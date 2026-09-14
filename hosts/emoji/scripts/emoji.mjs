// Every fully-qualified emoji in Emoji 17.0, as the items `public/emoji.json` holds.
//
//   node hosts/emoji/scripts/emoji.mjs
//
// Fetches `emoji-test.txt` once into `.cache/`, checks it against a pinned
// sha256, and writes one item per emoji in the file's own order.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE = 'https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt';
export const SHA256 = '1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda';

const LINE = /^([0-9A-F ]+?)\s*;\s*fully-qualified\s*#\s*(\S+)\s+E(\d+\.\d+)\s+(.+)$/;

/** The fully-qualified emoji in `text`, with the group and subgroup each sits under. */
export function parse(text) {
  const items = [];
  let group = '';
  let subgroup = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('# group:')) { group = line.slice(8).trim(); continue; }
    if (line.startsWith('# subgroup:')) { subgroup = line.slice(11).trim(); continue; }
    const m = LINE.exec(line);
    if (!m) continue;
    const points = m[1].trim().split(/\s+/);
    items.push({
      id: points.join('-'),
      index: items.length,
      sha: null,
      emoji: m[2],
      name: m[4].trim(),
      group,
      subgroup,
      version: Number(m[3]),
      tone: points.some((p) => p >= '1F3FB' && p <= '1F3FF'),
    });
  }
  return items;
}

async function source(cache) {
  const path = resolve(cache, 'emoji-test.txt');
  if (!existsSync(path)) {
    console.log(`  fetching ${SOURCE}`);
    const response = await fetch(SOURCE);
    if (!response.ok) throw new Error(`${SOURCE}: ${response.status}`);
    mkdirSync(cache, { recursive: true });
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = readFileSync(path);
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== SHA256) throw new Error(`${path} has sha256 ${got}, expected ${SHA256}`);
  return bytes.toString('utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const items = parse(await source(resolve(here, '.cache')));
  mkdirSync(resolve(here, 'public'), { recursive: true });
  writeFileSync(resolve(here, 'public/emoji.json'), JSON.stringify({ items, version: 'emoji-17.0' }));
  console.log(`  wrote public/emoji.json, ${items.length} emoji`);
}
