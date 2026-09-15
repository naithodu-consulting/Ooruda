'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import { DatePicker } from '@kit/ui/date-picker';
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

import { computeAmcStatus } from '../_lib/amc-utils';
import {
  AMC_CATEGORIES,
  AmcContractSchema,
  PAYMENT_FREQUENCIES,
  type AmcContractInput,
} from '../_lib/schemas/amc.schema';
import { createAmcContractAction } from '../_lib/server/amc-actions';
import type { AmcContractRow } from './amc-page-client';

interface Props {
  open: boolean;
  onClose: () => void;
  associationId: string;
  onSuccess: (contract: AmcContractRow) => void;
}

const DEFAULT_VALUES: Partial<AmcContractInput> = {
  priority: 'medium',
  paymentFrequency: 'Annual',
  autoRenewal: false,
  startDate: format(new Date(), 'yyyy-MM-dd'),
};

export function AddAmcContractDialog({
  open,
  onClose,
  associationId,
  onSuccess,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<any>({
    resolver: zodResolver(AmcContractSchema),
    defaultValues: { ...DEFAULT_VALUES, associationId },
  });

  const { execute, isPending } = useAction(createAmcContractAction, {
    onSuccess: ({ data }) => {
      toast.success('AMC contract added.');
      if (data) {
        const values = form.getValues() as AmcContractInput;
        onSuccess({
          id: data.id,
          name: values.name,
          vendor_name: values.vendorName,
          category: values.category,
          start_date: values.startDate,
          end_date: values.endDate,
          contract_value: values.contractValue,
          payment_frequency: values.paymentFrequency,
          priority: values.priority,
          auto_renewal: values.autoRenewal,
          terminated_at: null,
          status: computeAmcStatus(values.endDate, null),
        });
      }
      form.reset({ ...DEFAULT_VALUES, associationId });
      onClose();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Failed to add contract.'),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onSubmit(values: any) {
    execute(values as AmcContractInput);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className={'bg-card max-h-[90vh] max-w-lg overflow-y-auto'}
        data-test={'add-amc-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Add AMC Contract</DialogTitle>
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

            <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
              <FormField
                control={form.control}
                name={'vendorPhone'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number (optional)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode={'tel'}
                        placeholder={'+91…'}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          // Strip anything that isn't a digit, +, -, space, or ()
                          const cleaned = e.target.value.replace(
                            /[^\d+\-\s()]/g,
                            '',
                          );
                          field.onChange(cleaned || null);
                        }}
                        data-test={'amc-vendor-phone-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={'vendorEmail'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type={'email'}
                        {...field}
                        value={field.value ?? ''}
                        data-test={'amc-vendor-email-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
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
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
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
                    <FormLabel>Contract Amount(₹) *</FormLabel>
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
              name={'noticePeriodDays'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notice Period (optional)</FormLabel>
                  <FormControl>
                    <div className={'relative'}>
                      {/* Hide native spinners so the "days" suffix doesn't overlap them */}
                      <Input
                        type={'number'}
                        min={'0'}
                        placeholder={'e.g. 30'}
                        className={
                          '[appearance:textfield] pr-12 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                        }
                        {...field}
                        value={(field.value as number | null) ?? ''}
                        data-test={'amc-notice-input'}
                      />
                      <span
                        className={
                          'text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs'
                        }
                      >
                        days
                      </span>
                    </div>
                  </FormControl>
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
                data-test={'save-amc-btn'}
              >
                {isPending ? 'Saving…' : 'Save Contract'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
