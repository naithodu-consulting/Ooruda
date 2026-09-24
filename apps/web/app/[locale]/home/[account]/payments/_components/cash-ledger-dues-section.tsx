'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { billTypeLabel } from '@kit/pdf-templates/bill-type-labels';
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

import { formatINR } from '~/lib/format-inr';

import { PayDueDialog } from './pay-due-dialog';
import { RazorpayDueCheckoutButton } from './razorpay-due-checkout';

export interface CashLedgerDueRow {
  unit_id: string;
  unit_no: string;
  bill_type: string;
  balance: number; // negative = outstanding
  hasTenancy?: boolean;
}

interface Props {
  associationId: string;
  dues: CashLedgerDueRow[];
  canManage: boolean;
  canPay?: boolean;
  isOwnerView?: boolean;
  unitCount?: number;
}

export function CashLedgerDuesSection({
  associationId,
  dues,
  canManage,
  canPay = false,
  isOwnerView = false,
  unitCount = 1,
}: Props) {
  const router = useRouter();
  const [payTarget, setPayTarget] = useState<CashLedgerDueRow | null>(null);

  if (dues.length === 0) return null;

  const showUnitColumn = !isOwnerView || (unitCount ?? 1) > 1;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {isOwnerView ? 'Outstanding Dues' : 'Cash Ledger Dues'}
            <span className="bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold">
              {dues.length}
            </span>
          </CardTitle>
          <CardDescription>
            {isOwnerView
              ? 'Additional charges raised by the association, separate from your monthly bills.'
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
                    Charge type
                  </TableHead>
                  <TableHead className="text-right">Amount due</TableHead>
                  {(canManage || canPay) && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dues.map((due) => (
                  <TableRow key={`${due.unit_id}-${due.bill_type}`}>
                    {showUnitColumn && (
                      <TableCell className="py-3 pl-4 font-medium">
                        {due.unit_no}
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
                    {canManage && (
                      <TableCell className="py-3 pr-4 text-right">
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
          hasTenancy={payTarget.hasTenancy ?? false}
          onSuccess={() => {
            setPayTarget(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
