'use client';

import { useRouter } from 'next/navigation';

import { ArrowLeft } from 'lucide-react';

export function BookingBackButton(props: { fallbackUrl: string }) {
  const router = useRouter();

  const handleBack = () => {
    if (
      typeof window !== 'undefined' &&
      window.history.length > 1 &&
      document.referrer &&
      document.referrer.includes(window.location.host)
    ) {
      router.back();
    } else {
      router.push(props.fallbackUrl);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="text-muted-foreground hover:text-foreground inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm font-medium transition-colors"
      data-test={'villa-booking-back'}
    >
      <ArrowLeft className="h-4 w-4" />
      All bookings
    </button>
  );
}
