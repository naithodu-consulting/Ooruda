'use client';

import { useOptimistic, useTransition } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
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
  updateChargeTypeCalcMethodAction,
  updateChargeTypeGstApplicableAction,
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
  per_unit: 'e.g. 500',
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
  gst_applicable: boolean;
}

interface Props {
  chargeTypes: ChargeType[];
  associationId: string;
  isSuperAdmin?: boolean;
  gstEnabled?: boolean;
}

export function ChargeTypesCard({
  chargeTypes,
  associationId,
  isSuperAdmin,
  gstEnabled,
}: Props) {
  const [optimistic, setOptimistic] = useOptimistic<
    ChargeType[],
    {
      id: string;
      is_active?: boolean;
      rate_or_amount?: number | null;
      calc_method?: string;
      gst_applicable?: boolean;
    }
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

  const handleCalcMethodToggle = (ct: ChargeType) => {
    const next = ct.calc_method === 'per_sqft' ? 'per_unit' : 'per_sqft';
    startTransition(async () => {
      setOptimistic({ id: ct.id, calc_method: next });
      const result = await updateChargeTypeCalcMethodAction(
        associationId,
        ct.id,
        next,
      );
      if (!result.success) {
        toast.error(result.error ?? 'Could not update calculation method.');
      }
    });
  };

  const handleGstToggle = (id: string, checked: boolean) => {
    startTransition(async () => {
      setOptimistic({ id, gst_applicable: checked });
      const result = await updateChargeTypeGstApplicableAction(
        associationId,
        id,
        checked,
      );
      if (!result.success) {
        toast.error(result.error ?? 'Could not update GST setting.');
      }
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
        {/* Column headers */}
        <div className="flex items-center gap-4 border-b pb-2">
          <div className="flex-1" />
          <div className="w-28" />
          {gstEnabled && (
            <span className="text-muted-foreground w-12 text-center text-[11px] font-medium tracking-wide">
              GST
            </span>
          )}
          <span className="text-muted-foreground w-12 text-center text-[11px] font-medium tracking-wide">
            Active
          </span>
        </div>

        <div className="divide-y">
          {optimistic.map((ct) => {
            const isElectricity = ct.calc_method === 'electricity';
            const isOtherCharges =
              ct.key === 'other_charges' || ct.key === 'sinking_fund';
            const isMaintenance = ct.key === 'maintenance';
            const needsRate =
              !isElectricity &&
              !isOtherCharges &&
              ct.is_active &&
              !ct.rate_or_amount;

            return (
              <div key={ct.id} className="flex items-center gap-4 py-3">
                {/* Name + meta */}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ct.name}</span>
                    {ct.is_builtin && (
                      <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide whitespace-nowrap uppercase">
                        Built-in
                      </span>
                    )}
                    {needsRate && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase">
                        Rate required
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {CALC_METHOD_LABELS[ct.calc_method] ?? ct.calc_method}
                      {' · '}
                      {ct.frequency}
                    </span>
                    {/* Maintenance calc method toggle */}
                    {isSuperAdmin &&
                      isMaintenance &&
                      (ct.calc_method === 'per_sqft' ||
                        ct.calc_method === 'per_unit') && (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <button
                                type="button"
                                className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-blue-600 uppercase transition-colors hover:bg-blue-100"
                              >
                                Switch to{' '}
                                {ct.calc_method === 'per_sqft'
                                  ? '₹/unit'
                                  : '₹/sq.ft'}
                              </button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Change Maintenance Method
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This changes how future maintenance bills are
                                calculated for the entire association. Are you
                                sure you want to proceed?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => handleCalcMethodToggle(ct)}
                              >
                                Switch Method
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                  </div>
                </div>

                {/* Rate input */}
                {!isElectricity && !isOtherCharges ? (
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
                ) : isOtherCharges ? (
                  <div className="w-28 text-right">
                    <span className="text-muted-foreground text-xs">
                      Ad-hoc
                    </span>
                  </div>
                ) : (
                  <div className="w-28" />
                )}

                {/* GST switch - hidden for electricity (pass-through billing) */}
                {gstEnabled && (
                  <div className="flex w-12 justify-center">
                    {!isElectricity ? (
                      <Switch
                        checked={ct.gst_applicable}
                        onCheckedChange={(checked) =>
                          handleGstToggle(ct.id, checked)
                        }
                        aria-label={`GST applicable for ${ct.name}`}
                      />
                    ) : (
                      <span
                        className="text-muted-foreground/40 text-xs"
                        title="Electricity is pass-through billing. GST not applicable"
                      >
                        —
                      </span>
                    )}
                  </div>
                )}

                {/* Active toggle */}
                <div className="flex w-12 justify-center">
                  <Switch
                    checked={ct.is_active}
                    onCheckedChange={(checked) => handleToggle(ct.id, checked)}
                    aria-label={`Toggle ${ct.name}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
