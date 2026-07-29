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
          enabled
            ? 'Cash Ledger enabled for this workspace.'
            : 'Cash Ledger disabled for this workspace.',
        );
      } else {
        toast.error(result.error ?? 'Could not update the feature setting.');
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workspace Features</CardTitle>
        <CardDescription>
          Enable or disable optional features for this association workspace.
          Changes take effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
          <div className="flex items-center gap-3">
            <Wallet className="text-muted-foreground h-4 w-4 shrink-0" />
            <div>
              <Label className="text-sm font-medium">Cash Ledger</Label>
              <p className="text-muted-foreground text-xs">
                Per-unit advance payments and dues tracking ledger
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
