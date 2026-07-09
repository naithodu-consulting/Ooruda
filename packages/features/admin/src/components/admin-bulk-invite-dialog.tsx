'use client';

import { useRef, useState, useTransition } from 'react';

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
import { toast } from '@kit/ui/sonner';
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

// Association-supplied XLSX format headers (after normalizing)
const ASSOC_FORMAT_MARKER = 'owner_mobile_no';

function downloadTemplate() {
  const csv = `phone,name,email,role,association_name\n9911000001,Rajesh Kumar,rajesh@example.com,prop_owner,Sunrise Apartments\n9922000002,Priya Shah,,tenant,Sunrise Apartments\n`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bulk-invite-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Normalises a phone cell from an association XLSX.
 * Handles three real-world formats:
 *   - Excel numeric cells read as JS floats ("9876543210.0") → strip ".0"
 *   - Numbers with internal spaces ("94482 53545") → collapse whitespace
 *   - Trailing spaces ("9902335047 ") → trim
 * The result is a bare digit string; normalizePhoneNumber() adds the +91 prefix.
 */
function cleanPhoneCell(raw: string): string {
  return raw.replace(/\.0+$/, '').replace(/\s+/g, '').trim();
}

/**
 * Normalises a unit number cell from an association XLSX.
 * Excel stores numeric cells as floats, so "101" arrives as "101.0" when
 * SheetJS stringifies it. Strip the decimal part when the value is a whole number.
 */
function cleanUnitNo(raw: string): string {
  const trimmed = raw.trim();
  return /^\d+\.0+$/.test(trimmed)
    ? String(Math.round(parseFloat(trimmed)))
    : trimmed;
}

const UNIT_STATUS_MAP: Record<string, 'Self Occupied' | 'Rented' | 'Vacant'> = {
  'self occupied': 'Self Occupied',
  rented: 'Rented',
  vacant: 'Vacant',
};

/**
 * Maps the association XLSX UNIT_STATUS to our DB value.
 * Returns null if the value is unrecognised (treated as a validation error).
 */
function mapUnitStatus(
  raw: string,
): 'Self Occupied' | 'Rented' | 'Vacant' | null {
  return UNIT_STATUS_MAP[raw.trim().toLowerCase()] ?? null;
}

const COMPANY_SUFFIXES =
  /\b(llp|pvt\.?\s*ltd|private\s+limited|limited|ltd|llc|corp|inc|bank|fund|solutions|consulting|innovation|advisory|agencies|buildcon|infotech|management|realty|healthcare|design)\b/i;

/** Returns true when the name looks like a business entity rather than a person. */
function isCompanyName(name: string): boolean {
  return COMPANY_SUFFIXES.test(name.trim());
}

/**
 * Parses association-supplied XLSX format:
 * UNIT_NO, OWNER_NAME, OWNER_MOBILE_NO, OWNER_EMAIL_ADDRESS,
 * UNIT_STATUS, TENANT_OR_ORGANIZATION_NAME, TENANT_MOBILE_NO, TENANT_EMAIL_ADDRESS
 *
 * UNIT_STATUS is mandatory. Values:
 *   SELF OCCUPIED → Occupied, owner invite only (no tenant row)
 *   RENTED        → Occupied, owner + tenant invite rows
 *
 * Returns an error string if UNIT_STATUS is missing or invalid on any row.
 */
function parseAssocFormat(
  raw: Record<string, string>[],
  associationName: string,
): BulkInviteRow[] | string {
  const rows: BulkInviteRow[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]!;
    const unitNo = cleanUnitNo(r['unit_no'] ?? '');
    const unitStatusRaw = r['unit_status'] ?? '';

    if (!unitStatusRaw) {
      return `Row ${i + 1} (unit ${unitNo || '?'}): UNIT_STATUS is required.`;
    }

    const unitStatus = mapUnitStatus(unitStatusRaw);
    if (!unitStatus) {
      return `Row ${i + 1} (unit ${unitNo || '?'}): Unrecognised UNIT_STATUS "${unitStatusRaw}". Expected "SELF OCCUPIED", "RENTED", or "VACANT".`;
    }

    const isRented = unitStatusRaw.trim().toLowerCase() === 'rented';
    const isSelfOccupied =
      unitStatusRaw.trim().toLowerCase() === 'self occupied';

    const ownerPhone = cleanPhoneCell(r['owner_mobile_no'] ?? '');
    const ownerNameRaw = r['owner_name'] ?? '';
    // Split joint-person ownership (e.g. "UJWAL N SALIAN & HARSHALATHA U SALIAN") to
    // the first name only — one account per phone. Do NOT split if either side looks
    // like a company name (e.g. "Patel & Sons LLP", "Ernst & Young Advisory").
    const ownerName = (() => {
      if (!ownerNameRaw.includes(' & ')) return ownerNameRaw;
      const [first = '', second = ''] = ownerNameRaw.split(' & ', 2);
      if (isCompanyName(first.trim()) || isCompanyName(second.trim()))
        return ownerNameRaw;
      return first.trim();
    })();
    const ownerEmail = r['owner_email_address'] ?? '';

    const tenantNameRaw = r['tenant_or_organization_name'] ?? '';
    const tenantPhone = cleanPhoneCell(r['tenant_mobile_no'] ?? '');

    // For SELF OCCUPIED rows, the tenant column holds the occupying firm name
    // (grey "informational" cells used for billing). Only treat it as a company
    // name if it actually matches a business-entity pattern — avoids setting
    // owner_is_company=true when an individual's name appears in that cell.
    const selfOccupiedCompanyName =
      isSelfOccupied && tenantNameRaw && isCompanyName(tenantNameRaw)
        ? tenantNameRaw
        : undefined;

    // An owner name is a company if it matches common Indian business entity suffixes.
    // In that case we still invite the contact phone but also write owner_is_company + name.
    const ownerCompanyName =
      selfOccupiedCompanyName ??
      (isCompanyName(ownerName) ? ownerName : undefined);

    if (ownerPhone && ownerName) {
      rows.push({
        phone: ownerPhone,
        name: ownerName,
        email: ownerEmail,
        role: 'prop_owner',
        association_name: associationName,
        unit_no: unitNo || undefined,
        unit_status: unitStatus,
        owner_company_name: ownerCompanyName,
      });
    }

    if (isRented) {
      const tenantEmail = r['tenant_email_address'] ?? '';
      if (tenantPhone && tenantNameRaw) {
        rows.push({
          phone: tenantPhone,
          name: tenantNameRaw,
          email: tenantEmail,
          role: 'tenant',
          association_name: associationName,
          unit_no: unitNo || undefined,
          unit_status: unitStatus,
        });
      }
    }
  }

  if (rows.length === 0) {
    return 'No valid owner/tenant rows found in the file.';
  }
  return rows;
}

