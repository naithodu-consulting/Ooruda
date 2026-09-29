'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Switch } from '@kit/ui/switch';
import { Textarea } from '@kit/ui/textarea';

import { RupeeInput } from '~/components/rupee-input';
import { formatINR } from '~/lib/format-inr';
import { ADDON_UNIT_LABELS, addonUnitLabel } from '~/lib/villa/labels';

import {
  ADDON_UNITS,
  type AddonInput,
  AddonSchema,
} from '../_lib/schemas/villa-settings.schema';
import {
  deleteAddonAction,
  saveAddonAction,
} from '../_lib/server/villa-settings-actions';

export interface AddonRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  pricing_unit: string;
  is_active: boolean;
}

export function AddonsSection(props: {
  accountId: string;
  propertyId: string;
  canEdit: boolean;
  addons: AddonRow[];
}) {
  const [editing, setEditing] = useState<AddonRow | 'new' | null>(null);

  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-base">Add-ons</CardTitle>
          <CardDescription>
            Extras you charge for: extra bed, breakfast, BBQ, early check-in,
            late check-out. Added to bookings and invoices in Ooruda. (The guest
            site does not sell add-ons yet.)
          </CardDescription>
        </div>
        {props.canEdit ? (
          <Button
            size="sm"
            onClick={() => setEditing('new')}
            data-test={'villa-addon-new'}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        ) : null}
      </CardHeader>

      <CardContent>
        {props.addons.length === 0 ? (
          <p
            className="text-muted-foreground text-sm"
            data-test={'villa-addon-empty'}
          >
            No add-ons yet.
          </p>
        ) : (
          <ul className="divide-border divide-y rounded-lg border">
            {props.addons.map((addon) => (
              <li
                key={addon.id}
                data-test={'villa-addon-row'}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{addon.name}</span>
                    {!addon.is_active ? (
                      <Badge variant="outline">Off</Badge>
                    ) : null}
                  </span>
                  {addon.description ? (
                    <span className="text-muted-foreground line-clamp-2 text-xs">
                      {addon.description}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
                    {formatINR(Number(addon.price))}
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      {addonUnitLabel(addon.pricing_unit)}
                    </span>
                  </span>
                  {props.canEdit ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${addon.name}`}
                        onClick={() => setEditing(addon)}
                        data-test={'villa-addon-edit'}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteAddonButton
                        accountId={props.accountId}
                        propertyId={props.propertyId}
                        addon={addon}
                      />
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {editing ? (
        <AddonDialog
          accountId={props.accountId}
          propertyId={props.propertyId}
          addon={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function AddonDialog(props: {
  accountId: string;
  propertyId: string;
  addon: AddonRow | null;
  onClose: () => void;
}) {
  const form = useForm<AddonInput>({
    resolver: zodResolver(AddonSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      id: props.addon?.id,
      name: props.addon?.name ?? '',
      description: props.addon?.description ?? '',
      price: props.addon ? String(props.addon.price) : '',
      pricingUnit:
        (props.addon?.pricing_unit as AddonInput['pricingUnit']) ?? 'per_night',
      isActive: props.addon?.is_active ?? true,
    },
  });

  const { execute, isPending } = useAction(saveAddonAction, {
    onSuccess: () => {
      toast.success(props.addon ? 'Add-on updated' : 'Add-on added');
      props.onClose();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not save the add-on.'),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className="max-w-md" data-test={'villa-addon-dialog'}>
        <DialogHeader>
          <DialogTitle>
            {props.addon ? 'Edit add-on' : 'New add-on'}
          </DialogTitle>
          <DialogDescription>
            Prices include no tax; GST is added on invoices.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => execute(values))}
          >
            <FormField
              name="name"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        placeholder="Extra bed"
                        data-test={'villa-addon-name'}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="description"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl
                    render={
                      <Textarea
                        {...field}
                        rows={2}
                        data-test={'villa-addon-description'}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="price"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price</FormLabel>
                    <FormControl
                      render={
                        <RupeeInput
                          {...field}
                          data-test={'villa-addon-price'}
                        />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="pricingUnit"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Charged</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          data-test={'villa-addon-unit'}
                        >
                          <SelectValue>
                            {(value: string) => addonUnitLabel(value)}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ADDON_UNITS.map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {ADDON_UNIT_LABELS[unit]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              name="isActive"
              control={form.control}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3">
                  <div className="flex flex-col gap-1">
                    <FormLabel>Available</FormLabel>
                    <FormDescription>
                      Turn off to stop offering it without deleting it.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-test={'villa-addon-active'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={props.onClose}
                disabled={isPending}
                data-test={'villa-addon-cancel'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-test={'villa-addon-save'}
              >
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAddonButton(props: {
  accountId: string;
  propertyId: string;
  addon: AddonRow;
}) {
  const { execute, isPending } = useAction(deleteAddonAction, {
    onSuccess: () => toast.success('Add-on removed'),
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not remove the add-on.'),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${props.addon.name}`}
            data-test={'villa-addon-delete'}
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{props.addon.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            To stop offering it but keep it for later, turn it off instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Not AlertDialogFooter: its bg-muted band clashes with the white
            dialog (same issue as DialogFooter). */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel data-test={'villa-addon-delete-cancel'}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isPending}
            data-test={'villa-addon-delete-confirm'}
            onClick={() =>
              execute({
                accountId: props.accountId,
                propertyId: props.propertyId,
                id: props.addon.id,
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
