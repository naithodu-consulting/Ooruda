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
}) {
  const [open, setOpen] = useState(false);

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
          <DialogTitle>
            Bill {props.billNo} — {props.period}
          </DialogTitle>
          <DialogDescription>
            Line-by-line breakdown of this bill.
          </DialogDescription>
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
                <TableCell>
                  {li.description}
                  {li.gst_applicable ? (
                    <span className="text-muted-foreground ml-1 text-xs">
                      (GST)
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{li.payer}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatINR(li.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
