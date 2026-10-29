'use client';

import { useState } from 'react';
import { useEffect, useRef } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { FileText, IdCard, Plus, X } from 'lucide-react';
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
const MAX_FILES = 4;

interface FileEntry {
  file: File;
  error: string | null;
  previewUrl: string | null;
}

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

  const guestId = useWatch({ control: form.control, name: 'guestId' });

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [globalFileError, setGlobalFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Revoke all object URLs when the dialog unmounts.
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(
    () => () => {
      filesRef.current.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    },
    [],
  );

  function addFile(raw: File | null) {
    if (!raw) return;
    setGlobalFileError(null);

    if (files.length >= MAX_FILES) {
      setGlobalFileError(`You can attach up to ${MAX_FILES} photos.`);
      return;
    }

    if (raw.size > ID_FILE_MAX_BYTES) {
      setGlobalFileError('That file is larger than 10 MB.');
      return;
    }

    const isPdf = raw.type === 'application/pdf';
    const previewUrl = isPdf ? null : URL.createObjectURL(raw);
    setFiles((prev) => [...prev, { file: raw, error: null, previewUrl }]);
  }

  function removeFile(index: number) {
    const entry = files[index];
    if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function upload(values: RecordIdInput) {
    // Phone is required for the lead (first) guest.
    if (first && !values.newGuestPhone?.trim()) {
      form.setError('newGuestPhone', {
        message: 'Phone is required for the lead guest',
      });
      return;
    }

    if (files.length === 0) {
      setGlobalFileError('Attach at least one ID photo.');
      return;
    }

    setUploading(true);

    try {
      const body = new FormData();
      body.set('data', JSON.stringify(values));

      files.forEach(({ file }, i) => {
        body.set(`file_${i}`, file);
      });

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

  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent
        className="flex max-h-[90dvh] max-w-lg flex-col overflow-hidden"
        data-test={'villa-add-id-dialog'}
      >
        <DialogHeader>
          <DialogTitle>Add ID</DialogTitle>
          <DialogDescription>One ID per adult guest.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex min-h-0 flex-col gap-4 overflow-y-auto"
            onSubmit={form.handleSubmit((values) => upload(values))}
          >
            {/* Guest picker */}
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

            {/* New guest fields */}
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
                      <FormLabel>Phone{first ? '' : ' (optional)'}</FormLabel>
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
              </div>
            ) : null}

            {/* ID type + number */}
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
                          placeholder="Last 4 digits"
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

            {/* Multi-file upload */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">ID photos</p>
              <p className="text-muted-foreground text-xs">
                Front and back of the ID. Accepted Formats: JPEG, PNG, WebP and
                PDF.
              </p>

              {/* Thumbnail grid */}
              {files.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {files.map((entry, i) => (
                    <div
                      key={i}
                      className="relative h-20 w-20 overflow-hidden rounded-lg border"
                      data-test={`villa-add-id-file-thumb-${i}`}
                    >
                      {entry.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={entry.previewUrl}
                          alt={entry.file.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="bg-muted/40 flex h-full w-full flex-col items-center justify-center gap-1 p-2">
                          <FileText className="text-muted-foreground h-7 w-7" />
                          <span className="text-muted-foreground w-full truncate text-center text-xs">
                            {entry.file.name}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        aria-label="Remove file"
                        className="bg-background/80 absolute top-1 right-1 rounded-full p-0.5 shadow-sm"
                        data-test={`villa-add-id-file-remove-${i}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Add file button */}
              {files.length < MAX_FILES ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={
                      <label
                        htmlFor="villa-id-file-add"
                        className="cursor-pointer"
                      />
                    }
                    data-test={'villa-add-id-file-btn'}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {files.length === 0 ? 'Attach photo' : 'Add another photo'}
                  </Button>
                  <Input
                    id="villa-id-file-add"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      addFile(e.target.files?.[0] ?? null);
                      // Reset so the same file can be re-added after removal.
                      e.target.value = '';
                    }}
                    data-test={'villa-add-id-file'}
                  />
                </div>
              ) : null}

              {globalFileError ? (
                <p
                  className="text-destructive text-sm"
                  role="alert"
                  data-test={'villa-add-id-file-error'}
                >
                  {globalFileError}
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
                disabled={uploading}
                data-test={'villa-add-id-submit'}
              >
                {uploading ? 'Saving…' : 'Save ID'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
