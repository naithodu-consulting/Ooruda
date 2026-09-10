'use client';

import { useState } from 'react';

import Link from 'next/link';

import appConfig from '~/config/app.config';

/**
 * 16px is a floor, not a style choice: iOS Safari zooms the viewport on focus
 * for any input below it, which jerks the layout on every tap.
 */
const FIELD_CLASS =
  'rounded-lg border border-[#ddd] bg-[#fafafa] px-4 py-3 text-[16px] text-[#1d1e20] transition outline-none focus:border-[#FCD469] focus:ring-2 focus:ring-[#FCD469]/30';

const LABEL_CLASS = 'text-[12px] font-medium text-[#1d1e20]';

/** Meets 4.5:1 on white; the default red-500 measured 3.81:1. */
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
        This was hardcoded to the production URL, so submitting from localhost
        or a preview deploy bounced the tester onto the live site and made the
        success path impossible to verify anywhere but production.
      */}
      <input type={'hidden'} name={'_next'} value={appConfig.url} />

      {/*
        Honeypot. Captcha stays off so the form keeps its one-step flow, but
        this catches the bulk of automated submissions — the form is public,
        unauthenticated and posts to a third party, so it had no spam
        protection at all before.
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

      {/*
        The form navigates away on submit, so a slow network previously looked
        like a dead button and invited a second click — which creates duplicate
        leads at the form provider.
      */}
      <button
        type={'submit'}
        disabled={submitting}
        aria-busy={submitting}
        className={
          'mx-auto mt-1 block rounded-lg px-10 py-3.5 text-center text-[16px] font-medium text-black transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1e20] disabled:cursor-not-allowed disabled:opacity-60'
        }
        style={{ background: '#FCD469' }}
      >
        {submitting ? 'Sending…' : 'Request Early Access'}
      </button>

      {/*
        Notice at the point of collection: this form posts name, email and a
        free-text message to formsubmit.co, a third-party processor.
      */}
      <p className={'mt-3 text-center text-[12px] text-[#1d1e20]/70'}>
        By submitting, you agree to our{' '}
        <Link
          href={'/privacy-policy'}
          className={
            'rounded underline underline-offset-2 hover:text-[#1d1e20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1e20]'
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
