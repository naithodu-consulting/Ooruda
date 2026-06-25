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
  type BulkImportRow,
  bulkImportUnitsAction,
} from '../_lib/units-actions';
import { UNIT_TYPES } from '../_lib/units-schema';

const TEMPLATE_CSV = `unit_no,type,floor,area_sqft\nG-01,Shop,0,450\nG-02,Shop,0,380\n1-01,Office,1,600\n`;

const REQUIRED_COLUMNS = ['unit_no', 'type', 'area_sqft'] as const;

type ParsedRow = BulkImportRow & {
  _row: number;
  _error?: string;
};

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'units-import-template.csv';
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
        type: '',
        floor: null,
        area_sqft: '',
        _error: `Missing required columns: ${missing.join(', ')}`,
      },
    ];
  }

  const col = (name: string) => headers.indexOf(name);

  return lines.slice(1).map((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    const get = (name: string) => cells[col(name)] ?? '';

    const unit_no = get('unit_no');
    const type = get('type');
    const floor = get('floor');
    const area_sqft = get('area_sqft');

    const validType = UNIT_TYPES.includes(type as (typeof UNIT_TYPES)[number]);

    let error: string | undefined;
    if (!unit_no) error = 'unit_no is required';
    else if (!validType)
      error = `type must be one of: ${UNIT_TYPES.join(', ')}`;
    else if (!area_sqft || Number(area_sqft) <= 0)
      error = 'area_sqft must be a positive number';
    else if (
      floor !== '' &&
      floor !== undefined &&
      (Number.isNaN(Number(floor)) || Number(floor) < -5 || Number(floor) > 200)
    )
      error = 'floor must be an integer between -5 and 200';

    return {
      _row: i + 1,
      unit_no,
      type,
      floor: floor === '' ? null : floor,
      area_sqft,
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
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleImport() {
    if (validRows.length === 0) return;

    startTransition(async () => {
      const res = await bulkImportUnitsAction(
        associationId,
        validRows.map(({ unit_no, type, floor, area_sqft }) => ({
          unit_no,
          type,
          floor,
          area_sqft,
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
            Import CSV
          </Button>
        }
      />

      <DialogContent className="sm:max-w-2xl">
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
                accept=".csv,text/csv"
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
          <div className="flex items-start justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              Columns:{' '}
              <span className="font-medium">unit_no, type, area_sqft</span>{' '}
              (required)
              <br />
              Optional: <span className="font-medium">floor</span>
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
            <Alert variant="destructive">
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
              <Alert>
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

        <DialogFooter>
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
