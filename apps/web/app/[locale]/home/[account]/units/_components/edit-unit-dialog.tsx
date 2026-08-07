'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import { Checkbox } from '@kit/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Unit {props.unit.unit_no}</DialogTitle>
          <DialogDescription>
            Edit this unit&apos;s details, owner, and tenant.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden">
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
        </div>
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
      door_no: props.unit.door_no ?? '',
      owner_id: props.unit.owner_id ?? UNASSIGNED,
      bill_to: (props.unit.bill_to ?? 'auto') as 'auto' | 'owner' | 'tenant',
      owner_is_company: props.unit.owner_is_company ?? false,
      owner_company_name: props.unit.owner_company_name ?? '',
      owner_company_address: props.unit.owner_company_address ?? '',
      owner_company_gstin: props.unit.owner_company_gstin ?? '',
    },
  });

  const unitType = form.watch('type');

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const payload = { ...values };
      if (payload.type === 'Common Area') {
        payload.area_sqft = 0;
      }
      const result = await updateUnitAction(
        props.unit.id,
        props.associationId,
        payload,
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
            {unitType !== 'Common Area' && (
              <FormField
                name="area_sqft"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Area (sq.ft)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="e.g. 450"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
            name="door_no"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Door Number</FormLabel>
                <FormControl>
                  <Input placeholder="Optional, e.g. Door No. 12" {...field} />
                </FormControl>
                <FormDescription>
                  Leave blank if not applicable.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

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

          <div className="border-t pt-4">
            <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
              Billing
            </p>

            <FormField
              name="bill_to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bill to</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue>
                          {(v: string) =>
                            v === 'owner'
                              ? 'Always bill owner'
                              : v === 'tenant'
                                ? 'Always bill tenant'
                                : 'Auto — tenant if occupied, else owner'
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="min-w-[280px]">
                      <SelectItem value="auto">
                        Auto — tenant if occupied, else owner
                      </SelectItem>
                      <SelectItem value="owner">Always bill owner</SelectItem>
                      <SelectItem value="tenant">Always bill tenant</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Controls whose name appears on bills for this unit.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <OwnerCompanyFields form={form} />
        </form>
      </Form>

      {props.children}

      <div className="bg-popover sticky bottom-0 flex items-center gap-2 border-t pt-4 pb-1">
        <Button type="submit" form="unit-details-form" disabled={isPending}>
          {isPending && <Spinner className="mr-2 h-4 w-4" />}
          Save details
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={props.onDone}
        >
          Cancel
        </Button>
      </div>
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
  const [isCompany, setIsCompany] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyGstin, setCompanyGstin] = useState('');

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
          isCompany,
          companyName: companyName || null,
          companyAddress: companyAddress || null,
          companyGstin: companyGstin || null,
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
    <div className="flex flex-col gap-3 border-t pt-4">
      <span className="text-sm font-medium">Tenant</span>

      {props.eligibleTenants.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No one with the Tenant role has joined this association yet. Invite
          one from the Members page first.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={tenantId}
              onValueChange={(v) => setTenantId(v ?? '')}
            >
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
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="tenant-is-company"
              checked={isCompany}
              onCheckedChange={(v) => setIsCompany(!!v)}
              className="mt-0.5"
            />
            <label
              htmlFor="tenant-is-company"
              className="text-sm leading-snug select-none"
            >
              Tenant is a company
            </label>
          </div>

          {isCompany && (
            <div className="flex flex-col gap-2">
              <Input
                placeholder="Company name *"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              <Input
                placeholder="Company registered address (optional)"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
              />
              <Input
                placeholder="Company GSTIN (optional)"
                value={companyGstin}
                onChange={(e) => setCompanyGstin(e.target.value)}
              />
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={onAssign}
            className="self-start"
          >
            {isPending && <Spinner className="mr-2 h-4 w-4" />}
            Assign
          </Button>
        </>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OwnerCompanyFields({ form }: { form: any }) {
  const isCompany = useWatch({
    control: form.control,
    name: 'owner_is_company',
  });

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={form.control}
        name="owner_is_company"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start gap-3">
            <FormControl>
              <Checkbox
                checked={!!field.value}
                onCheckedChange={field.onChange}
                className="mt-0.5"
              />
            </FormControl>
            <div className="flex flex-col gap-0.5">
              <FormLabel>Owner is a company</FormLabel>
              <FormDescription>
                Shows company name and GSTIN on bills instead of personal name.
              </FormDescription>
            </div>
          </FormItem>
        )}
      />

      {isCompany ? (
        <>
          <FormField
            control={form.control}
            name="owner_company_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Acme Pvt. Ltd."
                    {...(field as React.InputHTMLAttributes<HTMLInputElement>)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="owner_company_address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company registered address</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Optional — leave blank to use unit address"
                    {...(field as React.InputHTMLAttributes<HTMLInputElement>)}
                  />
                </FormControl>
                <FormDescription>
                  Used on bills if the company&apos;s GST address differs from
                  this unit.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="owner_company_gstin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company GSTIN</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Optional, e.g. 29AABCU9603R1ZV"
                    {...(field as React.InputHTMLAttributes<HTMLInputElement>)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      ) : null}
    </div>
  );
}
