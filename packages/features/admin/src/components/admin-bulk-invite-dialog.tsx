'use client';

import { useRef, useState } from 'react';

import { AlertCircle, CheckCircle2, Download, Upload } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import {
  bulkInviteMembersAction,
  type BulkInviteResult,
  type BulkInviteRow,
} from '../lib/server/admin-server-actions';

const TEMPLATE_CSV = `phone,name,email,role,association_name\n9911000001,Rajesh Kumar,rajesh@example.com,prop_owner,Sunrise Apartments\n9922000002,Priya Shah,,tenant,Sunrise Apartments\n`;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bulk-invite-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

type Step = 'upload' | 'preview' | 'result';

const ROLE_LABELS: Record<string, string> = {
  assoc_admin: 'Assoc Admin',
  billing_operator: 'Billing Operator',
  prop_owner: 'Property Owner',
  tenant: 'Tenant',
};

export function AdminBulkInviteDialog(
  props: React.PropsWithChildren<Record<never, never>>,
) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<BulkInviteRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setRows([]);
    setParseError(null);
    setResult(null);
    setPending(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      if (typeof parsed === 'string') {
        setParseError(parsed);
        return;
      }
      setRows(parsed);
      setStep('preview');
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setPending(true);
    try {
      const res = await bulkInviteMembersAction(rows);
      setResult(res);
      setStep('result');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={props.children as React.ReactElement} />

      <DialogContent className="sm:max-w-2xl" style={{ maxWidth: '42rem' }}>
        <DialogHeader>
          <DialogTitle>Bulk Invite Members via CSV</DialogTitle>
          <DialogDescription>
            <span className="flex flex-col gap-1.5">
              <span>
                Upload a CSV file with these columns. Bad rows are skipped.
              </span>
              <code className="bg-muted text-foreground block w-fit rounded px-2 py-0.5 text-xs">
                phone, name, email (optional), role, association_name
              </code>
            </span>
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col gap-4">
            {parseError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Parse Error</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}

            <label
              htmlFor="bulk-invite-csv"
              className="border-muted-foreground/30 hover:border-primary/50 flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors"
            >
              <Upload className="text-muted-foreground h-8 w-8" />
              <span className="text-muted-foreground text-sm">
                Click to select a CSV file
              </span>
              <input
                id="bulk-invite-csv"
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>

            <div className="text-muted-foreground rounded-md border p-3 text-xs">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="font-semibold">Expected CSV format:</p>
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
              <pre className="font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap">
                {`phone,name,email,role,association_name\n9911000001,Rajesh Kumar,rajesh@example.com,prop_owner,Sunrise Apartments\n9922000002,Priya Shah,,tenant,Sunrise Apartments`}
              </pre>
              <p className="mt-2.5 flex flex-wrap gap-1">
                <span className="font-medium">Valid roles:</span>
                {[
                  'assoc_admin',
                  'billing_operator',
                  'prop_owner',
                  'tenant',
                ].map((r) => (
                  <code key={r} className="bg-background rounded px-1 py-0.5">
                    {r}
                  </code>
                ))}
              </p>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              {rows.length} row{rows.length !== 1 ? 's' : ''} parsed. Review
              before importing.
            </p>

            <div className="max-h-72 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Association</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground text-xs">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.phone}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.name || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {ROLE_LABELS[row.role] ?? row.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.association_name}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="flex flex-col gap-4">
            <Alert variant={result.imported > 0 ? 'default' : 'destructive'}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                {result.imported} member{result.imported !== 1 ? 's' : ''}{' '}
                invited successfully.
                {result.skipped.length > 0
                  ? ` ${result.skipped.length} row${result.skipped.length !== 1 ? 's' : ''} skipped.`
                  : ''}
              </AlertDescription>
            </Alert>

            {result.skipped.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Reason Skipped</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.skipped.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground text-xs">
                          {s.row}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.phone}
                        </TableCell>
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

        <div className="bg-popover -mx-4 -mb-4 flex flex-row justify-end gap-2 rounded-b-xl border-t p-4">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            disabled={pending}
          >
            {step === 'result' ? 'Close' : 'Cancel'}
          </Button>

          {step === 'preview' && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep('upload');
                  setRows([]);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                disabled={pending}
              >
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={pending || rows.length === 0}
              >
                {pending ? 'Importing…' : `Import ${rows.length} Members`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function parseCsv(text: string): BulkInviteRow[] | string {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2)
    return 'CSV must have a header row and at least one data row.';

  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  const phoneIdx = header.indexOf('phone');
  const nameIdx = header.indexOf('name');
  const emailIdx = header.indexOf('email');
  const roleIdx = header.indexOf('role');
  const assocIdx = header.indexOf('association_name');

  if (
    phoneIdx === -1 ||
    nameIdx === -1 ||
    roleIdx === -1 ||
    assocIdx === -1
  ) {
    return 'CSV must have columns: phone, name, role, association_name (email is optional).';
  }

  const rows: BulkInviteRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.trim());
    const phone = cols[phoneIdx] ?? '';
    const name = cols[nameIdx] ?? '';
    const email = emailIdx !== -1 ? (cols[emailIdx] ?? '') : '';
    const role = cols[roleIdx] ?? '';
    const association_name = cols[assocIdx] ?? '';

    if (!phone || !name || !role || !association_name) continue;

    rows.push({
      phone,
      name,
      email,
      role,
      association_name,
    });
  }

  if (rows.length === 0) return 'No valid data rows found in the CSV.';
  return rows;
}
