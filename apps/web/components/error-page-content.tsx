'use client';

import Link from 'next/link';

import { ArrowLeft, MessageCircleQuestion } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Trans } from '@kit/ui/trans';

export function ErrorPageContent({
  statusCode,
  heading,
  subtitle,
  reset,
  backLink = '/',
  backLabel = 'common.backToHomePage',
  contactLabel = 'common.contactUs',
}: {
  statusCode: string;
  heading: string;
  subtitle: string;
  reset?: () => void;
  backLink?: string;
  backLabel?: string;
  contactLabel?: string;
}) {
  return (
    <div
      className={
        'relative flex w-full flex-1 flex-col items-center justify-center overflow-hidden px-4'
      }
    >
      <span
        aria-hidden="true"
        className={
          'font-heading pointer-events-none absolute top-1/2 left-1/2 z-0 -translate-x-1/2 -translate-y-1/2 text-[16rem] leading-none font-extrabold tracking-tighter opacity-[0.02] select-none sm:text-[22rem] lg:text-[28rem]'
        }
      >
        <Trans i18nKey={statusCode} />
      </span>

      <div
        className={
          'relative z-10 flex max-w-md flex-col items-center text-center'
        }
      >
        <h1
          className={
            'font-heading text-2xl font-semibold tracking-tight sm:text-3xl'
          }
        >
          <Trans i18nKey={heading} />
        </h1>

        <p
          className={
            'text-muted-foreground mt-3 max-w-sm text-sm leading-relaxed'
          }
        >
          <Trans i18nKey={subtitle} />
        </p>

        <div className={'mt-8 flex items-center gap-3'}>
          {reset ? (
            <Button onClick={reset}>
              <ArrowLeft className={'h-4 w-4'} />
              <Trans i18nKey={backLabel} />
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={
                <Link href={backLink}>
                  <ArrowLeft className={'mr-1 h-4 w-4'} />
                  <Trans i18nKey={backLabel} />
                </Link>
              }
            />
          )}

          {/*
            Mails support directly: there is no /contact page. Ooruda has no
            public marketing site, and the contact address is published on the
            legal pages.
          */}
          <Button
            nativeButton={false}
            render={
              <a href={'mailto:hello@ooruda.com'}>
                <MessageCircleQuestion className={'mr-1 h-4 w-4'} />
                <Trans i18nKey={contactLabel} />
              </a>
            }
            variant={'ghost'}
          />
        </div>
      </div>
    </div>
  );
}
