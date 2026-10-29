'use client';

import { useEffect, useState } from 'react';

import { Mail } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { toast } from '@kit/ui/sonner';
import { Switch } from '@kit/ui/switch';

import { saveGuestEmailSettingsAction } from '../_lib/server/villa-settings-actions';

type EmailToggleField = 'preArrivalEmail' | 'thankYouEmail';

interface PendingToggle {
  field: EmailToggleField;
  nextValue: boolean;
}

const EMAIL_COPY: Record<
  EmailToggleField,
  {
    label: string;
    description: string;
    enableMessage: string;
    disableMessage: string;
  }
> = {
  preArrivalEmail: {
    label: 'Pre-arrival welcome email',
    description:
      'Sends automatically at 10:00 AM IST the day before check-in with directions, check-in time, ID requirements, and staff contact numbers. Also enables sending by hand from the booking page.',
    enableMessage:
      'Ooruda will automatically send the pre-arrival welcome email to guests at 10:00 AM IST the day before check-in for all confirmed bookings on this villa, and allow staff to send it by hand from the booking page.',
    disableMessage:
      'Ooruda will stop sending the automatic pre-arrival welcome email before check-in, and disable sending it by hand from the booking page.',
  },
  thankYouEmail: {
    label: 'Post-checkout thank-you email',
    description:
      'Sends automatically 3 hours after staff mark the stay completed at check-out. Also enables sending by hand from the booking page.',
    enableMessage:
      'Ooruda will automatically send the thank-you email to guests 3 hours after staff mark a stay completed at check-out, and allow staff to send it by hand from the booking page.',
    disableMessage:
      'Ooruda will stop sending the automatic thank-you email after check-out, and disable sending it by hand from the booking page.',
  },
};

export function GuestEmailsCard(props: {
  accountId: string;
  preArrivalEmail: boolean;
  thankYouEmail: boolean;
  canEdit: boolean;
}) {
  const [preArrival, setPreArrival] = useState(props.preArrivalEmail);
  const [thankYou, setThankYou] = useState(props.thankYouEmail);
  const [pending, setPending] = useState<PendingToggle | null>(null);

  useEffect(() => {
    setPreArrival(props.preArrivalEmail);
    setThankYou(props.thankYouEmail);
  }, [props.preArrivalEmail, props.thankYouEmail]);

  const { execute, isPending } = useAction(saveGuestEmailSettingsAction, {
    onSuccess: ({ input }) => {
      setPreArrival(input.preArrivalEmail);
      setThankYou(input.thankYouEmail);
      setPending(null);
      toast.success('Guest email settings updated');
    },
    onError: ({ error }) => {
      setPending(null);
      toast.error(
        error.serverError ?? 'Could not update guest email settings.',
      );
    },
  });

  const disabled = !props.canEdit || isPending;

  function requestToggle(field: EmailToggleField, nextValue: boolean) {
    if (disabled) return;
    setPending({ field, nextValue });
  }

  function confirmToggle() {
    if (!pending) return;

    const nextPreArrival =
      pending.field === 'preArrivalEmail' ? pending.nextValue : preArrival;
    const nextThankYou =
      pending.field === 'thankYouEmail' ? pending.nextValue : thankYou;

    execute({
      accountId: props.accountId,
      preArrivalEmail: nextPreArrival,
      thankYouEmail: nextThankYou,
    });
  }

  const activeCopy = pending ? EMAIL_COPY[pending.field] : null;

  return (
    <>
      <Card className="bg-card" data-test={'villa-settings-guest-emails'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="text-muted-foreground h-4 w-4" />
            Automatic guest emails
          </CardTitle>
          <CardDescription>
            Control which scheduled emails are sent automatically to guests.
            Only the villa admin can change these switches.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label
                htmlFor="villa-settings-pre-arrival-switch"
                className="text-sm leading-none font-medium"
              >
                {EMAIL_COPY.preArrivalEmail.label}
              </label>
              <p className="text-muted-foreground text-xs">
                {EMAIL_COPY.preArrivalEmail.description}
              </p>
            </div>
            <Switch
              id="villa-settings-pre-arrival-switch"
              checked={preArrival}
              disabled={disabled}
              onCheckedChange={(checked) =>
                requestToggle('preArrivalEmail', checked)
              }
              data-test={'villa-settings-pre-arrival-email'}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label
                htmlFor="villa-settings-thank-you-switch"
                className="text-sm leading-none font-medium"
              >
                {EMAIL_COPY.thankYouEmail.label}
              </label>
              <p className="text-muted-foreground text-xs">
                {EMAIL_COPY.thankYouEmail.description}
              </p>
            </div>
            <Switch
              id="villa-settings-thank-you-switch"
              checked={thankYou}
              disabled={disabled}
              onCheckedChange={(checked) =>
                requestToggle('thankYouEmail', checked)
              }
              data-test={'villa-settings-thank-you-email'}
            />
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) {
            setPending(null);
          }
        }}
      >
        <AlertDialogContent data-test={'villa-settings-email-confirm-dialog'}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.nextValue ? 'Enable' : 'Disable'}{' '}
              {activeCopy?.label.toLowerCase()}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.nextValue
                ? activeCopy?.enableMessage
                : activeCopy?.disableMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel
              disabled={isPending}
              data-test={'villa-settings-email-confirm-cancel'}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant={pending?.nextValue ? 'default' : 'destructive'}
              disabled={isPending}
              onClick={confirmToggle}
              data-test={'villa-settings-email-confirm-submit'}
            >
              {isPending
                ? 'Saving…'
                : pending?.nextValue
                  ? 'Enable email'
                  : 'Disable email'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
