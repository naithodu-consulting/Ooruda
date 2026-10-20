'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { IdCard } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@kit/ui/button';
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
  ID_DOC_TYPES,
  ID_FILE_MAX_BYTES,
  idDocTypeLabel,
} from '~/lib/villa/guest-ids';

import {
  type RecordIdInput,
  RecordIdSchema,
} from '../_lib/schemas/guests.schema';
import type { GuestRow } from './guest-ids-panel';

const NEW_GUEST = '__new__';

export function AddIdDialog(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
  guests: GuestRow[];
  bookingGuestName: string;
  bookingGuestPhone: string | null;
  uploadsEnabled: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} data-test={'villa-guest-ids-add'}>
        <IdCard className="mr-1.5 h-4 w-4" />
        Add ID
      </Button>
      {open ? (
        <AddIdForm
          {...props}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            props.onSaved();
          }}
        />
      ) : null}
    </>
  );
}

function AddIdForm(
  props: Parameters<typeof AddIdDialog>[0] & { onClose: () => void },
) {
  const first = props.guests.length === 0;

  const form = useForm<RecordIdInput>({
    resolver: zodResolver(RecordIdSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      bookingId: props.bookingId,
      guestId: first ? '' : (props.guests[0]?.id ?? ''),
      // The first ID is usually the lead guest who booked.
      newGuestName: first ? props.bookingGuestName : '',
      newGuestPhone: first ? (props.bookingGuestPhone ?? '') : '',
      isAdult: true,
      docType: 'aadhaar',
      idNumber: '',
      stage: 'soft_copy',
    },
  });

  const guestId = useWatch({
    control: form.control,
    name: 'guestId',
  });

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(values: RecordIdInput) {
    if (!file) {
      setFileError('Attach the ID photo.');
      return;
    }

    setUploading(true);

    try {
      const body = new FormData();
      body.set('data', JSON.stringify(values));
      body.set('file', file);

      const response = await fetch('/api/villa/guest-documents', {
        method: 'POST',
        body,
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !result?.ok) {
        toast.error(result?.message ?? 'Could not save the ID.');
        return;
      }

      toast.success('ID saved');
      props.onSaved();
    } catch {
      toast.error('Could not reach Ooruda. Check your connection.');
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading;

  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent
        className="max-h-[92vh] max-w-lg overflow-y-auto"
        data-test={'villa-add-id-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Add a guest ID</DialogTitle>
          <DialogDescription>
            One for each adult guest. Only the last 4 digits of the number are
            kept.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => upload(values))}
          >
            <FormField
              name="guestId"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guest</FormLabel>
                  <Select
                    value={field.value || NEW_GUEST}
                    onValueChange={(v) =>
                      field.onChange(v === NEW_GUEST ? '' : v)
                    }
                  >
                    <FormControl>
                      <SelectTrigger
                        className="w-full"
                        data-test={'villa-add-id-guest'}
                      >
                        <SelectValue>
                          {(v: string) =>
                            v === NEW_GUEST
                              ? 'New guest'
                              : (props.guests.find((g) => g.id === v)?.name ??
                                'Guest')
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {props.guests.map((g) => (
                        <SelectItem
                          key={g.id}
                          value={g.id}
                          data-test={'villa-add-id-guest-option'}
                        >
                          {g.name}
                        </SelectItem>
                      ))}
                      <SelectItem
                        value={NEW_GUEST}
                        data-test={'villa-add-id-guest-new'}
                      >
                        New guest
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {guestId === '' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  name="newGuestName"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name as on the ID</FormLabel>
                      <FormControl
                        render={
                          <Input
                            {...field}
                            autoComplete="off"
                            data-test={'villa-add-id-name'}
                          />
                        }
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="newGuestPhone"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (optional)</FormLabel>
                      <FormControl
                        render={
                          <PhoneInput
                            name={field.name}
                            ref={field.ref}
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            data-test={'villa-add-id-phone'}
                          />
                        }
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="isAdult"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 sm:col-span-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-test={'villa-add-id-adult'}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Adult (18+)</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                name="docType"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger
                          className="w-full"
                          data-test={'villa-add-id-type'}
                        >
                          <SelectValue>
                            {(v: string) => idDocTypeLabel(v)}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ID_DOC_TYPES.map((t) => (
                          <SelectItem
                            key={t}
                            value={t}
                            data-test={`villa-add-id-type-${t}`}
                          >
                            {idDocTypeLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="idNumber"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID number (optional)</FormLabel>
                    <FormControl
                      render={
                        <Input
                          {...field}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="Last 4 digits is enough"
                          data-test={'villa-add-id-number'}
                        />
                      }
                    />
                    <FormDescription>
                      Only the last 4 are saved.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="villa-id-file" className="text-sm font-medium">
                ID photo
              </label>
              <Input
                id="villa-id-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFileError(
                    f && f.size > ID_FILE_MAX_BYTES
                      ? 'The file is larger than 10 MB.'
                      : null,
                  );
                  setFile(f && f.size <= ID_FILE_MAX_BYTES ? f : null);
                }}
                data-test={'villa-add-id-file'}
              />
              <p className="text-muted-foreground text-xs">
                JPEG, PNG, WebP or PDF, up to 10 MB.
              </p>
              {fileError ? (
                <p
                  className="text-destructive text-sm"
                  role="alert"
                  data-test={'villa-add-id-file-error'}
                >
                  {fileError}
                </p>
              ) : null}
            </div>

            {/* Not DialogFooter: its bg-muted band clashes with the dialog. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={props.onClose}
                data-test={'villa-add-id-cancel'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busy}
                data-test={'villa-add-id-submit'}
              >
                {busy ? 'Saving…' : 'Save ID'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
