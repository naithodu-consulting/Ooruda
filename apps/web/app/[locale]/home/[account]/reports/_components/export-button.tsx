'use client';

import { useState, useTransition } from 'react';

import { Download, FileSpreadsheet, FileText } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';

import { downloadCsvAction, downloadPdfAction } from '../_lib/reports-actions';

interface Props {
  associationId: string;
  from: string;
  to: string;
  activeTab: string;
}

export function ExportButton({ associationId, from, to, activeTab }: Props) {
  const [isPending, startTransition] = useTransition();
  const [exportType, setExportType] = useState<'csv' | 'pdf' | null>(null);

  const handleCsv = () => {
    setExportType('csv');
    startTransition(async () => {
      const result = await downloadCsvAction(
        associationId,
        from,
        to,
        activeTab,
      );
      setExportType(null);
      if (!result.success) {
        toast.error(result.error ?? 'Could not generate CSV.');
        return;
      }
      const blob = new Blob([result.csv!], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename ?? 'report.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const handlePdf = () => {
    setExportType('pdf');
    startTransition(async () => {
      const result = await downloadPdfAction(associationId, from, to);
      setExportType(null);
      if (!result.success) {
        toast.error(result.error ?? 'Could not generate PDF.');
        return;
      }
      const binary = atob(result.base64!);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename ?? 'report.pdf';
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const loadingLabel =
    exportType === 'pdf' ? 'Generating PDF…' : 'Generating CSV…';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium shadow-xs transition-colors disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">
          {isPending ? loadingLabel : 'Export'}
        </span>
        <span className="sm:hidden">{isPending ? '…' : 'Export'}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
            Download report
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleCsv}
            disabled={isPending}
            className="flex items-start gap-3 py-2.5"
          >
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div className="flex flex-col">
              <span className="font-medium">Export CSV</span>
              <span className="text-muted-foreground text-xs">
                Current tab data as spreadsheet
              </span>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handlePdf}
            disabled={isPending}
            className="flex items-start gap-3 py-2.5"
          >
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div className="flex flex-col">
              <span className="font-medium">Export PDF</span>
              <span className="text-muted-foreground text-xs">
                Full report across all sections
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
