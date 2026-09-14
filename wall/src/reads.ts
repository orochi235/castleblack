import type { parse } from '@bufbuild/cel';

type ParsedExpr = ReturnType<typeof parse>;
type Expr = NonNullable<ParsedExpr['expr']>;

/** The item fields an expression reads, or null when it uses `item` in a way
 *  that cannot be narrowed to fields -- passed whole, or shadowed by a
 *  comprehension variable of the same name. */
export function readsOf(parsed: ParsedExpr): string[] | null {
  const fields = new Set<string>();
  const isItem = (e: Expr | undefined) =>
    e?.exprKind.case === 'identExpr' && e.exprKind.value.name === 'item';

  const walk = (e: Expr | undefined): boolean => {
    if (!e) return true;
    const k = e.exprKind;
    switch (k.case) {
      case 'identExpr':
        return k.value.name !== 'item';
      case 'constExpr':
        return true;
      case 'selectExpr':
        if (isItem(k.value.operand)) { fields.add(k.value.field); return true; }
        return walk(k.value.operand);
      case 'callExpr': {
        const { function: fn, target, args } = k.value;
        if (fn === '_[_]' && isItem(args[0]) && args[1]?.exprKind.case === 'constExpr'
            && args[1].exprKind.value.constantKind.case === 'stringValue') {
          fields.add(args[1].exprKind.value.constantKind.value);
          return true;
        }
        return walk(target) && args.every(walk);
      }
      case 'listExpr':
        return k.value.elements.every(walk);
      case 'structExpr':
        return k.value.entries.every((entry: (typeof k.value.entries)[number]) =>
          (entry.keyKind.case !== 'mapKey' || walk(entry.keyKind.value)) && walk(entry.value));
      case 'comprehensionExpr': {
        const c = k.value;
        if ([c.iterVar, c.iterVar2, c.accuVar].includes('item')) return false;
        return [c.iterRange, c.accuInit, c.loopCondition, c.loopStep, c.result].every(walk);
      }
      default:
        return false;
    }
  };

  return walk(parsed.expr) ? [...fields].sort() : null;
}
