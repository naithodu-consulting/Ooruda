import { addDays } from '~/lib/villa-db/dates';

/**
 * Guest identity documents: masking, retention and the WhatsApp request
 * link. Pure (no I/O). The full ID number never leaves this module: callers
 * store only what maskIdNumber returns.
 */

export const ID_DOC_TYPES = [
  'aadhaar',
  'passport',
  'driving_licence',
  'voter_id',
] as const;

export type IdDocType = (typeof ID_DOC_TYPES)[number];

export const ID_DOC_TYPE_LABELS: Record<IdDocType, string> = {
  aadhaar: 'Aadhaar',
  passport: 'Passport',
  driving_licence: 'Driving licence',
  voter_id: 'Voter ID',
};

export function idDocTypeLabel(type: string): string {
  return ID_DOC_TYPE_LABELS[type as IdDocType] ?? type;
}

export type MaskResult =
  | { ok: true; masked: string | null }
  | { ok: false; message: string };

// Shape of the FULL number per type (after removing spaces and hyphens).
const FULL: Record<IdDocType, RegExp> = {
  aadhaar: /^[2-9][0-9]{11}$/,
  passport: /^[A-Z0-9]{6,12}$/,
  driving_licence: /^[A-Z0-9]{8,20}$/,
  voter_id: /^[A-Z0-9]{8,12}$/,
};

const HINT: Record<IdDocType, string> = {
  aadhaar: 'Enter the 12-digit Aadhaar number, or just its last 4 digits.',
  passport: 'Enter the passport number, or just its last 4 characters.',
  driving_licence: 'Enter the licence number, or just its last 4 characters.',
  voter_id: 'Enter the voter ID number, or just its last 4 characters.',
};

/**
 * Masks an ID number, keeping only the last 4 characters:
 * Aadhaar 2345 6789 0123 → 'XXXX XXXX 0123'; passport N1234567 → 'XXXX4567'.
 * Staff may type just the last 4 (a masked Aadhaar shows only those).
 * Empty input means "not noted" and is allowed.
 */
export function maskIdNumber(type: IdDocType, raw: string): MaskResult {
  const value = raw.toUpperCase().replace(/[\s-]/g, '');

  if (!value) return { ok: true, masked: null };

  if (!/^[A-Z0-9]+$/.test(value)) {
    return { ok: false, message: 'Use letters and digits only.' };
  }

  const lastFour = value.length === 4;

  if (!lastFour && !FULL[type].test(value)) {
    return { ok: false, message: HINT[type] };
  }

  if (type === 'aadhaar' && lastFour && !/^[0-9]{4}$/.test(value)) {
    return { ok: false, message: HINT.aadhaar };
  }

  const tail = value.slice(-4);

  return {
    ok: true,
    masked: type === 'aadhaar' ? `XXXX XXXX ${tail}` : `XXXX${tail}`,
  };
}

/** The date a stored ID file is deleted: check-out + the villa's retention. */
export function idPurgeDate(checkOut: string, retentionDays: number): string {
  return addDays(checkOut, Math.max(0, Math.floor(retentionDays)));
}

/** Magic bytes of the accepted file types; the browser's claim is not trusted. */
export function sniffIdFileType(
  head: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null {
  const at = (i: number) => head[i];

  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    return 'image/png';
  }
  if (
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  ) {
    return 'image/webp';
  }
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) {
    return 'application/pdf';
  }

  return null;
}

export const ID_FILE_MAX_BYTES = 10 * 1024 * 1024;
