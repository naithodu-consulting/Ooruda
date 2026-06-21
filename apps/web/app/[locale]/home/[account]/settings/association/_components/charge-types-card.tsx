'use client';

import { useOptimistic, useTransition } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Switch } from '@kit/ui/switch';

import { toggleChargeTypeAction } from '../_actions/update-association';

const CALC_METHOD_LABELS: Record<string, string> = {
  per_sqft: '₹ / sq.ft',
  flat: 'Flat ₹',
  per_unit: '₹ / unit',
  electricity: 'Electricity (computed)',
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
}

interface Props {
  chargeTypes: ChargeType[];
  associationId: string;
}

export function ChargeTypesCard({ chargeTypes, associationId }: Props) {
  const [optimistic, setOptimistic] = useOptimistic<
    ChargeType[],
    { id: string; is_active: boolean }
  >(chargeTypes, (state, { id, is_active }) =>
    state.map((ct) => (ct.id === id ? { ...ct, is_active } : ct)),
  );

  const [, startTransition] = useTransition();

  const handleToggle = (id: string, checked: boolean) => {
    startTransition(async () => {
      setOptimistic({ id, is_active: checked });
      await toggleChargeTypeAction(associationId, id, checked);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Charge Types</CardTitle>
        <CardDescription>
          These are the charges you can add to your bills. Turn on the ones your
          association uses and turn off the rest.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="divide-y">
          {optimistic.map((ct) => (
            <div
              key={ct.id}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ct.name}</span>
                  {ct.is_builtin && (
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                      Built-in
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

              <Switch
                checked={ct.is_active}
                onCheckedChange={(checked) => handleToggle(ct.id, checked)}
                aria-label={`Toggle ${ct.name}`}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
