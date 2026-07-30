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

interface PrefetchedOrder {
  orderId: string;
  keyId: string;
  amount: number;
}

export function RazorpayDueCheckoutButton({
  associationId,
  unitId,
  unitNo,
  billType,
  outstanding,
  onSuccess,
}: Props) {
  const [step, setStep] = useState<'idle' | 'opening' | 'checkout'>('idle');
  const prefetchedOrder = useRef<PrefetchedOrder | null>(null);
  const prefetchInFlight = useRef(false);

  useEffect(() => {
    if (outstanding <= 0) return;

    // Inject Razorpay script once — skip if already present.
    if (
      !document.querySelector(
        'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
      )
    ) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.head.appendChild(script);
    }

    async function prefetchOrder() {
      if (prefetchInFlight.current || prefetchedOrder.current) return;
      prefetchInFlight.current = true;
      try {
        const res = await fetch('/api/billing/razorpay/create-order-due', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            associationId,
            unitId,
            billType,
            amount: outstanding,
          }),
        });
        const data = (await res.json()) as {
          orderId?: string;
          keyId?: string;
          amount?: number;
        };
        if (res.ok && data.orderId && data.keyId) {
          prefetchedOrder.current = {
            orderId: data.orderId,
            keyId: data.keyId,
            amount: data.amount!,
          };
        }
      } finally {
        prefetchInFlight.current = false;
      }
    }

    void prefetchOrder();

    return () => {
      // Invalidate pre-fetched order when unit, bill type, or amount changes
      // so a re-render with different props doesn't open a stale Razorpay order.
      prefetchedOrder.current = null;
      prefetchInFlight.current = false;
    };
  }, [associationId, unitId, billType, outstanding]);

  const handlePay = useCallback(async () => {
    if (step !== 'idle') return;
    setStep('opening');

    try {
      let order = prefetchedOrder.current;
      if (!order) {
        const res = await fetch('/api/billing/razorpay/create-order-due', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            associationId,
            unitId,
            billType,
            amount: outstanding,
          }),
        });
        const data = (await res.json()) as {
          orderId?: string;
          keyId?: string;
          amount?: number;
          error?: string;
        };
        if (!res.ok || !data.orderId || !data.keyId) {
          toast.error(data.error ?? 'Could not create payment order.');
          setStep('idle');
          return;
        }
        order = {
          orderId: data.orderId,
          keyId: data.keyId,
          amount: data.amount!,
        };
      }

      setStep('checkout');

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: 'INR',
        order_id: order.orderId,
        name: 'Association Billing',
        description: `Due payment — Unit ${unitNo} (${billType})`,
        theme: { color: '#d97706' },
        modal: {
          ondismiss: () => {
            prefetchedOrder.current = null;
            setStep('idle');
          },
        },
        handler: (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          // 1. Free the button immediately.
          prefetchedOrder.current = null;
          setStep('idle');

          // 2. Non-blocking confirming toast.
          const toastId = toast.loading('Confirming payment…', {
            description: `₹${outstanding.toLocaleString('en-IN')} received by Razorpay`,
          });

          // 3. Fallback: refresh UI after 6s even if verify is slow.
          const fallbackTimer = setTimeout(() => {
            toast.success('Payment received', {
              id: toastId,
              description: 'Your cash ledger balance will update shortly.',
            });
            onSuccess?.();
          }, 6000);

          // 4. Verify in background — resolves the toast in place.
          fetch('/api/billing/razorpay/verify-due', {
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
          })
            .then((r) => r.json())
            .then(
              (data: {
                paymentId?: string | null;
                alreadyRecorded?: boolean;
                error?: string;
              }) => {
                clearTimeout(fallbackTimer);
                if (data.error && !data.alreadyRecorded) {
                  toast.warning('Payment received — confirmation delayed', {
                    id: toastId,
                    description:
                      "Contact the association if it doesn't reflect within 24h.",
                    duration: Infinity,
                  });
                } else {
                  toast.success('Payment confirmed', {
                    id: toastId,
                    description: 'Your cash ledger balance has been updated.',
                  });
                }
                onSuccess?.();
              },
            )
            .catch(() => {
              clearTimeout(fallbackTimer);
              toast.warning('Payment received — confirmation delayed', {
                id: toastId,
                description:
                  "Contact the association if it doesn't reflect within 24h.",
                duration: Infinity,
              });
              onSuccess?.();
            });
        },
      });

      rzp.open();
    } catch {
      toast.error('Something went wrong. Please try again.');
      setStep('idle');
    }
  }, [associationId, unitId, unitNo, billType, outstanding, step, onSuccess]);

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handlePay}
      disabled={step !== 'idle' || outstanding <= 0}
      className="gap-1.5"
    >
      {step !== 'idle' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CreditCard className="h-3.5 w-3.5" />
      )}
      {step !== 'idle'
        ? 'Opening…'
        : `Pay ₹${outstanding.toLocaleString('en-IN')}`}
    </Button>
  );
}
