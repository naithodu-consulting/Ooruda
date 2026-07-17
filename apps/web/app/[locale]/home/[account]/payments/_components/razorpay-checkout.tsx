'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CreditCard, IndianRupee, Loader2 } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

type RazorpayConstructor = new (options: {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
  handler: (response: RazorpayResponse) => void;
}) => {
  open(): void;
  close(): void;
  on(event: string, handler: () => void): void;
};

export interface BillToPayRow {
  id: string;
  billNo: string;
  outstanding: number;
}

interface Props {
  associationId: string;
  bills: BillToPayRow[];
  paidByRole: 'Owner' | 'Tenant';
  label?: string;
  variant?: 'default' | 'outline';
  size?: 'sm' | 'default';
  onSuccess?: () => void;
}

export function RazorpayCheckoutButton({
  associationId,
  bills,
  paidByRole,
  label,
  variant = 'default',
  size = 'sm',
  onSuccess,
}: Props) {
  const [step, setStep] = useState<
    'idle' | 'creating' | 'checkout' | 'verifying'
  >('idle');
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (scriptLoaded.current) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      scriptLoaded.current = true;
    };
    document.head.appendChild(script);
    return () => {
      /* keep script across remounts */
    };
  }, []);

  const totalOutstanding = bills.reduce((s, b) => s + b.outstanding, 0);

  const handlePay = useCallback(async () => {
    if (step !== 'idle') return;
    setStep('creating');

    try {
      const orderRes = await fetch('/api/billing/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billIds: bills.map((b) => b.id),
          associationId,
        }),
      });

      const orderData = (await orderRes.json()) as {
        orderId?: string;
        keyId?: string;
        amount?: number;
        error?: string;
      };

      if (!orderRes.ok || !orderData.orderId || !orderData.keyId) {
        toast.error(orderData.error ?? 'Could not create payment order.');
        setStep('idle');
        return;
      }

      setStep('checkout');

      const description =
        bills.length === 1
          ? `Payment for bill ${bills[0]!.billNo}`
          : `Payment for ${bills.length} bills`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RazorpayConstructor = (window as any)
        .Razorpay as RazorpayConstructor;
      const rzp = new RazorpayConstructor({
        key: orderData.keyId,
        amount: orderData.amount!,
        currency: 'INR',
        order_id: orderData.orderId,
        name: 'Association Billing',
        description,
        theme: { color: '#d97706' },
        modal: {
          ondismiss: () => {
            setStep('idle');
          },
        },
        handler: async (response) => {
          setStep('verifying');
          try {
            const verifyRes = await fetch('/api/billing/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                billIds: bills.map((b) => b.id),
                associationId,
                paidByRole,
              }),
            });

            const verifyData = (await verifyRes.json()) as {
              paymentIds?: string[];
              error?: string;
            };

            if (!verifyRes.ok || !verifyData.paymentIds?.length) {
              toast.error(
                verifyData.error ??
                  'Payment recorded by Razorpay but verification failed. Please contact the association.',
              );
            } else {
              toast.success(
                `Payment successful — ₹${totalOutstanding.toLocaleString('en-IN')} paid`,
                {
                  description:
                    bills.length > 1
                      ? `${verifyData.paymentIds.length} bill(s) settled.`
                      : 'Your receipt will be generated shortly.',
                },
              );
              onSuccess?.();
            }
          } finally {
            setStep('idle');
          }
        },
      });

      rzp.open();
    } catch {
      toast.error('Something went wrong. Please try again.');
      setStep('idle');
    }
  }, [associationId, bills, paidByRole, step, totalOutstanding, onSuccess]);

  const busy = step !== 'idle';

  const buttonLabel =
    label ??
    (bills.length === 1
      ? `Pay ₹${totalOutstanding.toLocaleString('en-IN')}`
      : `Pay All — ₹${totalOutstanding.toLocaleString('en-IN')}`);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handlePay}
      disabled={busy || totalOutstanding <= 0}
      className="gap-1.5"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : bills.length > 1 ? (
        <IndianRupee className="h-3.5 w-3.5" />
      ) : (
        <CreditCard className="h-3.5 w-3.5" />
      )}
      {step === 'creating' && 'Preparing…'}
      {step === 'checkout' && 'Opening…'}
      {step === 'verifying' && 'Verifying…'}
      {step === 'idle' && buttonLabel}
    </Button>
  );
}
