/** Ordering ids that embed numbers.
 *
 *  A plain string compare reads one character at a time, so `10250` lands
 *  between `1` and `2` and `4100b` before `4100`. Splitting an id into runs
 *  of digits and runs of everything else, and comparing a digit run as a
 *  number, puts `4100` before `4100b` before `4101` before `10250`.
 */

const CHUNK = /\d+|\D+/g;

export type Chunks = (string | number)[];

/** An id split into its digit and non-digit runs, digits read as numbers. */
export function chunks(text: string): Chunks {
  return (text.match(CHUNK) ?? []).map((c) => (/^\d/.test(c) ? Number(c) : c));
}

/** A string that orders under plain `<` exactly as `naturalCompare` orders
 *  `text`: each digit run becomes a marker below every printable character
 *  followed by its digit count, so one string compare stands in for a run of
 *  chunk compares. Text holding U+0000 is not ordered faithfully. */
export function naturalKey(text: string): string {
  let i = 0;
  while (i < text.length && !isDigit(text.charCodeAt(i))) i++;
  if (i === text.length) return text;
  let out = text.slice(0, i);
  while (i < text.length) {
    const start = i;
    if (isDigit(text.charCodeAt(i))) {
      while (i < text.length && isDigit(text.charCodeAt(i))) i++;
      // Leading zeros dropped and the length first, so longer numbers sort later.
      let from = start;
      while (from < i - 1 && text.charCodeAt(from) === 48) from++;
      out += `\u0000${String.fromCharCode(64 + i - from)}${text.slice(from, i)}`;
    } else {
      while (i < text.length && !isDigit(text.charCodeAt(i))) i++;
      out += text.slice(start, i);
    }
  }
  return out;
}

const isDigit = (code: number) => code >= 48 && code <= 57;

/** Compares two ids component-wise. A digit run sorts before a letter run at
 *  the same position, which is what keeps `4100` ahead of `4100b`: the
 *  shorter id runs out of components first and sorts first. */
export function naturalCompare(a: string, b: string): number {
  return compareChunks(chunks(a), chunks(b));
}

/** `naturalCompare` over ids already split, for a sort that compares each id
 *  many times. */
export function compareChunks(ca: Chunks, cb: Chunks): number {
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
