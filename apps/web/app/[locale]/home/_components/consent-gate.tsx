'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Lock } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';

import { Button } from '@kit/ui/button';

import { AppLogo } from '~/components/app-logo';

import { acceptConsentAction } from '../_lib/server/accept-consent.action';

export function ConsentGate({ consentRequired }: { consentRequired: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  const { execute, isPending } = useAction(acceptConsentAction);

  /**
   * Unlocks the accept button once the reader reaches the end.
   *
   * Critically, content that is *not* scrollable counts as already read. This
   * gate is a full-screen overlay with no escape, so a document short enough to
   * fit — at browser zoom-out, on a tall viewport, or if this text is ever
   * shortened — would otherwise fire no scroll event, leave the button disabled
   * forever, and lock the user out of the app entirely.
   */
  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const scrollable = el.scrollHeight - el.clientHeight;

    if (scrollable <= 0) {
      setScrollProgress(100);
      setScrolledToBottom(true);
      return;
    }

    const pct = Math.min(100, Math.round((el.scrollTop / scrollable) * 100));
    setScrollProgress(pct);
    if (pct >= 98) setScrolledToBottom(true);
  }, []);

  // Re-measure on mount and whenever the box or its content resizes, so zoom
  // changes and font-size changes cannot strand the reader behind a locked
  // button.
  useEffect(() => {
    if (!consentRequired) return;

    const el = scrollRef.current;
    if (!el) return;

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => observer.disconnect();
  }, [consentRequired, measure]);

  if (!consentRequired) return null;

  return (
    <div
      className="bg-background/95 fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-sm sm:p-6"
      data-test="consent-gate-overlay"
    >
      <div
        className="bg-card flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-2xl"
        style={{ maxHeight: 'min(92vh, 720px)' }}
      >
        {/* ── Header ────────────────────────────────────── */}
        <div className="flex shrink-0 flex-col items-center gap-2 border-b px-6 py-4 sm:px-8 sm:py-5">
          <AppLogo />
          <h1 className="text-foreground text-xl font-semibold sm:text-2xl">
            User Consent
          </h1>
          <p className="text-muted-foreground text-sm">
            Please read carefully and accept before continuing
          </p>
        </div>

        {/* ── Scrollable body ────────────────────────────── */}
        {/*
          tabIndex makes the region focusable so it can be scrolled with the
          keyboard. Without it a keyboard-only or screen-reader user cannot
          reach the end of the text, cannot unlock the accept button, and is
          locked out of the application with no way forward.
        */}
        <div
          ref={scrollRef}
          onScroll={measure}
          tabIndex={0}
          role="region"
          aria-label="User Consent document"
          className="focus-visible:ring-ring flex-1 overflow-y-auto scroll-smooth px-6 py-5 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset sm:px-8"
        >
          <div className="space-y-5 text-sm leading-relaxed">
            {/* Meta line */}
            <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              <span>
                <span className="text-foreground font-medium">Product:</span>{' '}
                Ooruda
              </span>
              <span className="text-border">·</span>
              <span>
                <span className="text-foreground font-medium">
                  Owned and Operated by:
                </span>{' '}
                Habbaa Solutions Private Limited
              </span>
            </div>

            {/* Intro */}
            <p className="text-foreground/80">
              By registering for, accessing, or using Ooruda, I confirm that I
              have read, understood, and agree to this User Consent, the{' '}
              <a
                href="/terms-of-service"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                Ooruda Terms of Service
              </a>
              , and the{' '}
              <a
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                Ooruda Privacy Policy
              </a>
              , and the{' '}
              <a
                href="/refund-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                Ooruda Refund &amp; Cancellation Policy
              </a>
              .
            </p>

            <Section title="1. Consent">
              I voluntarily consent to Ooruda collecting, using, storing,
              processing, sharing, transferring, and otherwise handling my
              personal information and other information provided by me or
              generated through my use of Ooruda for the purpose of providing,
              operating, maintaining, securing, improving, administering, and
              developing Ooruda and its related services, and for complying with
              applicable legal and regulatory requirements.
            </Section>

            <Section title="2. Information Covered">
              This consent applies to information that I provide directly,
              authorise Ooruda to collect, or that is generated through my use
              of Ooruda, including personal, contact, property, tenancy,
              transactional, communication, technical, and usage information,
              together with any other information reasonably required to provide
              Ooruda&apos;s services.
            </Section>

            <Section title="3. Communications">
              I consent to receiving communications from Ooruda through email,
              SMS, telephone, WhatsApp, or other appropriate electronic
              communication channels for account administration, security,
              service delivery, customer support, legal compliance, and, where
              permitted by law, product updates and promotional communications.
            </Section>

            <Section title="4. Payments">
              Where payment-related services are available through Ooruda, I
              authorise Ooruda to facilitate payments through authorised
              third-party payment service providers. I acknowledge that Ooruda
              is not a payment processor or banking institution and does not
              intentionally collect or store my complete payment card details,
              banking credentials, UPI PINs, passwords, or other sensitive
              payment authentication information, except where required by
              applicable law.
            </Section>

            <Section title="5. Disclosure and Security">
              I understand that Ooruda may share my information with authorised
              users, property owners, associations, property managers, service
              providers, payment partners, affiliates, professional advisers,
              and government or regulatory authorities where reasonably
              necessary to provide services, fulfil legal obligations, or
              protect legitimate interests.
              <br />
              <br />
              Ooruda implements reasonable administrative, technical, and
              organisational safeguards to protect my information. However, no
              method of electronic storage or transmission is completely secure,
              and absolute security cannot be guaranteed.
            </Section>

            <Section title="6. My Rights">
              Subject to applicable law, I may request access to or correction
              of my personal information, withdraw consent where legally
              permissible, or exercise other applicable privacy rights by
              contacting{' '}
              <a
                href="mailto:hello@ooruda.com"
                className="text-primary underline underline-offset-2"
              >
                hello@ooruda.com
              </a>
              . Withdrawal of consent may affect my ability to access or use
              certain Ooruda services.
            </Section>

            <Section title="7. Electronic Consent">
              I agree that selecting an acceptance checkbox, clicking an
              &lsquo;Accept&rsquo; button, registering for an account, signing
              in, or continuing to use Ooruda constitutes my valid electronic
              consent and electronic signature.
            </Section>

            <Section title="8. Governing Law">
              This User Consent shall be governed by the laws of India. Any
              dispute arising out of or relating to this User Consent shall be
              subject to the exclusive jurisdiction of the competent courts at
              Mangalore, Karnataka.
            </Section>

            {/* Declaration */}
            <div className="border-border bg-card rounded-lg border px-5 py-4">
              <p className="text-foreground font-semibold">Declaration</p>
              <p className="text-foreground/80 mt-1 text-sm">I confirm that:</p>
              <ul className="text-foreground/80 mt-2 list-disc space-y-1 pl-5 text-sm">
                <li>I have read and understood this User Consent.</li>
                <li>
                  I voluntarily provide my consent for the processing of my
                  information as described above.
                </li>
                <li>
                  I agree to be bound by the Ooruda Terms of Service, Privacy
                  Policy, and Refund &amp; Cancellation Policy.
                </li>
              </ul>
              <p className="text-muted-foreground mt-3 text-xs">
                For any questions regarding this User Consent or privacy
                matters, please contact{' '}
                <a
                  href="mailto:hello@ooruda.com"
                  className="text-primary underline underline-offset-2"
                >
                  hello@ooruda.com
                </a>
                .
              </p>
            </div>

            {/* In-content scroll nudge */}
            {!scrolledToBottom && (
              <p className="text-muted-foreground flex items-center justify-center gap-2 pb-2 text-center text-xs select-none">
                <span className="animate-bounce">↓</span>
                Scroll to the end to continue
                <span className="animate-bounce">↓</span>
              </p>
            )}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────── */}
        <div className="shrink-0 border-t">
          {/* Progress bar */}
          <div className="bg-muted h-1 w-full">
            <div
              className="bg-primary h-1 transition-all duration-200 ease-out"
              style={{ width: `${scrollProgress}%` }}
            />
          </div>

          <div className="flex flex-col items-center gap-3 px-6 py-5 sm:px-8">
            {scrolledToBottom ? (
              <>
                <p className="text-muted-foreground max-w-md text-center text-xs">
                  By clicking &ldquo;I Agree&rdquo;, you confirm you have read
                  and understood this consent and agree to be bound by its
                  terms.
                </p>
                <Button
                  data-test="consent-agree-button"
                  size="lg"
                  className="w-full sm:w-72"
                  disabled={isPending}
                  onClick={() => execute({})}
                >
                  {isPending ? 'Saving…' : 'I Agree'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  Read to the end to unlock the consent button
                </p>
                <Button
                  data-test="consent-agree-button"
                  size="lg"
                  className="w-full cursor-not-allowed opacity-50 sm:w-72"
                  disabled
                  tabIndex={-1}
                >
                  I Agree
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-foreground font-semibold">{title}</p>
      <p className="text-foreground/80 mt-1">{children}</p>
    </div>
  );
}
