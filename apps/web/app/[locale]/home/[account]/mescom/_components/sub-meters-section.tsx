'use client';

import { useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Badge } from '@kit/ui/badge';
import { badgeExtras } from '@kit/ui/badge-extras';
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
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Form,
  FormControl,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import {
  createSubMeterAction,
  setSubMeterActiveAction,
} from '../_lib/mescom-actions';
import { CreateSubMeterSchema, SUB_METER_TYPES } from '../_lib/mescom-schema';

export interface SubMeterRow {
  id: string;
  meter_label: string;
  meter_type: string;
  is_active: boolean;
  unit_id: string;
  unit_no: string;
}

export function SubMetersSection(props: {
  associationId: string;
  subMeters: SubMeterRow[];
  units: { id: string; unit_no: string }[];
  canManage: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex flex-col space-y-1.5">
          <CardTitle>Sub-meters</CardTitle>
          <CardDescription>
            Each shop or office can have its own meter. Add a common-area meter
            for shared lighting, lifts, or pumps.
          </CardDescription>
        </div>

        {props.canManage ? (
          <AddSubMeterDialog
            associationId={props.associationId}
            units={props.units}
          />
        ) : null}
      </CardHeader>

      <CardContent>
        {props.subMeters.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No sub-meters yet. Add one to start recording readings.
          </p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Meter</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  {props.canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.subMeters.map((meter) => (
                  <TableRow key={meter.id}>
                    <TableCell className="font-medium">
                      {meter.meter_label}
                    </TableCell>
                    <TableCell>{meter.unit_no}</TableCell>
                    <TableCell>{meter.meter_type}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          meter.is_active ? badgeExtras.success : undefined
                        }
                      >
                        {meter.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    {props.canManage ? (
                      <TableCell>
                        <ToggleActiveButton
                          subMeterId={meter.id}
                          associationId={props.associationId}
                          isActive={meter.is_active}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ToggleActiveButton(props: {
  subMeterId: string;
  associationId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const result = await setSubMeterActiveAction(
        props.subMeterId,
        props.associationId,
        !props.isActive,
      );

      if (!result.success) {
        toast.error(result.error ?? 'Could not update the meter.');
        return;
      }

      router.refresh();
    });
  };

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={onClick}>
      {isPending && <Spinner className="mr-2 h-4 w-4" />}
      {props.isActive ? 'Deactivate' : 'Activate'}
    </Button>
  );
}

function AddSubMeterDialog(props: {
  associationId: string;
  units: { id: string; unit_no: string }[];
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" data-test="add-sub-meter-trigger">
            <Plus className="h-4 w-4" />
            Add Sub-meter
          </Button>
        }
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a sub-meter</DialogTitle>
          <DialogDescription>
            Attach a meter to a unit, or mark it as a common-area meter.
          </DialogDescription>
        </DialogHeader>

        <AddSubMeterForm
          associationId={props.associationId}
          units={props.units}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddSubMeterForm(props: {
  associationId: string;
  units: { id: string; unit_no: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(CreateSubMeterSchema),
    defaultValues: {
      unitId: props.units[0]?.id ?? '',
      meterLabel: '',
      meterType: 'Unit' as const,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await createSubMeterAction(props.associationId, values);

      if (!result.success) {
        toast.error(result.error ?? 'Could not add the sub-meter.');
        return;
      }

      toast.success('Sub-meter added.');
      form.reset();
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField
          name="unitId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unit</FormLabel>
              <Select
                value={field.value}
                onValueChange={(v) => field.onChange(v ?? '')}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string) =>
                        props.units.find((u) => u.id === value)?.unit_no ??
                        'Select a unit'
                      }
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {props.units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.unit_no}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="meterLabel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Meter label</FormLabel>
              <FormControl>
                <Input placeholder="e.g. SM-1 or Common-Lift" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="meterType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string) =>
                        value === 'Unit' ? 'Unit meter' : 'Common area'
                      }
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SUB_METER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === 'Unit' ? 'Unit meter' : 'Common area'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={isPending}
          size="sm"
          className="self-start"
        >
          {isPending && <Spinner className="mr-2 h-4 w-4" />}
          Add Sub-meter
        </Button>
      </form>
    </Form>
  );
}
