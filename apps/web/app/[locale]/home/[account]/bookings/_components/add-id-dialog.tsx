'use client';

import { useEffect, useRef, useState } from 'react';

import { FileText, IdCard, Loader2, Plus, Trash2, X } from 'lucide-react';

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
  docType: IdDocType;
  idNumber: string;
  files: FileEntry[];
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
          // Refreshes the panel behind the dialog without closing it: a
          // partial save has to show what is already recorded while the
          // guests that failed stay on screen to be retried.
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
    guestId: hasExistingGuests ? '' : '',
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
    docType: 'aadhaar',
    idNumber: '',
    files: [],
    error: null,
  };

  const [guestItems, setGuestItems] = useState<GuestItem[]>([initialLeadGuest]);
  const [uploading, setUploading] = useState(false);
  const [uploadingMessage, setUploadingMessage] = useState<string | null>(null);

  // Clean up object URLs on unmount
  const itemsRef = useRef(guestItems);
  itemsRef.current = guestItems;
  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => {
        item.files.forEach((f) => {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        });
      });
    },
    [],
  );

  const totalFiles = guestItems.reduce(
    (sum, item) => sum + item.files.length,
    0,
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
        docType: 'aadhaar',
        idNumber: '',
        files: [],
        error: null,
      },
    ]);
  }

  function removeGuestItem(index: number) {
    setGuestItems((prev) => {
      const removed = prev[index];
      if (removed) {
        removed.files.forEach((f) => {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        });
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function updateGuestItem(index: number, updates: Partial<GuestItem>) {
    setGuestItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    );
  }

  function addFileToGuest(index: number, raw: File | null) {
    if (!raw) return;

    if (totalFiles >= MAX_TOTAL_FILES) {
      toast.error(
        `You can attach up to ${MAX_TOTAL_FILES} photos in total across guests.`,
      );
      return;
    }

    if (raw.size > ID_FILE_MAX_BYTES) {
      toast.error('That file is larger than 10 MB.');
      return;
    }

    const isPdf = raw.type === 'application/pdf';
    const previewUrl = isPdf ? null : URL.createObjectURL(raw);

    setGuestItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              files: [...item.files, { file: raw, previewUrl }],
              error: null,
            }
          : item,
      ),
    );
  }

  function removeFileFromGuest(guestIndex: number, fileIndex: number) {
    setGuestItems((prev) =>
      prev.map((item, i) => {
        if (i !== guestIndex) return item;
        const entry = item.files[fileIndex];
        if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        return {
          ...item,
          files: item.files.filter((_, fi) => fi !== fileIndex),
        };
      }),
    );
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

      if (!err && item.files.length === 0) {
        err = 'Attach at least one ID photo.';
      }

      if (err) hasError = true;
      return { ...item, error: err };
    });

    setGuestItems(validated);

    if (hasError) {
      toast.error('Please complete the highlighted details for each guest.');
      return;
    }

    setUploading(true);

    // Each guest is its own request, so a failure halfway through leaves the
    // earlier ones already saved. Their keys are dropped from the dialog
    // before the error is shown: retrying must not post them a second time
    // and create a duplicate guest and a duplicate ID for the same person.
    const savedKeys = new Set<string>();
    const totalToSave = guestItems.length;

    try {
      for (let i = 0; i < guestItems.length; i++) {
        const item = guestItems[i]!;
        setUploadingMessage(`Saving guest ${i + 1} of ${guestItems.length}…`);

        // Fast client-side image optimization
        const compressedFiles: File[] = [];
        for (const fe of item.files) {
          const comp = await compressImageIfNeeded(fe.file);
          compressedFiles.push(comp);
        }

        const fullName = [item.firstName.trim(), item.lastName.trim()]
          .filter(Boolean)
          .join(' ');

        const recordInput: RecordIdInput = {
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
          docType: item.docType,
          idNumber: item.idNumber.trim(),
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
              `Failed to save guest ${i + 1} (${fullName || 'guest'}).`,
          );
        }

        savedKeys.add(item.key);
      }

      toast.success(
        totalToSave === 1
          ? 'Guest ID saved successfully'
          : `All ${totalToSave} guests & IDs saved successfully`,
      );
      props.onSaved();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not save the ID.';

      if (savedKeys.size > 0) {
        setGuestItems((prev) =>
          prev.filter((item) => {
            if (!savedKeys.has(item.key)) return true;

            item.files.forEach((f) => {
              if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
            });

            return false;
          }),
        );

        // The saved ones are already on the booking, so the panel behind the
        // dialog is out of date either way. Refresh it, but keep the dialog
        // open on the guests that still need saving.
        props.onRefresh();

        toast.error(
          `${savedKeys.size} of ${totalToSave} guests saved. ${message} The remaining guests are still listed - fix and save again.`,
        );
      } else {
        toast.error(message);
      }
    } finally {
      setUploading(false);
      setUploadingMessage(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? props.onClose() : undefined)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto p-6 sm:max-w-2xl"
        data-test={'villa-add-id-dialog'}
      >
        <DialogHeader className="pr-6 pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle>Add Guest IDs</DialogTitle>
            <span className="text-muted-foreground text-xs">
              {totalFiles} / {MAX_TOTAL_FILES} photos attached
            </span>
          </div>
          <DialogDescription>
            Record government photo IDs for guests staying at the villa. You can
            add multiple guests in this popup.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {guestItems.map((item, index) => {
            const isLead = !hasExistingGuests && index === 0;

            return (
              <div
                key={item.key}
                className="bg-card flex flex-col gap-4 rounded-xl border p-4 shadow-xs"
              >
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-semibold">
                      {isLead ? 'Guest 1 (Lead)' : `Guest ${index + 1}`}
                    </Badge>
                    {item.error ? (
                      <span className="text-destructive text-xs font-medium">
                        {item.error}
                      </span>
                    ) : null}
                  </div>
                  {guestItems.length > 1 ? (
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

                {/* Existing guest selector if guests exist */}
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
                              : (props.guests.find((g) => g.id === v)?.name ??
                                'Select a guest')
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
                      <label className="text-xs font-medium">Salutation</label>
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
                        First Name <span className="text-destructive">*</span>
                      </label>
                      <Input
                        value={item.firstName}
                        onChange={(e) =>
                          updateGuestItem(index, { firstName: e.target.value })
                        }
                        placeholder="First Name"
                        autoComplete="off"
                        data-test={`villa-add-id-first-name-${index}`}
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="text-xs font-medium">Last Name </label>
                      <Input
                        value={item.lastName}
                        onChange={(e) =>
                          updateGuestItem(index, { lastName: e.target.value })
                        }
                        placeholder="Surname"
                        autoComplete="off"
                        data-test={`villa-add-id-last-name-${index}`}
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
                        data-test={`villa-add-id-phone-${index}`}
                      />
                    </div>
                  </div>
                ) : null}

                {/* ID Type & Number */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium">ID type</label>
                    <Select
                      value={item.docType}
                      onValueChange={(v) =>
                        updateGuestItem(index, { docType: v as IdDocType })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {idDocTypeLabel(item.docType)}
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
                      value={item.idNumber}
                      onChange={(e) =>
                        updateGuestItem(index, { idNumber: e.target.value })
                      }
                      placeholder="Last 4 digits"
                      autoComplete="off"
                    />
                  </div>
                </div>

                {/* Photo attachments for this guest */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      ID Photos <span className="text-destructive">*</span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Front &amp; back of ID (JPEG, PNG, WebP, PDF)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.files.map((fe, fi) => (
                      <div
                        key={fi}
                        className="bg-muted relative h-18 w-18 overflow-hidden rounded-lg border"
                      >
                        {fe.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={fe.previewUrl}
                            alt={fe.file.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center p-1">
                            <FileText className="text-muted-foreground h-6 w-6" />
                            <span className="text-muted-foreground w-full truncate text-center text-[10px]">
                              {fe.file.name}
                            </span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFileFromGuest(index, fi)}
                          className="bg-background/80 hover:bg-background absolute top-1 right-1 rounded-full p-0.5 shadow-sm transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    {totalFiles < MAX_TOTAL_FILES ? (
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          nativeButton={false}
                          render={
                            <label
                              htmlFor={`villa-id-file-add-${index}`}
                              className="cursor-pointer text-xs"
                            />
                          }
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          {item.files.length === 0
                            ? 'Attach photo'
                            : 'Add photo'}
                        </Button>
                        <Input
                          id={`villa-id-file-add-${index}`}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          capture="environment"
                          className="sr-only"
                          onChange={(e) => {
                            addFileToGuest(index, e.target.files?.[0] ?? null);
                            e.target.value = '';
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            onClick={addGuestItem}
            className="w-full border-dashed py-5 text-sm font-medium"
            data-test={'villa-add-another-guest-btn'}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add another guest in this booking
          </Button>
        </div>

        {/* Footer */}
        <div className="bg-popover/95 sticky bottom-0 -mx-6 -mb-6 flex flex-col-reverse justify-between gap-3 border-t px-6 py-3.5 backdrop-blur-xs sm:flex-row sm:items-center">
          <div className="text-muted-foreground text-xs">
            {uploading && uploadingMessage ? (
              <span className="text-primary flex items-center gap-1.5 font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {uploadingMessage}
              </span>
            ) : (
              <span>
                {guestItems.length}{' '}
                {guestItems.length === 1 ? 'guest' : 'guests'} to record
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
