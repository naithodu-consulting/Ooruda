'use client';

/**
 * Makerkit override for @kit/ui/alert-dialog.
 *
 * The upstream shadcn AlertDialogFooter applies `bg-muted border-t` which
 * creates a grey separated footer band. This wrapper strips that background
 * so dialogs render with a clean, borderless footer consistent with the
 * rest of the app's modal style.
 */

import * as React from 'react';

import { cn } from '#lib/utils';

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../shadcn/alert-dialog';

export function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 pt-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}
