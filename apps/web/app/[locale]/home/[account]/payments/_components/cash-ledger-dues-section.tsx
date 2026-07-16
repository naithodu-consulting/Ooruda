'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

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

export interface CashLedgerDueRow {
  unit_id: string;
  unit_no: string;
  bill_type: string;
  balance: number; // negative = outstanding
}

interface Props {
  associationId: string;
  dues: CashLedgerDueRow[];
  canManage: boolean;
  isOwnerView?: boolean;
  unitCount?: number;
}

export function CashLedgerDuesSection({
  associationId,
  dues,
  canManage,
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
            {isOwnerView ? 'Pending dues' : 'Cash ledger dues'}
            <span className="bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold">
              {dues.length}
            </span>
          </CardTitle>
          <CardDescription>
            {isOwnerView
              ? 'Amounts not linked to a monthly bill.'
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
                  <TableHead className="pr-4 text-right">Outstanding</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dues.map((due) => (
                  <TableRow key={`${due.unit_id}-${due.bill_type}`}>
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
                    <TableCell className="text-destructive py-3 pr-4 text-right font-bold tabular-nums">
                      {formatINR(Math.abs(due.balance))}
                    </TableCell>
                    {canManage && (
                      <TableCell className="py-3 text-right">
                        <button
                          className="text-primary text-sm font-medium hover:underline"
                          onClick={() => setPayTarget(due)}
                        >
                          Record payment
                        </button>
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
          onSuccess={() => {
            setPayTarget(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
