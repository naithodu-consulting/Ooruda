import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import { addDays } from '~/lib/villa-db/dates';

/**
 * The audit trail of a coupon code, in the words of the screen.
 *
 * `villa_discount_audit` stores a full snapshot of the terms after every
 * change, so "what changed" is a diff of consecutive snapshots rather than
 * anything the writer had to record. Computed on the server: the client only
 * renders the sentences.
 */

/** One row of `villa_discount_audit`, as the History panel selects it. */
export interface DiscountAuditRow {
  action: string;
  created_at: string;
  actor_name: string | null;
  terms: unknown;
}

/** The one-line summary the list shows without loading the whole trail. */
export interface DiscountLastAction {
  action: string;
  at: string;
  actorName: string | null;
}

export interface DiscountChange {
  label: string;
  from: string;
  to: string;
}

export interface DiscountHistoryEntry {
  action: string;
  at: string;
  actorName: string | null;
  /** Empty for anything but 'updated', and for an update that only changed
   *  the status (an edit that voided an approval, say). */
  changes: DiscountChange[];
  /** An 'updated' entry with nothing before it to compare against — the
   *  terms it replaced were never recorded. Not the same as "nothing
   *  changed", and the panel must not say it was. */
  unknownBefore: boolean;
}

type Terms = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown) => Number(v ?? 0);

/**
 * The terms a person set, in the order the form shows them. Status,
 * approvals and the row's own identifiers are left out: the action label
 * already says "Approved by Ooruda", and repeating it as a change would
 * double-count it.
 */
const FIELDS: {
  key: string;
  label: string;
  /** Compare as numbers: PostgREST returns numerics as strings, and the
   *  stored scale has changed before ('10' vs '10.00' is not an edit). Only
   *  for fields that really are numbers — a code of '0100' is not '100'. */
  numeric?: true;
  format: (v: unknown, t: Terms) => string;
}[] = [
  { key: 'code', label: 'Code', format: str },
  {
    key: 'discount_type',
    label: 'Discount type',
    format: (v) => (v === 'flat' ? 'Flat amount off' : 'Percentage off'),
  },
  {
    key: 'discount_value',
    numeric: true,
    label: 'Discount',
    format: (v, t) =>
      t.discount_type === 'flat'
        ? `${formatINR(num(v))} off`
        : `${num(v)}% off`,
  },
  {
    key: 'max_discount',
    numeric: true,
    label: 'Maximum saving',
    format: (v) => (v === null || v === undefined ? 'None' : formatINR(num(v))),
  },
  {
    key: 'valid_from',
    label: 'Valid from',
    format: (v) => (v ? formatDateReadable(str(v)) : ''),
  },
  {
    key: 'valid_to',
    label: 'Valid until',
    format: (v) => (v ? formatDateReadable(str(v)) : ''),
  },
  {
    key: 'min_nights',
    numeric: true,
    label: 'Minimum nights',
    format: (v) => `${num(v)} night${num(v) === 1 ? '' : 's'}`,
  },
  {
    key: 'min_booking_value',
    numeric: true,
    label: 'Minimum booking value',
    format: (v) => (num(v) > 0 ? formatINR(num(v)) : 'None'),
  },
  {
    key: 'max_uses',
    numeric: true,
    label: 'Total uses allowed',
    format: (v) => (v === null || v === undefined ? 'No limit' : str(v)),
  },
  {
    key: 'max_uses_per_guest',
    numeric: true,
    label: 'Uses per guest',
    format: (v) => str(v),
  },
  {
    key: 'blackouts',
    label: 'Blackout nights',
    // The dates, not just the count: moving a blackout without adding one is
    // a real change, and "2 ranges → 2 ranges" would hide it.
    format: (v) => {
      const list = Array.isArray(v)
        ? (v as { start?: string; end?: string }[])
        : [];

      if (!list.length) return 'None';

      return list
        .map((b) => {
          if (!b.start || !b.end) return '?';
          // Stored end-exclusive; people think in nights, so show the last.
          const lastNight = addDays(b.end, -1);
          return b.start === lastNight
            ? formatDateReadable(b.start)
            : `${formatDateReadable(b.start)} – ${formatDateReadable(lastNight)}`;
        })
        .join(', ');
    },
  },
  { key: 'note', label: 'Note', format: (v) => (v ? str(v) : 'None') },
];

function same(a: unknown, b: unknown, numeric?: boolean): boolean {
  // `blackouts` is an array, so compare it by value, not by reference.
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  }

  if (numeric) {
    // null is "no limit", which is not the number zero, so a null on either
    // side is only unchanged if both sides are null.
    const an = a === null || a === undefined ? null : Number(a);
    const bn = b === null || b === undefined ? null : Number(b);
    if (an === null || bn === null) return an === bn;
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an === bn;
  }

  return str(a) === str(b);
}

function describe(before: Terms, after: Terms): DiscountChange[] {
  const changes: DiscountChange[] = [];

  for (const f of FIELDS) {
    if (same(before[f.key], after[f.key], f.numeric)) continue;
    changes.push({
      label: f.label,
      from: f.format(before[f.key], before),
      to: f.format(after[f.key], after),
    });
  }

  return changes;
}

/**
 * Build one code's history, newest first.
 *
 * @param rows that code's audit rows, newest first.
 */
export function buildDiscountHistory(
  rows: DiscountAuditRow[],
): DiscountHistoryEntry[] {
  return rows.map((row, i) => {
    // Newest first, so the snapshot this one changed is the NEXT row.
    const previous = rows[i + 1];
    const isUpdate = row.action === 'updated';

    return {
      action: row.action,
      at: row.created_at,
      actorName: row.actor_name,
      changes:
        isUpdate && previous
          ? describe(
              (previous.terms ?? {}) as Terms,
              (row.terms ?? {}) as Terms,
            )
          : [],
      unknownBefore: isUpdate && !previous,
    };
  });
}
