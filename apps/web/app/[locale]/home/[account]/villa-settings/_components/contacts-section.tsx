'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { formatPhoneNumber } from '@kit/shared/utils';
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
import { Input } from '@kit/ui/input';
import { PhoneInput } from '@kit/ui/phone-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';
import { Switch } from '@kit/ui/switch';

import {
  CONTACT_CATEGORY_LABELS,
  contactCategoryLabel,
} from '~/lib/villa/labels';

import {
  CONTACT_CATEGORIES,
  type ContactInput,
  ContactSchema,
} from '../_lib/schemas/villa-settings.schema';
import {
  deleteContactAction,
  saveContactAction,
} from '../_lib/server/villa-settings-actions';

export interface ContactRow {
  id: string;
  category: string;
  name: string;
  phone: string;
  notes: string | null;
  share_with_guests: boolean;
}

export function ContactsSection(props: {
  accountId: string;
  propertyId: string;
  canEdit: boolean;
  contacts: ContactRow[];
}) {
  const [editing, setEditing] = useState<ContactRow | 'new' | null>(null);

  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-base">Emergency contacts</CardTitle>
          <CardDescription>
            Key contacts for property operations and emergencies. Contacts
            marked "Share with guests" are included in pre-arrival guest emails.
          </CardDescription>
        </div>
        {props.canEdit ? (
          <Button
            size="sm"
            onClick={() => setEditing('new')}
            data-test={'villa-contact-new'}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add contact
          </Button>
        ) : null}
      </CardHeader>

      <CardContent>
        {props.contacts.length === 0 ? (
          <p
            className="text-muted-foreground text-sm"
            data-test={'villa-contact-empty'}
          >
            No emergency contacts yet. Add at least the caretaker and the
            nearest hospital.
          </p>
        ) : (
          <ul className="divide-border divide-y rounded-lg border">
            {props.contacts.map((contact) => (
              <li
                key={contact.id}
                data-test={'villa-contact-row'}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="truncate">{contact.name}</span>
                    <Badge variant="outline">
                      {contactCategoryLabel(contact.category)}
                    </Badge>
                    {contact.share_with_guests ? (
                      <Badge variant="outline">Shared with guests</Badge>
                    ) : null}
                  </span>
                  {contact.notes ? (
                    <span className="text-muted-foreground text-xs">
                      {contact.notes}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${contact.phone}`}
                    className="text-primary inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap tabular-nums hover:underline"
                    data-test={'villa-contact-call'}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {formatPhoneNumber(contact.phone)}
                  </a>
                  {props.canEdit ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${contact.name}`}
                        onClick={() => setEditing(contact)}
                        data-test={'villa-contact-edit'}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteContactButton
                        accountId={props.accountId}
                        propertyId={props.propertyId}
                        contact={contact}
                      />
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {editing ? (
        <ContactDialog
          accountId={props.accountId}
          propertyId={props.propertyId}
          contact={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  );
}

function ContactDialog(props: {
  accountId: string;
  propertyId: string;
  contact: ContactRow | null;
  onClose: () => void;
}) {
  const form = useForm<ContactInput>({
    resolver: zodResolver(ContactSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      id: props.contact?.id,
      category:
        (props.contact?.category as ContactInput['category']) ?? 'caretaker',
      name: props.contact?.name ?? '',
      phone: props.contact?.phone ?? '',
      notes: props.contact?.notes ?? '',
      shareWithGuests: props.contact?.share_with_guests ?? false,
    },
  });

  const { execute, isPending } = useAction(saveContactAction, {
    onSuccess: () => {
      toast.success(props.contact ? 'Contact updated' : 'Contact added');
      props.onClose();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not save the contact.'),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className="max-w-md" data-test={'villa-contact-dialog'}>
        <DialogHeader>
          <DialogTitle>
            {props.contact ? 'Edit contact' : 'New emergency contact'}
          </DialogTitle>
          <DialogDescription>Staff always see every contact.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => execute(values))}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="category"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          data-test={'villa-contact-category'}
                        >
                          <SelectValue>
                            {(value: string) => contactCategoryLabel(value)}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CONTACT_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {CONTACT_CATEGORY_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="name"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl
                      render={
                        <Input {...field} data-test={'villa-contact-name'} />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              name="phone"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl
                    render={
                      <PhoneInput
                        name={field.name}
                        ref={field.ref}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        data-test={'villa-contact-phone'}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="notes"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl
                    render={
                      <Input
                        {...field}
                        placeholder="e.g. 24 hours, 3 km away"
                        data-test={'villa-contact-notes'}
                      />
                    }
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="shareWithGuests"
              control={form.control}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3">
                  <div className="flex flex-col gap-1">
                    <FormLabel>Share with guests</FormLabel>
                    <FormDescription>
                      Include in the pre-arrival welcome email.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-test={'villa-contact-share'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={props.onClose}
                disabled={isPending}
                data-test={'villa-contact-cancel'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                data-test={'villa-contact-save'}
              >
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteContactButton(props: {
  accountId: string;
  propertyId: string;
  contact: ContactRow;
}) {
  const { execute, isPending } = useAction(deleteContactAction, {
    onSuccess: () => toast.success('Contact removed'),
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not remove the contact.'),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${props.contact.name}`}
            data-test={'villa-contact-delete'}
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {props.contact.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They will no longer appear for staff or in guest emails.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Not AlertDialogFooter: its bg-muted band clashes with the white
            dialog (same issue as DialogFooter). */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel data-test={'villa-contact-delete-cancel'}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isPending}
            data-test={'villa-contact-delete-confirm'}
            onClick={() =>
              execute({
                accountId: props.accountId,
                propertyId: props.propertyId,
                id: props.contact.id,
              })
            }
          >
            {isPending ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
