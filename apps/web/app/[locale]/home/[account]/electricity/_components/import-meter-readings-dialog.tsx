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

import { formatPeriod } from '~/lib/format-period';
import {
  downloadXlsxTemplate,
  parseSpreadsheetFile,
} from '~/lib/parse-spreadsheet';

import { bulkImportMeterReadingsAction } from '../_lib/electricity-actions';

const REQUIRED_COLUMNS = ['sub_meter_no', 'current_meter_reading'] as const;

const COLUMN_ALIASES: Record<string, string> = {
  current_meter_reading: 'current_reading',
  min_charges: 'minimum_charge',
};

/** Returns YYYY-MM for the DB from a MM/YYYY display value */
function toDbPeriod(mmYyyy: string): string {
  const parts = mmYyyy.split('/');
  const mm = parts[0] ?? '';
  const yyyy = parts[1] ?? '';
  return `${yyyy}-${mm}`;
}

/** Generates the current month + last N-1 months, as MM/YYYY strings */
function getPeriodOptions(count = 7): { value: string; label: string }[] {
  const options = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    options.push({
      value: `${mm}/${yyyy}`,
      label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    });
  }
  return options;
}

type ParsedRow = {
  _row: number;
  sub_meter_no: string;
  current_reading: number;
  load_kva: number | null; // null = blank in CSV → preserve existing
  minimum_charge: number | null; // null = blank in CSV → preserve existing
  _error?: string;
};

function downloadTemplate() {
  downloadXlsxTemplate(
    'meter-readings-import-template.xlsx',
    ['SUB_METER_NO', 'LOAD_KVA', 'MIN_CHARGES', 'CURRENT_METER_READING'],
    [
      ['SM-1', 5, 50, 1250],
      ['SM-5', '', '', 980],
      ['Common-Lift', 10, 100, 320],
    ],
  );
}

function normaliseRow(r: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    out[COLUMN_ALIASES[k] ?? k] = v;
  }
  return out;
}

