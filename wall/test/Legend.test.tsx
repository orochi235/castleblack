import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { compile } from '../src/cel';
import { derive } from '../src/derive';
import { Legend, type LegendProps } from '../src/Legend';
import { conditionKeys, labelTable } from '../src/states';
import { SPEC, thing, type Thing } from './fixture';

afterEach(cleanup);

const compiled = compile(SPEC);
const LABEL = labelTable(compiled.states);

function wall(overrides: Partial<Thing>[]) {
  const facts = derive(compiled, overrides.map((o, i) => thing(`t${i}`, i, o)));
  return { facts, rows: overrides.map((_, i) => i) };
}

const base = wall([
  {}, {},
  { level: 1 }, { level: 1 },
  { err: 'x' },
]);

const legend = (props: Partial<LegendProps<Thing>> = {}) => (
  <Legend compiled={compiled} facts={base.facts} rows={base.rows}
          highlight={null} onHighlight={vi.fn()} tags={[]} onTags={vi.fn()}
          highlightTag={null} onHighlightTag={vi.fn()} onClose={vi.fn()} {...props} />
);

it('renders a row per condition with its own count', () => {
  render(legend());
  expect(screen.getByLabelText('idle, 2 items')).toBeTruthy();
  expect(screen.getByLabelText('warning, 2 items')).toBeTruthy();
  expect(screen.getByLabelText('broken, 1 items')).toBeTruthy();
  expect(screen.getByLabelText('noted, 0 items')).toBeTruthy();
  expect(screen.queryByLabelText(/remote/)).toBeNull();
});

it('counts a variant under the row for its condition', () => {
  const w = wall([{}, { level: 1 }, { away: ['warn'] }]);
  render(legend({ facts: w.facts, rows: w.rows }));
  expect(w.facts.state[2]).toBe('warnRemote');
  expect(screen.getByLabelText('warning, 2 items')).toBeTruthy();
});

it('counts only the rows it is given, in view', () => {
  render(legend({ rows: [0, 2] }));
  expect(screen.getByLabelText('idle, 1 items')).toBeTruthy();
  expect(screen.getByLabelText('warning, 1 items')).toBeTruthy();
  expect(screen.getByLabelText('broken, 0 items')).toBeTruthy();
});

it('renders one row per condition, in the spec\'s own legend order', () => {
  const { container } = render(legend());
  const rows = [...container.querySelectorAll('[data-state]')];
  const keys = conditionKeys(compiled.states);
  expect(rows.map((row) => row.getAttribute('data-state'))).toEqual(keys);
  expect(rows.map((row) => row.querySelector('.wall-legend-name')?.textContent))
    .toEqual(keys.map((k) => LABEL[k]));
});

it('groups the tags by axis without writing the axis names on screen', () => {
  const { container } = render(legend());
  const axes = [...container.querySelectorAll('.wall-legend-axis')];
  expect(container.querySelector('.wall-legend-axis h4')).toBeNull();
  expect(axes.map((a) => a.getAttribute('aria-label'))).toEqual(['Size', 'Mood']);
  expect([...axes[0]!.querySelectorAll('.wall-legend-name')].map((n) => n.textContent))
    .toEqual(['big', 'small']);
});

it('draws a tag with badge art as its badge, and one without as a plain row', () => {
  const { container } = render(legend());
  const row = (tag: string) => screen.getByRole('button', { name: new RegExp(`^${tag},`) });
  expect(row('big').querySelector('.wall-badge')).toBeTruthy();
  expect(screen.getByText('B')).toBeTruthy();
  expect(row('small').querySelector('.wall-badge')).toBeNull();
  expect(row('small').querySelector('.wall-legend-swatch')).toBeTruthy();
  expect(container.querySelectorAll('.wall-legend-badge-row')).toHaveLength(4);
});

it('draws no tag section for a spec without tag axes', () => {
  const bare = compile({ ...SPEC, tagAxes: undefined });
  const { container } = render(legend({ compiled: bare }));
  expect(container.querySelector('.wall-legend-axis')).toBeNull();
  expect(screen.queryByText('Tags')).toBeNull();
});

it('puts the scale where the state rows are once a measured tint is on', () => {
  const { container, rerender } = render(legend({ tint: 'score', gradient: 'ember' }));
  expect(container.querySelector('.wall-tint-scale')).toBeTruthy();
  expect(screen.getByText('score out of ten')).toBeTruthy();
  expect(container.querySelector('[data-state]')).toBeNull();
  rerender(legend({ tint: 'status' }));
  expect(container.querySelector('.wall-tint-scale')).toBeNull();
  expect(container.querySelector('[data-state]')).toBeTruthy();
});

it('keeps the state rows for a tint the spec does not define', () => {
  const { container } = render(legend({ tint: 'nothing' }));
  expect(container.querySelector('.wall-tint-scale')).toBeNull();
  expect(container.querySelector('[data-state]')).toBeTruthy();
});

it('reports the hovered state, and null once the pointer leaves', () => {
  const onHighlight = vi.fn();
  render(legend({ onHighlight }));
  const row = screen.getByLabelText('warning, 2 items');
  fireEvent.mouseEnter(row);
  expect(onHighlight).toHaveBeenCalledWith('warn');
  fireEvent.mouseLeave(row);
  expect(onHighlight).toHaveBeenCalledWith(null);
});

it('treats keyboard focus the same as hover, and blur the same as leaving', () => {
  const onHighlight = vi.fn();
  render(legend({ onHighlight }));
  const row = screen.getByLabelText('broken, 1 items');
  fireEvent.focus(row);
  expect(onHighlight).toHaveBeenCalledWith('broken');
  fireEvent.blur(row);
  expect(onHighlight).toHaveBeenCalledWith(null);
});

