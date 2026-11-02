'use client';

import { useMemo, useState } from 'react';

import { Pencil, Trash2, X } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { toast } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';

import { RupeeInput } from '~/components/rupee-input';
import { todayInBillingZone } from '~/lib/billing-dates';
import { formatDateReadable } from '~/lib/format-date';
import { formatINR } from '~/lib/format-inr';
import type { BaseRates, RateGroup } from '~/lib/villa-db/rates';

import {
  deleteRateGroupAction,
  saveRateGroupAction,
} from '../_lib/server/villa-settings-actions';
import {
  type RateCalendarNight,
  RateCalendar,
  isWeekendNight,
} from './rate-calendar';

/** What the form is doing: a new rate, or editing an existing one. */
type Editing = { groupKey: string; name: string } | 'new' | null;

function groupKey(group: RateGroup): string {
  return `${group.name}\u0000${group.nightlyRate}\u0000${group.minStayNights}`;
}

/**
 * Describe a set of nights the way a person would say it: runs as ranges,
 * single nights on their own.
 */
function describeNights(nights: readonly string[]): string {
  if (nights.length === 0) return 'No nights';

  const parts: string[] = [];
  let start = nights[0]!;
  let previous = start;

  const flush = () => {
    parts.push(
      start === previous
        ? formatDateReadable(start)
        : `${formatDateReadable(start)} – ${formatDateReadable(previous)}`,
    );
  };

  for (const night of nights.slice(1)) {
    const expected = new Date(`${previous}T00:00:00Z`).getTime() + 86_400_000;

    if (new Date(`${night}T00:00:00Z`).getTime() === expected) {
      previous = night;
      continue;
    }

    flush();
    start = night;
    previous = night;
  }

  flush();
  return parts.join(', ');
}

