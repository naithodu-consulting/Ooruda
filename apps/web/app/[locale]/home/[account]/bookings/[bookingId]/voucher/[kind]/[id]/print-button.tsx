'use client';

import { Printer } from 'lucide-react';

import { Button } from '@kit/ui/button';

export function PrintButton() {
  return (
    <Button
      variant="outline"
      onClick={() => window.print()}
      data-test={'villa-voucher-print'}
    >
      <Printer className="mr-1.5 h-4 w-4" />
      Print / Save as PDF
    </Button>
  );
}
