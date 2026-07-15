'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { Badge } from '@kit/ui/badge';
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
}

export function CashLedgerDuesSection({
  associationId,
  dues,
  canManage,
}: Props) {
  const router = useRouter();
  const [payTarget, setPayTarget] = useState<CashLedgerDueRow | null>(null);

  if (dues.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Cash Ledger Dues
            <Badge variant="destructive">{dues.length}</Badge>
          </CardTitle>
          <CardDescription>
            Standalone dues not tied to a generated bill.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Bill Type</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dues.map((due) => (
                  <TableRow key={`${due.unit_id}-${due.bill_type}`}>
                    <TableCell className="font-medium">
                      Unit {due.unit_no}
                    </TableCell>
                    <TableCell className="capitalize">
                      {due.bill_type}
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600 dark:text-red-400">
                      {formatINR(Math.abs(due.balance))}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <button
                          className="text-primary text-sm font-medium hover:underline"
                          onClick={() => setPayTarget(due)}
                        >
                          Pay
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
