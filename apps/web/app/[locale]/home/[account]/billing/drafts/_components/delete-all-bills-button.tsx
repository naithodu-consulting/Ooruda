'use client';

import { DangerZoneDeleteAll } from '../../../_components/danger-zone-delete-all';
import { deleteAllBillsAction } from '../../_lib/billing-actions';

/**
 * Client wrapper around `DangerZoneDeleteAll`.
 *
 * The shared danger-zone component takes an `onDelete` callback, and functions
 * cannot cross the server/client boundary — so the server page passes plain
 * counts and the action is bound here.
 */
export function DeleteAllBillsButton({
  associationId,
  accountSlug,
  counts,
}: {
  associationId: string;
  accountSlug: string;
  counts: { bills: number; payments: number; receipts: number };
}) {
  return (
    <DangerZoneDeleteAll
      confirmValue={accountSlug}
      buttonLabel="Delete all bills"
      dialogTitle="Delete all bills for this association?"
      description={`This permanently deletes ${counts.bills} bills, ${counts.payments} payments, and ${counts.receipts} receipts for this association, and resets bill numbering. This cannot be undone.`}
      disabled={counts.bills === 0}
      onDelete={() => deleteAllBillsAction(associationId)}
      formatSuccessMessage={(result) =>
        `Deleted ${result.deletedBills ?? 0} bills, ${result.deletedPayments ?? 0} payments, ${result.deletedReceipts ?? 0} receipts.`
      }
    />
  );
}