export function SeasonalRates(props: {
  accountId: string;
  propertyId: string;
  canEdit: boolean;
  groups: RateGroup[];
  rates: BaseRates;
}) {
  const today = todayInBillingZone();

  const [editing, setEditing] = useState<Editing>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [nightlyRate, setNightlyRate] = useState('');
  const [minStay, setMinStay] = useState('1');
  const [error, setError] = useState<string | null>(null);

  // Which named rate covers each night, for the grid's colours and prices.
  const ruleByNight = useMemo(() => {
    const map = new Map<string, RateGroup>();
    for (const group of props.groups) {
      for (const night of group.nights) map.set(night, group);
    }
    return map;
  }, [props.groups]);

  const editingGroup =
    editing && editing !== 'new'
      ? props.groups.find((g) => groupKey(g) === editing.groupKey)
      : undefined;

  const nightFor = (date: string): RateCalendarNight => {
    const group = ruleByNight.get(date);
    const isWeekend = isWeekendNight(date);
    // While a rate is open, its own nights are free to take or drop; every
    // other rate's nights are locked, because two rates on one night is the
    // one thing the booking site refuses.
    const ownedByAnother =
      group && (!editingGroup || groupKey(group) !== groupKey(editingGroup));

    return {
      date,
      rate:
        group?.nightlyRate ??
        (isWeekend ? props.rates.weekendNightly : props.rates.weekdayNightly),
      ruleName: group?.name ?? null,
      isWeekend,
      isPast: date < today,
      lockedBy: ownedByAnother ? group.name : null,
    };
  };

  const reset = () => {
    setEditing(null);
    setSelected(new Set());
    setName('');
    setNightlyRate('');
    setMinStay('1');
    setError(null);
  };

  const save = useAction(saveRateGroupAction, {
    onSuccess: () => {
      toast.success(editing === 'new' ? 'Rate added' : 'Rate updated');
      reset();
    },
    onError: ({ error }) => {
      const message = error.serverError ?? 'Could not save the rate.';
      setError(message);
      toast.error(message);
    },
  });

  const startNew = () => {
    reset();
    setEditing('new');
  };

  const startEdit = (group: RateGroup) => {
    setEditing({ groupKey: groupKey(group), name: group.name });
    // Past nights stay on the rate but cannot be edited, so they are not in
    // the selection; they are added back on save.
    setSelected(new Set(group.nights.filter((n) => n >= today)));
    setName(group.name);
    setNightlyRate(String(group.nightlyRate));
    setMinStay(String(group.minStayNights));
    setError(null);
  };

  const submit = () => {
    setError(null);

    // Nights already past keep their rate: they were charged at it, and the
    // booking site has rows for them. Dropping them from an edit would
    // rewrite history.
    const pastNights = editingGroup
      ? editingGroup.nights.filter((n) => n < today)
      : [];
    const nights = [...new Set([...pastNights, ...selected])].sort();

    if (nights.length === 0) {
      setError('Pick at least one night on the calendar.');
      return;
    }

    save.execute({
      accountId: props.accountId,
      propertyId: props.propertyId,
      name,
      nights,
      nightlyRate,
      minStayNights: minStay,
      replaceRuleIds: editingGroup?.ranges.map((r) => r.id) ?? [],
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base">
            Seasonal and holiday rates
          </CardTitle>
          <CardDescription>
            A seasonal rate replaces both the weekday and weekend rate for every
            night it covers. One rate can cover a stretch of dates, a few
            scattered nights, or both. Rates cannot overlap each other.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {props.groups.length === 0 ? (
            <p
              className="text-muted-foreground text-sm"
              data-test={'villa-seasonal-empty'}
            >
              No seasonal rates. Every night uses the weekday or weekend rate.
            </p>
          ) : (
            <ul className="divide-border divide-y rounded-lg border">
              {props.groups.map((group) => {
                const last = group.nights[group.nights.length - 1]!;
                const past = last < today;
                const isEditing =
                  editing !== null &&
                  editing !== 'new' &&
                  editing.groupKey === groupKey(group);

                return (
                  <li
                    key={groupKey(group)}
                    data-test={'villa-seasonal-row'}
                    data-editing={isEditing ? 'true' : undefined}
                    className={cn(
                      'flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between',
                      isEditing && 'bg-primary/5',
                    )}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {group.name}
                        {past ? (
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            · past
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {describeNights(group.nights)}
                        {' · '}
                        {group.nights.length === 1
                          ? '1 night'
                          : `${group.nights.length} nights`}
                        {group.minStayNights > 1
                          ? ` · min stay ${group.minStayNights}`
                          : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatINR(group.nightlyRate)}
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          / night
                        </span>
                      </span>
                      {props.canEdit ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${group.name}`}
                            onClick={() => startEdit(group)}
                            data-test={'villa-seasonal-edit'}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DeleteGroupButton
                            accountId={props.accountId}
                            propertyId={props.propertyId}
                            group={group}
                            onDeleted={reset}
                          />
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {props.canEdit ? (
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-base">
              {editing && editing !== 'new'
                ? `Edit “${editing.name}”`
                : 'Rate calendar'}
            </CardTitle>
            <CardDescription>
              {editing
                ? 'Pick every night this rate should cover, then save.'
                : 'Every night at the price a guest pays today. Pick nights to set a seasonal rate, or edit one above.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RateCalendar
              nightFor={nightFor}
              selected={selected}
              onSelectedChange={(next) => {
                setSelected(next);
                // Picking nights with nothing open starts a new rate, so the
                // first click does what it looks like it does.
                if (!editing && next.size > 0) setEditing('new');
              }}
              today={today}
              disabled={save.isPending}
            />

            {editing ? (
              <div className="flex flex-col gap-4 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className="text-sm font-medium"
                    data-test={'villa-seasonal-selection'}
                  >
                    {selected.size === 0
                      ? 'No nights selected'
                      : `${selected.size} night${selected.size === 1 ? '' : 's'} selected`}
                    {selected.size > 0 ? (
                      <span className="text-muted-foreground font-normal">
                        {' · '}
                        {describeNights([...selected].sort())}
                      </span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    data-test={'villa-seasonal-cancel'}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Cancel
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="rate-name">Name</Label>
                    <Input
                      id="rate-name"
                      value={name}
                      placeholder="Diwali"
                      onChange={(e) => setName(e.target.value)}
                      data-test={'villa-seasonal-name'}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="rate-amount">Nightly rate</Label>
                    <RupeeInput
                      id="rate-amount"
                      value={nightlyRate}
                      onChange={(e) => setNightlyRate(e.target.value)}
                      data-test={'villa-seasonal-rate'}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="rate-min-stay">Minimum stay</Label>
                    <Input
                      id="rate-min-stay"
                      value={minStay}
                      inputMode="numeric"
                      onChange={(e) => setMinStay(e.target.value)}
                      data-test={'villa-seasonal-min-stay'}
                    />
                  </div>
                </div>

                {editingGroup && editingGroup.nights.some((n) => n < today) ? (
                  <p className="text-muted-foreground text-xs">
                    This rate also covers nights that have passed. They keep
                    their price and are not shown on the calendar.
                  </p>
                ) : null}

                {error ? (
                  <p
                    className="text-destructive text-sm"
                    role="alert"
                    data-test={'villa-seasonal-error'}
                  >
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    disabled={save.isPending}
                    onClick={submit}
                    data-test={'villa-seasonal-submit'}
                  >
                    {save.isPending
                      ? 'Saving…'
                      : editing === 'new'
                        ? 'Add rate'
                        : 'Save changes'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={startNew}
                  data-test={'villa-seasonal-new'}
                >
                  New seasonal rate
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function DeleteGroupButton(props: {
  accountId: string;
  propertyId: string;
  group: RateGroup;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { execute, isPending } = useAction(deleteRateGroupAction, {
    onSuccess: () => {
      setOpen(false);
      props.onDeleted();
      toast.success('Seasonal rate removed');
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not remove the rate.'),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${props.group.name}`}
            data-test={'villa-seasonal-delete'}
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{props.group.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            All {props.group.nights.length} of its nights go back to the weekday
            and weekend rates for new bookings. Existing bookings keep their
            price.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Not AlertDialogFooter: its bg-muted band clashes with the white
            dialog (same issue as DialogFooter). */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel data-test={'villa-seasonal-delete-cancel'}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isPending}
            data-test={'villa-seasonal-delete-confirm'}
            onClick={() =>
              execute({
                accountId: props.accountId,
                propertyId: props.propertyId,
                ruleIds: props.group.ranges.map((r) => r.id),
              })
            }
          >
            {isPending ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
