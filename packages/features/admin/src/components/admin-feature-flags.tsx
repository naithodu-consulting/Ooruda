'use client';

import { useTransition } from 'react';

import { useAction } from 'next-safe-action/hooks';

import { Badge } from '@kit/ui/badge';
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

import { toggleAssociationFeatureFlagAction } from '../lib/server/admin-server-actions';

interface Props {
  associationId: string;
  flags: {
    expense_tracker: boolean;
    amc_reminder: boolean;
  };
}

export function AdminFeatureFlags({ associationId, flags }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={'text-base'}>Optional Features</CardTitle>
        <CardDescription>
          Enable or disable add-on features for this association.
        </CardDescription>
      </CardHeader>
      <CardContent className={'flex flex-col gap-y-4'}>
        <FeatureToggle
          associationId={associationId}
          feature={'expense_tracker'}
          enabled={flags.expense_tracker}
          label={'Expense Tracker'}
          description={
            'Track association expenses, vendors, and view analytics.'
          }
        />
        <FeatureToggle
          associationId={associationId}
          feature={'amc_reminder'}
          enabled={flags.amc_reminder}
          label={'AMC Reminder'}
          description={'Manage AMC contracts and receive renewal reminders.'}
        />
      </CardContent>
    </Card>
  );
}

function FeatureToggle({
  associationId,
  feature,
  enabled,
  label,
  description,
}: {
  associationId: string;
  feature: 'expense_tracker' | 'amc_reminder';
  enabled: boolean;
  label: string;
  description: string;
}) {
  const [, startTransition] = useTransition();
  const { execute, isPending } = useAction(toggleAssociationFeatureFlagAction, {
    onError: ({ error }) => {
      toast.error(error.serverError ?? `Failed to update ${label}.`);
    },
  });

  function handleToggle(value: boolean) {
    startTransition(() => {
      execute({ associationId, feature, enabled: value });
      toast.success(`${label} ${value ? 'enabled' : 'disabled'} successfully.`);
    });
  }

  return (
    <div
      className={'flex items-center justify-between rounded-lg border p-4'}
      data-test={`feature-flag-${feature}`}
    >
      <div className={'flex flex-col gap-y-1'}>
        <div className={'flex items-center gap-x-2'}>
          <Label
            className={'cursor-pointer font-medium'}
            htmlFor={`flag-${feature}`}
          >
            {label}
          </Label>
          <Badge
            variant={enabled ? 'default' : 'outline'}
            className={'text-xs'}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <p className={'text-muted-foreground text-xs'}>{description}</p>
      </div>

      <Switch
        id={`flag-${feature}`}
        checked={enabled}
        disabled={isPending}
        onCheckedChange={handleToggle}
        data-test={`flag-switch-${feature}`}
      />
    </div>
  );
}
