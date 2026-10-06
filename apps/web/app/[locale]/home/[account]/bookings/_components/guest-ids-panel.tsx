'use client';

import { useRouter } from 'next/navigation';

import {
  BadgeCheck,
  Eye,
  FileCheck2,
  MessageCircle,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';

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
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { toast } from '@kit/ui/sonner';

import { formatDateReadable } from '~/lib/format-date';
import { idDocTypeLabel, idRequestLink } from '~/lib/villa/guest-ids';
import { idStatusLabel } from '~/lib/villa/labels';

import {
  deleteIdAction,
  removeGuestAction,
  setIdStatusAction,
} from '../_lib/server/guests-actions';
import { AddIdDialog } from './add-id-dialog';

export interface GuestRow {
  id: string;
  name: string;
  phone: string | null;
  isPrimary: boolean;
  isAdult: boolean;
}

export interface GuestDoc {
  id: string;
  guestId: string;
  docType: string;
  maskedNumber: string | null;
  stage: 'soft_copy' | 'seen_in_person';
  hasFile: boolean;
  purgedAt: string | null;
  purgeAfter: string;
  capturedAt: string;
  verified: boolean;
}

export function GuestIdsPanel(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
  bookingCode: string | null;
  bookingGuestName: string;
  bookingGuestPhone: string | null;
  adults: number;
  idStatus: string;
  editable: boolean;
  isOwner: boolean;
  uploadsEnabled: boolean;
  businessWhatsApp: string | null;
  guests: GuestRow[];
  docs: GuestDoc[];
}) {
  const router = useRouter();
  const ref = {
    accountId: props.accountId,
    propertyId: props.propertyId,
    bookingId: props.bookingId,
  };

  const status = useAction(setIdStatusAction, {
    onSuccess: () => {
      toast.success('ID status updated');
      router.refresh();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not update the ID status.'),
  });

  // An ID counts once recorded, even after its photo is deleted.
  const withId = new Set(props.docs.map((d) => d.guestId));
  const adultsWithId = props.guests.filter(
    (g) => g.isAdult && withId.has(g.id),
  ).length;
  const purgeDate = props.docs.find((d) => d.hasFile)?.purgeAfter;

  return (
    <Card className="bg-card lg:col-span-2" data-test={'villa-guest-ids'}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="text-muted-foreground h-4 w-4" />
          Guests and IDs
        </CardTitle>
        <Badge variant="outline" data-test={'villa-guest-ids-status'}>
          {idStatusLabel(props.idStatus)}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          {adultsWithId} of {props.adults} adult
          {props.adults === 1 ? '' : 's'} have an ID recorded.{' '}
          {props.uploadsEnabled
            ? 'ID photos are deleted automatically 30 days after check-out.'
            : 'Storing ID photos is not switched on yet: record IDs you have seen, with the last 4 digits only.'}
        </p>

        {props.editable ? (
          <div className="flex flex-wrap gap-2">
            <AddIdDialog
              {...ref}
              guests={props.guests}
              bookingGuestName={props.bookingGuestName}
              bookingGuestPhone={props.bookingGuestPhone}
              uploadsEnabled={props.uploadsEnabled}
              onSaved={() => router.refresh()}
            />
            {props.bookingGuestPhone && props.bookingCode ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={idRequestLink(
                      props.bookingGuestPhone,
                      props.businessWhatsApp,
                      props.bookingCode,
                      props.adults,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
                data-test={'villa-guest-ids-request'}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Ask for IDs on WhatsApp
              </Button>
            ) : null}
            {props.idStatus === 'pending' ? (
              <Button
                variant="outline"
                disabled={status.isPending}
                onClick={() => status.execute({ ...ref, status: 'received' })}
                data-test={'villa-guest-ids-mark-received'}
              >
                <FileCheck2 className="mr-1.5 h-4 w-4" />
                IDs received on WhatsApp
              </Button>
            ) : null}
            {props.idStatus !== 'verified' ? (
              <Button
                variant="outline"
                disabled={status.isPending}
                onClick={() => status.execute({ ...ref, status: 'verified' })}
                data-test={'villa-guest-ids-mark-verified'}
              >
                <BadgeCheck className="mr-1.5 h-4 w-4" />
                Mark IDs checked
              </Button>
            ) : null}
          </div>
        ) : null}

        {props.guests.length === 0 ? (
          <p
            className="text-muted-foreground text-sm"
            data-test={'villa-guest-ids-empty'}
          >
            No guests recorded yet. Add an ID for each adult guest.
          </p>
        ) : (
          <ul className="divide-border divide-y rounded-lg border">
            {props.guests.map((g) => (
              <GuestItem
                key={g.id}
                guest={g}
                docs={props.docs.filter((d) => d.guestId === g.id)}
                accountId={props.accountId}
                propertyId={props.propertyId}
                bookingId={props.bookingId}
                editable={props.editable}
                isOwner={props.isOwner}
                onChanged={() => router.refresh()}
              />
            ))}
          </ul>
        )}

        {purgeDate ? (
          <div className="bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-md px-3 py-2 text-xs">
            <ShieldCheck className="text-primary h-4 w-4 shrink-0" />
            <span>
              DPDP Retention: Stored ID documents for this stay will be
              automatically purged on{' '}
              <strong className="text-foreground">
                {formatDateReadable(purgeDate)}
              </strong>
              .
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GuestItem(props: {
  guest: GuestRow;
  docs: GuestDoc[];
  accountId: string;
  propertyId: string;
  bookingId: string;
  editable: boolean;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const { guest } = props;

  const remove = useAction(removeGuestAction, {
    onSuccess: () => {
      toast.success('Guest removed from this booking');
      props.onChanged();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not remove the guest.'),
  });

  const liveDocs = props.docs.filter((d) => !d.purgedAt);

  return (
    <li className="flex flex-col gap-2 p-3" data-test={'villa-guest-row'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium break-words">{guest.name}</span>
        {guest.isPrimary ? <Badge variant="secondary">Lead guest</Badge> : null}
        {!guest.isAdult ? <Badge variant="outline">Child</Badge> : null}
        {props.editable && liveDocs.length === 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={remove.isPending}
            onClick={() =>
              remove.execute({
                accountId: props.accountId,
                propertyId: props.propertyId,
                bookingId: props.bookingId,
                guestId: guest.id,
              })
            }
            data-test={'villa-guest-remove'}
          >
            Remove
          </Button>
        ) : null}
      </div>

      {props.docs.length === 0 ? (
        <p className="text-muted-foreground text-xs">No ID recorded.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {props.docs.map((d) => (
            <DocItem
              key={d.id}
              doc={d}
              accountId={props.accountId}
              canDelete={props.isOwner && !d.purgedAt}
              onChanged={props.onChanged}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function DocItem(props: {
  doc: GuestDoc;
  accountId: string;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const { doc } = props;

  const del = useAction(deleteIdAction, {
    onSuccess: () => {
      toast.success('ID deleted');
      props.onChanged();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not delete the ID.'),
  });

  const how =
    doc.stage === 'seen_in_person'
      ? 'Seen in person'
      : doc.purgedAt
        ? `Photo deleted ${formatDateReadable(doc.purgedAt.slice(0, 10))}`
        : 'Photo stored';

  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
      data-test={'villa-guest-doc'}
    >
      <span className="font-medium">{idDocTypeLabel(doc.docType)}</span>
      {doc.maskedNumber ? (
        <span className="text-muted-foreground font-mono text-xs">
          {doc.maskedNumber}
        </span>
      ) : null}
      <span className="text-muted-foreground text-xs">{how}</span>
      {doc.verified ? (
        <Badge variant="outline" className="border-success/40 text-success">
          Checked
        </Badge>
      ) : null}

      <span className="ml-auto flex gap-1">
        {doc.hasFile ? (
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={
              <a
                href={`/api/villa/guest-documents/${doc.id}?account=${props.accountId}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
            data-test={'villa-guest-doc-view'}
          >
            <Eye className="mr-1 h-3.5 w-3.5" />
            View
          </Button>
        ) : null}

        {props.canDelete ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete ID"
                  data-test={'villa-guest-doc-delete'}
                />
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this ID now?</AlertDialogTitle>
                <AlertDialogDescription>
                  The photo is removed straight away. A note that an ID was held
                  (type and last 4 digits) stays in the record.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialogCancel data-test={'villa-guest-doc-delete-cancel'}>
                  Keep
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={del.isPending}
                  onClick={() =>
                    del.execute({
                      accountId: props.accountId,
                      documentId: doc.id,
                    })
                  }
                  data-test={'villa-guest-doc-delete-confirm'}
                >
                  Delete
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </span>
    </li>
  );
}
