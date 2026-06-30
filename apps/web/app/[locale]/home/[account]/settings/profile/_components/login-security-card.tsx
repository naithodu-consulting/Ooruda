'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Mail, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AuthErrorAlert } from '@kit/auth/sign-in';
import { normalizePhoneNumber } from '@kit/shared/utils';
import { useSupabase } from '@kit/supabase/hooks/use-supabase';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@kit/ui/input-otp';
import { PhoneInput } from '@kit/ui/phone-input';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';
import { Trans } from '@kit/ui/trans';

type Kind = 'phone' | 'email';

// Per-channel throttle, matching the login flow (phone primary, email tighter).
const KIND_CONFIG = {
  phone: {
    resendCooldown: 60,
    icon: Smartphone,
    labelKey: 'auth.loginSecurity.phoneLabel',
    newLabelKey: 'auth.loginSecurity.newPhoneLabel',
    otpSentKey: 'auth.loginSecurity.otpSentPhone',
    updatedKey: 'auth.loginSecurity.phoneUpdated',
    verifyType: 'phone_change' as const,
  },
  email: {
    resendCooldown: 30,
    icon: Mail,
    labelKey: 'auth.loginSecurity.emailLabel',
    newLabelKey: 'auth.loginSecurity.newEmailLabel',
    otpSentKey: 'auth.loginSecurity.otpSentEmail',
    updatedKey: 'auth.loginSecurity.emailUpdated',
    verifyType: 'email_change' as const,
  },
} as const;

const slotClass =
  'h-12 w-10 rounded-md text-center text-lg font-bold focus:ring-1 focus:outline-none';

export function LoginSecurityCard(props: {
  phone: string | null;
  email: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans i18nKey="auth.loginSecurity.title" />
        </CardTitle>
        <CardDescription>
          <Trans i18nKey="auth.loginSecurity.description" />
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <IdentityUpdater kind="phone" currentValue={props.phone} />
        <IdentityUpdater kind="email" currentValue={props.email} />
      </CardContent>
    </Card>
  );
}

function IdentityUpdater({
  kind,
  currentValue,
}: {
  kind: Kind;
  currentValue: string | null;
}) {
  const client = useSupabase();
  const router = useRouter();
  const t = useTranslations();
  const config = KIND_CONFIG[kind];
  const Icon = config.icon;

  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [value, setValue] = useState('');
  const [target, setTarget] = useState(''); // normalized identifier sent to
  const [token, setToken] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
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

  const reset = () => {
    setEditing(false);
    setStep('input');
    setValue('');
    setTarget('');
    setToken('');
    setError(null);
    setResendSeconds(0);
  };

  const normalize = (raw: string) =>
    kind === 'phone'
      ? (normalizePhoneNumber(raw.trim()) ?? raw.trim())
      : raw.trim().toLowerCase();

  const validate = (raw: string) =>
    kind === 'phone'
      ? normalizePhoneNumber(raw.trim()) !== null
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());

  const sendCode = async (identifier: string) => {
    setError(null);
    setPending(true);

    try {
      const { error: updateError } = await client.auth.updateUser(
        kind === 'phone' ? { phone: identifier } : { email: identifier },
      );

      if (updateError) {
        setError(updateError);
        return false;
      }

      return true;
    } finally {
      setPending(false);
    }
  };

  const handleSend = async () => {
    if (!validate(value)) {
      setError(
        kind === 'phone'
          ? 'auth.phoneInvalidFormat'
          : 'auth.emailInvalidFormat',
      );
      return;
    }

    const identifier = normalize(value);
    const ok = await sendCode(identifier);
    if (!ok) return;

    setTarget(identifier);
    setResendSeconds(config.resendCooldown);
    setToken('');
    setStep('otp');
  };

  const handleResend = async () => {
    if (resendSeconds > 0) return;
    const ok = await sendCode(target);
    if (ok) setResendSeconds(config.resendCooldown);
  };

  const handleVerify = async () => {
    if (token.length !== 6) return;
    setError(null);
    setPending(true);

    try {
      const { error: verifyError } = await client.auth.verifyOtp(
        kind === 'phone'
          ? { phone: target, token, type: config.verifyType }
          : { email: target, token, type: config.verifyType },
      );

      if (verifyError) {
        setError(verifyError);
        return;
      }

      // Refresh the session so the JWT reflects the new phone/email identity
      // before any gate/middleware re-reads the claims.
      await client.auth.refreshSession();

      toast.success(t(config.updatedKey));
      reset();
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const displayCurrent = currentValue ?? t('auth.loginSecurity.notSet');

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Icon className="text-muted-foreground h-4 w-4" />
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">
              <Trans i18nKey={config.labelKey} />
            </span>
            <span className="text-sm font-medium">{displayCurrent}</span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
          data-test={`change-${kind}-button`}
        >
          <Trans i18nKey="auth.loginSecurity.change" />
        </Button>
      </div>
    );
  }

  return (
    <div className="border-border flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4" />
        <Trans i18nKey={config.newLabelKey} />
      </div>

      <AuthErrorAlert error={error} />

      {step === 'input' ? (
        <div className="flex flex-col gap-3">
          {kind === 'phone' ? (
            <PhoneInput
              value={value}
              onChange={(v) => setValue(v)}
              placeholder={t('auth.phoneInputPlaceholder')}
              autoFocus
              data-test={`new-${kind}-input`}
            />
          ) : (
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('auth.emailInputPlaceholder')}
              autoFocus
              data-test={`new-${kind}-input`}
            />
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSend}
              disabled={pending}
              data-test={`send-${kind}-code-button`}
            >
              {pending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  <Trans i18nKey="auth.phoneSendingOtp" />
                </>
              ) : (
                <Trans i18nKey="auth.loginSecurity.sendCode" />
              )}
            </Button>

            <Button variant="ghost" size="sm" onClick={reset}>
              <Trans i18nKey="auth.loginSecurity.cancel" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            <Trans i18nKey={config.otpSentKey} values={{ value: target }} />
          </p>

          <InputOTP
            maxLength={6}
            value={token}
            onChange={setToken}
            disabled={pending}
            autoFocus
            data-test={`${kind}-otp-input`}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} className={slotClass} />
              <InputOTPSlot index={1} className={slotClass} />
              <InputOTPSlot index={2} className={slotClass} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} className={slotClass} />
              <InputOTPSlot index={4} className={slotClass} />
              <InputOTPSlot index={5} className={slotClass} />
            </InputOTPGroup>
          </InputOTP>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleVerify}
              disabled={pending || token.length !== 6}
              data-test={`verify-${kind}-button`}
            >
              {pending ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  <Trans i18nKey="auth.phoneVerifyingOtp" />
                </>
              ) : (
                <Trans i18nKey="auth.loginSecurity.confirm" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={resendSeconds > 0 || pending}
              onClick={handleResend}
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

            <Button variant="ghost" size="sm" onClick={reset}>
              <Trans i18nKey="auth.loginSecurity.cancel" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
