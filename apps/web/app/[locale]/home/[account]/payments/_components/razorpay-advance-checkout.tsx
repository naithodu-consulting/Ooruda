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
  amount: number;
  disabled?: boolean;
  onSuccess?: () => void;
}

interface PrefetchedOrder {
  orderId: string;
  keyId: string;
  amount: number;
}

export function RazorpayAdvanceCheckoutButton({
  associationId,
  unitId,
  unitNo,
  billType,
  amount,
  disabled = false,
  onSuccess,
}: Props) {
  const [step, setStep] = useState<'idle' | 'opening' | 'checkout'>('idle');
  const prefetchedOrder = useRef<PrefetchedOrder | null>(null);
  const prefetchInFlight = useRef(false);

  useEffect(() => {
    if (amount < 1) return;

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

    // Reset any previously cached order - it was for a different amount/unit/type.
    prefetchedOrder.current = null;
    prefetchInFlight.current = false;

    const controller = new AbortController();

    async function prefetchOrder() {
      if (prefetchInFlight.current) return;
      prefetchInFlight.current = true;
      try {
        const res = await fetch('/api/billing/razorpay/create-order-advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ associationId, unitId, billType, amount }),
          signal: controller.signal,
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
            amount: data.amount ?? 0,
          };
        }
      } catch (e) {
        // AbortError is expected on cleanup - ignore it silently.
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          prefetchedOrder.current = null;
        }
      } finally {
        prefetchInFlight.current = false;
      }
    }

    // Debounce: wait 600ms after the last prop change before creating a Razorpay order.
    // Without this, every keystroke in the amount field creates an abandoned order.
    const debounceTimer = setTimeout(() => {
      void prefetchOrder();
    }, 600);

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
      prefetchedOrder.current = null;
      prefetchInFlight.current = false;
    };
  }, [associationId, unitId, billType, amount]);

  const handlePay = useCallback(async () => {
    if (step !== 'idle') return;
    setStep('opening');

    try {
      let order = prefetchedOrder.current;
      if (!order) {
        const res = await fetch('/api/billing/razorpay/create-order-advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ associationId, unitId, billType, amount }),
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
          amount: data.amount ?? 0,
        };
      }

      setStep('checkout');

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: 'INR',
        order_id: order.orderId,
        name: 'Association Billing',
        description: `Advance deposit - Unit ${unitNo} · ${billType}`,
        theme: { color: '#16a34a' },
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
          prefetchedOrder.current = null;
          setStep('idle');

          const toastId = toast.loading('Confirming advance payment…', {
            description: `₹${amount.toLocaleString('en-IN')} received by Razorpay`,
          });

          const fallbackTimer = setTimeout(() => {
            toast.success('Advance payment received', {
              id: toastId,
              description: 'Your credit balance will update shortly.',
            });
            onSuccess?.();
          }, 6000);

          fetch('/api/billing/razorpay/verify-advance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              associationId,
              unitId,
              billType,
              amount,
            }),
          })
            .then((r) => r.json())
            .then(
              (data: {
                ledgerId?: string | null;
                alreadyRecorded?: boolean;
                error?: string;
              }) => {
                clearTimeout(fallbackTimer);
                if (data.error && !data.alreadyRecorded) {
                  toast.warning('Advance received, confirmation delayed', {
                    id: toastId,
                    description:
                      "Contact the association if it doesn't reflect within 24h.",
                    duration: Infinity,
                  });
                } else {
                  toast.success('Advance payment confirmed', {
                    id: toastId,
                    description:
                      'Your credit balance has been updated. You can download your receipt below.',
                  });
                }
                onSuccess?.();
              },
            )
            .catch(() => {
              clearTimeout(fallbackTimer);
              toast.warning('Advance received, confirmation delayed', {
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
  }, [associationId, unitId, unitNo, billType, amount, step, onSuccess]);

  return (
    <Button
      variant="default"
      size="default"
      onClick={handlePay}
      disabled={disabled || step !== 'idle' || amount < 1}
      className="w-full gap-2"
      data-test="razorpay-advance-checkout-button"
    >
      {step !== 'idle' ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CreditCard className="h-4 w-4" />
      )}
      {step !== 'idle'
        ? 'Opening Razorpay…'
        : disabled || amount < 1
          ? 'Pay'
          : `Pay ${amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}`}
    </Button>
  );
}
