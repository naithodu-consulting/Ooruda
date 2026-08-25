'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';

import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { ArrowLeft, History, RefreshCw, XCircle } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
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
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';

import { formatINR } from '~/lib/format-inr';

import { AmcStatusBadge } from '../../_components/amc-status-badge';
import {
  RenewAmcSchema,
  TerminateAmcSchema,
  type RenewAmcInput,
  type TerminateAmcInput,
} from '../../_lib/schemas/amc.schema';
import {
  renewAmcContractAction,
  terminateAmcContractAction,
} from '../../_lib/server/amc-actions';
import { computeAmcStatus } from '../../_lib/amc-utils';

interface HistoryRow {
  id: string;
  renewed_at: string;
  new_end_date: string;
  contract_value: number;
  notes: string | null;
  created_at: string;
}

interface Props {
  associationId: string;
  accountSlug: string;
  contract: Record<string, unknown>;
  history: HistoryRow[];
}

export function AmcDetailClient({
  associationId,
  accountSlug,
  contract,
  history,
}: Props) {
  const [renewOpen, setRenewOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [contractData, setContractData] = useState(contract);

  const status = computeAmcStatus(
    contractData['end_date'] as string,
    contractData['terminated_at'] as string | null,
  );

  function labelVal(label: string, value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    return (
      <div className={'flex flex-col gap-0.5'}>
        <span className={'text-muted-foreground text-xs'}>{label}</span>
        <span className={'text-sm'}>{String(value)}</span>
      </div>
    );
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    // ISO timestamps already have a time component; date-only strings need one appended
    // to avoid UTC midnight shifting the date in IST
    const date = d.includes('T') ? new Date(d) : new Date(d + 'T00:00:00');
    return format(date, 'd MMM yyyy');
  }

  const daysLeft = (() => {
    if (contractData['terminated_at']) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(contractData['end_date'] as string);
    end.setHours(0, 0, 0, 0);
    return Math.round(
      (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
  })();

  return (
    <div className={'flex flex-col gap-y-6'}>
      {/* Back + actions */}
      <div className={'flex items-center justify-between gap-2'}>
        <Button
          variant={'ghost'}
          size={'sm'}
          render={<Link href={`/home/${accountSlug}/amc`} />}
        >
          <ArrowLeft className={'mr-1.5 h-4 w-4'} />
          Back to Contracts
        </Button>

        {!contractData['terminated_at'] && (
          <div className={'flex gap-2'}>
            <Button
              variant={'outline'}
              size={'sm'}
              onClick={() => setTerminateOpen(true)}
              data-test={'terminate-btn'}
            >
              <XCircle className={'mr-1.5 h-3.5 w-3.5'} />
              End Contract
            </Button>
            <Button
              size={'sm'}
              onClick={() => setRenewOpen(true)}
              data-test={'renew-btn'}
            >
              <RefreshCw className={'mr-1.5 h-3.5 w-3.5'} />
              Mark as Renewed
            </Button>
          </div>
        )}
      </div>

      {/* Overview card */}
      <Card>
        <CardHeader className={'pb-2'}>
          <div className={'flex items-start justify-between gap-2'}>
            <CardTitle className={'text-base'}>
              {String(contractData['name'])}
            </CardTitle>
            <AmcStatusBadge status={status} />
          </div>
        </CardHeader>
        <CardContent>
          <div
            className={'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'}
          >
            {labelVal('Vendor', contractData['vendor_name'])}
            {labelVal('Category', contractData['category'])}
            {labelVal(
              'Priority',
              contractData['priority']
                ? String(contractData['priority']).charAt(0).toUpperCase() +
                    String(contractData['priority']).slice(1)
                : null,
            )}
            {labelVal('Payment Frequency', contractData['payment_frequency'])}
            {labelVal(
              'Start Date',
              formatDate(contractData['start_date'] as string),
            )}
            {labelVal(
              'End Date',
              formatDate(contractData['end_date'] as string),
            )}
            {labelVal(
              'Contract Value',
              formatINR(contractData['contract_value'] as number),
            )}
            {daysLeft !== null &&
              labelVal(
                'Days Remaining',
                daysLeft < 0
                  ? `${Math.abs(daysLeft)} days overdue`
                  : daysLeft === 0
                    ? 'Expires today'
                    : `${daysLeft} days`,
              )}
            {!!contractData['vendor_contact_person'] &&
              labelVal('Contact Person', contractData['vendor_contact_person'])}
            {!!contractData['vendor_phone'] &&
              labelVal('Phone', contractData['vendor_phone'])}
            {!!contractData['vendor_email'] &&
              labelVal('Email', contractData['vendor_email'])}
            {!!contractData['notice_period_days'] &&
              labelVal(
                'Notice Period',
                `${contractData['notice_period_days']} days`,
              )}
            {!!contractData['auto_renewal'] && labelVal('Auto Renewal', 'Yes')}
            {!!contractData['coverage_scope'] &&
              labelVal('Coverage Scope', contractData['coverage_scope'])}
            {!!contractData['sla_terms'] &&
              labelVal('SLA Terms', contractData['sla_terms'])}
            {!!contractData['notes'] &&
              labelVal('Notes', contractData['notes'])}
            {!!contractData['terminated_at'] &&
              labelVal(
                'Terminated On',
                formatDate(contractData['terminated_at'] as string),
              )}
            {!!contractData['terminated_reason'] &&
              labelVal(
                'Reason for Termination',
                contractData['terminated_reason'],
              )}
          </div>

          {!!contractData['contract_document_url'] && (
            <div className={'mt-4'}>
              <a
                href={contractData['contract_document_url'] as string}
                target={'_blank'}
                rel={'noreferrer'}
                className={'text-primary text-sm underline underline-offset-4'}
              >
                View Contract Document
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renewal History */}
      <Card>
        <CardHeader className={'pb-2'}>
          <div className={'flex items-center gap-2'}>
            <History className={'h-4 w-4'} />
            <CardTitle className={'text-base'}>Renewal History</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              No renewals recorded yet.
            </p>
          ) : (
            <ol className={'flex flex-col gap-y-3'}>
              {history.map((h, i) => {
                const isLatest = i === 0;
                const currentEndDate = contractData['end_date'] as string;
                const dateMismatch =
                  isLatest && h.new_end_date !== currentEndDate;
                return (
                  <li key={h.id} className={'flex items-start gap-3'}>
                    <div
                      className={
                        'bg-muted mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium'
                      }
                    >
                      {history.length - i}
                    </div>
                    <div className={'flex flex-col gap-0.5'}>
                      <span className={'text-sm font-medium'}>
                        Renewed on{' '}
                        {format(
                          new Date(h.renewed_at + 'T00:00:00'),
                          'd MMM yyyy',
                        )}
                      </span>
                      <span className={'text-muted-foreground text-xs'}>
                        New expiry:{' '}
                        {format(
                          new Date(h.new_end_date + 'T00:00:00'),
                          'd MMM yyyy',
                        )}{' '}
                        · {formatINR(h.contract_value)}
                      </span>
                      {dateMismatch && (
                        <span className={'text-muted-foreground text-xs italic'}>
                          Current expiry updated to{' '}
                          {format(
                            new Date(currentEndDate + 'T00:00:00'),
                            'd MMM yyyy',
                          )}{' '}
                          via contract edit
                        </span>
                      )}
                      {h.notes && (
                        <span className={'text-muted-foreground text-xs'}>
                          {h.notes}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Renew Dialog */}
      <RenewDialog
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        contractId={contractData['id'] as string}
        associationId={associationId}
        currentValue={contractData['contract_value'] as number}
        onSuccess={(newEndDate, value) => {
          setContractData((prev) => ({
            ...prev,
            end_date: newEndDate,
            contract_value: value,
          }));
          setRenewOpen(false);
        }}
      />

      {/* Terminate Dialog */}
      <TerminateDialog
        open={terminateOpen}
        onClose={() => setTerminateOpen(false)}
        contractId={contractData['id'] as string}
        associationId={associationId}
        onSuccess={() => {
          setContractData((prev) => ({
            ...prev,
            terminated_at: new Date().toISOString(),
          }));
          setTerminateOpen(false);
        }}
      />
    </div>
  );
}

// ── Renew Dialog ─────────────────────────────────────────────────────────────

function RenewDialog({
  open,
  onClose,
  contractId,
  associationId,
  currentValue,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string;
  associationId: string;
  currentValue: number;
  onSuccess: (newEndDate: string, value: number) => void;
}) {
  const [, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(RenewAmcSchema),
    defaultValues: {
      id: contractId,
      associationId,
      contractValue: currentValue,
      renewedAt: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  const { execute, isPending } = useAction(renewAmcContractAction, {
    onSuccess: () => {
      const values = form.getValues() as RenewAmcInput;
      toast.success('Contract renewed.');
      onSuccess(values.newEndDate, values.contractValue);
      form.reset({
        id: contractId,
        associationId,
        contractValue: currentValue,
        renewedAt: format(new Date(), 'yyyy-MM-dd'),
      });
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Failed to renew.'),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className={'bg-card'} data-test={'renew-dialog'}>
        <DialogHeader>
          <DialogTitle>Mark as Renewed</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) =>
              startTransition(() => execute(v as RenewAmcInput)),
            )}
            className={'flex flex-col gap-y-4'}
          >
            <div className={'grid grid-cols-2 gap-3'}>
              <FormField
                control={form.control}
                name={'renewedAt'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Renewal Date *</FormLabel>
                    <FormControl>
                      <Input
                        type={'date'}
                        {...field}
                        data-test={'renewed-at-input'}
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
                      <Input
                        type={'date'}
                        {...field}
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
                  <FormLabel>Contract Value (₹) *</FormLabel>
                  <FormControl>
                    <Input
                      type={'number'}
                      step={'0.01'}
                      min={'0'}
                      {...field}
                      value={(field.value as number) ?? ''}
                      data-test={'renew-value-input'}
                    />
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
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={'Any renewal notes…'}
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                      data-test={'renew-notes-input'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={'flex justify-end gap-2 pt-2'}>
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
                {isPending ? 'Saving…' : 'Confirm Renewal'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Terminate Dialog ──────────────────────────────────────────────────────────

function TerminateDialog({
  open,
  onClose,
  contractId,
  associationId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  contractId: string;
  associationId: string;
  onSuccess: () => void;
}) {
  const [, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(TerminateAmcSchema),
    defaultValues: { id: contractId, associationId },
  });

  const { execute, isPending } = useAction(terminateAmcContractAction, {
    onSuccess: () => {
      toast.success('Contract ended.');
      onSuccess();
    },
    onError: ({ error }) =>
      toast.error(
        error.serverError ?? 'Could not end the contract. Please try again.',
      ),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className={'bg-card'} data-test={'terminate-dialog'}>
        <DialogHeader>
          <DialogTitle>End Contract</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) =>
              startTransition(() => execute(v as TerminateAmcInput)),
            )}
            className={'flex flex-col gap-y-4'}
          >
            <FormField
              control={form.control}
              name={'reason'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Termination *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={'Why is this contract being terminated?'}
                      rows={3}
                      {...field}
                      data-test={'terminate-reason-input'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className={'flex justify-end gap-2 pt-2'}>
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
                variant={'destructive'}
                disabled={isPending}
                data-test={'confirm-terminate-btn'}
              >
                {isPending ? 'Ending…' : 'End Contract'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
