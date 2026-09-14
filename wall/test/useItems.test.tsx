import { createElement } from 'react';
import { expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { tableFromArrays } from 'apache-arrow';
import { POLL_MS, useItems } from '../src/useItems';
import type { ItemsBody, ItemsState } from '../src/useItems';
import type { Item } from '../src/schema';

const item = (id: string, index: number, sha: string | null = null): Item => ({ id, index, sha });

type Body = ItemsBody<Item>;

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

const ids = (state: ItemsState<Item>) =>
  Array.from({ length: state.store!.length }, (_, row) => state.store!.id(row));

it('fetches the full list on mount, then polls the delta and patches it in', async () => {
  vi.useFakeTimers();
  try {
    const full: Body = { items: [item('a', 0), item('b', 1)], version: 'v1' };
    const delta: Body = { items: [item('b', 1, 'sha-b')], version: 'v2' };
    const { fetchItems, calls } = fakeFetch({ naive: [full, delta] });

    const { result, unmount } = renderHook(() => useItems(fetchItems, 'naive'));

    await flush();
    expect(ids(result.current)).toEqual(['a', 'b']);
    expect(result.current.changed).toBeNull();
    expect(calls[0]).toEqual({ slot: 'naive', since: undefined });

    const untouched = result.current.store!.get(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });

    expect(calls[1]).toEqual({ slot: 'naive', since: 'v1' });
    expect(result.current.store!.sha(1)).toBe('sha-b');
    expect(result.current.store!.get(0)).toBe(untouched);
    expect(result.current.changed).toEqual([1]);

    unmount();
    const callsBeforeUnmount = calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(calls.length).toBe(callsBeforeUnmount);
  } finally {
    vi.useRealTimers();
  }
});

it('takes the corpus and its deltas as Arrow tables', async () => {
  vi.useFakeTimers();
  try {
    const full: Body = {
      table: tableFromArrays({ id: ['a', 'b', 'c'], index: Int32Array.from([0, 1, 2]),
                               sha: ['x', 'y', 'z'] }) as never,
      version: 'v1',
    };
    const delta: Body = {
      table: tableFromArrays({ id: ['c'], index: Int32Array.from([2]), sha: ['z2'] }) as never,
      version: 'v2',
    };
    const { fetchItems } = fakeFetch({ arrow: [full, delta] });
    const { result } = renderHook(() => useItems(fetchItems, 'arrow'));
    await flush();
    expect(ids(result.current)).toEqual(['a', 'b', 'c']);
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(result.current.store!.sha(2)).toBe('z2');
    expect(result.current.changed).toEqual([2]);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps the same store when a delta names nothing on the wall', async () => {
  vi.useFakeTimers();
  try {
    const { fetchItems } = fakeFetch({
      s: [{ items: [item('a', 0)], version: 'v1' }, { items: [item('zz', 99)], version: 'v2' }],
    });
    const { result } = renderHook(() => useItems(fetchItems, 's'));
    await flush();
    const before = result.current.store;
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(result.current.store).toBe(before);
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
    expect(result.current.store!.sha(0)).toBe('sha-second');
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
  expect(seen.at(-1)!.state.store).not.toBeNull();

  seen.length = 0;
  rerender(createElement(Parent, { slot: 'second' }));

  // The second fetch never resolves, so this is the whole switching window.
  expect(seen.at(-1)!.state).toMatchObject({ slot: 'first' });
  expect(seen.at(-1)!.state.store).not.toBeNull();
  expect(seen.every((s) => s.state.store === null || s.state.slot === 'first')).toBe(true);
});
