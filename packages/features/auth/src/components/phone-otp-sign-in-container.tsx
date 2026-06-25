'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Lock, Mail, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { getSafeRedirectPath } from '@kit/shared/utils';
import { useSignInWithOtp } from '@kit/supabase/hooks/use-sign-in-with-otp';
import { useVerifyOtp } from '@kit/supabase/hooks/use-verify-otp';
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
import { Input } from '@kit/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@kit/ui/input-otp';
import { Spinner } from '@kit/ui/spinner';
import { Trans } from '@kit/ui/trans';

import { checkEmailLoginAction } from '../actions/check-email-login-action';
import { checkPhoneInvitationAction } from '../actions/check-invitation-action';
import { AuthErrorAlert } from './auth-error-alert';

// Per-channel throttling. Phone (primary) keeps its established limits; email
// (secondary) is intentionally tighter. The two are tracked independently —
// switching channels resets the counters, and the server-side SMS vs email
// rate-limit buckets are separate too.
const CHANNEL_CONFIG = {
  phone: { resendCooldown: 60, maxVerifyAttempts: 5 },
  email: { resendCooldown: 30, maxVerifyAttempts: 3 },
} as const;

type Channel = keyof typeof CHANNEL_CONFIG;
type Step = 'identifier' | 'otp';

const PhoneSchema = z.object({
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, { message: 'auth.phoneInvalidFormat' }),
});

const EmailSchema = z.object({
  email: z.string().email({ message: 'auth.emailInvalidFormat' }),
});

const OtpSchema = z.object({
  token: z.string().min(6).max(6),
});

