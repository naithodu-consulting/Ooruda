'use client';

import { useRef, useState, useTransition } from 'react';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';

import { voidBillAction, voidBillsBulkAction } from '../_lib/billing-actions';

// ── Single-bill void ──────────────────────────────────────────────────────────

interface VoidBillDialogProps {
  open: boolean;
  billId: string;
  billNo: string;
  associationId: string;
  onClose: () => void;
  onVoided: () => void;
}

export function VoidBillDialog({
  open,
  billId,
  billNo,
  associationId,
  onClose,
  onVoided,
}: VoidBillDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleOpenChange(next: boolean) {
    if (!next && !isPending) {
      setReason('');
      setError(null);
      onClose();
    }
  }

  function handleSubmit() {
    if (!reason.trim()) {
      setError('Please enter a reason before voiding.');
      textareaRef.current?.focus();
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await voidBillAction(associationId, {
        billId,
        reason: reason.trim(),
      });

      if (!result.success) {
        setError(result.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setReason('');
      onVoided();
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Void Bill</DialogTitle>
          <DialogDescription>
            Bill <span className="font-mono font-medium">{billNo}</span> will be
            voided. This cannot be undone. The bill number will never be reused.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Only bills with no payments or advance credit applied can be
              voided.
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Reason for voiding *</Label>
            <Textarea
              ref={textareaRef}
              id="void-reason"
              placeholder="e.g. Incorrect charge amount, wrong unit, duplicate bill…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
              required
              aria-required="true"
              disabled={isPending}
            />
            {error && (
              <p className="text-sm text-[var(--color-danger)]">{error}</p>
            )}
          </div>
        </div>

        {/* Plain flex row — avoids DialogFooter's hardcoded bg-muted which clashes with the dialog's bg-popover */}
        <div className="flex flex-row justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Keep Bill
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isPending || !reason.trim()}
          >
            {isPending ? 'Voiding…' : 'Void Bill'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk void ─────────────────────────────────────────────────────────────────

interface VoidBillsBulkDialogProps {
  open: boolean;
  associationId: string;
  period: string;
  periodLabel: string;
  billCount: number;
  onClose: () => void;
  onVoided: (count: number) => void;
}

export function VoidBillsBulkDialog({
  open,
  associationId,
  period,
  periodLabel,
  billCount,
  onClose,
  onVoided,
}: VoidBillsBulkDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next && !isPending) {
      setReason('');
      setError(null);
      onClose();
    }
  }

  function handleSubmit() {
    if (!reason.trim()) {
      setError('Please enter a reason before voiding.');
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await voidBillsBulkAction(associationId, {
        period,
        billType: 'all',
        reason: reason.trim(),
      });

      if (!result.success) {
        setError(result.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setReason('');
      onVoided(result.voided ?? 0);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Void All Bills — {periodLabel}</DialogTitle>
          <DialogDescription>
            All {billCount} bill{billCount !== 1 ? 's' : ''} for{' '}
            <strong>{periodLabel}</strong> will be voided. Bills with payments
            or advance credit applied are automatically skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This cannot be undone. Bill numbers will never be reused. After
              voiding, you can re-generate corrected bills for this period.
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-void-reason">Reason for voiding *</Label>
            <Textarea
              id="bulk-void-reason"
              placeholder="e.g. Incorrect rates applied, re-generating with updated charges…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
              required
              aria-required="true"
              disabled={isPending}
            />
            {error && (
              <p className="text-sm text-[var(--color-danger)]">{error}</p>
            )}
          </div>
        </div>

        {/* Plain flex row — avoids DialogFooter's hardcoded bg-muted which clashes with the dialog's bg-popover */}
        <div className="flex flex-row justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Keep Bills
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isPending || !reason.trim()}
          >
            {isPending
              ? 'Voiding…'
              : `Void ${billCount} Bill${billCount !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
