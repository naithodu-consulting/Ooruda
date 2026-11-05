/**
 * Retiring a channel stay that was filled in by mistake.
 *
 * Pure: the rules about WHETHER a stay may be voided, and what the activity
 * entry says about it, are decided here without touching either database, so
 * they are unit-tested directly (`enrichment-void.test.ts`).
 *
 * WHY THIS EXISTS, given a booking can already be cancelled. Cancelling only
 * flips the site's status (`cancelBooking`). It does not touch the money, and
 * enrichment records money: a payout receipt for the full amount, and a
 * commission expense when channel charges were entered. Reports reads
 * `villa_booking_payments` filtered on `voided_at is null` with no join to
 * booking status, so a cancelled-but-not-voided enrichment leaves its payout
 * counted as cash received for ever. Cancelling is also gated on
 * `today <= check_in` in the UI, so a mistake found after the guest's arrival
 * date has no remedy at all today.
 *
 * WHY THE SITE STATUS STAYS 'cancelled'. villa-booking's
 * `bookings_channel_event_unique` partial index excludes only
 * `status <> 'cancelled'`, so a row carrying any other status - 'voided'
 * included - stays inside the index and re-enriching the same iCal event
 * fails on a duplicate key for ever. That is the opposite of what voiding is
 * for, so the "created in error" distinction lives in Ooruda's own activity
 * log instead. Changing that would need a migration in the villa-booking
 * repo (its TODO: widen the index predicate), not here.
 */

/** What the caller knows about the booking before voiding it. */
export interface VoidableBooking {
  status: string;
  /** Non-null for a stay a channel feed sold; null for a direct booking. */
  sourceFeedId: string | null;
}

export interface VoidRefusal {
  code: 'NOT_CHANNEL_SOLD' | 'ALREADY_RETIRED';
  message: string;
}

/**
 * Whether this booking may be voided, or why not.
 *
 * Deliberately NOT gated on the check-in date, unlike cancelling. A wrong
 * enrichment is usually found late - when the payout does not reconcile, or
 * when the channel's own report is read at month end - and refusing then is
 * what leaves the phantom receipt in the ledger.
 */
export function checkVoidable(booking: VoidableBooking): VoidRefusal | null {
  if (booking.sourceFeedId === null) {
    return {
      code: 'NOT_CHANNEL_SOLD',
      message:
        'This booking was taken directly, not filled in from a channel calendar. Cancel it instead.',
    };
  }

  if (booking.status === 'cancelled') {
    return {
      code: 'ALREADY_RETIRED',
      message: 'This stay is already cancelled.',
    };
  }

  return null;
}

/**
 * What the void actually managed to undo, for the activity entry.
 *
 * Every field has a value for "could not tell" or "could not do it", and none
 * of them is folded into the "nothing to do" case. Nothing after the stay is
 * cancelled throws: a half-done void that reported failure used to leave the
 * money reversed, the stay still live and no activity row at all, which is
 * worse than any of these outcomes. So each step records what happened and
 * the operator is told which remedy to apply by hand.
 */
export interface VoidOutcome {
  /**
   * The payout receipt. 'voided' is the normal path, 'none' means the
   * enrichment never recorded one, and 'failed' means it exists and is still
   * standing - which has to be said, because the money is still counted.
   */
  receipt: 'voided' | 'none' | 'failed';
  /**
   * The commission expense. 'removed' when exactly one matched, 'none' when
   * the enrichment never recorded one, 'ambiguous' when more than one matched,
   * and 'unknown' when the lookup itself failed. In the last two nothing was
   * deleted and a person has to look.
   */
  commission: 'removed' | 'none' | 'ambiguous' | 'unknown';
  /** Rupees removed, when `commission` is 'removed'. */
  commissionAmount?: number;
}

/**
 * The activity note: the operator's reason, then what was and was not undone.
 *
 * Every outcome is stated, including the ones that did nothing. A void that
 * silently left a payout receipt standing would be worse than no void at all,
 * because the operator would believe the money had been taken back out.
 */
export function buildVoidNote(reason: string, outcome: VoidOutcome): string {
  const parts: string[] = ['Stay cancelled on the booking site'];

  parts.push(
    outcome.receipt === 'voided'
      ? 'Payout receipt voided'
      : outcome.receipt === 'none'
        ? 'No payout receipt to void'
        : 'Payout receipt could NOT be voided - void it by hand in Payments',
  );

  if (outcome.commission === 'removed') {
    parts.push(
      `Commission expense removed${
        outcome.commissionAmount === undefined
          ? ''
          : ` (₹${outcome.commissionAmount.toLocaleString('en-IN')})`
      }`,
    );
  } else if (outcome.commission === 'ambiguous') {
    parts.push(
      'Commission expense NOT removed - more than one matched, remove it by hand',
    );
  } else if (outcome.commission === 'unknown') {
    parts.push(
      'Commission expense NOT checked - the lookup failed, check Expenses by hand',
    );
  }

  return `${reason.trim()} — ${parts.join('; ')}`;
}

/**
 * The note enrichment writes on a commission expense, and the only link
 * between that expense and its booking - there is no foreign key.
 *
 * Shared by the writer and the matcher on purpose: when the two were written
 * out separately, one edit to either string would have silently stopped every
 * future void from finding the expense.
 */
export function commissionNoteFor(channel: string, bookingRef: string): string {
  return `Commission/charges deducted by ${channel} for booking ${bookingRef}`;
}

/** The fragment a commission expense's note must contain to be this booking's. */
export function commissionNoteFragment(bookingRef: string): string {
  return `for booking ${bookingRef.trim()}`;
}

/**
 * Does this expense belong to this booking?
 *
 * Enrichment writes the booking's code into the expense note
 * (`...for booking <code>`), which is the only link between the two - there is
 * no foreign key. Matching is therefore done on the note, and the caller
 * deletes only on an unambiguous single match: guessing which of several
 * commission rows to delete is worse than leaving one for a person.
 */
export function commissionNoteMatches(
  note: string | null,
  bookingRef: string,
): boolean {
  if (!note || bookingRef.trim() === '') return false;

  return note.includes(commissionNoteFragment(bookingRef));
}
