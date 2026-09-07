import { run, celEnv, plan, parse, celMap, celList, isCelError, isCelList, isCelMap } from '@bufbuild/cel'
import { strings } from '@bufbuild/cel/ext'

const obj = { a: 1, tags: ['popular'], cat: 'Brick' }
console.log('plain object binding:', run('item.a', { item: obj }))
const m = celMap(new Map(Object.entries(obj)))
console.log('celMap binding:', run('item.a', { item: m }))
console.log('in:', run("'popular' in item.tags", { item: m }))
console.log('has:', run('has(item.tags)', { item: m }))
console.log('has missing:', run('has(item.nope)', { item: m }))
console.log('missing:', run('item.nope', { item: m }))
console.log('lowerAscii std:', run('item.cat.lowerAscii()', { item: m }))
console.log('lowerAscii ext:', run('item.cat.lowerAscii()', { item: m }, { funcs: strings }))
console.log('matches:', run("item.cat.matches('^[~=_|]')", { item: m }))
console.log('startsWith:', run("item.cat.startsWith('B')", { item: m }))
console.log('gt:', run('item.a > 0', { item: m }))
console.log('null eq:', run('item.z == null', { item: celMap(new Map([['z', null]])) }))
console.log('list out:', run('item.tags', { item: m }))