function parseRows(raw: Record<string, string>[]): ParsedRow[] {
  if (raw.length === 0) return [];

  // Normalise aliases before checking headers
  const normalised = raw.map(normaliseRow);
  const headers = Object.keys(normalised[0]!);

  // Check required columns (accounting for alias mapping)
  const effectiveHeaders = [...headers, ...Object.keys(raw[0]!)];
  const missing = REQUIRED_COLUMNS.filter(
    (c) =>
      !effectiveHeaders.includes(c) &&
      !effectiveHeaders.includes(COLUMN_ALIASES[c] ?? c),
  );

  if (missing.length > 0) {
    return [
      {
        _row: 0,
        sub_meter_no: '',
        current_reading: 0,
        load_kva: null,
        minimum_charge: null,
        _error: `Missing required columns: ${missing.join(', ')}`,
      },
    ];
  }

  // Collect duplicate labels
  const duplicates = new Set<string>();
  const labelCounts = new Map<string, number>();
  for (const r of normalised) {
    const label = (r['sub_meter_no'] ?? '').toLowerCase();
    if (label) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  for (const [label, count] of labelCounts) {
    if (count > 1) duplicates.add(label);
  }

  return normalised.map((r, i) => {
    const sub_meter_no = r['sub_meter_no'] ?? '';
    const currentRaw = r['current_reading'] ?? '';
    const currentReading = Math.round(Number(currentRaw) * 100) / 100;

    const loadKvaRaw = r['load_kva'] ?? '';
    const load_kva =
      loadKvaRaw === '' ? null : Math.round(Number(loadKvaRaw) * 100) / 100;

    const minChargeRaw = r['minimum_charge'] ?? '';
    const minimum_charge =
      minChargeRaw === '' ? null : Math.round(Number(minChargeRaw) * 100) / 100;

    let error: string | undefined;
    if (!sub_meter_no) {
      error = 'Sub-meter number is missing. Add it and re-upload.';
    } else if (duplicates.has(sub_meter_no.toLowerCase())) {
      error = `"${sub_meter_no}" appears more than once. Remove the duplicate and re-upload.`;
    } else if (currentRaw === '' || Number.isNaN(currentReading)) {
      error = 'Current reading must be a number. Fix it and re-upload.';
    } else if (currentReading < 0) {
      error = 'Current reading must be 0 or greater.';
    } else if (load_kva !== null && (Number.isNaN(load_kva) || load_kva <= 0)) {
      error = 'Load (kVA) must be a positive number.';
    } else if (
      minimum_charge !== null &&
      (Number.isNaN(minimum_charge) || minimum_charge < 0)
    ) {
      error = 'Minimum charge must be 0 or greater.';
    }

    return {
      _row: i + 1,
      sub_meter_no,
      current_reading: Number.isNaN(currentReading) ? 0 : currentReading,
      load_kva: Number.isNaN(load_kva ?? 0) ? null : load_kva,
      minimum_charge: Number.isNaN(minimum_charge ?? 0) ? null : minimum_charge,
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
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    periodOptions[0]!.value,
  );
  const [result, setResult] = useState<{
    imported: number;
    skipped: { row: number; sub_meter_no: string; reason: string }[];
  } | null>(null);

  // selectedPeriod is the MM/YYYY option value; never show it raw - every
  // period the operator sees reads as "August 2026".
  const selectedPeriodLabel = formatPeriod(toDbPeriod(selectedPeriod));

  const validRows = rows.filter((r) => !r._error);
  const invalidRows = rows.filter((r) => r._error);
  const hasHeaderError = rows[0]?._row === 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    parseSpreadsheetFile(file)
      .then((raw) => setRows(parseRows(raw)))
      .catch(() =>
        toast.error(
          'Failed to read the file. Please check it is a valid CSV or Excel file.',
        ),
      );
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
          ({ sub_meter_no, current_reading, load_kva, minimum_charge }) => ({
            sub_meter_no,
            current_reading,
            period: dbPeriod,
            load_kva,
            minimum_charge,
          }),
        ),
      );

      if (!res.success) {
        // Rejection reasons (e.g. the block-consumption overage) carry numbers
        // the operator needs to act on, so give them time to read it.
        toast.error(res.error ?? 'Import failed.', { duration: 10000 });
        return;
      }

      setResult({ imported: res.imported, skipped: res.skipped });

      if (res.imported > 0) {
        toast.success(
          `${res.imported} reading(s) imported for ${selectedPeriodLabel}.`,
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

      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Import meter readings</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            {/* Billing month selector */}
            {!result && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="billing-month-select">Billing Period</Label>
                <SearchableSelect
                  items={periodOptions}
                  value={selectedPeriod}
                  onChange={(v) => v && setSelectedPeriod(v)}
                  placeholder="Select a month"
                  searchPlaceholder="Search months…"
                  emptyMessage="No months found"
                  id="billing-month-select"
                  className="w-52"
                  data-test="import-readings-period"
                />
                <p className="text-muted-foreground text-xs">
                  Select the billing month. Previous reading and minimum charge
                  are auto-filled from sub-meter defaults.
                </p>
              </div>
            )}

            {/* File input */}
            {!result && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,text/csv"
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
                    className="text-warning h-10 w-10"
                    strokeWidth={1.5}
                  />
                  <p className="text-warning font-medium">
                    {fileName
                      ? fileName
                      : 'Drop CSV or Excel here, or click to browse'}
                  </p>
                </label>
              </div>
            )}

            {/* Instructions + template */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-muted-foreground text-sm">
                Required:{' '}
                <span className="font-medium">
                  SUB_METER_NO, CURRENT_METER_READING
                </span>
                <br />
                Optional:{' '}
                <span className="font-medium">LOAD_KVA, MIN_CHARGES.</span>{' '}
                Leave blank to carry forward last month&apos;s values
                automatically (0 for brand-new meters).
                <br />
                Sub-meter labels must match those registered in the system.
                Duplicate labels in the file are rejected.
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

                <div className="max-h-52 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Sub-meter</TableHead>
                        <TableHead>Load (kVA)</TableHead>
                        <TableHead>Min. Charge</TableHead>
                        <TableHead>Current Reading</TableHead>
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
                          <TableCell>{row.sub_meter_no || '-'}</TableCell>
                          <TableCell className="tabular-nums">
                            {row.load_kva != null ? row.load_kva : '-'}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {row.minimum_charge != null
                              ? row.minimum_charge
                              : '-'}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {row._error ? '-' : row.current_reading}
                          </TableCell>
                          <TableCell>
                            {row._error ? (
                              <span className="text-destructive flex items-start gap-1 text-xs break-words whitespace-normal">
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
                    successfully for <strong>{selectedPeriodLabel}</strong>.
                    {result.skipped.length > 0 && (
                      <> {result.skipped.length} row(s) were skipped.</>
                    )}
                  </AlertDescription>
                </Alert>

                {result.skipped.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border">
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
                            <TableCell className="text-destructive text-xs break-words whitespace-normal">
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
