'use client';

import { useState } from 'react';

import { FileDown, LoaderCircle } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';

/**
 * Downloads this booking's guest registration card, prefilled, to print and
 * hand over at check-in.
 *
 * Fetched rather than left to a plain `<a download>`: the card depends on the
 * booking site being reachable, and a browser saves whatever a failed request
 * returns - staff at the gate would get a file containing an error message
 * and no error anywhere on screen. This way a failure is a toast and nothing
 * lands in the downloads folder.
 *
 * Rendered only when the villa actually has a card template (see the booking
 * page) - there is no generic form to fall back to.
 */
export function RegistrationCardButton(props: {
  accountId: string;
  propertyId: string;
  bookingId: string;
}) {
  const [pending, setPending] = useState(false);

  async function download() {
    if (pending) return;

    setPending(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(
        `/api/villa/bookings/${props.bookingId}/registration-card/pdf` +
          `?account=${props.accountId}&property=${props.propertyId}`,
        { signal: controller.signal },
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        toast.error(body?.error ?? 'Could not generate the registration card.');
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/pdf')) {
        toast.error('Could not generate the registration card.');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = filenameFrom(response) ?? 'registration-card.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Revoked on the next tick: Safari cancels the save if the URL dies
      // while the click is still being handled.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Registration card downloaded');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error(
          'Registration card generation timed out. Please try again.',
        );
      } else {
        toast.error('Could not generate the registration card.');
      }
    } finally {
      clearTimeout(timeout);
      setPending(false);
    }
  }

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => void download()}
      data-test={'villa-registration-card-download'}
    >
      {pending ? (
        <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="mr-1.5 h-4 w-4" />
      )}
      Registration card
    </Button>
  );
}

/** The server names the file after the booking code; keep that name. */
function filenameFrom(response: Response): string | null {
  const match = /filename="([^"]+)"/.exec(
    response.headers.get('content-disposition') ?? '',
  );

  return match?.[1] ?? null;
}
