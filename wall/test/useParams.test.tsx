import { afterEach, beforeEach, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { paramSchema } from '../src/params';
import { expandStates } from '../src/states';
import { useParams } from '../src/useParams';
import { SPEC } from './fixture';

const STORAGE_KEY = 'test.wall-params';
const schema = paramSchema(expandStates(SPEC));
const opts = { storageKey: STORAGE_KEY, root: '--wall' };

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div class="lk-root"></div>';
});

afterEach(() => { document.body.innerHTML = ''; });

const root = () => document.querySelector('.lk-root') as HTMLElement;

it('starts from the tuned defaults with nothing stored', () => {
  const { result } = renderHook(() => useParams(schema, opts));
  expect(result.current.params).toEqual(schema.defaults);
});

it('persists a change so a fresh hook picks it up, surviving a reload', () => {
  const { result } = renderHook(() => useParams(schema, opts));
  act(() => result.current.setParam('cell', 48));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).cell).toBe(48);

  const { result: reloaded } = renderHook(() => useParams(schema, opts));
  expect(reloaded.current.params.cell).toBe(48);
});

it('stores under the key it is given, so two walls keep separate params', () => {
  const { result } = renderHook(() => useParams(schema, opts));
  act(() => result.current.setParam('cell', 48));
  const { result: other } = renderHook(() => useParams(schema, { ...opts, storageKey: 'other' }));
  expect(other.current.params.cell).toBe(32);
});

it('resets every field back to its default, and persists the reset', () => {
  const { result } = renderHook(() => useParams(schema, opts));
  act(() => {
    result.current.setParam('cell', 48);
    result.current.setParam('idleFill', '#123456');
  });
  act(() => result.current.reset());
  expect(result.current.params).toEqual(schema.defaults);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(schema.defaults);
});

it('tolerates a corrupt store by falling back to defaults', () => {
  localStorage.setItem(STORAGE_KEY, '{not json');
  const { result } = renderHook(() => useParams(schema, opts));
  expect(result.current.params).toEqual(schema.defaults);
});

it('takes a stored value over a default, and a default for a key the store lacks', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ gap: 9 }));
  const { result } = renderHook(() => useParams(schema, opts));
  expect(result.current.params.gap).toBe(9);
  expect(result.current.params.warnBorder).toBe('#ddaa22');
});

it('writes a color param onto .lk-root as a CSS custom property', () => {
  const { result } = renderHook(() => useParams(schema, opts));
  act(() => result.current.setParam('warnBorder', '#abcdef'));
  expect(root().style.getPropertyValue('--wall-cell-warn-border')).toBe('#abcdef');
});

it('writes every color var on mount, so a reload restores a customized palette', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...schema.defaults, caretColor: '#00ff00' }));
  renderHook(() => useParams(schema, opts));
  expect(root().style.getPropertyValue('--wall-caret-color')).toBe('#00ff00');
  expect(root().style.getPropertyValue('--wall-cell-broken-remote-fill')).toBe('#442222');
});

it('writes under the root it is given', () => {
  renderHook(() => useParams(schema, { ...opts, root: '--host' }));
  expect(root().style.getPropertyValue('--host-cell-idle-fill')).toBe('#333333');
  expect(root().style.getPropertyValue('--wall-cell-idle-fill')).toBe('');
});
