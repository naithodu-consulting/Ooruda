'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { billTypeLabel } from '~/lib/bill-type-labels';
import { formatINR } from '~/lib/format-inr';

import { PayDueDialog } from './pay-due-dialog';
import { RazorpayDueCheckoutButton } from './razorpay-due-checkout';

export interface CashLedgerDueRow {
  unit_id: string;
  unit_no: string;
  bill_type: string;
  balance: number; // negative = outstanding
}

export interface PaidDueRow {
  unit_id: string;
  unit_no: string;
  bill_type: string;
  amount: number;
  paid_at: string;
  mode: string;
}

interface Props {
  associationId: string;
  dues: CashLedgerDueRow[];
  paidDues?: PaidDueRow[];
  canManage: boolean;
  canPay?: boolean;
  paidByRole?: 'Owner' | 'Tenant';
  isOwnerView?: boolean;
  unitCount?: number;
}

export function CashLedgerDuesSection({
  associationId,
  dues,
  paidDues = [],
  canManage,
  canPay = false,
  isOwnerView = false,
  unitCount = 1,
}: Props) {
  const router = useRouter();
  const [payTarget, setPayTarget] = useState<CashLedgerDueRow | null>(null);

  if (dues.length === 0 && paidDues.length === 0) return null;

  const showUnitColumn = !isOwnerView || (unitCount ?? 1) > 1;
  const hasPaid = paidDues.length > 0;
  const totalCount = dues.length + paidDues.length;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {isOwnerView
              ? hasPaid
                ? 'Dues'
                : 'Pending dues'
              : 'Cash ledger dues'}
            <span className="bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold">
              {totalCount}
            </span>
          </CardTitle>
          <CardDescription>
            {isOwnerView
              ? hasPaid
                ? 'Dues raised by the association.'
                : 'Other dues raised by the association.'
              : 'Standalone dues not tied to a generated bill.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {showUnitColumn && (
                    <TableHead className="pl-4">Unit</TableHead>
                  )}
                  <TableHead className={showUnitColumn ? '' : 'pl-4'}>
                    Bill type
                  </TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isOwnerView && <TableHead>Status</TableHead>}
                  {isOwnerView && hasPaid && <TableHead>Paid on</TableHead>}
                  {(canManage || canPay) && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dues.map((due) => (
                  <TableRow key={`outstanding-${due.unit_id}-${due.bill_type}`}>
                    {showUnitColumn && (
                      <TableCell className="py-3 pl-4 font-medium">
                        Unit {due.unit_no}
                      </TableCell>
                    )}
                    <TableCell
                      className={`py-3 ${showUnitColumn ? '' : 'pl-4'}`}
                    >
                      {billTypeLabel(due.bill_type)}
                    </TableCell>
                    <TableCell className="text-destructive py-3 text-right font-bold tabular-nums">
                      {formatINR(Math.abs(due.balance))}
                    </TableCell>
                    {isOwnerView && (
                      <TableCell className="py-3">
                        <Badge variant="destructive" className="text-xs">
                          Outstanding
                        </Badge>
                      </TableCell>
                    )}
                    {isOwnerView && hasPaid && (
                      <TableCell className="text-muted-foreground py-3 text-sm">
                        —
                      </TableCell>
                    )}
                    {canManage && (
                      <TableCell className="py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPayTarget(due)}
                        >
                          Record payment
                        </Button>
                      </TableCell>
                    )}
                    {canPay && (
                      <TableCell className="py-3 pr-4 text-right">
                        <RazorpayDueCheckoutButton
                          associationId={associationId}
                          unitId={due.unit_id}
                          unitNo={due.unit_no}
                          billType={due.bill_type}
                          outstanding={Math.abs(due.balance)}
                          onSuccess={() => router.refresh()}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {paidDues.map((pd, i) => (
                  <TableRow
                    key={`paid-${pd.unit_id}-${pd.bill_type}-${i}`}
                    className="opacity-75"
                  >
                    {showUnitColumn && (
                      <TableCell className="py-3 pl-4 font-medium">
                        Unit {pd.unit_no}
                      </TableCell>
                    )}
                    <TableCell
                      className={`py-3 ${showUnitColumn ? '' : 'pl-4'}`}
                    >
                      {billTypeLabel(pd.bill_type)}
                    </TableCell>
                    <TableCell className="py-3 text-right font-semibold tabular-nums">
                      {formatINR(pd.amount)}
                    </TableCell>
                    {isOwnerView && (
                      <TableCell className="py-3">
                        <Badge
                          variant="secondary"
                          className="border-green-200 bg-green-50 text-xs text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                        >
                          Paid
                        </Badge>
                      </TableCell>
                    )}
                    {isOwnerView && hasPaid && (
                      <TableCell className="text-muted-foreground py-3 text-sm">
                        {new Date(pd.paid_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                    )}
                    {(canManage || canPay) && <TableCell className="py-3" />}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {payTarget && (
        <PayDueDialog
          open={!!payTarget}
          onOpenChange={(v) => {
            if (!v) setPayTarget(null);
          }}
          associationId={associationId}
          unitId={payTarget.unit_id}
          unitNo={payTarget.unit_no}
          billType={payTarget.bill_type}
          outstanding={Math.abs(payTarget.balance)}
          onSuccess={() => {
            setPayTarget(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
