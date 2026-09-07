import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(readFileSync(join(HERE, 'expressions.json'), 'utf8'))

const impl = process.argv[2]
if (impl !== 'buf' && impl !== 'marc') {
  console.error('usage: node run.mjs <buf|marc>')
  process.exit(2)
}

// JSON cannot carry a BigInt, and an int that serializes differently per
// implementation would read as a disagreement it is not.
function plain (v) {
  if (typeof v === 'bigint') return Number(v)
  if (v === null || v === undefined) return v
  if (Array.isArray(v)) return v.map(plain)
  if (typeof v === 'object') {
    if (typeof v[Symbol.iterator] === 'function' && typeof v.size === 'number' && typeof v.get === 'function' && typeof v.has !== 'function') {
      return [...v].map(plain)
    }
    if (v instanceof Map || (typeof v.entries === 'function' && typeof v.has === 'function')) {
      return Object.fromEntries([...v.entries()].map(([k, val]) => [String(plain(k)), plain(val)]))
    }
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, plain(val)]))
  }
  return v
}

const evaluators = {
  async buf () {
    const { run, isCelError } = await import('@bufbuild/cel')
    const { strings } = await import('@bufbuild/cel/ext')
    // lowerAscii et al are not in @bufbuild/cel's standard set; they ship as an opt-in ext.
    const envOptions = { funcs: strings }
    return (expr, bindings) => {
      const out = run(expr, bindings, envOptions)
      if (isCelError(out)) throw new Error(out.message ?? String(out))
      return out
    }
  },
  async marc () {
    const { evaluate } = await import('@marcbachmann/cel-js')
    return (expr, bindings) => evaluate(expr, bindings)
  }
}

const evalOne = await evaluators[impl]()

const results = {}
let ok = 0
let failed = 0
for (const { key, expr } of corpus.expressions) {
  for (const [fixture, item] of Object.entries(corpus.fixtures)) {
    const cell = `${key}@${fixture}`
    try {
      results[cell] = { ok: true, value: plain(evalOne(expr, { ...corpus.bindings, item })) }
      ok++
    } catch (e) {
      results[cell] = { ok: false, error: String(e && e.message ? e.message : e).replace(/\s+/g, ' ').slice(0, 120) }
      failed++
    }
  }
}

const out = join(HERE, `results.${impl}.json`)
writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`)
console.log(`${impl}: ${ok + failed} cells, ${ok} evaluated, ${failed} errored -> ${out}`)
