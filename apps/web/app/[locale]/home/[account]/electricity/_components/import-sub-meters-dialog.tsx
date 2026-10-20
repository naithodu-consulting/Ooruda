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

import { bulkImportSubMetersAction } from '../_lib/electricity-actions';

// For CommonArea rows, unit_no MUST be "COMMON" - the backend attaches them to
// the first unit as an FK placeholder. The label (sub_meter_no) is what
// identifies them during meter-readings import.

const REQUIRED_COLUMNS = ['unit_no', 'sub_meter_no', 'meter_type'] as const;
const VALID_METER_TYPES = ['Unit', 'CommonArea'] as const;

const COLUMN_ALIASES: Record<string, string> = {
  initial_meter_reading: 'initial_reading',
};

type ParsedRow = {
  _row: number;
  unit_no: string;
  sub_meter_no: string;
  meter_type: 'Unit' | 'CommonArea' | '';
  initial_reading: number;
  _error?: string;
};

function downloadTemplate() {
  downloadXlsxTemplate(
    'sub-meters-import-template.xlsx',
    ['unit_no', 'sub_meter_no', 'meter_type', 'initial_meter_reading'],
    [
      ['G-01', 'SM-1', 'Unit', 1250],
      ['1-02', 'SM-5', 'Unit', 980],
      ['COMMON', 'Common-Lift', 'CommonArea', 320],
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

function parseNum(raw: string): number | null {
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : Math.round(n * 100) / 100;
}

function parseRows(raw: Record<string, string>[]): ParsedRow[] {
  if (raw.length === 0) return [];

  const normalised = raw.map(normaliseRow);
  const headers = Object.keys(normalised[0]!);
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));

  if (missing.length > 0) {
    return [
      {
        _row: 0,
        unit_no: '',
        sub_meter_no: '',
        meter_type: '',
        initial_reading: 0,
        _error: `Missing required columns: ${missing.join(', ')}`,
      },
    ];
  }

  return normalised.map((r, i) => {
    const unit_no = r['unit_no'] ?? '';
    const sub_meter_no = r['sub_meter_no'] ?? '';
    const meter_type_raw = r['meter_type'] ?? '';
    const meter_type = VALID_METER_TYPES.find(
      (t) => t.toLowerCase() === meter_type_raw.toLowerCase(),
    );

    const initial_reading_raw = r['initial_reading'] ?? '';
    const initial_reading_parsed = parseNum(initial_reading_raw);
    const initial_reading = initial_reading_parsed ?? 0;

    let error: string | undefined;
    if (!unit_no) error = 'Unit number is missing. Add it and re-upload.';
    else if (!sub_meter_no)
      error = 'Sub-meter number is missing. Add it and re-upload.';
    else if (!meter_type)
      error = `"${meter_type_raw}" is not a valid meter type. Use "Unit" or "CommonArea".`;
    else if (meter_type === 'CommonArea' && unit_no.toUpperCase() !== 'COMMON')
      error = 'Common area meters must have "COMMON" as the unit number.';
    else if (initial_reading_raw !== '' && initial_reading_parsed === null)
      error = 'Initial reading must be a number. Fix it and re-upload.';
    else if (initial_reading < 0)
      error = 'Initial reading must be 0 or greater.';

    return {
      _row: i + 1,
      unit_no,
      sub_meter_no,
      meter_type: (meter_type ?? '') as 'Unit' | 'CommonArea' | '',
      initial_reading,
      _error: error,
    };
  });
}

export function ImportSubMetersDialog({
  associationId,
}: {
  associationId: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
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
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleImport() {
    if (validRows.length === 0) return;
    startTransition(async () => {
      const res = await bulkImportSubMetersAction(
        associationId,
        validRows.map(
          ({ unit_no, sub_meter_no, meter_type, initial_reading }) => ({
            unit_no,
            sub_meter_no,
            meter_type: meter_type as 'Unit' | 'CommonArea',
            initial_reading,
          }),
        ),
      );

      if (!res.success) {
        toast.error(res.error ?? 'Import failed.');
        return;
      }

      setResult({ imported: res.imported, skipped: res.skipped });
      if (res.imported > 0) {
        toast.success(`${res.imported} sub-meter(s) imported.`);
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
            data-test="import-sub-meters-trigger"
          >
            <Upload className="h-4 w-4" />
            Import Sub-meters
          </Button>
        }
      />

      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Import sub-meters</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            {/* File input */}
            {!result && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,text/csv"
                  className="hidden"
                  id="sub-meters-csv-upload"
                  onChange={handleFileChange}
                  data-test="sub-meters-csv-file-input"
                />
                <label
                  htmlFor="sub-meters-csv-upload"
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
                  unit_no, sub_meter_no, meter_type
                </span>
                <br />
                Optional:{' '}
                <span className="font-medium">initial_meter_reading</span>
                <br />
                <span className="font-medium">meter_type</span>:{' '}
                <span className="font-medium">Unit</span> or{' '}
                <span className="font-medium">CommonArea</span>. For common-area
                meters use <span className="font-medium">COMMON</span> as
                unit_no.
                <br />
                <span className="font-medium">initial_meter_reading</span> is
                last month&apos;s reading at onboarding, used as the baseline
                for the first bill.
                <br />
                Existing sub-meters are skipped (no overwrite).
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
                        <TableHead>Unit</TableHead>
                        <TableHead>Sub-meter</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Init. Reading</TableHead>
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
                          <TableCell>{row.unit_no || '-'}</TableCell>
                          <TableCell>{row.sub_meter_no || '-'}</TableCell>
                          <TableCell>{row.meter_type || '-'}</TableCell>
                          <TableCell className="tabular-nums">
                            {row.initial_reading}
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

            {/* Result */}
            {result && (
              <div className="flex flex-col gap-3">
                <Alert className="bg-transparent">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{result.imported}</strong> sub-meter(s) imported
                    successfully.
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
