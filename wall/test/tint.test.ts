import { expect, it } from 'vitest';
import { compile } from '../src/cel';
import { derive } from '../src/derive';
import { defaultPalette } from '../src/palette';
import { ramp, tintFor } from '../src/tint';
import { SPEC, thing } from './fixture';

const compiled = compile(SPEC);
const palette = defaultPalette(compiled.states);

it('samples a two-stop ramp at its ends', () => {
  expect(ramp(0)).toBe('rgb(58,58,63)');
  expect(ramp(1)).toBe('rgb(232,196,120)');
});

it('quantizes to eight steps', () => {
  expect(ramp(0.07)).toBe(ramp(0));
  expect(ramp(0.5)).toBe(ramp(4 / 7));
});

it('lands an eight-stop ramp on its own stops', () => {
  expect(ramp(1 / 7, 'viridis')).toBe('rgb(71,45,123)');
});

it('colors by state under status, and by ramp under a measure', () => {
  const facts = derive(compiled, [thing('a', 0, { level: 1 }), thing('b', 1, { score: null })]);
  expect(tintFor(facts, 0, 'status', palette)).toEqual(palette.states.warn);
  expect(tintFor(facts, 0, 'score', palette)).toEqual(
    { fill: ramp(0.5), border: null, weight: null });
  expect(tintFor(facts, 1, 'score', palette)).toEqual(palette.unmatched);
  expect(() => tintFor(facts, 0, 'nope', palette)).toThrow(/nope/);
});
