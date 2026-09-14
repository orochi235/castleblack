// Whether Arrow decodes the million-row feed in Chromium within 200 ms.
//
//   node hosts/unicode/bench/arrow-trial.mjs
//
// Serves the feed and Arrow's browser build, then times decode plus one read
// of every column buffer and dictionary, five runs.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const GATE_MS = 200;
const files = {
  '/arrow.js': ['node_modules/apache-arrow/Arrow.es2015.min.js', 'text/javascript'],
  '/codepoints.arrow': ['hosts/unicode/out/codepoints.arrow', 'application/octet-stream'],
};
const page = `<!doctype html><script src="/arrow.js"></script><script>
window.trial = async () => {
  const bytes = new Uint8Array(await (await fetch('/codepoints.arrow')).arrayBuffer());
  const runs = [];
  for (let run = 0; run < 5; run++) {
    const t0 = performance.now();
    const table = Arrow.tableFromIPC(bytes);
    const t1 = performance.now();
    for (const field of table.schema.fields) {
      for (const data of table.getChild(field.name).data) {
        const values = data.values;
        let sum = 0;
        for (let i = 0; i < values.length; i++) sum += Number(values[i]) & 1;
        if (data.dictionary) data.dictionary.toArray();
      }
    }
    runs.push({ rows: table.numRows, decode: t1 - t0, total: performance.now() - t0 });
  }
  return runs;
};
</script>`;

const server = createServer((req, res) => {
  const hit = files[req.url];
  if (!hit) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); return; }
  res.writeHead(200, { 'content-type': hit[1] });
  res.end(readFileSync(root + hit[0]));
}).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));

const browser = await chromium.launch({ headless: true });
try {
  const tab = await browser.newPage();
  await tab.goto(`http://127.0.0.1:${server.address().port}/`);
  const runs = await tab.evaluate(() => window.trial());
  runs.forEach((r, i) => console.log(`${i + 1}/5  ${r.rows} rows  decode ${r.decode.toFixed(1).padStart(6)} ms`
    + `  total ${r.total.toFixed(1).padStart(6)} ms`));
  const best = Math.min(...runs.slice(1).map((r) => r.total));
  console.log(`${best <= GATE_MS ? 'PASS' : 'MISS'}  warm total ${best.toFixed(1)} ms against ${GATE_MS} ms`);
  process.exitCode = best <= GATE_MS ? 0 : 1;
} finally {
  await browser.close();
  server.close();
}
