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
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
  handler: (response: RazorpayResponse) => void;
}) => {
  open(): void;
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

interface PrefetchedOrder {
  orderId: string;
  keyId: string;
  amount: number;
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
  const [step, setStep] = useState<'idle' | 'opening' | 'checkout'>('idle');
  const prefetchedOrder = useRef<PrefetchedOrder | null>(null);
  const prefetchInFlight = useRef(false);

  const totalOutstanding = bills.reduce((s, b) => s + b.outstanding, 0);

  // Stable key representing the current bill set — changes when props change.
  const billKey = bills.map((b) => b.id).join(',');

  useEffect(() => {
    if (totalOutstanding <= 0) return;

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
        const res = await fetch('/api/billing/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            billIds: bills.map((b) => b.id),
            associationId,
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
      // Invalidate pre-fetched order when bills or amount change so a
      // re-render with different props doesn't open the wrong Razorpay order.
      prefetchedOrder.current = null;
      prefetchInFlight.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billKey, associationId, totalOutstanding]);

  const handlePay = useCallback(async () => {
    if (step !== 'idle') return;
    setStep('opening');

    try {
      let order = prefetchedOrder.current;
      if (!order) {
        const res = await fetch('/api/billing/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            billIds: bills.map((b) => b.id),
            associationId,
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

      const description =
        bills.length === 1
          ? `Payment for bill ${bills[0]!.billNo}`
          : `Payment for ${bills.length} bills`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RazorpayConstructor = (window as any)
        .Razorpay as RazorpayConstructor;
      const rzp = new RazorpayConstructor({
        key: order.keyId,
        amount: order.amount,
        currency: 'INR',
        order_id: order.orderId,
        name: 'Association Billing',
        description,
        theme: { color: '#d97706' },
        modal: {
          ondismiss: () => {
            prefetchedOrder.current = null;
            setStep('idle');
          },
        },
        handler: (response) => {
          // 1. Free the button immediately — user can navigate away.
          prefetchedOrder.current = null;
          setStep('idle');

          // 2. Non-blocking confirming toast — visible while verify runs in background.
          const toastId = toast.loading('Confirming payment…', {
            description: `₹${totalOutstanding.toLocaleString('en-IN')} received by Razorpay`,
          });

          // 3. Fallback: if verify takes >6s, refresh UI anyway and update toast.
          //    Webhook is the safety net for the actual DB write.
          const fallbackTimer = setTimeout(() => {
            toast.success('Payment received', {
              id: toastId,
              description: 'Your bills will be updated shortly.',
            });
            onSuccess?.();
          }, 6000);

          // 4. Verify in the background — updates DB; resolves the toast in place.
          fetch('/api/billing/razorpay/verify', {
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
          })
            .then((r) => r.json())
            .then((data: { paymentIds?: string[]; error?: string }) => {
              clearTimeout(fallbackTimer);
              if (data.paymentIds?.length) {
                toast.success('Payment confirmed', {
                  id: toastId,
                  description:
                    bills.length > 1
                      ? `${data.paymentIds.length} bill(s) settled.`
                      : 'Your receipt will be generated shortly.',
                });
              } else {
                toast.warning('Payment received — confirmation delayed', {
                  id: toastId,
                  description:
                    "Contact the association if it doesn't reflect within 24h.",
                  duration: Infinity,
                });
              }
              onSuccess?.();
            })
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
  }, [associationId, bills, paidByRole, step, totalOutstanding, onSuccess]);

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
      disabled={step !== 'idle' || totalOutstanding <= 0}
      className="gap-1.5"
    >
      {step !== 'idle' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : bills.length > 1 ? (
        <IndianRupee className="h-3.5 w-3.5" />
      ) : (
        <CreditCard className="h-3.5 w-3.5" />
      )}
      {step !== 'idle' ? 'Opening…' : buttonLabel}
    </Button>
  );
}
