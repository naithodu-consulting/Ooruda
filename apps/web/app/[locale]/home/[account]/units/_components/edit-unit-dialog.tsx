'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';

import { formatDateDMY } from '~/lib/format-date';

import {
  assignTenantAction,
  endTenancyAction,
  updateUnitAction,
} from '../_lib/units-actions';
import { UNIT_TYPES, UpdateUnitSchema } from '../_lib/units-schema';
import type { MemberOption, TenancyInfo, UnitRow } from './units-table';

const UNASSIGNED = '__unassigned__';

export function EditUnitDialog(props: {
  unit: UnitRow;
  associationId: string;
  ownerLabel: string | null;
  tenancy: (TenancyInfo & { label: string }) | null;
  eligibleOwners: MemberOption[];
  eligibleTenants: MemberOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" data-test="edit-unit-trigger">
            <Pencil className="mr-1.5 h-4 w-4" />
            Edit
          </Button>
        }
      />

      <DialogContent className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Unit {props.unit.unit_no}</DialogTitle>
          <DialogDescription>
            Edit this unit's details, owner, and tenant.
          </DialogDescription>
        </DialogHeader>

        <UnitDetailsForm
          unit={props.unit}
          associationId={props.associationId}
          eligibleOwners={props.eligibleOwners}
          onDone={() => setOpen(false)}
        >
          <TenantSection
            unit={props.unit}
            associationId={props.associationId}
            tenancy={props.tenancy}
            eligibleTenants={props.eligibleTenants}
            onDone={() => setOpen(false)}
          />
        </UnitDetailsForm>
      </DialogContent>
    </Dialog>
  );
}

function UnitDetailsForm(props: {
  unit: UnitRow;
  associationId: string;
  eligibleOwners: MemberOption[];
  onDone: () => void;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(UpdateUnitSchema),
    defaultValues: {
      unit_no: props.unit.unit_no,
      type: props.unit.type as (typeof UNIT_TYPES)[number],
      floor: props.unit.floor?.toString() ?? '',
      area_sqft: props.unit.area_sqft.toString(),
      owner_id: props.unit.owner_id ?? UNASSIGNED,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateUnitAction(
        props.unit.id,
        props.associationId,
        values,
      );

      if (!result.success) {
        toast.error(result.error ?? 'Could not update the unit.');
        return;
      }

      toast.success('Unit details updated.');
      props.onDone();
      router.refresh();
    });
  });

  return (
    <div className="flex flex-col gap-6">
      <Form {...form}>
        <form
          id="unit-details-form"
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
        >
          <FormField
            name="unit_no"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit number</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {UNIT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              name="area_sqft"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Area (sq.ft)</FormLabel>
                  <FormControl>
                    <Input type="number" step="1" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="floor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Floor</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      placeholder="Optional"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Leave blank if N/A.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            name="owner_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Owner</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue>
                        {(v: string) =>
                          v === UNASSIGNED
                            ? 'Unassigned'
                            : (props.eligibleOwners.find((o) => o.id === v)
                                ?.label ?? 'Unassigned')
                        }
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {props.eligibleOwners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>

      {props.children}

      <DialogFooter>
        <Button type="submit" form="unit-details-form" disabled={isPending}>
          {isPending && <Spinner className="mr-2 h-4 w-4" />}
          Save details
        </Button>
      </DialogFooter>
    </div>
  );
}

function TenantSection(props: {
  unit: UnitRow;
  associationId: string;
  tenancy: (TenancyInfo & { label: string }) | null;
  eligibleTenants: MemberOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tenantId, setTenantId] = useState(props.eligibleTenants[0]?.id ?? '');
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });

  if (props.tenancy) {
    const onEnd = () => {
      startTransition(async () => {
        const result = await endTenancyAction(
          props.tenancy!.id,
          props.unit.id,
          props.associationId,
        );

        if (!result.success) {
          toast.error(result.error ?? 'Could not end the tenancy.');
          return;
        }

        toast.success('Tenancy ended.');
        props.onDone();
        router.refresh();
      });
    };

    return (
      <div className="flex flex-col gap-2 border-t pt-4">
        <span className="text-sm font-medium">Tenant</span>
        <p className="text-sm">
          {props.tenancy.label} — since{' '}
          {formatDateDMY(props.tenancy.start_date)}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={onEnd}
          className="self-start"
        >
          {isPending && <Spinner className="mr-2 h-4 w-4" />}
          End tenancy
        </Button>
      </div>
    );
  }

  const onAssign = () => {
    startTransition(async () => {
      const result = await assignTenantAction(
        props.unit.id,
        props.associationId,
        {
          tenantId,
          startDate,
        },
      );

      if (!result.success) {
        toast.error(result.error ?? 'Could not assign the tenant.');
        return;
      }

      toast.success('Tenant assigned.');
      props.onDone();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <span className="text-sm font-medium">Tenant</span>

      {props.eligibleTenants.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No one with the Tenant role has joined this association yet. Invite
          one from the Members page first.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={tenantId} onValueChange={(v) => setTenantId(v ?? '')}>
            <SelectTrigger className="min-w-0 flex-1 basis-40">
              <SelectValue>
                {(v: string) =>
                  props.eligibleTenants.find((t) => t.id === v)?.label ??
                  'Select a tenant'
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {props.eligibleTenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-36 shrink-0"
          />

          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={onAssign}
            className="shrink-0"
          >
            {isPending && <Spinner className="mr-2 h-4 w-4" />}
            Assign
          </Button>
        </div>
      )}
    </div>
  );
}
