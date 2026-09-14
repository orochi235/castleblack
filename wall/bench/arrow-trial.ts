/** Whether Arrow decodes a million-row feed fast enough to build on.
 *
 *    npx vite-node bench/arrow-trial.ts [path/to/codepoints.arrow]
 *
 *  Decodes the table, then reads every column's buffer once and every
 *  dictionary's values: what the wall does before it can derive anything.
 */
import { readFileSync } from 'node:fs';
import { tableFromIPC } from 'apache-arrow';

const path = process.argv[2] ?? '../hosts/unicode/out/codepoints.arrow';
const bytes = readFileSync(path);

for (let run = 1; run <= 5; run++) {
  const t0 = performance.now();
  const table = tableFromIPC(bytes);
  const t1 = performance.now();
  let sum = 0;
  for (const field of table.schema.fields) {
    for (const data of table.getChild(field.name)!.data) {
      const values = data.values as ArrayLike<number | bigint>;
      for (let i = 0; i < values.length; i++) sum += Number(values[i]) & 1;
      if (data.dictionary) sum += data.dictionary.toArray().length;
    }
  }
  const t2 = performance.now();
  console.log(`${run}/5  ${table.numRows} rows  decode ${(t1 - t0).toFixed(1).padStart(6)} ms  `
    + `columns ${(t2 - t1).toFixed(1).padStart(6)} ms  total ${(t2 - t0).toFixed(1).padStart(6)} ms`
    + `  (${sum})`);
}
