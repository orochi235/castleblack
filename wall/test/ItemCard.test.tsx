import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CARD_HEIGHT, CARD_MARGIN, CARD_OFFSET, CARD_WIDTH, ItemCard, placeCard }
  from '../src/ItemCard';

afterEach(cleanup);

const VIEWPORT = { width: 1000, height: 800 };

const card = (props: Partial<Parameters<typeof ItemCard>[0]> = {}) => (
  <ItemCard at={{ x: 100, y: 100 }} viewport={VIEWPORT} onClose={() => {}} {...props}>
    {props.children ?? <p>item seven</p>}
  </ItemCard>
);

const pos = (el: HTMLElement) => ({
  x: parseInt(el.style.getPropertyValue('--card-x'), 10),
  y: parseInt(el.style.getPropertyValue('--card-y'), 10),
});

it('shows the body its host gives it, as a dialog', () => {
  render(card({ label: 'item seven card' }));
  expect(screen.getByText('item seven')).toBeTruthy();
  expect(screen.getByRole('dialog', { name: 'item seven card' })).toBeTruthy();
});

it('sits past the clicked point, so it never covers what was clicked', () => {
  const { container } = render(card());
  const el = container.querySelector('.wall-card') as HTMLElement;
  expect(pos(el)).toEqual({ x: 100 + CARD_OFFSET, y: 100 + CARD_OFFSET });
});

it('stays inside the viewport when clicked near the right edge', () => {
  const { container } = render(card({ at: { x: 990, y: 790 } }));
  const el = container.querySelector('.wall-card') as HTMLElement;
  const { x, y } = pos(el);
  expect(x).toBeLessThan(990);
  expect(x + CARD_WIDTH).toBeLessThanOrEqual(VIEWPORT.width - CARD_MARGIN);
  expect(y + CARD_HEIGHT).toBeLessThanOrEqual(VIEWPORT.height - CARD_MARGIN);
});

it('flips to the far side of the point rather than sliding over it', () => {
  // Room on the left: the card goes there whole, clear of the point.
  expect(placeCard({ x: 900, y: 700 }, VIEWPORT, { width: CARD_WIDTH, height: CARD_HEIGHT }))
    .toEqual({ x: 900 - CARD_OFFSET - CARD_WIDTH, y: 700 - CARD_OFFSET - CARD_HEIGHT });
});

it('clamps where neither side has room', () => {
  const small = { width: 300, height: 200 };
  expect(placeCard({ x: 150, y: 100 }, small, { width: CARD_WIDTH, height: CARD_HEIGHT }))
    .toEqual({ x: CARD_MARGIN, y: CARD_MARGIN });
});

it('closes on Escape', () => {
  const onClose = vi.fn();
  render(card({ onClose }));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

it('closes on a press outside it, and not on one inside', () => {
  const onClose = vi.fn();
  render(card({ onClose, children: <button type="button">act</button> }));
  fireEvent.pointerDown(screen.getByRole('button', { name: 'act' }));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.pointerDown(document.body);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('reports the pointer entering and leaving, so a zoom can spare the card being read', () => {
  const onHoverChange = vi.fn();
  const { container } = render(card({ onHoverChange }));
  const el = container.querySelector('.wall-card')!;
  fireEvent.pointerEnter(el);
  expect(onHoverChange).toHaveBeenLastCalledWith(true);
  fireEvent.pointerLeave(el);
  expect(onHoverChange).toHaveBeenLastCalledWith(false);
});

it('stops listening once it is gone', () => {
  const onClose = vi.fn();
  const { unmount } = render(card({ onClose }));
  unmount();
  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.pointerDown(document.body);
  expect(onClose).not.toHaveBeenCalled();
});
