import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CacheFailureButton } from '../src/CacheFailureButton';
import { cacheReport } from '../src/cacheReport';

afterEach(cleanup);

const report = cacheReport({
  slot: 's', cellPx: 300, dpr: 1, level: 128,
  cells: { shown: 10, visible: 10, visibleWithSha: 10 },
  sheets: [{ level: 8, loaded: true, version: 'v1', baked: 10 }],
  loose: { loaded: 0, requested: 10 },
  vector: { resident: 0, inFlight: 0, queued: 0, bytesCached: 0, rasterPx: [] },
});

it('reports first, then resets, and shows the findings', async () => {
  const order: string[] = [];
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(<CacheFailureButton
    report={async () => { order.push('report'); return report; }}
    reset={() => order.push('reset')} />);

  fireEvent.click(screen.getByRole('button', { name: 'Cache failure' }));
  const status = await screen.findByRole('status');

  expect(order).toEqual(['report', 'reset']);
  expect(status.textContent).toContain('loose rung at 300px cells');
  expect(status.textContent).toContain('JSON in the console');
  expect(status.querySelectorAll('li')).toHaveLength(report.findings.length);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('"slot": "s"'));
  warn.mockRestore();
});

it('dismisses the findings', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(<CacheFailureButton report={async () => report} reset={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cache failure' }));
  await screen.findByRole('status');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('status')).toBeNull();
  warn.mockRestore();
});
