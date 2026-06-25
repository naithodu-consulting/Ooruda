'use client';

import { useActionState, useState } from 'react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Spinner } from '@kit/ui/spinner';
import { Switch } from '@kit/ui/switch';

import {
  type UpdateAssociationState,
  updateAssociationAction,
} from '../_actions/update-association';

interface Props {
  association: {
    id: string;
    status: string;
    address: string | null;
    brand_colour: string;
    gstin: string | null;
    gst_enabled: boolean;
    mescom_consumer_no: string | null;
  };
  billingSettings: {
    due_day_of_month: number;
    minimum_electricity_charge: number;
  } | null;
}

export function AssociationForm({ association, billingSettings }: Props) {
  const boundAction = updateAssociationAction.bind(null, association.id);
  const [state, formAction, isPending] = useActionState<
    UpdateAssociationState,
    FormData
  >(boundAction, null);

  const [brandColour, setBrandColour] = useState(association.brand_colour);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* ── General ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            Basic details shown on bills and member portals.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={association.status}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Setup">Setup</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand_colour">Brand Colour</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="brand_colour"
                name="brand_colour"
                value={brandColour}
                onChange={(e) => setBrandColour(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <span className="text-muted-foreground font-mono text-sm uppercase">
                {brandColour}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              defaultValue={association.address ?? ''}
              placeholder="123, Commercial Complex, MG Road, Mangaluru — 575008"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── MESCOM ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>MESCOM / Electricity</CardTitle>
          <CardDescription>
            BESCOM / MESCOM consumer details for electricity billing.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mescom_consumer_no">Consumer Number</Label>
            <Input
              id="mescom_consumer_no"
              name="mescom_consumer_no"
              defaultValue={association.mescom_consumer_no ?? ''}
              placeholder="e.g. 1234567890"
              className="max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Tax ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Tax Settings</CardTitle>
          <CardDescription>
            GST registration details for billing. Leave GSTIN blank if not
            registered.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Switch
              id="gst_enabled"
              name="gst_enabled"
              defaultChecked={association.gst_enabled}
            />
            <Label htmlFor="gst_enabled">GST Applicable</Label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input
              id="gstin"
              name="gstin"
              defaultValue={association.gstin ?? ''}
              placeholder="29AABCS1429B1ZB"
              className="max-w-xs font-mono uppercase"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Billing Defaults ───────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Billing Defaults</CardTitle>
          <CardDescription>
            Default due dates and minimum charges applied across all bills.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="due_day_of_month">Due Day of Month (1–28)</Label>
            <Input
              id="due_day_of_month"
              name="due_day_of_month"
              type="number"
              min={1}
              max={28}
              defaultValue={billingSettings?.due_day_of_month ?? 10}
              className="max-w-[120px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minimum_electricity_charge">
              Min. Electricity Charge (₹)
            </Label>
            <Input
              id="minimum_electricity_charge"
              name="minimum_electricity_charge"
              type="number"
              min={0}
              step="0.01"
              defaultValue={billingSettings?.minimum_electricity_charge ?? 0}
              className="max-w-[160px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Footer ─────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>

        {state?.success && (
          <p className="text-sm text-green-600">Settings saved.</p>
        )}
        {state?.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
      </div>
    </form>
  );
}
