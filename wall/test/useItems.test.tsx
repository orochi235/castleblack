import { createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { mergeItems, POLL_MS, useItems } from '../src/useItems';
import type { ItemsState } from '../src/useItems';
import type { Item } from '../src/schema';

const item = (id: string, index: number, sha: string | null = null): Item => ({ id, index, sha });

type Body = { items: Item[]; version: string };

it('replaces an item the delta names', () => {
  const { items } = mergeItems([item('a', 0), item('b', 1)], [item('b', 1, 'sha-b')]);
  expect(items[1]!.sha).toBe('sha-b');
});

it('leaves untouched items alone, by identity', () => {
  const a = item('a', 0);
  const { items } = mergeItems([a, item('b', 1)], [item('b', 1, 'sha-b')]);
  expect(items[0]).toBe(a);
});

it('keeps the array in index order', () => {
  const { items } = mergeItems([item('a', 0), item('b', 1), item('c', 2)],
                               [item('c', 2, 'sha-c'), item('a', 0, 'sha-a')]);
  expect(items.map((c) => c.id)).toEqual(['a', 'b', 'c']);
});

it('ignores a delta item that is not on the wall', () => {
  const { items, changed } = mergeItems([item('a', 0)], [item('zz', 99)]);
  expect(items.map((c) => c.id)).toEqual(['a']);
  expect(changed).toEqual([]);
});

it('returns the same array when the delta is empty', () => {
  const current = [item('a', 0)];
  expect(mergeItems(current, [])).toEqual({ items: current, changed: [] });
  expect(mergeItems(current, []).items).toBe(current);
});

it('names the rows the delta replaced, in row order', () => {
  const { changed } = mergeItems([item('a', 0), item('b', 1), item('c', 2)],
                                 [item('c', 2, 'sha-c'), item('a', 0, 'sha-a')]);
  expect(changed).toEqual([0, 2]);
});

it('returns the same array when no delta item is on the wall', () => {
  const current = [item('a', 0)];
  expect(mergeItems(current, [item('zz', 99)]).items).toBe(current);
});

it('keeps the fields a host added to its items', () => {
  const current = [{ ...item('a', 0), title: 'A' }];
  const { items } = mergeItems(current, [{ ...item('a', 0, 's'), title: 'B' }]);
  expect(items[0]!.title).toBe('B');
});

/** A stub fetch scripted per slot by call count. */
function fakeFetch(bodies: Record<string, Body[]>) {
  const cursor: Record<string, number> = {};
  const calls: { slot: string; since?: string }[] = [];
  const fetchItems = vi.fn(async (slot: string, since?: string) => {
    calls.push({ slot, since });
    const list = bodies[slot] ?? [];
    const i = cursor[slot] ?? 0;
    cursor[slot] = Math.min(i + 1, list.length - 1);
    return list[i]!;
  });
  return { fetchItems, calls };
}

// Under fake timers testing-library's `waitFor` polls on a real timer and
// never sees a resolution.
async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

it('fetches the full list on mount, then polls the delta and merges it', async () => {
  vi.useFakeTimers();
  try {
    const full: Body = { items: [item('a', 0), item('b', 1)], version: 'v1' };
    const delta: Body = { items: [item('b', 1, 'sha-b')], version: 'v2' };
    const { fetchItems, calls } = fakeFetch({ naive: [full, delta] });

    const { result, unmount } = renderHook(() => useItems(fetchItems, 'naive'));

    await flush();
    expect(result.current.items!.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result.current.changed).toBeNull();
    expect(calls[0]).toEqual({ slot: 'naive', since: undefined });

    const untouched = result.current.items![0];

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });

    expect(calls[1]).toEqual({ slot: 'naive', since: 'v1' });
    expect(result.current.items!.find((c) => c.id === 'b')!.sha).toBe('sha-b');
    expect(result.current.items![0]).toBe(untouched);
    expect(result.current.changed).toEqual([1]);

    unmount();
    const callsBeforeUnmount = calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(calls.length).toBe(callsBeforeUnmount);
  } finally {
    vi.useRealTimers();
  }
});

it('refetches from scratch, with no since, when the slot changes', async () => {
  vi.useFakeTimers();
  try {
    const firstFull: Body = { items: [item('a', 0)], version: 'v1' };
    const secondFull: Body = { items: [item('a', 0, 'sha-second')], version: 'w1' };
    const { fetchItems, calls } = fakeFetch({ first: [firstFull], second: [secondFull] });

    const { result, rerender } = renderHook(
      ({ slot }) => useItems(fetchItems, slot),
      { initialProps: { slot: 'first' } },
    );
    await flush();
    expect(calls[0]).toEqual({ slot: 'first', since: undefined });

    rerender({ slot: 'second' });
    await flush();

    expect(calls.find((c) => c.slot === 'second')).toEqual({ slot: 'second', since: undefined });
    expect(result.current.items!.find((c) => c.id === 'a')!.sha).toBe('sha-second');
    expect(result.current.changed).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it('keeps the old slot drawn until the new one lands, and never pairs items with a slot they are not for', async () => {
  const seen: { asked: string; state: ItemsState<Item> }[] = [];
  let resolveFirst!: (body: Body) => void;
  const first = new Promise<Body>((res) => { resolveFirst = res; });
  const fetchItems = vi.fn((slot: string) =>
    slot === 'first' ? first : new Promise<Body>(() => {}));

  function Child({ asked, state }: { asked: string; state: ItemsState<Item> }) {
    seen.push({ asked, state });
    return null;
  }
  function Parent({ slot }: { slot: string }) {
    return createElement(Child, { asked: slot, state: useItems(fetchItems, slot) });
  }

  const { rerender } = render(createElement(Parent, { slot: 'first' }));
  await act(async () => { resolveFirst({ items: [item('a', 0, 'sha-a')], version: 'v1' }); });
  expect(seen.at(-1)!.state.items).not.toBeNull();

  seen.length = 0;
  rerender(createElement(Parent, { slot: 'second' }));

  // The second fetch never resolves, so this is the whole switching window.
  expect(seen.at(-1)!.state).toMatchObject({ slot: 'first' });
  expect(seen.at(-1)!.state.items).not.toBeNull();
  expect(seen.every((s) => s.state.items === null || s.state.slot === 'first')).toBe(true);
});
