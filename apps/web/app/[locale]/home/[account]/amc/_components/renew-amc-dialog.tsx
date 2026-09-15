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
  DialogDescription,
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
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';

import { computeAmcStatus } from '../_lib/amc-utils';
import { RenewAmcSchema, type RenewAmcInput } from '../_lib/schemas/amc.schema';
import { renewAmcContractAction } from '../_lib/server/amc-actions';
import type { AmcContractRow } from './amc-page-client';

interface Props {
  open: boolean;
  onClose: () => void;
  contract: AmcContractRow;
  associationId: string;
  onSuccess: (updated: AmcContractRow) => void;
}

export function RenewAmcDialog({
  open,
  onClose,
  contract,
  associationId,
  onSuccess,
}: Props) {
  const today = format(new Date(), 'yyyy-MM-dd');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<any>({
    resolver: zodResolver(RenewAmcSchema),
    defaultValues: {
      id: contract.id,
      associationId,
      renewedAt: today,
      newEndDate: '',
      contractValue: contract.contract_value,
      notes: '',
    },
  });

  const { execute, isPending } = useAction(renewAmcContractAction, {
    onSuccess: () => {
      const values = form.getValues() as RenewAmcInput;
      toast.success('Contract marked as renewed.');
      onSuccess({
        ...contract,
        end_date: values.newEndDate,
        contract_value: values.contractValue,
        status: computeAmcStatus(values.newEndDate, null),
      });
      onClose();
    },
    onError: ({ error }) =>
      toast.error(
        error.serverError ?? 'Could not renew the contract. Please try again.',
      ),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onSubmit(values: any) {
    execute(values as RenewAmcInput);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className={'bg-card max-w-md'}
        data-test={'renew-amc-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Mark as Renewed</DialogTitle>
          <DialogDescription>
            Enter the new contract details for <strong>{contract.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className={'flex flex-col gap-y-4'}
          >
            <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
              <FormField
                control={form.control}
                name={'renewedAt'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Renewed On</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        data-test={'renew-date-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={'newEndDate'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Expiry Date *</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        data-test={'new-end-date-input'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name={'contractValue'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Renewed Contract Amount (₹) *</FormLabel>
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
                        className={'pl-7'}
                        {...field}
                        value={(field.value as number | undefined) ?? ''}
                        data-test={'renew-value-input'}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={'notes'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={'Any remarks about this renewal…'}
                      className={'h-20 resize-none'}
                      {...field}
                      data-test={'renew-notes-input'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={'flex flex-wrap justify-end gap-2 pt-1'}>
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
                data-test={'confirm-renew-btn'}
              >
                {isPending ? 'Saving…' : 'Mark as Renewed'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
