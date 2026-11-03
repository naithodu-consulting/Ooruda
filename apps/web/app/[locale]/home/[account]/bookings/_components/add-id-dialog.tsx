'use client';

import { useEffect, useRef, useState } from 'react';

import {
  FileText,
  IdCard,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';

import { isPhoneEmpty, normalizePhoneNumber } from '@kit/shared/utils';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
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
  type IdDocType,
  idDocTypeLabel,
} from '~/lib/villa/guest-ids';

import {
  GUEST_SALUTATIONS,
  type GuestSalutation,
  type RecordIdInput,
} from '../_lib/schemas/guests.schema';
import { addGuestAction } from '../_lib/server/guests-actions';
import type { GuestRow } from './guest-ids-panel';

const NEW_GUEST = '__new__';
const MAX_TOTAL_FILES = 10;

interface FileEntry {
  file: File;
  previewUrl: string | null;
}

interface GuestItem {
  key: string;
  guestId: string;
  salutation: GuestSalutation;
  firstName: string;
  lastName: string;
  phone: string;
  isAdult: boolean;
  error?: string | null;
}

/**
 * Fast client-side image downscaling.
 * Compresses large camera photos (e.g. 8-12 MB) to ~300-500 KB JPEGs in milliseconds.
 * Leaves PDFs and smaller images untouched.
 */
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file;
  }
  if (file.size < 600 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1920;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
          } else {
            resolve(
              new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
              }),
            );
          }
        },
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AddIdDialog(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
  guests: GuestRow[];
  bookingGuestName: string;
  bookingSalutation?: string | null;
  bookingFirstName?: string | null;
  bookingLastName?: string | null;
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
          onRefresh={props.onSaved}
        />
      ) : null}
    </>
  );
}

