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

import { bulkImportSubMetersAction } from '../_lib/electricity-actions';

const TEMPLATE_CSV = [
  'unit_no,sub_meter_no,meter_type,load_kva',
  'G-01,SM-1,Unit,5',
  '1-02,SM-5,Unit,',
  'COMMON,Common-Lift,CommonArea,10',
].join('\n');
// For CommonArea rows, unit_no MUST be "COMMON" — the backend attaches them to
// the first unit as an FK placeholder. The label (sub_meter_no) is what
// identifies them during meter-readings import.

const REQUIRED_COLUMNS = ['unit_no', 'sub_meter_no', 'meter_type'] as const;
const VALID_METER_TYPES = ['Unit', 'CommonArea'] as const;

type ParsedRow = {
  _row: number;
  unit_no: string;
  sub_meter_no: string;
  meter_type: 'Unit' | 'CommonArea' | '';
  load_kva: number | null;
  _error?: string;
};

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sub-meters-import-template.csv';
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
        meter_type: '',
        load_kva: null,
        _error: `Missing required columns: ${missing.join(', ')}`,
      },
    ];
  }

  const col = (name: string) => headers.indexOf(name);

  return lines.slice(1).map((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    const get = (name: string) => cells[col(name)] ?? '';

    const unit_no = get('unit_no');
    const sub_meter_no = get('sub_meter_no');
    const meter_type_raw = get('meter_type');
    const meter_type = VALID_METER_TYPES.find(
      (t) => t.toLowerCase() === meter_type_raw.toLowerCase(),
    );
    const load_kva_raw = get('load_kva');
    const load_kva =
      load_kva_raw === ''
        ? null
        : Number.isNaN(Number(load_kva_raw))
          ? null
          : Number(load_kva_raw);

    let error: string | undefined;
    if (!unit_no) error = 'unit_no is required';
    else if (!sub_meter_no) error = 'sub_meter_no is required';
    else if (!meter_type)
      error = `meter_type must be "Unit" or "CommonArea" (got "${meter_type_raw}")`;
    else if (
      meter_type === 'CommonArea' &&
      unit_no.toUpperCase() !== 'COMMON'
    )
      error =
        'For CommonArea meters, unit_no must be "COMMON" (it is ignored by the system)';
    else if (load_kva_raw !== '' && load_kva !== null && load_kva <= 0)
      error = 'load_kva must be a positive number';

    return {
      _row: i + 1,
      unit_no,
      sub_meter_no,
      meter_type: (meter_type ?? '') as 'Unit' | 'CommonArea' | '',
      load_kva,
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
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRows(parseCSV(ev.target?.result as string));
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
      const res = await bulkImportSubMetersAction(
        associationId,
        validRows.map(({ unit_no, sub_meter_no, meter_type, load_kva }) => ({
          unit_no,
          sub_meter_no,
          meter_type: meter_type as 'Unit' | 'CommonArea',
          load_kva,
        })),
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

      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex flex-col gap-6 p-6">
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
                  accept=".csv,text/csv"
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
                  unit_no, sub_meter_no, meter_type
                </span>
                <br />
                Optional: <span className="font-medium">load_kva</span>{' '}
                (sanctioned load in kVA)
                <br />
                <span className="font-medium">meter_type</span> must be{' '}
                <span className="font-medium">Unit</span> or{' '}
                <span className="font-medium">CommonArea</span>.
                <br />
                For common-area meters use{' '}
                <span className="font-medium">COMMON</span> as unit_no — the
                backend ignores it and uses the first unit as an FK anchor.
                <br />
                Existing sub-meters are skipped — no overwrite.
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
                        <TableHead>Type</TableHead>
                        <TableHead>Load (kVA)</TableHead>
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
                          <TableCell>{row.meter_type || '—'}</TableCell>
                          <TableCell>
                            {row.load_kva != null ? row.load_kva : '—'}
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
