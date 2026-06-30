'use client';

import { Download } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@kit/ui/tooltip';

interface DownloadPdfButtonProps {
  href: string;
  label: string;
  dataTest: string;
  variant?: 'outline' | 'ghost';
  /** Icon + visible text (use where it sits among other labeled buttons). */
  showLabel?: boolean;
  /** Icon-only size when showLabel is false. */
  iconSize?: 'icon-xs' | 'icon-sm';
}

/**
 * A bare `<Download />` icon with no visible text reads as decoration, not a
 * control — every download affordance in the billing/payments UI goes
 * through this component so it's always either a labeled button or an
 * icon button with a tooltip + aria-label, never a naked icon link.
 */
export function DownloadPdfButton({
  href,
  label,
  dataTest,
  variant = 'outline',
  showLabel = false,
  iconSize = 'icon-sm',
}: DownloadPdfButtonProps) {
  if (showLabel) {
    return (
      <Button
        size="sm"
        variant={variant}
        data-test={dataTest}
        render={<a href={href} download />}
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size={iconSize}
              variant={variant}
              data-test={dataTest}
              aria-label={label}
              render={<a href={href} download />}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
