'use client';

import { useState } from 'react';

import Link from 'next/link';

import appConfig from '~/config/app.config';

/**
 * 16px font-size floor on mobile prevents iOS Safari from zooming the viewport on focus.
 */
const FIELD_CLASS =
  'w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-[16px] text-neutral-900 placeholder:text-neutral-400 transition outline-none focus:border-neutral-400 focus:ring-2 focus:ring-[#FCD469]/50 sm:text-sm';

const LABEL_CLASS = 'text-xs font-medium text-neutral-700';

const REQUIRED_MARK_CLASS = 'text-red-600';

export function EarlyAccessForm() {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action={'https://formsubmit.co/hello@ooruda.com'}
      method={'POST'}
      onSubmit={() => setSubmitting(true)}
      className={'flex flex-col gap-4'}
    >
      <input
        type={'hidden'}
        name={'_subject'}
        value={'Ooruda Early Access Request'}
      />

      {/*
        Redirect back to whichever environment the visitor is actually on.
      */}
      <input type={'hidden'} name={'_next'} value={appConfig.url} />

      {/*
        Honeypot spam protection.
      */}
      <input
        type={'text'}
        name={'_honey'}
        tabIndex={-1}
        autoComplete={'off'}
        aria-hidden={'true'}
        className={'hidden'}
      />
      <input type={'hidden'} name={'_captcha'} value={'false'} />

      <div className={'flex flex-col gap-1.5'}>
        <label htmlFor={'early-access-name'} className={LABEL_CLASS}>
          Your Name <span className={REQUIRED_MARK_CLASS}>*</span>
        </label>
        <input
          id={'early-access-name'}
          name={'name'}
          type={'text'}
          required
          autoComplete={'name'}
          placeholder={'Your Full Name'}
          className={FIELD_CLASS}
        />
      </div>

      <div className={'flex flex-col gap-1.5'}>
        <label htmlFor={'early-access-email'} className={LABEL_CLASS}>
          Email Address <span className={REQUIRED_MARK_CLASS}>*</span>
        </label>
        <input
          id={'early-access-email'}
          name={'email'}
          type={'email'}
          required
          autoComplete={'email'}
          placeholder={'Your Email Address'}
          className={FIELD_CLASS}
        />
      </div>

      <div className={'flex flex-col gap-1.5'}>
        <label htmlFor={'early-access-message'} className={LABEL_CLASS}>
          Message
        </label>
        <textarea
          id={'early-access-message'}
          name={'message'}
          rows={4}
          placeholder={'Tell us about your property management needs…'}
          className={FIELD_CLASS}
        />
      </div>

      <button
        type={'submit'}
        disabled={submitting}
        aria-busy={submitting}
        className={
          'mt-2 w-full rounded-lg bg-[#FCD469] px-6 py-3 text-center text-sm font-semibold text-neutral-950 shadow-sm transition hover:bg-[#f5cf5e] hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:opacity-60'
        }
      >
        {submitting ? 'Sending…' : 'Request Early Access'}
      </button>

      <p className={'mt-2 text-center text-xs leading-normal text-neutral-500'}>
        By submitting, you agree to our{' '}
        <Link
          href={'/privacy-policy'}
          className={
            'underline underline-offset-2 hover:text-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950'
          }
        >
          Privacy Policy
        </Link>
        . Your details are processed by our form provider and used only to
        contact you about early access.
      </p>
    </form>
  );
}
