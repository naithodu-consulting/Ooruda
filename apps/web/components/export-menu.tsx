'use client';

import { useRef, useState } from 'react';

import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { toast } from '@kit/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@kit/ui/tooltip';

const PDF_WARN_THRESHOLD = 200;
const PDF_MAX = 300;

interface ExportMenuProps {
  /** All currently-filtered row IDs (used for PDF) */
  ids: string[];
  /** Total row count — controls button label and warning threshold */
  count: number;
  /** Noun shown in button label, e.g. "bills" or "payments" */
  noun: string;
  /** Called when user picks CSV — caller performs the actual download */
  onCsvExport: () => void;
  /** POST endpoint for PDF, e.g. /api/billing/bills/export/pdf */
  pdfEndpoint: string;
  /** Suggested filename for the downloaded PDF */
  pdfFilename?: string;
}

export function ExportMenu({
  ids,
  count,
  noun,
  onCsvExport,
  pdfEndpoint,
  pdfFilename = 'export.pdf',
}: ExportMenuProps) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const disabled = count === 0;
  const overWarning = count > PDF_WARN_THRESHOLD;
  const overMax = count > PDF_MAX;

  async function handlePdfExport() {
    if (pdfLoading) return;
    setPdfLoading(true);
    abortRef.current = new AbortController();

    const toastId = toast.loading('Preparing export…');

    try {
      const res = await fetch(pdfEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(json?.error ?? `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFilename;
      a.click();
      URL.revokeObjectURL(url);

      toast.dismiss(toastId);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      toast.dismiss(toastId);
      toast.error('Export failed — please try again.');
    } finally {
      setPdfLoading(false);
    }
  }

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || pdfLoading}
      className="h-9 gap-1.5 text-xs font-semibold"
      data-test="export-menu-trigger"
    >
      {pdfLoading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Download className="size-3.5" />
      )}
      Export {count > 0 ? `${count} ${noun}` : noun}
    </Button>
  );

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger render={trigger} />
        <TooltipContent>Nothing to export</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={onCsvExport}
          className="gap-2.5"
          data-test="export-csv"
        >
          <FileSpreadsheet className="size-4 shrink-0 text-green-600" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold">Download CSV</span>
            <span className="text-muted-foreground text-[10px]">
              Spreadsheet · instant
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handlePdfExport}
          disabled={overMax || pdfLoading}
          className="gap-2.5"
          data-test="export-pdf"
        >
          <FileText className="size-4 shrink-0 text-red-500" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold">Download PDF Report</span>
            {overMax ? (
              <span className="text-destructive text-[10px]">
                Too many rows — max {PDF_MAX}. Narrow filters.
              </span>
            ) : overWarning ? (
              <span className="text-[10px] text-amber-600">
                ⚠ Large export · may be slow
              </span>
            ) : (
              <span className="text-muted-foreground text-[10px]">
                Formatted report · server
              </span>
            )}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
