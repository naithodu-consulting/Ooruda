'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { useSignInWithOtp } from '@kit/supabase/hooks/use-sign-in-with-otp';
import { useVerifyOtp } from '@kit/supabase/hooks/use-verify-otp';
import { getSafeRedirectPath } from '@kit/shared/utils';
import { Button } from '@kit/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@kit/ui/input-otp';
import { Input } from '@kit/ui/input';
import { Spinner } from '@kit/ui/spinner';
import { Trans } from '@kit/ui/trans';

import { AuthErrorAlert } from './auth-error-alert';

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;

// Whether an unknown phone number is allowed to self-register on sign-in.
// PropOps is invite-based, so production should set this to 'false' once the
// invitation-provisioning flow is in place; until then it defaults to allowing
// sign-up so the first association admin can onboard themselves.
const ALLOW_SIGNUP =
  process.env.NEXT_PUBLIC_ALLOW_PHONE_SIGNUP !== 'false';

const PhoneSchema = z.object({
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, { message: 'auth.phoneInvalidFormat' }),
});

const OtpSchema = z.object({
  token: z.string().min(6).max(6),
});

type Step = 'phone' | 'otp';

export function PhoneOtpSignInContainer() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('auth');

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [verifyAttempts, setVerifyAttempts] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const signInMutation = useSignInWithOtp();
  const verifyMutation = useVerifyOtp();

  const isMockMode = process.env.NEXT_PUBLIC_MOCK_OTP === 'true';

  // Countdown timer for resend cooldown
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

  const phoneForm = useForm({
    resolver: zodResolver(PhoneSchema),
    defaultValues: { phone: '' },
  });

  const otpForm = useForm({
    resolver: zodResolver(OtpSchema),
    defaultValues: { token: '' },
  });

  const handleSendOtp = async ({ phone: rawPhone }: z.output<typeof PhoneSchema>) => {
    const e164 = `+91${rawPhone}`;

    await signInMutation.mutateAsync({
      phone: e164,
      options: { shouldCreateUser: ALLOW_SIGNUP },
    });

    setPhone(e164);
    setResendSeconds(RESEND_COOLDOWN_SECONDS);
    setVerifyAttempts(0);
    otpForm.reset();
    setStep('otp');
  };

  const handleResend = async () => {
    if (resendSeconds > 0) return;

    await signInMutation.mutateAsync({
      phone,
      options: { shouldCreateUser: ALLOW_SIGNUP },
    });

    setResendSeconds(RESEND_COOLDOWN_SECONDS);
    setVerifyAttempts(0);
    otpForm.reset();
  };

  const handleVerifyOtp = async ({ token }: z.output<typeof OtpSchema>) => {
    if (verifyAttempts >= MAX_VERIFY_ATTEMPTS) return;

    setVerifyAttempts((n) => n + 1);

    await verifyMutation.mutateAsync({
      type: 'sms',
      phone,
      token,
    });

    const next = getSafeRedirectPath(params.get('next'), '/home');
    router.replace(next);
  };

  if (step === 'phone') {
    return (
      <Form {...phoneForm}>
        <form
          className="flex flex-col gap-y-4"
          onSubmit={phoneForm.handleSubmit(handleSendOtp)}
        >
          <AuthErrorAlert error={signInMutation.error} />

          <FormField
            name="phone"
            control={phoneForm.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans i18nKey="auth.phoneInputLabel" />
                </FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <span className="bg-muted text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm font-medium select-none">
                      +91
                    </span>
                    <Input
                      {...field}
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder={t('phoneInputPlaceholder')}
                      autoFocus
                      data-test="phone-input"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={signInMutation.isPending}
            data-test="phone-send-otp-button"
          >
            {signInMutation.isPending ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                <Trans i18nKey="auth.phoneSendingOtp" />
              </>
            ) : (
              <Trans i18nKey="auth.phoneSendOtp" />
            )}
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            Delivered via SMS &middot; DLT registered
          </p>
        </form>
      </Form>
    );
  }

  const displayPhone = phone.replace('+91', '');
  const tooManyAttempts = verifyAttempts >= MAX_VERIFY_ATTEMPTS;

  return (
    <Form {...otpForm}>
      <div className="flex w-full flex-col items-center gap-y-6">
        <p className="text-muted-foreground text-sm text-center">
          <Trans i18nKey="auth.phoneOtpSentTo" values={{ phone: displayPhone }} />
        </p>

        {isMockMode && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-center w-full">
            <Trans i18nKey="auth.phoneMockHint" />
          </p>
        )}

        <form
          className="flex w-full flex-col items-center gap-y-6"
          onSubmit={otpForm.handleSubmit(handleVerifyOtp)}
        >
          <AuthErrorAlert error={verifyMutation.error} />

          {/* surface failures from resending the OTP, not just verification */}
          <AuthErrorAlert error={signInMutation.error} />

          {tooManyAttempts && (
            <p className="text-destructive text-sm">
              <Trans i18nKey="auth.phoneTooManyAttempts" />
            </p>
          )}

          <FormField
            name="token"
            control={otpForm.control}
            render={({ field }) => (
              <FormItem className="flex flex-col items-center">
                <FormControl>
                  <InputOTP
                    maxLength={6}
                    {...field}
                    disabled={verifyMutation.isPending || tooManyAttempts}
                    autoFocus
                    data-test="otp-input"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} data-slot="0" />
                      <InputOTPSlot index={1} data-slot="1" />
                      <InputOTPSlot index={2} data-slot="2" />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} data-slot="3" />
                      <InputOTPSlot index={4} data-slot="4" />
                      <InputOTPSlot index={5} data-slot="5" />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormDescription>
                  <Trans i18nKey="auth.phoneOtpLabel" />
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={verifyMutation.isPending || tooManyAttempts}
            data-test="otp-verify-button"
          >
            {verifyMutation.isPending ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                <Trans i18nKey="auth.phoneVerifyingOtp" />
              </>
            ) : (
              <Trans i18nKey="auth.phoneVerifyOtp" />
            )}
          </Button>

          <div className="flex w-full justify-between text-sm">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setStep('phone');
                setPhone('');
                phoneForm.reset();
              }}
            >
              <Trans i18nKey="auth.phoneChangeNumber" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={resendSeconds > 0 || signInMutation.isPending}
              onClick={handleResend}
              data-test="resend-otp-button"
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
