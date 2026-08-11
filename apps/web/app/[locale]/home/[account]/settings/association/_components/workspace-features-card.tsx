'use client';

import { useTransition } from 'react';

import { Wallet } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Label } from '@kit/ui/label';
import { toast } from '@kit/ui/sonner';
import { Switch } from '@kit/ui/switch';

import { toggleCashLedgerEnabledAction } from '../_actions/update-association';

export function WorkspaceFeaturesCard({
  associationId,
  cashLedgerEnabled,
}: {
  associationId: string;
  cashLedgerEnabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleCashLedgerToggle = (enabled: boolean) => {
    startTransition(async () => {
      const result = await toggleCashLedgerEnabledAction(
        associationId,
        enabled,
      );
      if (result.success) {
        toast.success(
          enabled ? 'Cash Ledger is now on.' : 'Cash Ledger is now off.',
        );
      } else {
        toast.error(result.error ?? 'Could not update the feature setting.');
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Optional Features</CardTitle>
        <CardDescription>
          Turn optional features on or off for this association. Changes take
          effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
          <div className="flex items-center gap-3">
            <Wallet className="text-muted-foreground h-4 w-4 shrink-0" />
            <div>
              <Label className="text-sm font-medium">Cash Ledger</Label>
              <p className="text-muted-foreground text-xs">
                Track advance payments and outstanding dues per unit
              </p>
            </div>
          </div>
          <Switch
            checked={cashLedgerEnabled}
            onCheckedChange={handleCashLedgerToggle}
            disabled={isPending}
            aria-label="Toggle Cash Ledger"
          />
        </div>
      </CardContent>
    </Card>
  );
}
