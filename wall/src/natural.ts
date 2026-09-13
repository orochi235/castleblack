/** Ordering ids that embed numbers.
 *
 *  A plain string compare reads one character at a time, so `10250` lands
 *  between `1` and `2` and `4100b` before `4100`. Splitting an id into runs
 *  of digits and runs of everything else, and comparing a digit run as a
 *  number, puts `4100` before `4100b` before `4101` before `10250`.
 */

const CHUNK = /\d+|\D+/g;

function chunks(text: string): (string | number)[] {
  return (text.match(CHUNK) ?? []).map((c) => (/^\d/.test(c) ? Number(c) : c));
}

/** Compares two ids component-wise. A digit run sorts before a letter run at
 *  the same position, which is what keeps `4100` ahead of `4100b`: the
 *  shorter id runs out of components first and sorts first. */
export function naturalCompare(a: string, b: string): number {
  const ca = chunks(a);
  const cb = chunks(b);
  for (let i = 0; i < Math.min(ca.length, cb.length); i += 1) {
    const x = ca[i]!;
    const y = cb[i]!;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x < y ? -1 : 1;
      continue;
    }
    if (typeof x === 'number') return -1;
    if (typeof y === 'number') return 1;
    // Code-unit order, not `localeCompare`: a sort on raw group names relies
    // on a `~` sigil landing after every letter, which a locale collation
    // reverses.
    if (x !== y) return x < y ? -1 : 1;
  }
  return ca.length - cb.length;
}
