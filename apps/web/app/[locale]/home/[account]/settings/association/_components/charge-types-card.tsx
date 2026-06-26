'use client';

import { useOptimistic, useTransition } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { toast } from '@kit/ui/sonner';
import { Switch } from '@kit/ui/switch';

import {
  toggleChargeTypeAction,
  updateChargeTypeRateAction,
} from '../_actions/update-association';

const CALC_METHOD_LABELS: Record<string, string> = {
  per_sqft: '₹ / sq.ft',
  flat: 'Flat ₹',
  per_unit: '₹ / unit',
  electricity: 'Electricity (computed)',
};

const RATE_PLACEHOLDER: Record<string, string> = {
  per_sqft: 'e.g. 14',
  flat: 'e.g. 500',
  per_unit: 'e.g. 200',
};

interface ChargeType {
  id: string;
  key: string;
  name: string;
  is_builtin: boolean;
  calc_method: string;
  frequency: string;
  default_payer: string;
  is_active: boolean;
  rate_or_amount: number | null;
}

interface Props {
  chargeTypes: ChargeType[];
  associationId: string;
}

export function ChargeTypesCard({ chargeTypes, associationId }: Props) {
  const [optimistic, setOptimistic] = useOptimistic<
    ChargeType[],
    { id: string; is_active?: boolean; rate_or_amount?: number | null }
  >(chargeTypes, (state, patch) =>
    state.map((ct) => (ct.id === patch.id ? { ...ct, ...patch } : ct)),
  );

  const [, startTransition] = useTransition();

  const handleToggle = (id: string, checked: boolean) => {
    startTransition(async () => {
      setOptimistic({ id, is_active: checked });
      await toggleChargeTypeAction(associationId, id, checked);
    });
  };

  const handleRateBlur = (ct: ChargeType, raw: string) => {
    const trimmed = raw.trim();
    const rate = trimmed === '' ? null : parseFloat(trimmed);

    if (trimmed !== '' && (isNaN(rate!) || rate! < 0)) {
      toast.error('Enter a valid positive number for the rate.');
      return;
    }

    if (rate === ct.rate_or_amount) return;

    startTransition(async () => {
      setOptimistic({ id: ct.id, rate_or_amount: rate });
      const result = await updateChargeTypeRateAction(
        associationId,
        ct.id,
        rate,
      );
      if (!result.success) {
        toast.error(result.error ?? 'Could not save rate.');
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Charge Types</CardTitle>
        <CardDescription>
          Enable the charges your association uses and set their rates. Bills
          cannot be generated until active charge types have a rate set.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="divide-y">
          {optimistic.map((ct) => {
            const isElectricity = ct.calc_method === 'electricity';
            const needsRate =
              !isElectricity && ct.is_active && !ct.rate_or_amount;

            return (
              <div key={ct.id} className="flex items-center gap-4 py-3">
                {/* Name + meta */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ct.name}</span>
                    {ct.is_builtin && (
                      <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                        Built-in
                      </span>
                    )}
                    {needsRate && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase">
                        Rate required
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {CALC_METHOD_LABELS[ct.calc_method] ?? ct.calc_method}
                    {' · '}
                    {ct.frequency}
                    {' · '}
                    {ct.default_payer}
                  </span>
                </div>

                {/* Rate input (non-electricity only) */}
                {!isElectricity ? (
                  <div className="flex w-28 items-center">
                    <span className="text-muted-foreground mr-1 text-sm">
                      ₹
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={ct.rate_or_amount ?? ''}
                      placeholder={RATE_PLACEHOLDER[ct.calc_method] ?? '0'}
                      className="h-8 text-sm"
                      onBlur={(e) => handleRateBlur(ct, e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="w-28" />
                )}

                {/* Toggle */}
                <Switch
                  checked={ct.is_active}
                  onCheckedChange={(checked) => handleToggle(ct.id, checked)}
                  aria-label={`Toggle ${ct.name}`}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