type Step = 'upload' | 'preview' | 'result';

const ROLE_LABELS: Record<string, string> = {
  assoc_admin: 'Assoc Admin',
  billing_operator: 'Billing Operator',
  prop_owner: 'Property Owner',
  tenant: 'Tenant',
};

interface AdminBulkInviteDialogProps {
  /** Pre-fill association name when opened from an association's units page */
  associationName?: string;
}

export function AdminBulkInviteDialog(
  props: React.PropsWithChildren<AdminBulkInviteDialogProps>,
) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<BulkInviteRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setRows([]);
    setParseError(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.xlsx')) {
      import('xlsx').then((XLSX) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = new Uint8Array(ev.target!.result as ArrayBuffer);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]!]!;
            const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
              defval: '',
            });
            const normalized = raw.map((r) => {
              const out: Record<string, string> = {};
              for (const k of Object.keys(r)) {
                out[normalizeHeader(k)] = String(r[k] ?? '').trim();
              }
              return out;
            });

            const isAssocFmt =
              normalized.length > 0 &&
              ASSOC_FORMAT_MARKER in (normalized[0] ?? {});

            if (isAssocFmt) {
              const assocName = props.associationName ?? '';
              if (!assocName) {
                setParseError(
                  'Could not detect the association name. Please use the standard CSV format.',
                );
                return;
              }
              const parsed = parseAssocFormat(normalized, assocName);
              if (typeof parsed === 'string') {
                setParseError(parsed);
                return;
              }
              setRows(parsed);
              setStep('preview');
            } else {
              setParseError(
                'Unrecognised XLSX format. Use the CSV template or the association-supplied member list.',
              );
            }
          } catch {
            setParseError('Failed to read the XLSX file. Please try again.');
          }
        };
        reader.readAsArrayBuffer(file);
      });
    } else {
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
    }
  };

  const handleImport = () => {
    startTransition(async () => {
      try {
        const res = await bulkInviteMembersAction(rows);
        setResult(res);
        setStep('result');
      } catch {
        toast.error('Import failed. Please try again.');
      }
    });
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
          <DialogTitle>Bulk Invite Members</DialogTitle>
          <DialogDescription>
            <span className="flex flex-col gap-1.5">
              <span>
                Upload a CSV or the association-supplied Excel file. Bad rows
                are skipped.
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
                Click to select a CSV or Excel (.xlsx) file
              </span>
              <input
                id="bulk-invite-csv"
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,text/csv"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>

            <div className="text-muted-foreground rounded-md border p-3 text-xs">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="font-semibold">Standard CSV format:</p>
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
              {props.associationName && (
                <p className="mt-2.5 border-t pt-2">
                  <span className="font-medium">Association Excel format</span>{' '}
                  also accepted for{' '}
                  <span className="font-semibold">{props.associationName}</span>
                  . <span className="font-medium">UNIT_STATUS</span> is
                  mandatory —{' '}
                  <code className="bg-background rounded px-1">
                    SELF OCCUPIED
                  </code>{' '}
                  invites owner only,{' '}
                  <code className="bg-background rounded px-1">RENTED</code>{' '}
                  invites owner + tenant. Unit status is saved to the database.
                </p>
              )}
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
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
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
                      <TableCell className="text-muted-foreground text-xs">
                        {row.unit_no || '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.unit_status ?? '—'}
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
            disabled={isPending}
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
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={isPending || rows.length === 0}
              >
                {isPending ? 'Importing…' : `Import ${rows.length} Members`}
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

  if (phoneIdx === -1 || nameIdx === -1 || roleIdx === -1 || assocIdx === -1) {
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
