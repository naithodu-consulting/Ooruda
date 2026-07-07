'use client';

import { useState } from 'react';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Spinner } from '@kit/ui/spinner';

interface Props {
  trigger: React.ReactElement;
  title: string;
  description: string;
  /** The exact string the user must type to unlock deletion */
  confirmValue: string;
  confirmLabel?: string;
  isPending: boolean;
  onConfirm: () => void;
}

export function TypeToConfirmDialog({
  trigger,
  title,
  description,
  confirmValue,
  confirmLabel,
  isPending,
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setTyped('');
  };

  const canDelete = typed === confirmValue;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />

      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="bg-destructive/10 text-destructive mb-2 flex h-10 w-10 items-center justify-center rounded-full">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-input" className="text-sm">
            {confirmLabel ?? (
              <>
                Type{' '}
                <span className="font-mono font-semibold">{confirmValue}</span>{' '}
                to confirm
              </>
            )}
          </Label>
          <Input
            id="confirm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmValue}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canDelete || isPending}
            onClick={() => {
              if (canDelete) onConfirm();
            }}
          >
            {isPending && <Spinner className="mr-2 h-4 w-4" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
