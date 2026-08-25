'use client';

import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

import {
  AMC_CATEGORIES,
  AMC_PRIORITIES,
  PAYMENT_FREQUENCIES,
  UpdateAmcContractSchema,
  type UpdateAmcContractInput,
} from '../_lib/schemas/amc.schema';
import { updateAmcContractAction } from '../_lib/server/amc-actions';
import { computeAmcStatus } from '../_lib/amc-utils';
import type { AmcContractRow } from './amc-page-client';

interface Props {
  open: boolean;
  onClose: () => void;
  contract: AmcContractRow;
  associationId: string;
  onSuccess: (updated: AmcContractRow) => void;
}

export function EditAmcContractDialog({
  open,
  onClose,
  contract,
  associationId,
  onSuccess,
}: Props) {
  const form = useForm({
    resolver: zodResolver(UpdateAmcContractSchema),
    defaultValues: {
      id: contract.id,
      associationId,
      name: contract.name,
      vendorName: contract.vendor_name,
      category: contract.category as (typeof AMC_CATEGORIES)[number],
      startDate: contract.start_date,
      endDate: contract.end_date,
      contractValue: contract.contract_value,
      paymentFrequency:
        contract.payment_frequency as (typeof PAYMENT_FREQUENCIES)[number],
      priority: contract.priority as (typeof AMC_PRIORITIES)[number],
      autoRenewal: contract.auto_renewal,
    },
  });

  const { execute, isPending } = useAction(updateAmcContractAction, {
    onSuccess: () => {
      const values = form.getValues() as UpdateAmcContractInput;
      toast.success('Contract updated.');
      const newEndDate = values.endDate ?? contract.end_date;
      onSuccess({
        ...contract,
        name: values.name ?? contract.name,
        vendor_name: values.vendorName ?? contract.vendor_name,
        category: values.category ?? contract.category,
        start_date: values.startDate ?? contract.start_date,
        end_date: newEndDate,
        contract_value: values.contractValue ?? contract.contract_value,
        payment_frequency:
          values.paymentFrequency ?? contract.payment_frequency,
        priority: values.priority ?? contract.priority,
        auto_renewal: values.autoRenewal ?? contract.auto_renewal,
        status: computeAmcStatus(newEndDate, contract.terminated_at),
      });
      onClose();
    },
    onError: ({ error }) =>
      toast.error(
        error.serverError ?? 'Could not update the contract. Please try again.',
      ),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onSubmit(values: any) {
    execute(values as UpdateAmcContractInput);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className={'max-h-[90vh] max-w-lg overflow-y-auto bg-card'}
        data-test={'edit-amc-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Edit Contract</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className={'flex flex-col gap-y-4'}
          >
            {/* Contract Name */}
            <FormField
              control={form.control}
              name={'name'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contract Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={'e.g. Lift Maintenance – Schindler'}
                      {...field}
                      data-test={'amc-name-input'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Vendor */}
            <FormField
              control={form.control}
              name={'vendorName'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={'Vendor company name'}
                      {...field}
                      data-test={'amc-vendor-input'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name={'category'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ''}
                  >
                    <FormControl>
                      <SelectTrigger
                        className={'w-full'}
                        data-test={'amc-category-select'}
                      >
                        <SelectValue>
                          {field.value ?? 'Select category'}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {AMC_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
              <FormField
                control={form.control}
                name={'startDate'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date *</FormLabel>
                    <FormControl>
                      <Input
                        type={'date'}
                        {...field}
                        data-test={'amc-start-date-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={'endDate'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date *</FormLabel>
                    <FormControl>
                      <Input
                        type={'date'}
                        {...field}
                        data-test={'amc-end-date-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
              <FormField
                control={form.control}
                name={'contractValue'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contract Amount (₹) *</FormLabel>
                    <FormControl>
                      <div className={'relative'}>
                        <span
                          className={
                            'text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm'
                          }
                        >
                          ₹
                        </span>
                        <Input
                          type={'number'}
                          step={'0.01'}
                          min={'0'}
                          placeholder={'0.00'}
                          className={'pl-7'}
                          {...field}
                          value={(field.value as number | undefined) ?? ''}
                          data-test={'amc-value-input'}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={'paymentFrequency'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Frequency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger
                          className={'w-full'}
                          data-test={'amc-freq-select'}
                        >
                          <SelectValue>
                            {field.value ?? 'Select frequency'}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
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
              control={form.control}
              name={'priority'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger
                        className={'w-full'}
                        data-test={'amc-priority-select'}
                      >
                        <SelectValue>
                          {field.value
                            ? field.value.charAt(0).toUpperCase() +
                              field.value.slice(1)
                            : 'Medium'}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {AMC_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={'flex flex-wrap justify-end gap-2 pt-2'}>
              <Button
                type={'button'}
                variant={'outline'}
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type={'submit'}
                disabled={isPending}
                data-test={'save-amc-edit-btn'}
              >
                {isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
