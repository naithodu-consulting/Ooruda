'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CreditCard, Loader2 } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';

interface Props {
  associationId: string;
  unitId: string;
  unitNo: string;
  billType: string;
  outstanding: number;
  onSuccess?: () => void;
}

export function RazorpayDueCheckoutButton({
  associationId,
  unitId,
  unitNo,
  billType,
  outstanding,
  onSuccess,
}: Props) {
  const [step, setStep] = useState<'idle' | 'creating' | 'checkout'>('idle');
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

  const handlePay = useCallback(async () => {
    if (step !== 'idle') return;
    setStep('creating');

    try {
      const orderRes = await fetch('/api/billing/razorpay/create-order-due', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          associationId,
          unitId,
          billType,
          amount: outstanding,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RazorpayConstructor = (window as any).Razorpay as new (
        opts: unknown,
      ) => { open(): void };
      const rzp = new RazorpayConstructor({
        key: orderData.keyId,
        amount: orderData.amount!,
        currency: 'INR',
        order_id: orderData.orderId,
        name: 'Association Billing',
        description: `Due payment — Unit ${unitNo} (${billType})`,
        theme: { color: '#d97706' },
        modal: {
          ondismiss: () => {
            setStep('idle');
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await fetch('/api/billing/razorpay/verify-due', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                associationId,
                unitId,
                billType,
                amount: outstanding,
              }),
            });

            const verifyData = (await verifyRes.json()) as {
              paymentId?: string | null;
              alreadyRecorded?: boolean;
              error?: string;
            };

            if (!verifyRes.ok && !verifyData.alreadyRecorded) {
              toast.error(
                verifyData.error ??
                  'Payment captured but recording failed. Please contact the association.',
              );
            } else {
              toast.success(
                `₹${outstanding.toLocaleString('en-IN')} paid successfully`,
                { description: 'Your cash ledger balance will update now.' },
              );
              onSuccess?.();
            }
          } catch {
            toast.error(
              'Payment captured but verification failed. Please contact the association.',
            );
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
  }, [associationId, unitId, unitNo, billType, outstanding, step, onSuccess]);

  const busy = step !== 'idle';

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handlePay}
      disabled={busy || outstanding <= 0}
      className="gap-1.5"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CreditCard className="h-3.5 w-3.5" />
      )}
      {step === 'creating' && 'Preparing…'}
      {step === 'checkout' && 'Opening…'}
      {step === 'idle' && `Pay ₹${outstanding.toLocaleString('en-IN')}`}
    </Button>
  );
}
