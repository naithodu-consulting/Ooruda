'use client';

import { useState } from 'react';

import { Download, Loader2 } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';
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
 * control - every download affordance in the billing/payments UI goes
 * through this component so it's always either a labeled button or an
 * icon button with a tooltip + aria-label, never a naked icon link.
 *
 * Uses fetch + Blob to trigger the download programmatically so we can show
 * a loading spinner during the (potentially slow) PDF generation request.
 */
/**
 * Freshly rendered PDFs carry their name in Content-Disposition. Cached ones
 * arrive via a redirect to a signed Storage URL, where that header isn't
 * readable cross-origin, so the name travels in the URL's `download` param.
 */
function downloadFilename(res: Response, fallback: string): string {
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fromHeader = disposition.match(/filename="([^"]+)"/)?.[1];

  if (fromHeader) return fromHeader;

  try {
    // supabase-js encodes the query and then encodeURI()s the whole URL, so
    // the value arrives percent-encoded one level deeper than usual.
    const fromUrl = new URL(res.url).searchParams.get('download');
    if (fromUrl) return decodeURIComponent(fromUrl);
  } catch {
    // Fall through to the label-based name.
  }

  return `${fallback}.pdf`;
}

export function DownloadPdfButton({
  href,
  label,
  dataTest,
  variant = 'outline',
  showLabel = false,
  iconSize = 'icon-sm',
}: DownloadPdfButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);

    try {
      const res = await fetch(href);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      a.download = downloadFilename(res, label);

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download the PDF. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const icon = loading ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
  ) : (
    <Download className="h-3.5 w-3.5" />
  );

  if (showLabel) {
    return (
      <Button
        size="sm"
        variant={variant}
        data-test={dataTest}
        disabled={loading}
        onClick={handleDownload}
        className="w-[110px] justify-center"
      >
        {icon}
        {loading ? 'Generating…' : 'Download'}
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
              aria-label={loading ? 'Generating PDF…' : label}
              disabled={loading}
              onClick={handleDownload}
            >
              {icon}
            </Button>
          }
        />
        <TooltipContent>{loading ? 'Generating PDF…' : label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
