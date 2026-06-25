'use client';

import { useEffect, useRef, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { AuthErrorAlert } from '@kit/auth/sign-in';
import { useSupabase } from '@kit/supabase/hooks/use-supabase';
import { Button } from '@kit/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@kit/ui/input-otp';
import { Spinner } from '@kit/ui/spinner';
import { Trans } from '@kit/ui/trans';

// Email channel limits (mirrors the secondary login channel).
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_VERIFY_ATTEMPTS = 3;

const slotClass =
  'h-13 w-11 rounded-md border-[#2E3F50] bg-[#1B293A] text-center text-[22px] font-black text-[#F59E0B] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] focus:outline-none md:h-14 md:w-12';

const EmailSchema = z.object({
  email: z.string().email({ message: 'auth.emailInvalidFormat' }),
});

const OtpSchema = z.object({
  token: z.string().min(6).max(6),
});

/**
 * Collects and verifies a mandatory email for an already-logged-in user who has
 * none (legacy phone-only accounts). Uses updateUser({ email }) to attach the
 * email and an email_change OTP to confirm it, then continues into the app.
 */
export function CompleteProfileForm(props: { redirectPath: string }) {
  const client = useSupabase();
  const t = useTranslations('auth');

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [verifyAttempts, setVerifyAttempts] = useState(0);
  const [error, setError] = useState<string | Error | null>(null);
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (resendSeconds <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(
      () => setResendSeconds((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resendSeconds]);

  const emailForm = useForm({
    resolver: zodResolver(EmailSchema),
    defaultValues: { email: '' },
  });

  const otpForm = useForm({
    resolver: zodResolver(OtpSchema),
    defaultValues: { token: '' },
  });

  const sendCode = async (target: string) => {
    setError(null);
    setPending(true);

    try {
      const { error: updateError } = await client.auth.updateUser({
        email: target,
      });

      if (updateError) {
        setError(updateError);
        return false;
      }

      return true;
    } finally {
      setPending(false);
    }
  };

  const handleSendEmail = async ({
    email: raw,
  }: z.output<typeof EmailSchema>) => {
    const normalized = raw.trim().toLowerCase();
    const ok = await sendCode(normalized);
    if (!ok) return;

    setEmail(normalized);
    setResendSeconds(RESEND_COOLDOWN_SECONDS);
    setVerifyAttempts(0);
    otpForm.reset();
    setStep('otp');
  };

  const handleResend = async () => {
    if (resendSeconds > 0) return;
    const ok = await sendCode(email);
    if (!ok) return;
    setResendSeconds(RESEND_COOLDOWN_SECONDS);
    setVerifyAttempts(0);
    otpForm.reset();
  };

  const handleVerify = async ({ token }: z.output<typeof OtpSchema>) => {
    if (verifyAttempts >= MAX_VERIFY_ATTEMPTS) return;
    setVerifyAttempts((n) => n + 1);
    setError(null);
    setPending(true);

    try {
      const { error: verifyError } = await client.auth.verifyOtp({
        email,
        token,
        type: 'email_change',
      });

      if (verifyError) {
        setError(verifyError);
        return;
      }

      // Force a fresh access token so the JWT carries the new email claim before
      // the middleware re-evaluates the mandatory-email gate. Without this the
      // cookie can still hold the pre-change (email-less) JWT and bounce the
      // user straight back here — an infinite redirect loop.
      await client.auth.refreshSession();

      // Hard navigation so the refreshed session cookie is written before the
      // middleware reads it on the next request.
      window.location.assign(props.redirectPath);
    } finally {
      setPending(false);
    }
  };

  if (step === 'email') {
    return (
      <div className="flex flex-col gap-y-6">
        <div className="flex flex-col gap-y-1.5">
          <h2 className="text-[15px] font-bold text-white">
            <Trans i18nKey="auth.completeProfileHeading" />
          </h2>
          <p className="text-sm text-[#6B88A4]">
            <Trans i18nKey="auth.completeProfileSubheading" />
          </p>
        </div>

        <Form {...emailForm}>
          <form
            className="flex flex-col gap-y-4"
            onSubmit={emailForm.handleSubmit(handleSendEmail)}
          >
            <AuthErrorAlert error={error} />

            <FormField
              name="email"
              control={emailForm.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <Trans i18nKey="auth.emailInputLabel" />
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder={t('emailInputPlaceholder')}
                      autoFocus
                      data-test="complete-profile-email-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={pending}
              data-test="complete-profile-send-button"
            >
              {pending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  <Trans i18nKey="auth.phoneSendingOtp" />
                </>
              ) : (
                <Trans i18nKey="auth.completeProfileSendCode" />
              )}
            </Button>
          </form>
        </Form>
      </div>
    );
  }

  const tooManyAttempts = verifyAttempts >= MAX_VERIFY_ATTEMPTS;

  return (
    <Form {...otpForm}>
      <div className="flex w-full flex-col items-center gap-y-6">
        <p className="text-center text-sm font-medium text-[#6B88A4]">
          <Trans i18nKey="auth.completeProfileOtpSentTo" values={{ email }} />
        </p>

        <form
          className="flex w-full flex-col gap-y-5"
          onSubmit={otpForm.handleSubmit(handleVerify)}
        >
          <AuthErrorAlert error={error} />

          {tooManyAttempts && (
            <p className="text-destructive text-center text-sm font-semibold">
              <Trans i18nKey="auth.phoneTooManyAttempts" />
            </p>
          )}

          <FormField
            name="token"
            control={otpForm.control}
            render={({ field }) => (
              <FormItem className="flex flex-col items-center gap-y-2">
                <FormControl>
                  <InputOTP
                    maxLength={6}
                    {...field}
                    disabled={pending || tooManyAttempts}
                    autoFocus
                    data-test="complete-profile-otp-input"
                  >
                    <InputOTPGroup className="gap-1.5 md:gap-2">
                      <InputOTPSlot index={0} className={slotClass} />
                      <InputOTPSlot index={1} className={slotClass} />
                      <InputOTPSlot index={2} className={slotClass} />
                    </InputOTPGroup>
                    <InputOTPSeparator className="mx-1 font-bold text-[#2E3F50]" />
                    <InputOTPGroup className="gap-1.5 md:gap-2">
                      <InputOTPSlot index={3} className={slotClass} />
                      <InputOTPSlot index={4} className={slotClass} />
                      <InputOTPSlot index={5} className={slotClass} />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 border-0 bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-[13px] font-extrabold text-[#0F172A] shadow-[0_4px_16px_rgba(245,158,11,0.22)] transition-all hover:brightness-[1.03] active:scale-[0.98]"
            disabled={pending || tooManyAttempts}
            data-test="complete-profile-verify-button"
          >
            {pending ? (
              <>
                <Spinner className="mr-2 h-4 w-4 text-current" />
                <Trans i18nKey="auth.phoneVerifyingOtp" />
              </>
            ) : (
              <>
                <Lock className="h-[14px] w-[14px]" strokeWidth={2.5} />
                <Trans i18nKey="auth.completeProfileVerify" />
              </>
            )}
          </Button>

          <div className="mt-3 flex w-full justify-between px-1 text-sm">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex h-9 items-center gap-1.5 text-[#6B88A4] transition-all hover:bg-[#1B293A]/50 hover:text-white"
              onClick={() => {
                setStep('email');
                setError(null);
                emailForm.reset();
              }}
            >
              <ArrowLeft className="h-[14px] w-[14px]" strokeWidth={2.5} />
              <Trans i18nKey="auth.completeProfileChangeEmail" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={resendSeconds > 0 || pending}
              onClick={handleResend}
              className="h-9 text-[#6B88A4] transition-all hover:bg-[#1B293A]/50 hover:text-white disabled:text-[#6B88A4]/40 disabled:hover:bg-transparent"
            >
              {resendSeconds > 0 ? (
                <Trans
                  i18nKey="auth.phoneResendCountdown"
                  values={{ seconds: resendSeconds }}
                />
              ) : (
                <Trans i18nKey="auth.phoneResendOtp" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </Form>
  );
}
