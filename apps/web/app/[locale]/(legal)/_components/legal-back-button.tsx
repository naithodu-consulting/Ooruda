'use client';

import { useRouter } from 'next/navigation';

import { ArrowLeft } from 'lucide-react';

/**
 * Returns the reader to wherever they came from - usually the sign-in screen,
 * which is the main route into these documents.
 *
 * `router.back()` alone is unsafe here: these URLs are opened directly by
 * payment-gateway reviewers, from search results, and in fresh tabs, where
 * there is no in-app history and the button would silently do nothing (or
 * eject the reader off the site). So we only go back when the referrer is
 * ours, and fall back to the site root otherwise.
 */
export function LegalBackButton() {
  const router = useRouter();

  function handleBack() {
    let cameFromThisSite = false;

    try {
      cameFromThisSite =
        !!document.referrer &&
        new URL(document.referrer).origin === window.location.origin;
    } catch {
      cameFromThisSite = false;
    }

    if (cameFromThisSite) {
      router.back();
    } else {
      router.push('/');
    }
  }

  return (
    <button
      type={'button'}
      onClick={handleBack}
      data-test={'legal-back-button'}
      aria-label={'Go back'}
      className={
        'text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
      }
    >
      <ArrowLeft className={'h-4 w-4'} aria-hidden />
      <span className={'hidden sm:inline'}>Back</span>
    </button>
  );
}
