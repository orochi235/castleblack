// The wall at a million items, measured in headless Chromium against its gates.
//
//   node hosts/unicode/bench/browser.mjs [--dpr 2] [--dev]
//
// Starts the feed server and serves a production build of the page (or the
// Vite dev server, with --dev), loads the page once to warm both, then times on
// a fresh page: first paint of every code point, frame
// intervals over a scripted pan and zoom with the whole wall on screen, and
// the time from each selection change to the next complete frame. Prints each
// measurement as it lands and exits nonzero on a miss.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build, createServer, preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const dprArg = process.argv.indexOf('--dpr');
const DPR = dprArg > 0 ? Number(process.argv[dprArg + 1]) : 1;
const DEV = process.argv.includes('--dev');
const API_PORT = 8797;
const VIEWPORT = { width: 1600, height: 1000 };
const MARK = 'pezlie:complete';
const GATES = { firstPaintMs: 3000, firstPaintTargetMs: 1000, medianFrameMs: 17.5, p95FrameMs: 34, changeMs: 250 };

const CHANGES = [
  ['Show', 'assigned'], ['Show', 'all'], ['Order', 'age'], ['Order', 'name'], ['Order', 'cp'],
  ['Color', 'age'], ['Color', 'status'], ['Show', 'unassigned'], ['Show', 'all'],
];
const TOTAL = 3 + CHANGES.length;
let step = 0;
const misses = [];
function report(name, ms, gate, note = '') {
  const ok = gate === null || ms <= gate;
  if (!ok) misses.push(name);
  console.log(`${String(++step).padStart(2)}/${TOTAL}  ${ok ? 'PASS' : 'MISS'}  ${name.padEnd(34)} `
    + `${ms.toFixed(1).padStart(8)} ms${gate === null ? '' : `  (gate ${gate} ms)`}${note}`);
}

async function waitFor(url, tries = 200) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${url} never answered`);
}

const api = spawn(`${root}.venv/bin/python`, [
  '-m', 'uvicorn', '--factory', 'server:app_from_env', '--app-dir', root,
  '--port', String(API_PORT), '--log-level', 'warning',
], { stdio: 'inherit' });
let vite;
let browser;
try {
  await waitFor(`http://127.0.0.1:${API_PORT}/api/codepoints/slots`);
  // The server gzips a feed on first request; a warm server has done that.
  for (const c of ['codepoints', 'assigned']) {
    await (await fetch(`http://127.0.0.1:${API_PORT}/api/${c}/items/ucd`, { headers: { 'accept-encoding': 'gzip' } })).arrayBuffer();
  }
  const proxy = { '/api': `http://127.0.0.1:${API_PORT}` };
  const configFile = `${root}vite.config.ts`;
  if (DEV) {
    vite = await createServer({ root, configFile, logLevel: 'warn', server: { port: 5297, strictPort: false, proxy } });
    await vite.listen();
  } else {
    await build({ root, configFile, logLevel: 'warn', build: { outDir: `${root}dist`, emptyOutDir: true } });
    vite = await preview({ root, configFile, logLevel: 'warn',
                           build: { outDir: `${root}dist` }, preview: { port: 5297, strictPort: false, proxy } });
  }
  const base = vite.resolvedUrls.local[0];
  console.log(`serving ${DEV ? 'the dev server' : 'a production build'} at ${base}, dpr ${DPR}`);

  browser = await chromium.launch({ headless: true });
  const open = async () => {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
    await page.goto(`${base}#codepoints`);
    await page.waitForFunction((mark) => performance.getEntriesByName(mark).length > 0, MARK,
                               { timeout: 120_000, polling: 50 });
    return { context, page };
  };

  const warm = await open();
  await warm.context.close();

  const { page } = await open();
  const firstPaint = await page.evaluate((mark) => performance.getEntriesByName(mark)[0].startTime, MARK);
  report('first paint, every code point', firstPaint, GATES.firstPaintMs,
         firstPaint <= GATES.firstPaintTargetMs ? '' : `  target ${GATES.firstPaintTargetMs} ms not met`);
  const t = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const feed = performance.getEntriesByType('resource').find((r) => r.name.includes('/items/'));
    return { scripts: nav.domContentLoadedEventEnd, asked: feed?.startTime ?? NaN, got: feed?.responseEnd ?? NaN,
             wire: feed?.encodedBodySize ?? NaN, body: feed?.decodedBodySize ?? NaN };
  });
  const mb = (bytes) => (bytes / 1e6).toFixed(1);
  console.log(`        scripts loaded ${t.scripts.toFixed(0)} ms, feed asked ${t.asked.toFixed(0)} ms, `
    + `received ${t.got.toFixed(0)} ms (${mb(t.wire)} MB sent, ${mb(t.body)} MB unpacked), `
    + `drawn ${(firstPaint - t.got).toFixed(0)} ms after`);

  // Out far enough that the whole wall is on screen.
  const cx = VIEWPORT.width / 2;
  const cy = VIEWPORT.height / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(30); }
  await page.waitForFunction((mark) => {
    const marks = performance.getEntriesByName(mark);
    return marks.length > 0 && performance.now() - marks.at(-1).startTime > 300;
  }, MARK, { timeout: 30_000, polling: 100 }).catch(() => {});

  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    window.__recording = true;
    const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__recording) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.mouse.down();
  await page.mouse.move(cx - 400, cy - 250, { steps: 90 });
  await page.mouse.move(cx + 300, cy + 200, { steps: 90 });
  await page.mouse.up();
  for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, i % 12 < 6 ? -100 : 100); await page.waitForTimeout(40); }
  const frames = await page.evaluate(() => { window.__recording = false; return window.__frames.slice(1); });
  frames.sort((a, b) => a - b);
  const at = (q) => frames[Math.min(frames.length - 1, Math.floor(q * frames.length))];
  report('median frame, pan and zoom', at(0.5), GATES.medianFrameMs, `  ${frames.length} frames`);
  report('95th percentile frame', at(0.95), GATES.p95FrameMs, `  worst ${frames.at(-1).toFixed(1)} ms`);

  for (const [label, value] of CHANGES) {
    const ms = await page.evaluate(([label, value, mark]) => new Promise((resolve, reject) => {
      const row = [...document.querySelectorAll('label.wall-side__row')]
        .find((l) => l.firstChild?.textContent?.trim() === label);
      const select = row?.querySelector('select');
      if (!select) { reject(new Error(`no ${label} select`)); return; }
      const before = performance.getEntriesByName(mark).length;
      const t0 = performance.now();
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const check = () => {
        const marks = performance.getEntriesByName(mark);
        if (marks.length > before) resolve(marks.at(-1).startTime - t0);
        else if (performance.now() - t0 > 60_000) reject(new Error(`${label} ${value} never finished`));
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }), [label, value, MARK]);
    report(`${label.toLowerCase()} ${value}`, ms, GATES.changeMs);
  }
} finally {
  await browser?.close();
  await vite?.close();
  api.kill();
}
console.log(misses.length ? `MISSED ${misses.length}: ${misses.join(', ')}` : 'every gate passed');
process.exitCode = misses.length ? 1 : 0;
