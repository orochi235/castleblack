import { expect, it } from 'vitest';
import { DEFAULT_CHROME, defaultPalette, readPalette } from '../src/palette';
import { expandStates } from '../src/states';
import { SPEC } from './fixture';

const states = expandStates(SPEC);

it('holds every state and the chrome', () => {
  const p = defaultPalette(states);
  expect(Object.keys(p.states)).toEqual(states.map((s) => s.key));
  expect(p.states.warn).toEqual({ fill: '#443322', border: '#ddaa22', weight: 'thick' });
  expect(p.caret).toBe(DEFAULT_CHROME.caret);
  expect(p.unmatched).toEqual(DEFAULT_CHROME.unmatched);
});

it('prefers a declared variable and falls back per property', () => {
  const declared: Record<string, string> = {
    '--x-cell-warn-fill': ' #123456 ',
    '--x-caret-color': '#00ff00',
  };
  const p = readPalette((prop) => declared[prop] ?? '', states, '--x');
  expect(p.states.warn).toEqual({ fill: '#123456', border: '#ddaa22', weight: 'thick' });
  expect(p.states.idle).toEqual({ fill: '#333333', border: null, weight: null });
  expect(p.caret).toBe('#00ff00');
  expect(p.label).toEqual(DEFAULT_CHROME.label);
});
