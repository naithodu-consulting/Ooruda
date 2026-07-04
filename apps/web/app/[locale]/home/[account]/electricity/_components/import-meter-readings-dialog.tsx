'use client';

import { useRef, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  Download,
  Upload,
} from 'lucide-react';

import { Alert, AlertDescription } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { Label } from '@kit/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
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

import { bulkImportMeterReadingsAction } from '../_lib/electricity-actions';

// 3 required columns + 2 optional overrides for testing large datasets
const TEMPLATE_CSV = [
  'unit_no,sub_meter_no,current_reading,previous_reading,minimum_charge',
  'G-01,SM-1,1250,,',
  '1-02,SM-5,980,900,150',
  'COMMON,Common-Lift,320,,',
].join('\n');

const REQUIRED_COLUMNS = [
  'unit_no',
  'sub_meter_no',
  'current_reading',
] as const;

/** Returns YYYY-MM for the DB from a MM/YYYY display value */
function toDbPeriod(mmYyyy: string): string {
  const [mm, yyyy] = mmYyyy.split('/');
  return `${yyyy}-${mm}`;
}

/** Generates the last N months including current, as MM/YYYY strings */
function getPeriodOptions(count = 7): { value: string; label: string }[] {
  const options = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    const mmYyyy = `${mm}/${yyyy}`;
    options.push({
      value: mmYyyy,
      label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    });
  }
  return options;
}

type ParsedRow = {
  _row: number;
  unit_no: string;
  sub_meter_no: string;
  current_reading: number;
  previous_reading?: number; // optional override — only used when > 0
  minimum_charge?: number;   // optional override — only used when > 0
  _error?: string;
};

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'meter-readings-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0]!.split(',').map((h) => h.trim().toLowerCase());

  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return [
      {
        _row: 0,
        unit_no: '',
        sub_meter_no: '',
        current_reading: 0,
        _error: `Missing required columns: ${missing.join(', ')}`,
      },
    ];
  }

  const col = (name: string) => headers.indexOf(name);
  const hasCol = (name: string) => headers.includes(name);

  return lines.slice(1).map((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    const get = (name: string) => cells[col(name)] ?? '';

    const unit_no = get('unit_no');
    const sub_meter_no = get('sub_meter_no');
    const currentReadingRaw = get('current_reading');
    const currentReading = Number(currentReadingRaw);

    // Optional overrides — treated as absent when blank or non-positive
    const prevRaw = hasCol('previous_reading') ? get('previous_reading') : '';
    const prevNum = prevRaw !== '' ? Number(prevRaw) : NaN;
    const previous_reading =
      !Number.isNaN(prevNum) && prevNum > 0 ? prevNum : undefined;

    const minRaw = hasCol('minimum_charge') ? get('minimum_charge') : '';
    const minNum = minRaw !== '' ? Number(minRaw) : NaN;
    const minimum_charge =
      !Number.isNaN(minNum) && minNum > 0 ? minNum : undefined;

    let error: string | undefined;
    if (!unit_no) error = 'unit_no is required';
    else if (!sub_meter_no) error = 'sub_meter_no is required';
    else if (
      !currentReadingRaw ||
      Number.isNaN(currentReading) ||
      currentReading < 0
    )
      error = 'current_reading must be a non-negative number';

    return {
      _row: i + 1,
      unit_no,
      sub_meter_no,
      current_reading: currentReading,
      previous_reading,
      minimum_charge,
      _error: error,
    };
  });
}

