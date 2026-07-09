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

import {
  type BulkImportRow,
  bulkImportUnitsAction,
} from '../_lib/units-actions';
import { UNIT_TYPES } from '../_lib/units-schema';

const REQUIRED_COLUMNS = ['unit_no', 'type', 'area_sqft'] as const;

// Accept column names as sent by associations (map → our internal names)
const COLUMN_ALIASES: Record<string, string> = {
  area: 'area_sqft',
  door_number: 'door_no',
};

type ParsedRow = BulkImportRow & {
  _row: number;
  _error?: string;
};

function downloadTemplate() {
  downloadXlsxTemplate(
    'units-import-template.xlsx',
    ['unit_no', 'type', 'floor', 'area_sqft', 'door_no'],
    [
      ['G-01', 'Shop', 0, 450, 'Door No. 101'],
      ['G-02', 'Shop', 0, 380, ''],
      ['1-01', 'Office', 1, 600, ''],
      ['CA-01', 'Common Area', '', 0, ''],
    ],
  );
}

function normalizeRow(r: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    out[COLUMN_ALIASES[k] ?? k] = v;
  }
  return out;
}

function parseRows(raw: Record<string, string>[]): ParsedRow[] {
  if (raw.length === 0) return [];

  const normalized = raw.map(normalizeRow);
  const headers = Object.keys(normalized[0]!);
  const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return [
      {
        _row: 0,
        unit_no: '',
        type: '',
        floor: null,
        area_sqft: '',
        _error: `Missing required columns: ${missing.join(', ')}`,
      },
    ];
  }

  return normalized.map((r, i) => {
    const unit_no = r['unit_no'] ?? '';
    const type = r['type'] ?? '';
    const floor = r['floor'] ?? '';
    let area_sqft = r['area_sqft'] ?? '';
    const door_no_raw = r['door_no'] ?? '';
    const door_no = door_no_raw === '' ? null : door_no_raw;

    const validType = UNIT_TYPES.includes(type as (typeof UNIT_TYPES)[number]);

    let error: string | undefined;
    if (!unit_no) error = 'unit_no is required';
    else if (!validType)
      error = `type must be one of: ${UNIT_TYPES.join(', ')}`;
    else {
      if (type === 'Common Area' && (!area_sqft || area_sqft === '')) {
        area_sqft = '0';
      }
      if (
        !area_sqft ||
        Number(area_sqft) < 0 ||
        (type !== 'Common Area' && Number(area_sqft) <= 0)
      ) {
        error =
          type === 'Common Area'
            ? 'area_sqft must be 0 or a positive number'
            : 'area_sqft must be greater than 0';
      }
    }

    if (
      !error &&
      floor !== '' &&
      (Number.isNaN(Number(floor)) || Number(floor) < -5 || Number(floor) > 200)
    )
      error = 'floor must be an integer between -5 and 200';

    return {
      _row: i + 1,
      unit_no,
      type,
      floor: floor === '' ? null : floor,
      area_sqft,
      door_no,
      _error: error,
    };
  });
}

export function ImportUnitsDialog({
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
    skipped: { row: number; unit_no: string; reason: string }[];
  } | null>(null);

  const validRows = rows.filter((r) => !r._error);
  const invalidRows = rows.filter((r) => r._error);
  const hasHeaderError = rows[0]?._row === 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResult(null);

    parseSpreadsheetFile(file).then((raw) => setRows(parseRows(raw)));
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
      const res = await bulkImportUnitsAction(
        associationId,
        validRows.map(({ unit_no, type, floor, area_sqft, door_no }) => ({
          unit_no,
          type,
          floor,
          area_sqft,
          door_no,
        })),
      );

      if (!res.success) {
        toast.error(res.error ?? 'Import failed.');
        return;
      }

      setResult({ imported: res.imported, skipped: res.skipped });

      if (res.imported > 0) {
        toast.success(`${res.imported} unit(s) imported.`);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" data-test="import-units-trigger">
            <Upload className="h-4 w-4" />
            Import Units
          </Button>
        }
      />

      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Bulk import — CSV / Excel</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-6">
            {/* File input */}
            {!result && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,text/csv"
                  className="hidden"
                  id="csv-upload"
                  onChange={handleFileChange}
                  data-test="csv-file-input"
                />
                <label
                  htmlFor="csv-upload"
                  className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-orange-500/50 px-6 py-10 text-center transition-colors hover:bg-orange-50/50 dark:hover:bg-orange-950/20"
                >
                  <CloudUpload
                    className="h-10 w-10 text-orange-500"
                    strokeWidth={1.5}
                  />
                  <p className="font-medium text-orange-600">
                    {fileName
                      ? fileName
                      : 'Drop CSV or Excel here, or click to browse'}
                  </p>
                </label>
              </div>
            )}

            {/* Template download and instructions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-muted-foreground text-sm">
                Columns:{' '}
                <span className="font-medium">unit_no, type, area_sqft</span>{' '}
                (required)
                <br />
                Optional: <span className="font-medium">floor, door_no</span>
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

                <div className="max-h-60 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Unit No</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Floor</TableHead>
                        <TableHead>Area (sq.ft)</TableHead>
                        <TableHead>Door No</TableHead>
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
                          <TableCell>{row.type || '—'}</TableCell>
                          <TableCell>
                            {row.floor === null || row.floor === ''
                              ? '—'
                              : row.floor}
                          </TableCell>
                          <TableCell>{row.area_sqft || '—'}</TableCell>
                          <TableCell>{row.door_no ?? '—'}</TableCell>
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
                    <strong>{result.imported}</strong> unit(s) imported
                    successfully.
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
                          <TableHead>Unit No</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.skipped.map((s) => (
                          <TableRow key={s.row} className="bg-destructive/5">
                            <TableCell className="text-xs">{s.row}</TableCell>
                            <TableCell>{s.unit_no}</TableCell>
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
