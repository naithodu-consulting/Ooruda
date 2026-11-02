'use client';

import { useState } from 'react';

import { Plus } from 'lucide-react';

import { Button } from '@kit/ui/button';

import {
  type EnrichableChannelStay,
  EnrichChannelStayDialog,
} from './enrich-channel-stay-dialog';

/**
 * "Add booking details" on an imported channel stay, wherever it is listed.
 *
 * The lists themselves are server components, so the dialog's state lives
 * here rather than in each of them.
 */
export function AddChannelDetailsButton(props: {
  account: string;
  accountId: string;
  propertyId: string;
  stay: EnrichableChannelStay;
  size?: 'sm' | 'default';
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size={props.size ?? 'sm'}
        className={props.className}
        onClick={() => setOpen(true)}
        data-test={'villa-add-channel-details'}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Add booking details
      </Button>

      {open ? (
        <EnrichChannelStayDialog
          account={props.account}
          accountId={props.accountId}
          propertyId={props.propertyId}
          stay={props.stay}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
