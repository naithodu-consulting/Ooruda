'use client';

import { useMemo, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
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
import { SearchableSelect } from '@kit/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';

import { generateBillsAction } from '../_lib/billing-actions';
import { GenerateBillsSchema } from '../_lib/billing-schema';

const BILL_TYPE_ITEMS = {
  All: 'All Bills',
  Maintenance: 'Maintenance',
  Electricity: 'Electricity',
  'Other Charges': 'Other Charges',
  'Sinking Fund': 'Sinking Fund',
};

export function GenerateBillsDialog(props: { associationId: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirming(false);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" data-test="generate-bills-trigger">
            <Plus className="h-4 w-4" />
            Generate Bills
          </Button>
        }
      />

      <DialogContent>
        {!confirming && (
          <DialogHeader>
            <DialogTitle>Generate bills for a period</DialogTitle>
            <DialogDescription>
              Creates a bill for every unit for the selected period and bill
              type.
            </DialogDescription>
          </DialogHeader>
        )}

        <GenerateBillsForm
          associationId={props.associationId}
          confirming={confirming}
          setConfirming={setConfirming}
          onDone={() => {
            setOpen(false);
            setConfirming(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function GenerateBillsForm(props: {
  associationId: string;
  confirming: boolean;
  setConfirming: (value: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { confirming, setConfirming } = props;

  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const periodOptions = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() - 6 + i, 1);
      return {
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      };
    });
  }, []);

  const form = useForm({
    resolver: zodResolver(GenerateBillsSchema),
    defaultValues: { period: defaultPeriod, billType: undefined },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await generateBillsAction(props.associationId, values);

      if (!result.success) {
        toast.error(result.error ?? 'Could not generate bills.');
        return;
      }

      toast.success(
        `${result.created ?? 0} bill(s) created${
          result.skipped ? `, ${result.skipped} already billed` : ''
        }.`,
      );
      props.onDone();
      router.refresh();
    });
  });

  if (confirming) {
    return (
      <div className="flex flex-col gap-4" role="alertdialog" aria-modal="true">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base leading-snug font-semibold">
            Generate Bills
          </h3>
          <p className="text-muted-foreground text-sm">
            Are you sure you want to generate bills for this period? Once
            generated, bills cannot be deleted or modified.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => setConfirming(false)}
            data-test="generate-bills-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={onSubmit}
            data-test="generate-bills-confirm"
          >
            {isPending && <Spinner className="mr-2 h-4 w-4" />}
            Yes, Generate Bills
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.trigger().then((valid) => {
            if (valid) setConfirming(true);
          });
        }}
        className="flex flex-col gap-4"
      >
        <FormField
          name="billType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bill Type</FormLabel>
              <FormControl>
                <Select
                  items={BILL_TYPE_ITEMS}
                  onValueChange={field.onChange}
                  value={field.value ?? ''}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bill type…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Bills</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                    <SelectItem value="Electricity">Electricity</SelectItem>
                    <SelectItem value="Other Charges">Other Charges</SelectItem>
                    <SelectItem value="Sinking Fund">Sinking Fund</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="period"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Period</FormLabel>
              <FormControl>
                <SearchableSelect
                  items={periodOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  placeholder="Select Period"
                  searchPlaceholder="Search periods…"
                  emptyMessage="No periods found"
                  data-test="generate-bills-period"
                />
              </FormControl>
              <FormDescription>
                Units that already have a bill for this period are skipped.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="sm"
          className="self-start"
          disabled={!form.watch('billType')}
        >
          Generate
        </Button>
      </form>
    </Form>
  );
}