it('is reachable by keyboard: every row is focusable', () => {
  const { container } = render(legend());
  const rows = container.querySelectorAll('[data-state]');
  expect(rows.length).toBe(conditionKeys(compiled.states).length);
  for (const row of rows) expect(row.getAttribute('tabindex')).toBe('0');
});

it('asks its owner to close rather than hiding itself', () => {
  const onClose = vi.fn();
  const { container } = render(legend({ onClose }));
  fireEvent.click(screen.getByRole('button', { name: /close legend/i }));
  expect(onClose).toHaveBeenCalled();
  expect(container.querySelector('.wall-legend')).toBeTruthy();
});

it('filters the wall by a tag, and stacks two picks', () => {
  const onTags = vi.fn();
  render(legend({ onTags }));
  fireEvent.click(screen.getByRole('button', { name: /^big/ }));
  // An updater, not an array: two rows clicked in one render both read the
  // same `tags` prop, and the second would drop the first's pick.
  const update = onTags.mock.calls[0]![0] as (prev: string[]) => string[];
  expect(update(['calm'])).toEqual(['calm', 'big']);
  expect(update(['big'])).toEqual([]);
});

it('clears every pick from the section heading, shown only while something is picked', () => {
  const onTags = vi.fn();
  const { rerender } = render(legend({ onTags }));
  expect(screen.queryByRole('button', { name: 'clear' })).toBeNull();
  rerender(legend({ onTags, tags: ['big'] }));
  fireEvent.click(screen.getByRole('button', { name: 'clear' }));
  expect((onTags.mock.calls[0]![0] as (p: string[]) => string[])(['big'])).toEqual([]);
});

it('counts every tag over `tagRows`, falling back to the wall itself', () => {
  const w = wall([{ labels: ['big'] }, { labels: ['big', 'calm'] }]);
  render(legend({ facts: w.facts, rows: w.rows }));
  expect(screen.getByRole('button', { name: 'big, 2 items' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'calm, 1 items' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'loud, 0 items' })).toBeTruthy();
});

it('counts states over the wall and tags over `tagRows`', () => {
  // The states describe what is on the wall; the tags stay a menu of where
  // you could go next.
  const w = wall([{ labels: ['big'] }, { labels: ['calm'] }, { labels: ['calm'] }]);
  render(legend({ facts: w.facts, rows: [0], tagRows: [0, 1, 2], tags: ['big'] }));
  expect(screen.getByLabelText('idle, 1 items')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'big, 1 items' })).toBeTruthy();
  // `calm` does not read 0 just because `big` is narrowing the wall.
  expect(screen.getByRole('button', { name: 'calm, 2 items' })).toBeTruthy();
});

it('reports the hovered tag, and null once the pointer leaves', () => {
  const onHighlightTag = vi.fn();
  render(legend({ onHighlightTag }));
  const row = screen.getByRole('button', { name: /^big/ });
  fireEvent.mouseEnter(row);
  expect(onHighlightTag).toHaveBeenCalledWith('big');
  fireEvent.mouseLeave(row);
  expect(onHighlightTag).toHaveBeenCalledWith(null);
});

it('treats focus on a tag row the same as hover, and blur the same as leaving', () => {
  const onHighlightTag = vi.fn();
  render(legend({ onHighlightTag }));
  const row = screen.getByRole('button', { name: /^calm/ });
  fireEvent.focus(row);
  expect(onHighlightTag).toHaveBeenCalledWith('calm');
  fireEvent.blur(row);
  expect(onHighlightTag).toHaveBeenCalledWith(null);
});

it('marks the hovered and the picked tag rows', () => {
  render(legend({ highlightTag: 'big', tags: ['loud'] }));
  expect(screen.getByRole('button', { name: /^big/ }).getAttribute('data-highlighted'))
    .toBe('true');
  const loud = screen.getByRole('button', { name: /^loud/ });
  expect(loud.getAttribute('aria-pressed')).toBe('true');
  expect(loud.getAttribute('data-picked')).toBe('true');
});

it('gives every state a swatch colored from the state\'s custom properties', () => {
  const { container } = render(legend());
  const rows = container.querySelectorAll<HTMLElement>('.wall-legend-row[data-state]');
  expect(rows.length).toBe(conditionKeys(compiled.states).length);
  for (const row of rows) {
    const state = row.dataset.state!;
    expect(row.style.getPropertyValue('--swatch-fill'), `${state} has no fill`)
      .toBe(`var(--wall-cell-${state}-fill)`);
    const line = row.style.getPropertyValue('--swatch-line');
    expect(line, `${state} has no line color`).not.toBe('');
    // A state the wall strikes must say so, or the swatch is a plain square
    // where the cell is struck corner to corner.
    expect(row.dataset.struck === 'true', `${state} strike disagrees with its border`)
      .toBe(line !== 'transparent');
  }
});

it('reads the swatch properties under the host\'s root', () => {
  const { container } = render(legend({ root: '--host' }));
  const row = container.querySelector<HTMLElement>('[data-state="warn"]')!;
  expect(row.style.getPropertyValue('--swatch-fill')).toBe('var(--host-cell-warn-fill)');
  expect(row.style.getPropertyValue('--swatch-line')).toBe('var(--host-cell-warn-border)');
});

it('gives a state the shape and weight the wall draws it in', () => {
  const { container } = render(legend());
  const attr = (state: string, name: string) =>
    container.querySelector(`[data-state="${state}"]`)?.getAttribute(name);
  expect(attr('hidden', 'data-shape')).toBe('circle');
  expect(attr('warn', 'data-shape')).toBe('square');
  expect(attr('warn', 'data-weight')).toBe('thick');
  expect(attr('noted', 'data-weight')).toBe('thin');
  expect(attr('idle', 'data-weight')).toBe('none');
});
