'use client';

import { useActionState, useEffect, useState } from 'react';

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
import { toast } from '@kit/ui/sonner';
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
    registration_number: string | null;
    brand_colour: string;
    gstin: string | null;
    gst_enabled: boolean;
    gst_rate: number | null;
    mescom_consumer_no: string | null;
    authorised_signatory: string | null;
    sanctioned_load_kva: number | null;
    pan_number: string | null;
    email: string | null;
    phone: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_name: string | null;
    bank_ifsc: string | null;
    bank_branch: string | null;
  };
  billingSettings: {
    electricity_due_day: number;
    maintenance_due_day: number;
    other_charges_due_day: number;
  } | null;
}

export function AssociationForm({ association, billingSettings }: Props) {
  const boundAction = updateAssociationAction.bind(null, association.id);
  const [state, formAction, isPending] = useActionState<
    UpdateAssociationState,
    FormData
  >(boundAction, null);

  const [brandColour, setBrandColour] = useState(association.brand_colour);

  useEffect(() => {
    if (state?.success) {
      toast.success('Settings saved.');
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

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
              placeholder="123, Commercial Complex, MG Road, Mangaluru - 575008"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registration_number">Registration Number</Label>
            <Input
              id="registration_number"
              name="registration_number"
              defaultValue={association.registration_number ?? ''}
              placeholder="e.g. KAR/HSG/2018/001234"
              className="max-w-xs font-mono"
            />
            <p className="text-muted-foreground text-xs">
              Society or association registration number issued by the
              Registrar.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Contact ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>
            Shown in the header of all bill and receipt PDFs.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={association.email ?? ''}
              placeholder="accounts@myassociation.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={association.phone ?? ''}
              placeholder="+91 98765 43210"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Bank Details ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Bank Details</CardTitle>
          <CardDescription>
            Shown in the footer of all bill and receipt PDFs for payment
            transfers.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="bank_account_name">Account Name</Label>
            <Input
              id="bank_account_name"
              name="bank_account_name"
              defaultValue={association.bank_account_name ?? ''}
              placeholder="Prism Commercial Complex Owners Association"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bank_account_number">Account Number</Label>
            <Input
              id="bank_account_number"
              name="bank_account_number"
              defaultValue={association.bank_account_number ?? ''}
              placeholder="40200097006000"
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bank_name">Bank Name</Label>
            <Input
              id="bank_name"
              name="bank_name"
              defaultValue={association.bank_name ?? ''}
              placeholder="Axis Bank"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bank_ifsc">IFSC Code</Label>
            <Input
              id="bank_ifsc"
              name="bank_ifsc"
              defaultValue={association.bank_ifsc ?? ''}
              placeholder="AXIS0000100"
              className="font-mono uppercase"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bank_branch">Branch</Label>
            <Input
              id="bank_branch"
              name="bank_branch"
              defaultValue={association.bank_branch ?? ''}
              placeholder="Lalbagh, Mangalore"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Electricity ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Electricity</CardTitle>
          <CardDescription>
            Electricity Board consumer details for electricity billing.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="authorised_signatory">Authorised Signatory</Label>
              <Input
                id="authorised_signatory"
                name="authorised_signatory"
                defaultValue={association.authorised_signatory ?? ''}
                placeholder="e.g. John Doe, Secretary"
                className="max-w-xs"
              />
              <p className="text-muted-foreground text-xs">
                Name shown on electricity bill PDFs.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sanctioned_load_kva">Sanctioned Load (kVA)</Label>
              <Input
                id="sanctioned_load_kva"
                name="sanctioned_load_kva"
                type="number"
                step="0.01"
                min="0"
                defaultValue={association.sanctioned_load_kva ?? ''}
                placeholder="e.g. 100"
                className="max-w-xs"
              />
              <p className="text-muted-foreground text-xs">
                Total sanctioned load for the association from the electricity
                board.
              </p>
            </div>
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
            <p className="text-muted-foreground text-xs">
              Shown on bills when available.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pan_number">PAN Number</Label>
            <Input
              id="pan_number"
              name="pan_number"
              defaultValue={association.pan_number ?? ''}
              placeholder="AABCS1429B"
              className="max-w-xs font-mono uppercase"
            />
            <p className="text-muted-foreground text-xs">
              Shown on bills when GSTIN is not available.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gst_rate">GST Rate (%)</Label>
            <Input
              id="gst_rate"
              name="gst_rate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={association.gst_rate ?? ''}
              placeholder="e.g. 18"
              className="max-w-xs"
            />
            <p className="text-muted-foreground text-xs">
              Split evenly into CGST + SGST on generated bill PDFs. Only applied
              when GST is applicable above.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Billing Defaults ───────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Billing Defaults</CardTitle>
          <CardDescription>
            Configure default due days for different bill types.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="electricity_due_day">
              Electricity Due Day (1–28)
            </Label>
            <Input
              id="electricity_due_day"
              name="electricity_due_day"
              type="number"
              min={1}
              max={28}
              defaultValue={billingSettings?.electricity_due_day ?? 10}
              className="max-w-[120px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maintenance_due_day">
              Maintenance Due Day (1–28)
            </Label>
            <Input
              id="maintenance_due_day"
              name="maintenance_due_day"
              type="number"
              min={1}
              max={28}
              defaultValue={billingSettings?.maintenance_due_day ?? 10}
              className="max-w-[120px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="other_charges_due_day">
              Other Charges Due Day (1–28)
            </Label>
            <Input
              id="other_charges_due_day"
              name="other_charges_due_day"
              type="number"
              min={1}
              max={28}
              defaultValue={billingSettings?.other_charges_due_day ?? 10}
              className="max-w-[120px]"
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
      </div>
    </form>
  );
}
