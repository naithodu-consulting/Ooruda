'use client';

import { useState } from 'react';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import { formatINR } from '~/lib/format-inr';
import { formatPeriod } from '~/lib/format-period';

export interface BillLineItemRow {
  id: string;
  description: string;
  payer: string;
  gst_applicable: boolean;
  amount: number;
}

export function BillLineItemsDialog(props: {
  billNo: string;
  period: string;
  lineItems: BillLineItemRow[];
  gstAmount?: number | null;
}) {
  const [open, setOpen] = useState(false);

  const subtotal = props.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const gst = props.gstAmount ?? 0;
  const halfGst = gst / 2;
  const total = subtotal + gst;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            View breakdown
          </Button>
        }
      />

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bill Details</DialogTitle>
          <DialogDescription className="sr-only">
            Bill {props.billNo} for {formatPeriod(props.period)}
          </DialogDescription>
          <div className="flex flex-col gap-0.5">
            <span className="text-foreground text-sm font-medium">
              {formatPeriod(props.period)}
            </span>
            <span className="text-muted-foreground text-xs">
              #{props.billNo}
            </span>
          </div>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Charge</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.lineItems.map((li) => (
              <TableRow key={li.id}>
                <TableCell>{li.description}</TableCell>
                <TableCell>{li.payer}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatINR(li.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Compact GST summary — only shown when GST was applied */}
        {gst > 0 && (
          <div className="border-t pt-3">
            <div className="text-muted-foreground flex flex-col gap-1 text-xs">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>CGST + SGST</span>
                <span className="tabular-nums">
                  {formatINR(halfGst)} + {formatINR(halfGst)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex justify-between text-sm font-semibold">
              <span>Total (GST inclusive)</span>
              <span className="tabular-nums">{formatINR(total)}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
