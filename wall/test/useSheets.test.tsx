import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSheets } from '../src/useSheets';
import { SHEET_LEVELS } from '../src/levels';
import { defaultUrls } from '../src/urls';
import type { SheetManifest } from '../src/sheet';

const urls = defaultUrls('/api');
const manifest = (level: number, version?: string): SheetManifest => ({
  level, gutter: 1, pitch: level + 2, cols: 4, rows: 4, count: 16, size: 64,
  baked: { a: 'x' }, version,
});

const loaded: string[] = [];
let failing = new Set<string>();

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = '';
  get src() { return this.#src; }
  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => {
      if (failing.has(value)) this.onerror?.();
      else { loaded.push(value); this.onload?.(); }
    });
  }
}

beforeEach(() => {
  loaded.length = 0;
  failing = new Set();
  vi.stubGlobal('Image', FakeImage);
});
afterEach(() => { vi.unstubAllGlobals(); });

function serve(pending: Set<string> = new Set()) {
  const asked: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    asked.push(url);
    const m = /\/thumbs\/([^/]+)\/sheet-(\d+)\.json$/.exec(url);
    if (!m) return new Response('', { status: 404 });
    if (pending.has(m[1]!)) return new Promise<Response>(() => {});
    return new Response(JSON.stringify(manifest(Number(m[2]), 'v7')));
  }));
  return asked;
}

it('loads every sheet level for the slot, versioning the image off its manifest', async () => {
  const asked = serve();
  const { result } = renderHook(() => useSheets(urls, 'first'));
  await waitFor(() => expect(Object.keys(result.current.sheets)).toHaveLength(SHEET_LEVELS.length));
  expect(asked).toEqual(SHEET_LEVELS.map((l) => `/api/thumbs/first/sheet-${l}.json`));
  expect(loaded.sort()).toEqual(SHEET_LEVELS.map((l) => `/api/thumbs/first/sheet-${l}.webp?v=v7`).sort());
  expect(result.current.slot).toBe('first');
  expect(result.current.sheets[SHEET_LEVELS[0]]!.manifest.level).toBe(SHEET_LEVELS[0]);
});

it('settles a slot with a sheet missing, rather than holding the old slot', async () => {
  serve();
  failing = new Set([`/api/thumbs/second/sheet-${SHEET_LEVELS[1]}.webp?v=v7`]);
  const { result, rerender } = renderHook(({ slot }) => useSheets(urls, slot),
                                          { initialProps: { slot: 'first' } });
  await waitFor(() => expect(Object.keys(result.current.sheets)).toHaveLength(2));
  rerender({ slot: 'second' });
  await waitFor(() => expect(result.current.slot).toBe('second'));
  expect(Object.keys(result.current.sheets).map(Number)).toEqual([SHEET_LEVELS[0]]);
});

it('keeps the old slot whole until the new one has settled', async () => {
  serve(new Set(['second']));
  const { result, rerender } = renderHook(({ slot }) => useSheets(urls, slot),
                                          { initialProps: { slot: 'first' } });
  await waitFor(() => expect(Object.keys(result.current.sheets)).toHaveLength(2));
  const before = result.current.sheets;
  rerender({ slot: 'second' });
  await new Promise((r) => setTimeout(r, 10));
  expect(result.current.slot).toBe('first');
  expect(result.current.sheets).toBe(before);
});
