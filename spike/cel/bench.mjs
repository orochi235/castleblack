import { celEnv, parse as bufParse, plan, isCelError } from '@bufbuild/cel'
import { strings } from '@bufbuild/cel/ext'
import { parse as marcParse } from '@marcbachmann/cel-js'

const N = 24591
const EXPR = 'item.open_defects > 0'
const items = Array.from({ length: N }, (_, i) => ({ open_defects: i % 7 === 0 ? 1 : 0 }))

const candidates = {
  buf () {
    const env = celEnv({ funcs: strings })
    const program = plan(env, bufParse(EXPR))
    return (item) => {
      const v = program({ item })
      return isCelError(v) ? false : v
    }
  },
  marc () {
    const program = marcParse(EXPR)
    return (item) => program({ item })
  }
}

for (const [name, compile] of Object.entries(candidates)) {
  const run = compile()
  for (let i = 0; i < 2000; i++) run(items[i]) // warm the JIT

  const t0 = performance.now()
  let truthy = 0
  for (let i = 0; i < N; i++) if (run(items[i])) truthy++
  const ms = performance.now() - t0

  console.log(`${name}: ${N} evals in ${ms.toFixed(1)} ms -- ${((ms * 1000) / N).toFixed(2)} us each (${truthy} true)`)
}
