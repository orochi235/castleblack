import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { BadgeSwatch } from '../src/BadgeSwatch';
import type { Marks } from '../src/marks';
import type { Badge } from '../src/schema';

afterEach(cleanup);

const MARKS: Marks = {
  horseshoe: [
    { d: 'M-1 -1H1V1H-1Z' },
    { d: 'M-1 0.5H1V1H-1Z', fill: 'accent' },
  ],
  peel: [
    { d: 'M-1 -1H1V1Z' },
    { d: 'M0 0H1V1Z', punch: true },
  ],
};

const HORSESHOE: Badge = { tag: 'pull', mark: 'horseshoe', field: '#224488', ink: '#ffffff',
                           accent: '#ff0000' };
const LETTER: Badge = { tag: 'odd', text: 'Q', field: '#442266', ink: '#ffffff' };
const PLAIN: Badge = { tag: 'open', field: '#888888', ink: '#000000' };
const PEEL: Badge = { tag: 'peel', mark: 'peel', field: '#aa8800', ink: '#000000' };

test('a badge with a mark draws it as SVG, in the badge\'s own inks', () => {
  const { container } = render(<BadgeSwatch badge={HORSESHOE} marks={MARKS} label="pull" />);
  const paths = [...container.querySelectorAll('path')];
  expect(paths.map((p) => p.getAttribute('d'))).toEqual(MARKS.horseshoe!.map((s) => s.d));
  // The body in the ink, the poles in the accent.
  expect(paths.map((p) => p.getAttribute('fill'))).toEqual(['#ffffff', '#ff0000']);
  expect(container.querySelector('canvas')).toBeNull();
});

test('a badge with a letter sets it as text, not as artwork', () => {
  const { container } = render(<BadgeSwatch badge={LETTER} marks={MARKS} label="odd" />);
  // The badge is aria-hidden, so the glyph is found by its text alone.
  expect(screen.getByText('Q')).toBeTruthy();
  expect(screen.getByText('odd')).toBeTruthy();
  expect(container.querySelector('svg')).toBeNull();
});

test('a markless badge gets no disc', () => {
  const { container } = render(<BadgeSwatch badge={PLAIN} marks={MARKS} label="open" />);
  expect(container.querySelector('.wall-badge')!.getAttribute('data-disc')).toBe('false');
  expect(container.querySelector('.wall-badge-disc')).toBeNull();
});

test('a mark the passed set does not hold draws no artwork and reserves no disc', () => {
  const { container } = render(<BadgeSwatch badge={HORSESHOE} marks={{}} label="pull" />);
  expect(container.querySelector('svg')).toBeNull();
  expect(container.querySelector('.wall-badge')!.getAttribute('data-disc')).toBe('false');
});

test('a mark that erases part of its badge becomes a mask', () => {
  const { container } = render(<BadgeSwatch badge={PEEL} marks={MARKS} label="peel" />);
  const badge = container.querySelector('.wall-badge') as HTMLElement;
  expect(badge.getAttribute('data-cut')).toBe('true');
  expect(badge.style.getPropertyValue('--badge-cut')).toContain('image/svg+xml');
  // The punch is drawn by the mask, never painted into the disc.
  expect(container.querySelectorAll('svg.wall-badge-art path').length)
    .toBe(MARKS.peel!.filter((s) => !s.punch).length);
});

test('washes the field behind a label, and keeps the disc its own field', () => {
  const { container } = render(<BadgeSwatch badge={HORSESHOE} marks={MARKS} label="pull" />);
  const badge = container.querySelector('.wall-badge') as HTMLElement;
  expect(badge.style.getPropertyValue('--badge-disc-field')).toBe('#224488');
  expect(badge.style.getPropertyValue('--badge-field')).not.toBe('#224488');
  const bare = render(<BadgeSwatch badge={HORSESHOE} marks={MARKS} />).container;
  expect((bare.querySelector('.wall-badge') as HTMLElement).style
    .getPropertyValue('--badge-field')).toBe('#224488');
});
