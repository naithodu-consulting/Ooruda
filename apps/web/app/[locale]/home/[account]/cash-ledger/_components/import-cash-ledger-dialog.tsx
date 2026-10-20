'use client';

import { useTransition, useState } from 'react';

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  Upload,
} from 'lucide-react';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
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

import { bulkImportCashLedgerAction } from '../_lib/cash-ledger-actions';

const REQUIRED_COLUMNS = ['unit_no', 'type', 'bill_type', 'amount', 'paid_by'];

type ParsedRow = {
  _row: number;
  unit_no: string;
  type: string;
  bill_type: string;
  amount: number;
  paid_by: string;
  paid_on: string;
  _error?: string;
};

const FALLBACK_DATE = new Date().toISOString().slice(0, 10);

function parseRawRows(raw: Record<string, string>[]): ParsedRow[] {
  return raw.map((r, i) => {
    const row = i + 2;
    const unit_no = String(r['unit_no'] ?? '').trim();
    const type = String(r['type'] ?? '').trim();
    const bill_type = String(r['bill_type'] ?? '')
      .trim()
      .toLowerCase();
    const amountRaw = String(r['amount'] ?? '').trim();
    const paid_by = String(r['paid_by'] ?? '').trim();
    const paid_on = String(r['paid_on'] ?? '').trim() || FALLBACK_DATE;

    if (!unit_no)
      return {
        _row: row,
        unit_no,
        type,
        bill_type,
        amount: 0,
        paid_by,
        paid_on,
        _error: 'Unit number is missing. Add it and re-upload.',
      };
    if (!type)
      return {
        _row: row,
        unit_no,
        type,
        bill_type,
        amount: 0,
        paid_by,
        paid_on,
        _error: 'Entry type is missing. Use "Due" or "Advance Payment".',
      };
    if (
      ![
        'due',
        'Due',
        'advance payment',
        'Advance Payment',
        'advance_payment',
      ].includes(type)
    )
      return {
        _row: row,
        unit_no,
        type,
        bill_type,
        amount: 0,
        paid_by,
        paid_on,
        _error: `"${type}" is not a valid type. Use "Due" or "Advance Payment".`,
      };
    if (!bill_type)
      return {
        _row: row,
        unit_no,
        type,
        bill_type,
        amount: 0,
        paid_by,
        paid_on,
        _error: 'Bill type is missing. Add it and re-upload.',
      };
    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount <= 0)
      return {
        _row: row,
        unit_no,
        type,
        bill_type,
        amount: 0,
        paid_by,
        paid_on,
        _error: amountRaw
          ? `"${amountRaw}" is not a valid amount. Enter a number greater than 0.`
          : 'Amount is missing. Enter a number greater than 0.',
      };

    return { _row: row, unit_no, type, bill_type, amount, paid_by, paid_on };
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  associationId: string;
  onSuccess: () => void;
}

export function ImportCashLedgerDialog({
  open,
  onOpenChange,
  associationId,
  onSuccess,
}: Props) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const hasErrors = rows.some((r) => r._error);
  const validRows = rows.filter((r) => !r._error);

  function reset() {
    setStep('upload');
    setRows([]);
    setFileName('');
    setSkipped([]);
  }

  function downloadTemplate() {
    downloadXlsxTemplate(
      'cash-ledger-import-template.xlsx',
      ['unit_no', 'type', 'bill_type', 'amount', 'paid_by', 'paid_on'],
      [
        ['G-01', 'Due', 'maintenance', 5000, 'Ravi Kumar', '2026-03-31'],
        [
          '1-02',
          'Advance Payment',
          'electricity',
          3000,
          'Priya Sharma',
          '2026-04-15',
        ],
      ],
    );
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const raw = await parseSpreadsheetFile(file);
    if (!raw || raw.length === 0) {
      toast.error('No data found in the file');
      return;
    }

    // Validate required columns
    const missing = REQUIRED_COLUMNS.filter((col) => !(col in (raw[0] ?? {})));
    if (missing.length > 0) {
      toast.error(`Missing columns: ${missing.join(', ')}`);
      return;
    }

    setRows(parseRawRows(raw));
    setStep('preview');
  }

  function handleSubmit() {
    startTransition(async () => {
      const importRows = validRows.map((r) => ({
        unit_no: r.unit_no,
        entry_type: r.type,
        bill_type: r.bill_type,
        amount: r.amount,
        paid_by: r.paid_by,
        paid_on: r.paid_on,
      }));
      const result = await bulkImportCashLedgerAction(
        associationId,
        importRows,
      );
      if (result.success) {
        setSkipped(result.skipped);
        setStep('done');
        onSuccess();
        if (result.imported > 0) {
          toast.success(`Imported ${result.imported} entries`);
        }
      } else {
        toast.error(result.error ?? 'Import failed');
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="mx-4 max-w-3xl sm:mx-auto">
        <DialogHeader>
          <DialogTitle>Import Cash Ledger Entries</DialogTitle>
          <DialogDescription>
            Import dues and advance payments from a spreadsheet.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col gap-4">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Download Template
            </Button>

            <label className="hover:bg-muted/40 flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-8 text-center">
              <Upload className="text-muted-foreground h-8 w-8" />
              <span className="text-sm font-medium">
                Click to upload .xlsx or .csv
              </span>
              <span className="text-muted-foreground text-xs">
                Columns: unit_no, type, bill_type, amount, paid_by, paid_on
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-4">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4" />
              {fileName} - {rows.length} rows ({validRows.length} valid
              {hasErrors && `, ${rows.length - validRows.length} errors`})
            </div>

            {hasErrors && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Some rows have errors and will be skipped during import.
                </AlertDescription>
              </Alert>
            )}

            <div className="max-h-72 overflow-x-auto overflow-y-auto rounded border">
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Bill Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Paid By</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r._row}
                      className={r._error ? 'bg-destructive/5' : ''}
                    >
                      <TableCell className="text-muted-foreground text-xs">
                        {r._row}
                      </TableCell>
                      <TableCell>{r.unit_no}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell>{r.bill_type}</TableCell>
                      <TableCell>
                        {r._error ? (
                          <span className="text-destructive text-xs">
                            {r._error}
                          </span>
                        ) : (
                          `₹${r.amount}`
                        )}
                      </TableCell>
                      <TableCell>{r.paid_by}</TableCell>
                      <TableCell>{r.paid_on}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={validRows.length === 0 || isPending}
              >
                {isPending && <Spinner className="mr-2" />}
                <ChevronRight className="mr-1 h-4 w-4" />
                Import {validRows.length} Entries
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="text-success h-10 w-10" />
            <p className="font-medium">Import complete</p>
            {skipped.length > 0 && (
              <Alert>
                <AlertDescription>
                  <p className="mb-1 text-sm font-medium">
                    {skipped.length} rows were skipped:
                  </p>
                  <ul className="text-muted-foreground list-inside list-disc text-xs">
                    {skipped.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <Button
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
