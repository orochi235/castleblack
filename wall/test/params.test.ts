import { expect, it } from 'vitest';
import { paramCssVars, paramSchema } from '../src/params';
import { expandStates, paramKeys } from '../src/states';
import type { CorpusSpec } from '../src/schema';
import { SPEC } from './fixture';

const STATES = expandStates(SPEC);
const schema = paramSchema(STATES);

it('keeps the fixed params at the values the wall shipped with', () => {
  const { defaults } = schema;
  expect({
    cell: defaults.cell, gap: defaults.gap, cols: defaults.cols,
    showBadges: defaults.showBadges, showCaptions: defaults.showCaptions,
    wash: defaults.wash,
    thickBorderFactor: defaults.thickBorderFactor, thinBorderFactor: defaults.thinBorderFactor,
    maxBorderPx: defaults.maxBorderPx, dimAlpha: defaults.dimAlpha,
    washStrength: defaults.washStrength,
    dragThresholdPx: defaults.dragThresholdPx, sceneRenderer: defaults.sceneRenderer,
    levelUpHysteresis: defaults.levelUpHysteresis,
    levelDownHysteresis: defaults.levelDownHysteresis, pollMs: defaults.pollMs,
  }).toEqual({
    cell: 32, gap: 4, cols: 0,
    showBadges: true, showCaptions: true, wash: false,
    thickBorderFactor: 0.18, thinBorderFactor: 0.09, maxBorderPx: 6, dimAlpha: 0.25,
    washStrength: 0.75,
    dragThresholdPx: 4, sceneRenderer: false,
    levelUpHysteresis: 1.5, levelDownHysteresis: 0.67, pollMs: 10_000,
  });
});

it('gives every param key exactly one field, each pointing at the default', () => {
  const fieldKeys = schema.fields.map((f) => f.key).sort();
  expect(fieldKeys).toEqual(Object.keys(schema.defaults).sort());
  for (const f of schema.fields) expect(f.default).toBe(schema.defaults[f.key]);
});

it('leaves no field without a default', () => {
  for (const f of schema.fields) expect(f.default).not.toBeUndefined();
});

it('gives every color a state declares one param, and carries no orphans', () => {
  const expected = [
    ...STATES.flatMap((s) => {
      const p = paramKeys(s);
      return p.border === null ? [p.fill] : [p.fill, p.border];
    }),
    'caretColor',
  ];
  expect([...schema.colorKeys]).toEqual(expected);
});

it('defaults every state color to the state\'s own value', () => {
  for (const s of STATES) {
    const p = paramKeys(s);
    expect(schema.defaults[p.fill]).toBe(s.fill);
    if (p.border !== null) expect(schema.defaults[p.border]).toBe(s.border);
  }
  expect(schema.defaults.caretColor).toBe('#ffffff');
});

it('labels the color rows from the state keys, fill before border, variants last', () => {
  const rows = new Map(schema.fields.map((f) => [f.key, f.label]));
  expect(schema.colorKeys.map((key) => rows.get(key))).toEqual([
    'Idle fill', 'Hidden fill', 'Warn fill', 'Warn border',
    'Broken fill', 'Broken border', 'Noted fill', 'Noted border',
    'Warn-remote fill', 'Warn-remote border',
    'Broken-remote fill', 'Broken-remote border',
    'Caret color',
  ]);
});

it('groups the fields as the panel shows them, colors under Appearance', () => {
  expect(schema.groups.map((g) => g.label)).toEqual(['Layout', 'Cell', 'Appearance', 'Feel']);
  const appearance = schema.groups.find((g) => g.label === 'Appearance')!;
  for (const key of schema.colorKeys) {
    expect(appearance.fields.some((f) => f.key === key && f.type === 'color'), key).toBe(true);
  }
  expect(schema.fields).toEqual(schema.groups.flatMap((g) => g.fields));
});

it('keeps the slider ranges', () => {
  const field = (key: string) => schema.fields.find((f) => f.key === key);
  expect(field('cell')).toMatchObject({ type: 'slider', min: 8, max: 128, step: 4 });
  expect(field('cols')).toMatchObject({ type: 'number', min: 0, max: 64, step: 1 });
  expect(field('washStrength')).toMatchObject({ type: 'slider', min: 0, max: 1, step: 0.05 });
  expect(field('levelDownHysteresis')).toMatchObject({ min: 0.3, max: 1, step: 0.01 });
  expect(field('pollMs')).toMatchObject({ type: 'number', min: 1000, max: 60_000, step: 1000 });
  expect(schema.units).toEqual({
    cell: 'px', gap: 'px', maxBorderPx: 'px', dragThresholdPx: 'px', pollMs: 'ms',
  });
});

it('generates the color rows from whatever states it is given', () => {
  const spec: CorpusSpec = {
    states: [{ key: 'onlyOne', label: 'only', fill: '#010203', border: null, weight: null,
               shape: 'square', precedence: 1, match: 'true' }],
    filters: [], classes: [], sorts: [],
  };
  const one = paramSchema(expandStates(spec));
  expect(one.colorKeys).toEqual(['onlyOneFill', 'caretColor']);
  expect(one.fields.find((f) => f.key === 'onlyOneFill')?.label).toBe('Only-one fill');
  expect(schema.colorKeys).toContain('warnFill');
  expect(one.defaults).not.toHaveProperty('warnFill');
});

it('maps every color param to the custom property the palette reads, under the root', () => {
  const vars = paramCssVars(STATES, '--wall');
  expect(Object.keys(vars)).toEqual(schema.colorKeys);
  expect(vars.warnRemoteBorder).toBe('--wall-cell-warn-remote-border');
  expect(vars.idleFill).toBe('--wall-cell-idle-fill');
  expect(vars.caretColor).toBe('--wall-caret-color');
  expect(paramCssVars(STATES, '--host').brokenFill).toBe('--host-cell-broken-fill');
});
