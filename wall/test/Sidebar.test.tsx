import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from '../src/cel';
import { paramSchema } from '../src/params';
import { Sidebar, type SidebarProps, type SidebarSelection } from '../src/Sidebar';
import { RAMP_NAMES } from '../src/tint';
import { SPEC, type Thing } from './fixture';

afterEach(cleanup);

const compiled = compile(SPEC);
const schema = paramSchema(compiled.states);

const selection: SidebarSelection = {
  sort: 'id', filter: 'all', shown: {}, exclude: {}, tags: [],
  tint: 'status', gradient: 'ember', grouping: 'none', desc: true,
};

const POLES = new Set(['north', 'south']);
const facet: NonNullable<SidebarProps['facet']> = {
  key: 'group', label: 'Group',
  counts: new Map([['north', 1332], ['south', 2117], ['east', 589], ['west', 1]]),
  groupOf: (v) => (POLES.has(v) ? 'Poles' : v === 'east' ? 'Sides' : null),
};

const props: Omit<SidebarProps<Thing>, 'onChange'> = {
  compiled, selection, facet,
  groupings: [
    { key: 'none', label: 'nothing' },
    { key: 'group', label: 'group' },
    { key: 'score', label: 'score', desc: 'Highest first' },
  ],
  shown: 1332, total: 1921,
  paramSchema: schema, params: schema.defaults, setParam: vi.fn(), resetParams: vi.fn(),
};

const facets = () => within(document.querySelector('.wall-side__facets') as HTMLElement);
const openGroup = (group: string) =>
  fireEvent.click(screen.getByRole('button', { name: `${group} members` }));

describe('Sidebar', () => {
  it('lists the groups the facet has values in, and values no group claims', () => {
    render(<Sidebar {...props} onChange={vi.fn()} />);
    const boxes = facets().getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('name'))).toEqual(['Poles', 'Sides', 'west']);
  });

  it('heads the facet with its label', () => {
    render(<Sidebar {...props} onChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /^Group/ })).toBeTruthy();
  });

  it('carries each group total', () => {
    render(<Sidebar {...props} onChange={vi.fn()} />);
    expect(facets().getByText('3,449')).toBeTruthy();
  });

  it('shows a group\'s values only once it is opened, biggest first', () => {
    const { container } = render(<Sidebar {...props} onChange={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: /north 1,332/ })).toBeNull();
    openGroup('Poles');
    expect(screen.getByRole('checkbox', { name: /north 1,332/ })).toBeTruthy();
    const members = container.querySelectorAll('.wall-side__members input');
    expect([...members].map((m) => m.getAttribute('name'))).toEqual(['south', 'north']);
  });

  it('excludes one value when its box is cleared', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} onChange={onChange} />);
    openGroup('Poles');
    fireEvent.click(screen.getByRole('checkbox', { name: /north 1,332/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ exclude: { group: ['north'] } }));
  });

  it('puts a value back when its box is checked again', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} selection={{ ...selection, exclude: { group: ['north'] } }}
                    onChange={onChange} />);
    openGroup('Poles');
    fireEvent.click(screen.getByRole('checkbox', { name: /north 1,332/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ exclude: { group: [] } }));
  });

  it('leaves other facets\' exclusions alone', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} selection={{ ...selection, exclude: { other: ['x'] } }}
                    onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /^west/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ exclude: { other: ['x'], group: ['west'] } }));
  });

  it('clears a whole group from its own box', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /^Poles/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ exclude: { group: ['south', 'north'] } }));
  });

  it('restores a group that is already all off', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props}
                    selection={{ ...selection, exclude: { group: ['south', 'north'] } }}
                    onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /^Poles/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ exclude: { group: [] } }));
  });

  it('reads a part-cleared group as neither on nor off', () => {
    render(<Sidebar {...props} selection={{ ...selection, exclude: { group: ['north'] } }}
                    onChange={vi.fn()} />);
    const box = screen.getByRole('checkbox', { name: /^Poles/ }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.indeterminate).toBe(true);
  });

  it('clears and restores every value at once', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'none' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ exclude: { group: ['south', 'north', 'east', 'west'] } }));
    fireEvent.click(screen.getByRole('button', { name: 'all' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ exclude: { group: [] } }));
  });

  it('lists a facet with no grouping flat, biggest first', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} facet={{ ...facet, groupOf: undefined }} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /members$/ })).toBeNull();
    expect(facets().getAllByRole('checkbox').map((b) => b.getAttribute('name')))
      .toEqual(['south', 'north', 'east', 'west']);
    fireEvent.click(screen.getByRole('checkbox', { name: /^east/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ exclude: { group: ['east'] } }));
  });

  it('draws no facet section without a facet', () => {
    const { container } = render(<Sidebar {...props} facet={undefined} onChange={vi.fn()} />);
    expect(screen.queryByRole('heading', { name: /^Group/ })).toBeNull();
    expect(container.querySelectorAll('.wall-side__facets')).toHaveLength(1);
  });

  it('changes the grouping', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'score' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ grouping: 'score' }));
  });

  it('offers the direction toggle only where the grouping names one', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Sidebar {...props} onChange={onChange} />);
    expect(screen.queryByLabelText('Highest first')).toBeNull();
    rerender(<Sidebar {...props} selection={{ ...selection, grouping: 'score' }}
                      onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Highest first'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ desc: false }));
  });

  it('builds the order and show menus from the spec', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} onChange={onChange} />);
    const options = (label: string) => [...(screen.getByLabelText(label) as HTMLSelectElement)
      .options].map((o) => [o.value, o.textContent]);
    expect(options('Order')).toEqual(SPEC.sorts.map((s) => [s.key, s.label]));
    expect(options('Show')).toEqual(SPEC.filters.map((f) => [f.key, f.label]));
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'score' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'score' }));
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'broken' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ filter: 'broken' }));
  });

  it('colors by status first, then by each tint the spec defines', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} onChange={onChange} />);
    const color = screen.getByLabelText('Color') as HTMLSelectElement;
    expect([...color.options].map((o) => [o.value, o.textContent]))
      .toEqual([['status', 'status'], ['score', 'score']]);
    fireEvent.change(color, { target: { value: 'score' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tint: 'score' }));
  });

  it('offers a gradient only under a measured tint', () => {
    const { rerender } = render(<Sidebar {...props} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Gradient')).toBeNull();
    rerender(<Sidebar {...props} selection={{ ...selection, tint: 'score' }}
                      onChange={vi.fn()} />);
    const gradient = screen.getByLabelText('Gradient') as HTMLSelectElement;
    expect([...gradient.options].map((o) => o.value)).toEqual(RAMP_NAMES);
  });

  it('says how much of the corpus is on the wall', () => {
    render(<Sidebar {...props} onChange={vi.fn()} />);
    expect(screen.getByText('1332 of 1921')).toBeTruthy();
  });

  it('takes a class shown by default off the wall from its checkbox', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'hidden' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ shown: { hidden: false } }));
  });

  it('puts a class hidden by default back on the wall from its checkbox', () => {
    const onChange = vi.fn();
    render(<Sidebar {...props} selection={{ ...selection, shown: { hidden: false } }}
                    onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'archived' }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ shown: { hidden: false, archived: true } }));
  });

  it('carries the params panel', () => {
    const { container } = render(<Sidebar {...props} onChange={vi.fn()} />);
    expect(container.querySelector('.wall-params-panel')).toBeTruthy();
  });
});