function AddIdForm(
  props: Parameters<typeof AddIdDialog>[0] & {
    onClose: () => void;
    onRefresh: () => void;
  },
) {
  const hasExistingGuests = props.guests.length > 0;

  const bookingSalutation: GuestSalutation | undefined = GUEST_SALUTATIONS.find(
    (s) => s === props.bookingSalutation,
  );

  const initialLeadGuest: GuestItem = {
    key: 'initial-lead',
    guestId: hasExistingGuests ? (props.guests[0]?.id ?? '') : '',
    salutation: bookingSalutation ?? 'Mr',
    firstName: !hasExistingGuests
      ? (props.bookingFirstName ??
        props.bookingGuestName.split(' ')[0] ??
        props.bookingGuestName)
      : '',
    lastName: !hasExistingGuests
      ? (props.bookingLastName ??
        props.bookingGuestName.split(' ').slice(1).join(' '))
      : '',
    phone: !hasExistingGuests ? (props.bookingGuestPhone ?? '') : '',
    isAdult: true,
    error: null,
  };

  const [guestItems, setGuestItems] = useState<GuestItem[]>([initialLeadGuest]);
  const [docType, setDocType] = useState<IdDocType>('aadhaar');
  const [idNumber, setIdNumber] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [docError, setDocError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingMessage, setUploadingMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Clean up object URLs on unmount
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

  function addGuestItem() {
    setGuestItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        guestId: '',
        salutation: 'Mr',
        firstName: '',
        lastName: '',
        phone: '',
        isAdult: true,
        error: null,
      },
    ]);
  }

  function removeGuestItem(index: number) {
    setGuestItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateGuestItem(index: number, updates: Partial<GuestItem>) {
    setGuestItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    );
  }

  function addFiles(newFiles: FileList | File[] | null) {
    if (!newFiles || newFiles.length === 0) return;
    const list = Array.from(newFiles);

    const availableSlots = MAX_TOTAL_FILES - files.length;
    if (availableSlots <= 0) {
      toast.error(`You can attach up to ${MAX_TOTAL_FILES} files in total.`);
      return;
    }

    const toAdd = list.slice(0, availableSlots);
    if (list.length > availableSlots) {
      toast.warning(
        `Only ${availableSlots} more file(s) could be added (max ${MAX_TOTAL_FILES}).`,
      );
    }

    const validEntries: FileEntry[] = [];
    for (const raw of toAdd) {
      if (raw.size > ID_FILE_MAX_BYTES) {
        toast.error(`"${raw.name}" is larger than 10 MB.`);
        continue;
      }
      const isPdf = raw.type === 'application/pdf';
      const previewUrl = isPdf ? null : URL.createObjectURL(raw);
      validEntries.push({ file: raw, previewUrl });
    }

    if (validEntries.length > 0) {
      setFiles((prev) => [...prev, ...validEntries]);
      setDocError(null);
    }
  }

  function removeFile(fileIndex: number) {
    setFiles((prev) => {
      const entry = prev[fileIndex];
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((_, fi) => fi !== fileIndex);
    });
  }

  async function handleSaveAll() {
    // 1. Validation
    let hasError = false;
    const validated = guestItems.map((item, index) => {
      let err: string | null = null;
      const isLead = !hasExistingGuests && index === 0;

      if (!item.guestId) {
        if (!item.firstName.trim()) {
          err = 'First name is required.';
        } else if (
          isLead &&
          (isPhoneEmpty(item.phone) || !normalizePhoneNumber(item.phone))
        ) {
          err = isPhoneEmpty(item.phone)
            ? 'Phone number is required for the lead guest.'
            : 'Enter a valid phone number (10-digit mobile or international with country code).';
        } else if (
          !isLead &&
          !isPhoneEmpty(item.phone) &&
          !normalizePhoneNumber(item.phone)
        ) {
          err =
            'Enter a valid phone number (10-digit mobile or international with country code).';
        }
      }

      if (err) hasError = true;
      return { ...item, error: err };
    });

    setGuestItems(validated);

    if (files.length === 0) {
      setDocError('Attach at least one ID photo or document.');
      hasError = true;
    }

    if (hasError) {
      toast.error('Please complete the highlighted details.');
      return;
    }

    setUploading(true);
    setUploadingMessage('Saving lead guest & ID documents…');

    try {
      // Fast client-side image optimization
      const compressedFiles: File[] = [];
      for (const fe of files) {
        const comp = await compressImageIfNeeded(fe.file);
        compressedFiles.push(comp);
      }

      const leadItem = guestItems[0]!;
      const leadFullName = [leadItem.firstName.trim(), leadItem.lastName.trim()]
        .filter(Boolean)
        .join(' ');

      const recordInput: RecordIdInput = {
        accountId: props.accountId,
        propertyId: props.propertyId,
        bookingId: props.bookingId,
        guestId: leadItem.guestId,
        newGuestSalutation: leadItem.salutation,
        newGuestFirstName: leadItem.firstName.trim(),
        newGuestLastName: leadItem.lastName.trim(),
        newGuestName: leadFullName,
        newGuestPhone: leadItem.phone.trim(),
        isAdult: leadItem.isAdult,
        docType,
        idNumber: idNumber.trim(),
        stage: 'soft_copy',
      };

      const body = new FormData();
      body.set('data', JSON.stringify(recordInput));
      compressedFiles.forEach((file, fileIdx) => {
        body.set(`file_${fileIdx}`, file);
      });

      const res = await fetch('/api/villa/guest-documents', {
        method: 'POST',
        body,
      });

      const resData = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!res.ok || !resData?.ok) {
        throw new Error(
          resData?.message ??
            `Failed to save lead guest (${leadFullName || 'guest'}) and IDs.`,
        );
      }

      // Refresh panel in background to show lead guest & ID
      props.onRefresh();

      // Save remaining additional guests
      if (guestItems.length > 1) {
        for (let i = 1; i < guestItems.length; i++) {
          const item = guestItems[i]!;
          setUploadingMessage(`Saving guest ${i + 1} of ${guestItems.length}…`);

          const fullName = [item.firstName.trim(), item.lastName.trim()]
            .filter(Boolean)
            .join(' ');

          const addRes = await addGuestAction({
            accountId: props.accountId,
            propertyId: props.propertyId,
            bookingId: props.bookingId,
            guestId: item.guestId,
            newGuestSalutation: item.salutation,
            newGuestFirstName: item.firstName.trim(),
            newGuestLastName: item.lastName.trim(),
            newGuestName: fullName,
            newGuestPhone: item.phone.trim(),
            isAdult: item.isAdult,
          });

          if (addRes?.serverError) {
            throw new Error(addRes.serverError);
          }
          if (addRes?.validationErrors) {
            throw new Error(
              `Invalid data for guest ${i + 1} (${fullName || 'guest'}).`,
            );
          }
        }
      }

      toast.success(
        guestItems.length === 1
          ? 'Guest ID recorded successfully'
          : `All ${guestItems.length} guests & ID documents saved successfully`,
      );
      props.onSaved();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not save the ID.';
      toast.error(message);
    } finally {
      setUploading(false);
      setUploadingMessage(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent
        className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-2xl"
        data-test={'villa-add-id-dialog'}
      >
        {/* Header - Fixed */}
        <div className="border-b px-6 py-4">
          <DialogHeader className="pr-6">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <IdCard className="text-primary h-5 w-5" />
                Add Guest IDs
              </DialogTitle>
              <span className="text-muted-foreground text-xs font-medium">
                {files.length} / {MAX_TOTAL_FILES} files
              </span>
            </div>
            <DialogDescription className="text-xs">
              Record government photo IDs for guests staying at the villa. You
              can add multiple guests and attach ID documents in bulk.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable Body - Strictly overflow-x-hidden */}
        <div className="min-h-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto p-6">
          {/* Section: Guests */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">
                Guests in this stay ({guestItems.length})
              </h3>
              <span className="text-muted-foreground text-xs">
                Names as on government IDs
              </span>
            </div>

            <div className="space-y-4">
              {guestItems.map((item, index) => {
                const isLead = !hasExistingGuests && index === 0;

                return (
                  <div
                    key={item.key}
                    className="bg-card flex flex-col gap-3.5 rounded-xl border p-4 shadow-2xs"
                  >
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={isLead ? 'default' : 'secondary'}
                          className="font-semibold"
                        >
                          {isLead ? 'Lead Guest' : `Guest ${index + 1}`}
                        </Badge>
                        {item.error ? (
                          <span className="text-destructive text-xs font-medium">
                            {item.error}
                          </span>
                        ) : null}
                      </div>
                      {index > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive h-7 px-2"
                          onClick={() => removeGuestItem(index)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      ) : null}
                    </div>

                    {/* Existing guest selector if guests exist on booking */}
                    {hasExistingGuests ? (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium">Guest</label>
                        <Select
                          value={item.guestId || NEW_GUEST}
                          onValueChange={(v) =>
                            updateGuestItem(index, {
                              guestId: v === NEW_GUEST || !v ? '' : v,
                            })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue>
                              {(v: string) =>
                                v === NEW_GUEST
                                  ? 'Someone else (New guest)'
                                  : (props.guests.find((g) => g.id === v)
                                      ?.name ?? 'Select a guest')
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {props.guests.map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name}
                              </SelectItem>
                            ))}
                            <SelectItem value={NEW_GUEST}>
                              Someone else (New guest)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {/* Guest Names & Phone if adding new guest */}
                    {!item.guestId ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                        <div className="sm:col-span-3">
                          <label className="text-xs font-medium">
                            Salutation
                          </label>
                          <Select
                            value={item.salutation}
                            onValueChange={(v) =>
                              updateGuestItem(index, {
                                salutation: v as GuestSalutation,
                              })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Mr">Mr</SelectItem>
                              <SelectItem value="Mrs">Mrs</SelectItem>
                              <SelectItem value="Ms">Ms</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="sm:col-span-5">
                          <label className="text-xs font-medium">
                            First Name{' '}
                            <span className="text-destructive">*</span>
                          </label>
                          <Input
                            value={item.firstName}
                            onChange={(e) =>
                              updateGuestItem(index, {
                                firstName: e.target.value,
                              })
                            }
                            placeholder="First Name"
                            autoComplete="off"
                            data-test={
                              index === 0
                                ? 'villa-add-id-first-name'
                                : `villa-add-id-first-name-${index}`
                            }
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="text-xs font-medium">
                            Last Name
                          </label>
                          <Input
                            value={item.lastName}
                            onChange={(e) =>
                              updateGuestItem(index, {
                                lastName: e.target.value,
                              })
                            }
                            placeholder="Surname"
                            autoComplete="off"
                            data-test={
                              index === 0
                                ? 'villa-add-id-last-name'
                                : `villa-add-id-last-name-${index}`
                            }
                          />
                        </div>

                        <div className="sm:col-span-12">
                          <label className="text-xs font-medium">
                            Phone{isLead ? ' *' : ' (optional)'}
                          </label>
                          <PhoneInput
                            value={item.phone}
                            onChange={(v) =>
                              updateGuestItem(index, { phone: v, error: null })
                            }
                            data-test={
                              index === 0
                                ? 'villa-add-id-phone'
                                : `villa-add-id-phone-${index}`
                            }
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* ID Type & Number: ONLY in Lead Guest section */}
                    {index === 0 ? (
                      <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium">ID type</label>
                          <Select
                            value={docType}
                            onValueChange={(v) => setDocType(v as IdDocType)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {idDocTypeLabel(docType)}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {ID_DOC_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {idDocTypeLabel(t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-xs font-medium">
                            ID number{' '}
                            <span className="text-muted-foreground font-normal">
                              (optional)
                            </span>
                          </label>
                          <Input
                            value={idNumber}
                            onChange={(e) => setIdNumber(e.target.value)}
                            placeholder="Last 4 digits"
                            autoComplete="off"
                            data-test={'villa-add-id-number'}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={addGuestItem}
              className="w-full border-dashed py-3.5 text-xs font-medium"
              data-test={'villa-add-another-guest-btn'}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add another guest in this booking
            </Button>
          </div>

          {/* Section: ID Documents (shown ONCE in bulk at the end) */}
          <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-1 border-b pb-2">
              <div className="flex items-center gap-2">
                <IdCard className="text-primary h-4 w-4" />
                <h3 className="text-sm font-semibold">
                  Identity Documents &amp; Photos
                </h3>
              </div>
            </div>

            {docError ? (
              <span className="text-destructive text-xs font-medium">
                {docError}
              </span>
            ) : null}

            {/* Bulk File Dropzone / Uploader */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">
                Add guest IDs <span className="text-destructive">*</span>
              </label>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-primary/50'
                }`}
              >
                <UploadCloud className="text-muted-foreground mb-1.5 h-7 w-7" />
                <p className="text-xs font-medium">
                  Drag and drop OR{' '}
                  <label
                    htmlFor="villa-bulk-id-files"
                    className="text-primary hover:text-primary/80 cursor-pointer underline underline-offset-2"
                  >
                    upload IDs
                  </label>
                </p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  Accepted formats are JPEG, PNG, WebP or PDF. Max{' '}
                  {MAX_TOTAL_FILES} files.
                </p>

                <Input
                  id="villa-bulk-id-files"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="sr-only"
                  data-test={'villa-add-id-file'}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>

              {/* Attached files preview grid */}
              {files.length > 0 ? (
                <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {files.map((fe, fi) => (
                    <div
                      key={fi}
                      className="bg-muted/50 relative flex items-center gap-2 rounded-lg border p-2"
                    >
                      <div className="bg-muted relative h-12 w-12 shrink-0 overflow-hidden rounded-md border">
                        {fe.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={fe.previewUrl}
                            alt={fe.file.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <FileText className="text-muted-foreground h-5 w-5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {fe.file.name}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          {formatBytes(fe.file.size)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFile(fi)}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive absolute top-1 right-1 rounded-full p-1 transition-colors"
                        title="Remove file"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer - Fixed Solid Opaque Background */}
        <div className="bg-card flex flex-col-reverse justify-between gap-3 border-t px-6 py-3.5 sm:flex-row sm:items-center">
          <div className="text-muted-foreground text-xs">
            {uploading && uploadingMessage ? (
              <span className="text-primary flex items-center gap-1.5 font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {uploadingMessage}
              </span>
            ) : (
              <span>
                {guestItems.length}{' '}
                {guestItems.length === 1 ? 'guest' : 'guests'} • {files.length}{' '}
                {files.length === 1 ? 'file' : 'files'} attached
              </span>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={props.onClose}
              data-test={'villa-add-id-cancel'}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={uploading}
              onClick={handleSaveAll}
              data-test={'villa-add-id-submit'}
            >
              {uploading
                ? 'Saving…'
                : guestItems.length > 1
                  ? `Save all (${guestItems.length} guests)`
                  : 'Save ID'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
