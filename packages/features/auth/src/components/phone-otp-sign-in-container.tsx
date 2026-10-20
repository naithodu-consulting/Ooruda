'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Lock, Mail, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { normalizePhoneNumber, getSafeRedirectPath } from '@kit/shared/utils';
import { useSignInWithOtp } from '@kit/supabase/hooks/use-sign-in-with-otp';
import { useVerifyOtp } from '@kit/supabase/hooks/use-verify-otp';
import { Alert, AlertDescription } from '@kit/ui/alert';
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
import { PhoneInput } from '@kit/ui/phone-input';
import { Spinner } from '@kit/ui/spinner';
import { Trans } from '@kit/ui/trans';

import { checkEmailLoginAction } from '../actions/check-email-login-action';
import { checkPhoneInvitationAction } from '../actions/check-invitation-action';
import { AuthErrorAlert } from './auth-error-alert';

// Per-channel throttling. Phone (primary) keeps its established limits; email
// (secondary) is intentionally tighter. The two are tracked independently -
// switching channels resets the counters, and the server-side SMS vs email
// rate-limit buckets are separate too.
const CHANNEL_CONFIG = {
  phone: { resendCooldown: 60, maxVerifyAttempts: 5 },
  email: { resendCooldown: 30, maxVerifyAttempts: 3 },
} as const;

type Channel = keyof typeof CHANNEL_CONFIG;

/** Matches the /auth rate-limit window in apps/web/proxy.ts. */
const RATE_LIMIT_WINDOW_SECONDS = 60;
type Step = 'identifier' | 'otp';

