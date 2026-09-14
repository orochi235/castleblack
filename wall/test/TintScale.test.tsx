import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CHROME } from '../src/palette';
import type { TintDef } from '../src/schema';
import { TintScale } from '../src/TintScale';
import { RAMP_NAMES, STEPS } from '../src/tint';
import { SPEC, type Thing } from './fixture';

afterEach(cleanup);

const SCORE = SPEC.tints![0]!;
// Log over 1..1000, so the midpoint tick is 32 rather than 500.
const SPAN: TintDef<Thing> = {
  key: 'span', label: 'span', scaleLabel: 'time taken', log: true, reads: [],
  t: () => null, raw: () => null,
  at: (t) => 10 ** (t * 3),
  format: (v) => (v < 10 ? `${v.toFixed(1)}s` : `${Math.round(v)}s`),
};

describe('TintScale', () => {
  it('names what the colors mean and the range they span', () => {
    render(<TintScale tint={SPAN} gradient="ember" />);
    expect(screen.getByText('time taken')).toBeTruthy();
    expect(screen.getByText('1.0s')).toBeTruthy();
    expect(screen.getByText('32s')).toBeTruthy();
    expect(screen.getByText('1000s')).toBeTruthy();
  });

  it('reads its ticks off the tint\'s own inverse and formatter', () => {
    const { container } = render(<TintScale tint={SCORE} gradient="ember" />);
    const ticks = [...container.querySelectorAll('.wall-tint-scale-ticks > span')];
    expect(ticks.map((t) => t.textContent)).toEqual(['0', '5', '10']);
  });

  it('says when the ramp is logarithmic, and does not when it is not', () => {
    const { unmount } = render(<TintScale tint={SPAN} gradient="ember" />);
    expect(screen.queryByText('log')).toBeTruthy();
    unmount();
    render(<TintScale tint={SCORE} gradient="ember" />);
    expect(screen.queryByText('log')).toBeNull();
  });

  it('draws one swatch per quantized step, not a smooth gradient', () => {
    const { container } = render(<TintScale tint={SPAN} gradient="ember" />);
    const strip = container.querySelector('.wall-tint-scale-strip')!;
    expect(strip.querySelectorAll('.wall-tint-scale-swatch')).toHaveLength(STEPS);
  });

  it('is read-only: nothing to click, nothing to focus', () => {
    const { container } = render(<TintScale tint={SCORE} gradient="viridis" />);
    expect(container.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
    expect(container.querySelectorAll('[onclick]')).toHaveLength(0);
  });

  it('gives the strip a role and a name rather than bare swatches', () => {
    render(<TintScale tint={SPAN} gradient="ember" />);
    const label = screen.getByRole('img').getAttribute('aria-label');
    expect(label).toContain('time taken');
    expect(label).toContain('1.0s to 1000s');
    expect(label).toContain('logarithmic');
  });

  it('renders in every gradient, thermal ones included', () => {
    for (const gradient of RAMP_NAMES) {
      const { unmount, container } = render(<TintScale tint={SPAN} gradient={gradient} />);
      const swatches = container.querySelectorAll(
        '.wall-tint-scale-strip .wall-tint-scale-swatch');
      expect(swatches).toHaveLength(STEPS);
      // A ramp that collapsed to one color would be a strip, not a scale.
      const seen = new Set([...swatches].map((el) => (el as HTMLElement).style.background));
      expect(seen.size).toBeGreaterThan(1);
      unmount();
    }
  });

  it('shows what an unmeasured item looks like, in the chrome\'s unmatched tone', () => {
    const { container } = render(<TintScale tint={SCORE} gradient="ember" />);
    expect(screen.getByText('not measured')).toBeTruthy();
    const swatch = container.querySelector('.wall-tint-scale-absent .wall-tint-scale-swatch');
    // #2a2a2e, as jsdom serializes it.
    expect(DEFAULT_CHROME.unmatched.fill).toBe('#2a2a2e');
    expect((swatch as HTMLElement).style.background).toBe('rgb(42, 42, 46)');
  });

  it('takes the host\'s unmatched tone where one is given', () => {
    const { container } = render(<TintScale tint={SCORE} gradient="ember" unmatched="#010203" />);
    const swatch = container.querySelector('.wall-tint-scale-absent .wall-tint-scale-swatch');
    expect((swatch as HTMLElement).style.background).toBe('rgb(1, 2, 3)');
  });
});
