'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  Upload,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { SearchableSelect } from '@kit/ui/searchable-select';
import { toast } from '@kit/ui/sonner';
import { Spinner } from '@kit/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import {
  downloadXlsxTemplate,
  parseSpreadsheetFile,
} from '~/lib/parse-spreadsheet';

import { bulkImportOtherChargesAction } from '../_lib/billing-actions';

const REQUIRED_COLUMNS = ['unit_no', 'label', 'amount'] as const;

function getPeriodOptions(periods: string[]) {
  return periods.map((p) => ({
    value: p,
    label: new Date(`${p}-01T00:00:00`).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    }),
  }));
}

type ParsedRow = {
  _row: number;
  unit_no: string;
  label: string;
  amount: number;
  _error?: string;
};

interface Props {
  associationId: string;
  periods: string[];
  onSuccess?: () => void;
}

export function ImportOtherChargesDialog(props: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [period, setPeriod] = useState<string>(props.periods[0] ?? '');
  const [_file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [isPending, startTransition] = useTransition();

  const periodOptions = getPeriodOptions(props.periods);
  const hasErrors = rows.some((r) => r._error);
  const canSubmit = rows.length > 0 && !hasErrors && period;

  function downloadTemplate() {
    downloadXlsxTemplate(
      'other-charges-import-template.xlsx',
      ['unit_no', 'label', 'amount'],
      [
        ['G-01', 'Clubhouse Access fee', 500],
        ['1-02', 'Water charges excess', 250],
        ['2-03', 'Repairs reimbursement', 1200],
      ],
    );
  }

  function parseRawRows(raw: Record<string, string>[]): ParsedRow[] {
    if (raw.length === 0) return [];

    const headers = Object.keys(raw[0]!);
    if (!REQUIRED_COLUMNS.every((c) => headers.includes(c))) {
      toast.error(`File must contain columns: ${REQUIRED_COLUMNS.join(', ')}`);
      return [];
    }

    return raw.map((r, i) => {
      const unit_no = r['unit_no'] ?? '';
      const label = r['label'] ?? '';
      const amountRaw = r['amount'] ?? '';
      const amount = Math.round(parseFloat(amountRaw) * 100) / 100;

      let err: string | undefined;
      if (!unit_no) {
        err = 'Unit No is missing';
      } else if (!label) {
        err = 'Label is missing';
      } else if (isNaN(amount) || amount <= 0) {
        err = 'Amount must be positive';
      }

      return {
        _row: i + 1,
        unit_no,
        label,
        amount: isNaN(amount) ? 0 : amount,
        _error: err,
      };
    });
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setFileName(selected.name);

    parseSpreadsheetFile(selected).then((raw) => setRows(parseRawRows(raw)));
  };

  const handleImport = () => {
    if (!canSubmit) return;

    startTransition(async () => {
      const data = rows.map((r) => ({
        unit_no: r.unit_no,
        label: r.label,
        amount: r.amount,
      }));

      const res = await bulkImportOtherChargesAction(
        props.associationId,
        period,
        data,
      );

      if (!res.success) {
        toast.error(res.error ?? 'Failed to import other charges.');
        return;
      }

      if (res.skipped.length > 0) {
        toast.warning(
          `Imported ${res.imported} charges. ${res.skipped.length} rows skipped: \n` +
            res.skipped.slice(0, 5).join('\n'),
        );
      } else {
        toast.success(`Successfully imported ${res.imported} other charges.`);
      }

      // reset state
      setFile(null);
      setFileName('');
      setRows([]);
      setIsOpen(false);
      if (props.onSuccess) props.onSuccess();
      router.refresh();
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="gap-1.5">
            <Upload className="h-4 w-4" /> Import
          </Button>
        }
      />

      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="text-info h-5 w-5" />
            Import Other Charges
          </DialogTitle>
          <DialogDescription>
            Bulk import ad-hoc other charges for specific units from a CSV or
            Excel file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {/* Step 1: Billing Period */}
          <div className="bg-muted/20 flex flex-col gap-2 rounded-lg border p-3.5">
            <h4 className="text-muted-foreground flex items-center gap-1.5 text-sm font-bold tracking-wider uppercase">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
                1
              </span>
              Select Target Billing Period
            </h4>
            <div className="mt-1 w-64">
              <SearchableSelect
                items={periodOptions}
                value={period}
                onChange={(val) => setPeriod(val ?? '')}
                placeholder="Select period"
                searchPlaceholder="Search periods…"
                emptyMessage="No periods found"
                className="h-9"
                data-test="import-other-charges-period"
              />
            </div>
          </div>

          {/* Step 2: Upload CSV */}
          <div className="bg-muted/20 flex flex-col gap-2 rounded-lg border p-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-muted-foreground flex items-center gap-1.5 text-sm font-bold tracking-wider uppercase">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
                  2
                </span>
                Upload File
              </h4>
              <button
                type="button"
                onClick={downloadTemplate}
                className="text-info text-sm font-semibold hover:underline"
              >
                Download Template
              </button>
            </div>

            <div className="mt-1">
              <input
                type="file"
                accept=".csv,.xlsx,text/csv"
                id="other-charges-csv-upload"
                className="hidden"
                onChange={handleFileChange}
              />
              <label
                htmlFor="other-charges-csv-upload"
                className="border-muted-foreground/30 hover:bg-muted/10 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center transition-colors"
              >
                <Upload className="text-muted-foreground/60 mb-2 h-8 w-8" />
                <span className="text-base font-medium">
                  {fileName
                    ? fileName
                    : 'Drop CSV or Excel here, or click to browse'}
                </span>
                <span className="text-muted-foreground mt-1 text-sm">
                  Required columns: unit_no, label, amount
                </span>
              </label>
            </div>
          </div>

          {/* Step 3: Review Rows */}
          {rows.length > 0 && (
            <div className="flex min-h-[200px] flex-1 flex-col gap-2 rounded-lg border p-3.5">
              <h4 className="text-muted-foreground flex items-center justify-between text-sm font-bold tracking-wider uppercase">
                <span className="flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
                    3
                  </span>
                  Review Import Rows ({rows.length})
                </span>
                {hasErrors ? (
                  <span className="text-destructive flex items-center gap-1 font-semibold">
                    <AlertCircle className="h-3.5 w-3.5" /> Resolve errors
                    before importing
                  </span>
                ) : (
                  <span className="text-success flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> All rows are valid!
                  </span>
                )}
              </h4>

              <div className="mt-2 max-h-[250px] overflow-hidden overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0">
                    <TableRow>
                      <TableHead className="w-[80px]">Row</TableHead>
                      <TableHead>Unit No</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status/Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={row._row}
                        className={
                          row._error ? 'bg-red-50/50 dark:bg-red-950/20' : ''
                        }
                      >
                        <TableCell className="font-mono text-sm">
                          {row._row}
                        </TableCell>
                        <TableCell className="font-bold">
                          {row.unit_no}
                        </TableCell>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          ₹{row.amount}
                        </TableCell>
                        <TableCell>
                          {row._error ? (
                            <span className="text-destructive flex items-center gap-1 text-sm font-medium">
                              <AlertCircle className="h-3 w-3 shrink-0" />{' '}
                              {row._error}
                            </span>
                          ) : (
                            <span className="text-success flex items-center gap-1 text-sm font-medium">
                              <CheckCircle2 className="h-3 w-3 shrink-0" />{' '}
                              Ready
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFile(null);
              setFileName('');
              setRows([]);
              setIsOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={!canSubmit || isPending}
            className="gap-1.5"
          >
            {isPending ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <>
                Import {rows.length} Charges{' '}
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
