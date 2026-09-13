import { describe, expect, it } from 'vitest';
import {
  byPrecedence, conditionKeys, cssVarTable, expandStates, familyTable, kebabKey,
  paramKeys, washOut,
} from '../src/states';
import { SPEC } from './fixture';

describe('expandStates', () => {
  const states = expandStates(SPEC);

  it('lists every condition, then every variant in condition order', () => {
    expect(states.map((s) => s.key)).toEqual(
      ['idle', 'hidden', 'warn', 'broken', 'noted', 'warnRemote', 'brokenRemote']);
  });

  it('builds a variant from its state and its definition', () => {
    const v = states.find((s) => s.key === 'warnRemote')!;
    expect(v).toMatchObject({
      label: 'warning remote', fill: '#443322', border: washOut('#ddaa22'),
      weight: 'thin', shape: 'square', precedence: 60,
      match: "'warn' in item.away", family: 'warn',
    });
    expect(v.variants).toBeUndefined();
    expect(v.quiet).toBeUndefined();
  });

  it('refuses a variant nobody defined', () => {
    expect(() => expandStates({ ...SPEC, variants: [] })).toThrow(/remote/);
  });

  it('refuses a variant on a state with no border to wash', () => {
    const states = SPEC.states.map((s) => s.key === 'warn' ? { ...s, border: null } : s);
    expect(() => expandStates({ ...SPEC, states })).toThrow(/warn.*border/);
  });
});

it('orders matching by precedence, not by listing', () => {
  expect(byPrecedence(expandStates(SPEC)).map((s) => s.key)).toEqual(
    ['hidden', 'warn', 'broken', 'noted', 'warnRemote', 'brokenRemote', 'idle']);
});

it('folds a variant into the condition it came from', () => {
  const states = expandStates(SPEC);
  expect(familyTable(states)).toMatchObject({ warn: 'warn', warnRemote: 'warn', idle: 'idle' });
  expect(conditionKeys(states)).toEqual(['idle', 'hidden', 'warn', 'broken', 'noted']);
});

it('names each color a CSS variable under the host prefix', () => {
  const vars = cssVarTable(expandStates(SPEC), '--x');
  expect(vars.warn).toEqual({ fill: '--x-cell-warn-fill', border: '--x-cell-warn-border' });
  expect(vars.idle).toEqual({ fill: '--x-cell-idle-fill', border: null });
  expect(vars.warnRemote!.fill).toBe('--x-cell-warn-remote-fill');
  expect(kebabKey('brokenRemote')).toBe('broken-remote');
});

it('names each color a param', () => {
  const [idle, , warn] = expandStates(SPEC);
  expect(paramKeys(warn!)).toEqual({ fill: 'warnFill', border: 'warnBorder' });
  expect(paramKeys(idle!)).toEqual({ fill: 'idleFill', border: null });
});

it('washes a color by keeping its hue', () => {
  expect(washOut('#e03030', 0.3, 0.675)).toBe('#c59393');
  expect(washOut('#e03030')).toBe('#c59393');
});