export function PhoneOtpSignInContainer() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('auth');

  const [channel, setChannel] = useState<Channel>('phone');
  const [step, setStep] = useState<Step>('identifier');
  // The identifier the OTP was sent to: an E.164 phone ('+91…') or an email.
  const [sentTo, setSentTo] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [verifyAttempts, setVerifyAttempts] = useState(0);
  const [localError, setLocalError] = useState<string | Error | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const signInMutation = useSignInWithOtp();
  const verifyMutation = useVerifyOtp();

  const isMockMode = process.env.NEXT_PUBLIC_MOCK_OTP === 'true';
  const config = CHANNEL_CONFIG[channel];

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

  const emailForm = useForm({
    resolver: zodResolver(EmailSchema),
    defaultValues: { email: '' },
  });

  const otpForm = useForm({
    resolver: zodResolver(OtpSchema),
    defaultValues: { token: '' },
  });

  // Send the OTP to a given identifier, gating on whether the user is allowed
  // to sign in (invited phone, or an email belonging to an existing account).
  const sendOtpTo = async (channelArg: Channel, identifier: string) => {
    setLocalError(null);
    signInMutation.reset();

    if (channelArg === 'phone') {
      const checkResult = await checkPhoneInvitationAction(identifier);
      if (!checkResult.allowed) {
        setLocalError('not_invited');
        return false;
      }

      await signInMutation.mutateAsync({
        phone: identifier,
        options: { shouldCreateUser: checkResult.shouldCreateUser },
      });

      return true;
    }

    // email channel — secondary login, never creates an account
    const checkResult = await checkEmailLoginAction(identifier);
    if (!checkResult.allowed) {
      setLocalError('email_not_registered');
      return false;
    }

    await signInMutation.mutateAsync({
      email: identifier,
      options: { shouldCreateUser: false },
    });

    return true;
  };

  const handleSendPhone = async ({
    phone: rawPhone,
  }: z.output<typeof PhoneSchema>) => {
    const e164 = `+91${rawPhone}`;

    try {
      const ok = await sendOtpTo('phone', e164);
      if (!ok) return;

      setSentTo(e164);
      setResendSeconds(CHANNEL_CONFIG.phone.resendCooldown);
      setVerifyAttempts(0);
      otpForm.reset();
      setStep('otp');
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendEmail = async ({ email }: z.output<typeof EmailSchema>) => {
    const normalized = email.trim().toLowerCase();

    try {
      const ok = await sendOtpTo('email', normalized);
      if (!ok) return;

      setSentTo(normalized);
      setResendSeconds(CHANNEL_CONFIG.email.resendCooldown);
      setVerifyAttempts(0);
      otpForm.reset();
      setStep('otp');
    } catch (e) {
      console.error(e);
    }
  };

  const handleResend = async () => {
    if (resendSeconds > 0) return;

    try {
      const ok = await sendOtpTo(channel, sentTo);
      if (!ok) return;

      setResendSeconds(config.resendCooldown);
      setVerifyAttempts(0);
      otpForm.reset();
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerifyOtp = async ({ token }: z.output<typeof OtpSchema>) => {
    if (verifyAttempts >= config.maxVerifyAttempts) return;

    setVerifyAttempts((n) => n + 1);

    try {
      await verifyMutation.mutateAsync(
        channel === 'phone'
          ? { type: 'sms', phone: sentTo, token }
          : { type: 'email', email: sentTo, token },
      );

      const next = getSafeRedirectPath(params.get('next'), '/home');
      router.replace(next);
    } catch (e) {
      console.error(e);
    }
  };

  // Reset all transient state when switching channels.
  const switchChannel = (next: Channel) => {
    setChannel(next);
    setStep('identifier');
    setSentTo('');
    setLocalError(null);
    setResendSeconds(0);
    setVerifyAttempts(0);
    signInMutation.reset();
    verifyMutation.reset();
    phoneForm.reset();
    emailForm.reset();
    otpForm.reset();
  };

  if (step === 'identifier') {
    return channel === 'phone' ? (
      <Form {...phoneForm}>
        <form
          className="flex flex-col gap-y-4"
          onSubmit={phoneForm.handleSubmit(handleSendPhone)}
        >
          <AuthErrorAlert error={localError || signInMutation.error} />

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

          <ChannelToggle target="email" onSwitch={switchChannel} />
        </form>
      </Form>
    ) : (
      <Form {...emailForm}>
        <form
          className="flex flex-col gap-y-4"
          onSubmit={emailForm.handleSubmit(handleSendEmail)}
        >
          <AuthErrorAlert error={localError || signInMutation.error} />

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
                    data-test="email-input"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={signInMutation.isPending}
            data-test="email-send-otp-button"
          >
            {signInMutation.isPending ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                <Trans i18nKey="auth.phoneSendingOtp" />
              </>
            ) : (
              <Trans i18nKey="auth.emailSendOtp" />
            )}
          </Button>

          <ChannelToggle target="phone" onSwitch={switchChannel} />
        </form>
      </Form>
    );
  }

  const displayTarget =
    channel === 'phone' ? sentTo.replace('+91', '') : sentTo;
  const tooManyAttempts = verifyAttempts >= config.maxVerifyAttempts;

  return (
    <Form {...otpForm}>
      <div className="flex w-full flex-col items-center gap-y-6">
        <p className="text-center text-sm font-medium text-[#6B88A4]">
          <Trans
            i18nKey={
              channel === 'phone'
                ? 'auth.phoneOtpSentTo'
                : 'auth.emailOtpSentTo'
            }
            values={
              channel === 'phone'
                ? { phone: displayTarget }
                : { email: displayTarget }
            }
          />
        </p>

        {isMockMode && (
          <p className="w-full animate-pulse rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-center text-xs font-medium text-[#F59E0B]">
            <Trans i18nKey="auth.phoneMockHint" />
          </p>
        )}

        <form
          className="flex w-full flex-col gap-y-5"
          onSubmit={otpForm.handleSubmit(handleVerifyOtp)}
        >
          <AuthErrorAlert error={verifyMutation.error} />

          {/* surface failures from resending the OTP, not just verification */}
          <AuthErrorAlert error={localError || signInMutation.error} />

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
                    disabled={verifyMutation.isPending || tooManyAttempts}
                    autoFocus
                    data-test="otp-input"
                  >
                    <InputOTPGroup className="gap-1.5 md:gap-2">
                      <InputOTPSlot
                        index={0}
                        data-slot="0"
                        className="h-13 w-11 rounded-md border-[#2E3F50] bg-[#1B293A] text-center text-[22px] font-black text-[#F59E0B] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] focus:outline-none md:h-14 md:w-12"
                      />
                      <InputOTPSlot
                        index={1}
                        data-slot="1"
                        className="h-13 w-11 rounded-md border-[#2E3F50] bg-[#1B293A] text-center text-[22px] font-black text-[#F59E0B] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] focus:outline-none md:h-14 md:w-12"
                      />
                      <InputOTPSlot
                        index={2}
                        data-slot="2"
                        className="h-13 w-11 rounded-md border-[#2E3F50] bg-[#1B293A] text-center text-[22px] font-black text-[#F59E0B] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] focus:outline-none md:h-14 md:w-12"
                      />
                    </InputOTPGroup>
                    <InputOTPSeparator className="mx-1 font-bold text-[#2E3F50]" />
                    <InputOTPGroup className="gap-1.5 md:gap-2">
                      <InputOTPSlot
                        index={3}
                        data-slot="3"
                        className="h-13 w-11 rounded-md border-[#2E3F50] bg-[#1B293A] text-center text-[22px] font-black text-[#F59E0B] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] focus:outline-none md:h-14 md:w-12"
                      />
                      <InputOTPSlot
                        index={4}
                        data-slot="4"
                        className="h-13 w-11 rounded-md border-[#2E3F50] bg-[#1B293A] text-center text-[22px] font-black text-[#F59E0B] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] focus:outline-none md:h-14 md:w-12"
                      />
                      <InputOTPSlot
                        index={5}
                        data-slot="5"
                        className="h-13 w-11 rounded-md border-[#2E3F50] bg-[#1B293A] text-center text-[22px] font-black text-[#F59E0B] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B] focus:outline-none md:h-14 md:w-12"
                      />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormDescription className="text-center text-xs text-[#6B88A4]">
                  <Trans i18nKey="auth.phoneOtpLabel" />
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 border-0 bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-[13px] font-extrabold text-[#0F172A] shadow-[0_4px_16px_rgba(245,158,11,0.22)] transition-all hover:brightness-[1.03] active:scale-[0.98]"
            disabled={verifyMutation.isPending || tooManyAttempts}
            data-test="otp-verify-button"
          >
            {verifyMutation.isPending ? (
              <>
                <Spinner className="mr-2 h-4 w-4 text-current" />
                <Trans i18nKey="auth.phoneVerifyingOtp" />
              </>
            ) : (
              <>
                <Lock className="h-[14px] w-[14px]" strokeWidth={2.5} />
                <Trans i18nKey="auth.phoneVerifyOtp" />
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
                setStep('identifier');
                setSentTo('');
                setLocalError(null);
                signInMutation.reset();
                if (channel === 'phone') phoneForm.reset();
                else emailForm.reset();
              }}
            >
              <ArrowLeft className="h-[14px] w-[14px]" strokeWidth={2.5} />
              <Trans
                i18nKey={
                  channel === 'phone'
                    ? 'auth.phoneChangeNumber'
                    : 'auth.emailChangeAddress'
                }
              />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={resendSeconds > 0 || signInMutation.isPending}
              onClick={handleResend}
              data-test="resend-otp-button"
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

// Link to switch between the phone and email login channels.
function ChannelToggle({
  target,
  onSwitch,
}: {
  target: Channel;
  onSwitch: (next: Channel) => void;
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="h-px flex-1 bg-[#2E3F50]" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onSwitch(target)}
        data-test={`use-${target}-instead`}
        className="h-9 gap-1.5 text-[#6B88A4] transition-all hover:bg-[#1B293A]/50 hover:text-white"
      >
        {target === 'email' ? (
          <Mail className="h-[14px] w-[14px]" strokeWidth={2.5} />
        ) : (
          <Smartphone className="h-[14px] w-[14px]" strokeWidth={2.5} />
        )}
        <Trans
          i18nKey={
            target === 'email' ? 'auth.useEmailInstead' : 'auth.usePhoneInstead'
          }
        />
      </Button>
      <span className="h-px flex-1 bg-[#2E3F50]" />
    </div>
  );
}
