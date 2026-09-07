import { run, isCelError } from '@bufbuild/cel'
import { evaluate } from '@marcbachmann/cel-js'

const patterns = JSON.parse(process.argv[2])
const out = {}
for (const p of patterns) {
  const expr = `s.matches(${JSON.stringify(p)})`
  const b = run(expr, { s: 'Brick' })
  let m
  try { m = evaluate(expr, { s: 'Brick' }) } catch (e) { m = `ERROR: ${String(e.message).split('\n')[0]}` }
  out[p] = { buf: isCelError(b) ? `ERROR: ${b.message}` : b, marc: m }
}
process.stdout.write(JSON.stringify(out))