const PhoneSchema = z.object({
  phone: z.string().refine((v) => normalizePhoneNumber(v) !== null, {
    message: 'auth.phoneInvalidFormat',
  }),
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
  const [emailValue, setEmailValue] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [verifyAttempts, setVerifyAttempts] = useState(0);
  const [localError, setLocalError] = useState<string | Error | null>(null);
  // Seconds left on the app's per-IP sign-in rate limit (proxy.ts, 60s
  // window). The form can't read the 429's Retry-After from a server action,
  // so it counts the window down itself.
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);

  useEffect(() => {
    if (rateLimitSeconds <= 0) return;
    const timer = setTimeout(() => setRateLimitSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [rateLimitSeconds]);

  /**
   * Surfaces a failed send instead of swallowing it. A request blocked by the
   * sign-in rate limit reaches the form as a server action that got a non-RSC
   * (429) response; anything else shows the generic error.
   */
  const handleSendError = (error: unknown) => {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);

    // Next.js rethrows the 429 body ("Too Many Requests"); older versions
    // report a generic unexpected-response error instead.
    if (
      /too many requests|unexpected response was received from the server/i.test(
        message,
      )
    ) {
      setLocalError(null);
      setRateLimitSeconds(RATE_LIMIT_WINDOW_SECONDS);
      return;
    }

    // Supabase auth errors are already shown via signInMutation.error.
    if (!signInMutation.error) setLocalError('default');
  };
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const signInMutation = useSignInWithOtp();
  const verifyMutation = useVerifyOtp();

  const isMockMode = process.env.NEXT_PUBLIC_MOCK_OTP === 'false';
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

    // email channel - secondary login, never creates an account
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
    const e164 = normalizePhoneNumber(rawPhone) ?? rawPhone;

    try {
      const ok = await sendOtpTo('phone', e164);
      if (!ok) return;

      setSentTo(e164);
      setResendSeconds(CHANNEL_CONFIG.phone.resendCooldown);
      setVerifyAttempts(0);
      otpForm.reset();
      setStep('otp');
    } catch (e) {
      handleSendError(e);
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
      handleSendError(e);
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
      handleSendError(e);
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
    setEmailValue('');
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
          <RateLimitNotice seconds={rateLimitSeconds} />

          <FormField
            name="phone"
            control={phoneForm.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans i18nKey="auth.phoneInputLabel" />
                </FormLabel>
                <FormControl>
                  <PhoneInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    placeholder={t('phoneInputPlaceholder')}
                    autoFocus
                    data-test="phone-input"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="!text-primary-foreground w-full border border-[#FCD469] !bg-[#FCD469] font-semibold shadow-none hover:!bg-[#f0c740]"
            disabled={signInMutation.isPending || rateLimitSeconds > 0}
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
          onSubmit={(event) => {
            event.preventDefault();

            const parsed = EmailSchema.safeParse({ email: emailValue });

            if (!parsed.success) {
              emailForm.setError('email', {
                message: 'auth.emailInvalidFormat',
              });

              return;
            }

            emailForm.clearErrors('email');
            void handleSendEmail(parsed.data);
          }}
        >
          <AuthErrorAlert error={localError || signInMutation.error} />
          <RateLimitNotice seconds={rateLimitSeconds} />

          <FormField
            name="email"
            control={emailForm.control}
            render={() => (
              <FormItem>
                <FormLabel>
                  <Trans i18nKey="auth.emailInputLabel" />
                </FormLabel>
                <FormControl>
                  <Input
                    name="email"
                    value={emailValue}
                    onChange={(event) => {
                      setEmailValue(event.currentTarget.value);
                      emailForm.clearErrors('email');
                    }}
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={t('emailInputPlaceholder')}
                    autoFocus
                    data-test="email-input"
                    className="border-[#EADFB0] bg-white"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="!text-primary-foreground w-full border border-[#FCD469] !bg-[#FCD469] font-semibold shadow-none hover:!bg-[#f0c740]"
            disabled={signInMutation.isPending || rateLimitSeconds > 0}
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
    channel === 'phone'
      ? sentTo.replace('+91', '').replace(/^(\d{2})\d{6}(\d{2})$/, '$1xxxxxx$2')
      : sentTo;
  const tooManyAttempts = verifyAttempts >= config.maxVerifyAttempts;

  return (
    <Form {...otpForm}>
      <div className="flex w-full flex-col items-center gap-y-8">
        <p className="text-muted-foreground text-center text-sm font-medium">
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
          <p className="text-brand-ink w-full animate-pulse rounded border border-[#FCD469]/40 bg-[#FCD469]/15 px-3 py-2 text-center text-xs font-medium">
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
          <RateLimitNotice seconds={rateLimitSeconds} />

          {tooManyAttempts && (
            <p className="text-destructive text-center text-sm font-semibold">
              <Trans i18nKey="auth.phoneTooManyAttempts" />
            </p>
          )}

          <FormField
            name="token"
            control={otpForm.control}
            render={({ field }) => (
              <FormItem className="flex flex-col items-center gap-y-3">
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
                        className="text-foreground h-13 w-11 rounded-md border-[#EADFB0] bg-white text-center text-2xl font-semibold focus:border-[#FCD469] focus:ring-1 focus:ring-[#FCD469] focus:outline-none md:h-14 md:w-12"
                      />
                      <InputOTPSlot
                        index={1}
                        data-slot="1"
                        className="text-foreground h-13 w-11 rounded-md border-[#EADFB0] bg-white text-center text-2xl font-semibold focus:border-[#FCD469] focus:ring-1 focus:ring-[#FCD469] focus:outline-none md:h-14 md:w-12"
                      />
                      <InputOTPSlot
                        index={2}
                        data-slot="2"
                        className="text-foreground h-13 w-11 rounded-md border-[#EADFB0] bg-white text-center text-2xl font-semibold focus:border-[#FCD469] focus:ring-1 focus:ring-[#FCD469] focus:outline-none md:h-14 md:w-12"
                      />
                    </InputOTPGroup>
                    <InputOTPSeparator className="text-muted-foreground/50 mx-1 font-bold" />
                    <InputOTPGroup className="gap-1.5 md:gap-2">
                      <InputOTPSlot
                        index={3}
                        data-slot="3"
                        className="text-foreground h-13 w-11 rounded-md border-[#EADFB0] bg-white text-center text-2xl font-semibold focus:border-[#FCD469] focus:ring-1 focus:ring-[#FCD469] focus:outline-none md:h-14 md:w-12"
                      />
                      <InputOTPSlot
                        index={4}
                        data-slot="4"
                        className="text-foreground h-13 w-11 rounded-md border-[#EADFB0] bg-white text-center text-2xl font-semibold focus:border-[#FCD469] focus:ring-1 focus:ring-[#FCD469] focus:outline-none md:h-14 md:w-12"
                      />
                      <InputOTPSlot
                        index={5}
                        data-slot="5"
                        className="text-foreground h-13 w-11 rounded-md border-[#EADFB0] bg-white text-center text-2xl font-semibold focus:border-[#FCD469] focus:ring-1 focus:ring-[#FCD469] focus:outline-none md:h-14 md:w-12"
                      />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="!text-primary-foreground mt-2 flex h-12 w-full items-center justify-center gap-2 border border-[#FCD469] !bg-[#FCD469] text-sm font-semibold shadow-none transition-all hover:!bg-[#f0c740] active:scale-[0.98]"
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
              className="text-muted-foreground hover:text-foreground flex h-9 items-center gap-1.5 transition-all hover:bg-[#FBF7E8]"
              onClick={() => {
                setStep('identifier');
                setSentTo('');
                setLocalError(null);
                signInMutation.reset();
                if (channel === 'phone') phoneForm.reset();
                else {
                  emailForm.reset();
                  setEmailValue('');
                }
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
              disabled={
                resendSeconds > 0 ||
                signInMutation.isPending ||
                rateLimitSeconds > 0
              }
              onClick={handleResend}
              data-test="resend-otp-button"
              className="text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 h-9 transition-all hover:bg-[#FBF7E8] disabled:hover:bg-transparent"
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
      <span className="h-px flex-1 bg-[#EADFB0]" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onSwitch(target)}
        data-test={`use-${target}-instead`}
        className="text-muted-foreground hover:text-foreground h-9 gap-1.5 transition-all hover:bg-[#FBF7E8]"
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
      <span className="h-px flex-1 bg-[#EADFB0]" />
    </div>
  );
}

function RateLimitNotice({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null;

  return (
    <Alert variant={'destructive'} data-test={'auth-rate-limit-notice'}>
      <AlertDescription>
        <Trans i18nKey={'auth.tooManyAttempts'} values={{ seconds }} />
      </AlertDescription>
    </Alert>
  );
}