export function ImportMeterReadingsDialog({
  associationId,
}: {
  associationId: string;
}) {
  const periodOptions = getPeriodOptions(7);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  // Default to current month (first option)
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    periodOptions[0]!.value,
  );
  const [result, setResult] = useState<{
    imported: number;
    skipped: { row: number; sub_meter_no: string; reason: string }[];
  } | null>(null);

  const validRows = rows.filter((r) => !r._error);
  const invalidRows = rows.filter((r) => r._error);
  const hasHeaderError = rows[0]?._row === 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRows(parseCSV(text));
    };
    reader.readAsText(file);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setRows([]);
      setFileName('');
      setResult(null);
      setSelectedPeriod(periodOptions[0]!.value);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleImport() {
    if (validRows.length === 0) return;

    const dbPeriod = toDbPeriod(selectedPeriod);

    startTransition(async () => {
      const res = await bulkImportMeterReadingsAction(
        associationId,
        validRows.map(
          ({ unit_no, sub_meter_no, current_reading, previous_reading, minimum_charge }) => ({
            unit_no,
            sub_meter_no,
            current_reading,
            period: dbPeriod,
            previous_reading_override: previous_reading,
            minimum_charge_override: minimum_charge,
          }),
        ),
      );

      if (!res.success) {
        toast.error(res.error ?? 'Import failed.');
        return;
      }

      setResult({ imported: res.imported, skipped: res.skipped });

      if (res.imported > 0) {
        toast.success(
          `${res.imported} reading(s) imported for ${selectedPeriod}.`,
        );
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            data-test="import-readings-trigger"
          >
            <Upload className="h-4 w-4" />
            Import Readings
          </Button>
        }
      />

      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex flex-col gap-6 p-6">
          <DialogHeader>
            <DialogTitle>Import meter readings</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            {/* Billing month selector */}
            {!result && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="billing-month-select">Billing month</Label>
                <Select
                  items={periodOptions}
                  value={selectedPeriod}
                  onValueChange={(v) => v && setSelectedPeriod(v)}
                >
                  <SelectTrigger id="billing-month-select" className="w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periodOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  All readings in this import will be recorded for the selected
                  month. Previous readings are auto-filled from the last
                  recorded bill.
                </p>
              </div>
            )}

            {/* File input */}
            {!result && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  id="readings-csv-upload"
                  onChange={handleFileChange}
                  data-test="readings-csv-file-input"
                />
                <label
                  htmlFor="readings-csv-upload"
                  className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-orange-500/50 px-6 py-10 text-center transition-colors hover:bg-orange-50/50 dark:hover:bg-orange-950/20"
                >
                  <CloudUpload
                    className="h-10 w-10 text-orange-500"
                    strokeWidth={1.5}
                  />
                  <p className="font-medium text-orange-600">
                    {fileName ? fileName : 'Drop CSV here, or click to browse'}
                  </p>
                </label>
              </div>
            )}

            {/* Instructions + template */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-muted-foreground text-sm">
                Required:{' '}
                <span className="font-medium">
                  unit_no, sub_meter_no, current_reading
                </span>
                <br />
                Optional:{' '}
                <span className="font-medium">
                  previous_reading, minimum_charge
                </span>{' '}
                — leave blank to use existing values.
                <br />
                For common-area meters use{' '}
                <span className="font-medium">COMMON</span> as unit_no.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
                type="button"
                className="shrink-0"
              >
                <Download className="mr-1.5 h-4 w-4" />
                Template
              </Button>
            </div>

            {/* Header error */}
            {hasHeaderError && rows[0]?._error && (
              <Alert variant="destructive" className="bg-transparent">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{rows[0]._error}</AlertDescription>
              </Alert>
            )}

            {/* Preview table */}
            {!hasHeaderError && rows.length > 0 && !result && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Preview</span>
                  <Badge variant="default" className="text-xs">
                    {validRows.length} valid
                  </Badge>
                  {invalidRows.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {invalidRows.length} invalid
                    </Badge>
                  )}
                </div>

                <div className="max-h-52 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Sub-meter</TableHead>
                        <TableHead>Prev</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Min charge</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow
                          key={row._row}
                          className={row._error ? 'bg-destructive/5' : ''}
                        >
                          <TableCell className="text-muted-foreground text-xs">
                            {row._row}
                          </TableCell>
                          <TableCell>{row.unit_no || '—'}</TableCell>
                          <TableCell>{row.sub_meter_no || '—'}</TableCell>
                          <TableCell className="text-muted-foreground tabular-nums text-xs">
                            {row.previous_reading ?? '—'}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {row._error ? '—' : row.current_reading}
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums text-xs">
                            {row.minimum_charge ?? '—'}
                          </TableCell>
                          <TableCell>
                            {row._error ? (
                              <span className="text-destructive flex items-center gap-1 text-xs">
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                {row._error}
                              </span>
                            ) : (
                              <CheckCircle2 className="text-success h-4 w-4" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {invalidRows.length > 0 && validRows.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    Invalid rows will be skipped. Only valid rows will be
                    imported.
                  </p>
                )}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="flex flex-col gap-3">
                <Alert className="bg-transparent">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{result.imported}</strong> reading(s) imported
                    successfully for <strong>{selectedPeriod}</strong>.
                    {result.skipped.length > 0 && (
                      <> {result.skipped.length} row(s) were skipped.</>
                    )}
                  </AlertDescription>
                </Alert>

                {result.skipped.length > 0 && (
                  <div className="max-h-40 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Sub-meter</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.skipped.map((s) => (
                          <TableRow key={s.row} className="bg-destructive/5">
                            <TableCell className="text-xs">{s.row}</TableCell>
                            <TableCell>{s.sub_meter_no}</TableCell>
                            <TableCell className="text-destructive text-xs">
                              {s.reason}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="bg-muted mx-0 mb-0 flex gap-2 rounded-none border-t px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={validRows.length === 0 || isPending}
            >
              {isPending && <Spinner className="mr-2 h-4 w-4" />}
              Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
