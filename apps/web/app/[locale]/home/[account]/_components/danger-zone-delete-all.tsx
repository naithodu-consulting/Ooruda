'use client';

import { useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Trash2 } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';

import { TypeToConfirmDialog } from './type-to-confirm-dialog';

interface DeleteResult {
  success: boolean;
  error?: string;
}

/**
 * Super-admin-only bulk-delete button. Only ever rendered when the caller
 * has already confirmed the current viewer is a super admin - this
 * component itself does no authorization, it's purely the confirm-and-call
 * UI, mirroring the units-table delete flow's TypeToConfirmDialog usage.
 */
export function DangerZoneDeleteAll<T extends DeleteResult>({
  confirmValue,
  buttonLabel,
  dialogTitle,
  description,
  disabled,
  onDelete,
  formatSuccessMessage,
}: {
  /** The exact string (association slug) the admin must type to unlock deletion. */
  confirmValue: string;
  buttonLabel: string;
  dialogTitle: string;
  description: string;
  disabled: boolean;
  onDelete: () => Promise<T>;
  formatSuccessMessage: (result: T) => string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await onDelete();
      if (result.success) {
        toast.success(formatSuccessMessage(result));
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to delete.');
      }
    });
  };

  return (
    <TypeToConfirmDialog
      trigger={
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={disabled}
          className="gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {buttonLabel}
        </Button>
      }
      title={dialogTitle}
      description={description}
      confirmValue={confirmValue}
      isPending={isPending}
      onConfirm={handleConfirm}
    />
  );
}
