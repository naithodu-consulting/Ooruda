'use client';

import * as XLSX from 'xlsx';

/**
 * Normalizes a header string: lowercase + trim + collapse internal spaces to underscore.
 * e.g. "UNIT NO" → "unit_no", "OWNER_NAME" → "owner_name"
 */
export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Parses a File (CSV or XLSX) into an array of row objects keyed by
 * normalized header names (lowercase, spaces → underscores). Returns a promise.
 */
export function parseSpreadsheetFile(
  file: File,
): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    if (file.name.toLowerCase().endsWith('.xlsx')) {
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]!]!;
          const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
            defval: '',
          });
          const rows = raw.map((r) => {
            const out: Record<string, string> = {};
            for (const k of Object.keys(r)) {
              out[normalizeHeader(k)] = String(r[k] ?? '').trim();
            }
            return out;
          });
          resolve(rows);
        } catch (e) {
          reject(e);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (ev) => {
        try {
          const text = ev.target!.result as string;
          const lines = text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);

          if (lines.length < 2) {
            resolve([]);
            return;
          }

          const headers = lines[0]!
            .split(',')
            .map((h) => normalizeHeader(h));
          const rows = lines.slice(1).map((line) => {
            const cells = line.split(',').map((c) => c.trim());
            const row: Record<string, string> = {};
            headers.forEach((h, i) => {
              row[h] = cells[i] ?? '';
            });
            return row;
          });
          resolve(rows);
        } catch (e) {
          reject(e);
        }
      };
      reader.readAsText(file);
    }

    reader.onerror = () => reject(reader.error);
  });
}

/** Builds and triggers download of an XLSX template from header + sample rows. */
export function downloadXlsxTemplate(
  filename: string,
  headers: string[],
  sampleRows: (string | number | null | undefined)[][],
) {
  const data = [headers, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, filename);
}
