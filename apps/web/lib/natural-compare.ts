/**
 * Human-friendly ordering for identifiers that mix letters and numbers.
 *
 * Unit numbers come back from Postgres via a plain `.order('unit_no')`, which
 * is a text sort — so an association's units list reads
 * `111, 404, 410, A1, A10, A12, A13, A2, A3`, with A10 landing before A2.
 * Residents look for "A2" where they expect it, not nine rows further down.
 *
 * `Intl.Collator` with `numeric` compares embedded digit runs as numbers, which
 * gives `A1, A2, A3, A10, A12, A13`. Built once, because constructing a
 * collator per comparison is the expensive part.
 */
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/** Compares two mixed letter/number labels in natural order. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Sorts a copy of `items` by a natural-order key, leaving the input untouched. */
export function sortNaturally<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => naturalCompare(key(a), key(b)));
}
