import { describe, expect, it } from 'vitest';

import { idPurgeDate, maskIdNumber, sniffIdFileType } from './guest-ids';

describe('maskIdNumber', () => {
  it('masks a full Aadhaar number to its last 4', () => {
    expect(maskIdNumber('aadhaar', '2345 6789 0123')).toEqual({
      ok: true,
      masked: 'XXXX XXXX 0123',
    });
  });

  it('accepts only the last 4 (masked Aadhaar)', () => {
    expect(maskIdNumber('aadhaar', '0123')).toEqual({
      ok: true,
      masked: 'XXXX XXXX 0123',
    });
  });

  it('rejects an Aadhaar that is not 12 digits or starts with 0/1', () => {
    expect(maskIdNumber('aadhaar', '1234 5678 9012').ok).toBe(false);
    expect(maskIdNumber('aadhaar', '23456789').ok).toBe(false);
    expect(maskIdNumber('aadhaar', 'AB12').ok).toBe(false);
  });

  it('masks other documents to the last 4', () => {
    expect(maskIdNumber('passport', 'n1234567')).toEqual({
      ok: true,
      masked: 'XXXX4567',
    });
    expect(maskIdNumber('driving_licence', 'KA-01 2019 0001234')).toEqual({
      ok: true,
      masked: 'XXXX1234',
    });
  });

  it('never returns 5 or more digits in a row', () => {
    for (const [type, raw] of [
      ['aadhaar', '987654321098'],
      ['passport', 'Z9876543'],
      ['voter_id', '1234567890'],
    ] as const) {
      const r = maskIdNumber(type, raw);
      expect(r.ok && r.masked).toBeTruthy();
      expect(r.ok && /[0-9]{5,}/.test(r.masked!)).toBe(false);
    }
  });

  it('allows leaving the number out', () => {
    expect(maskIdNumber('passport', '  ')).toEqual({ ok: true, masked: null });
  });

  it('rejects symbols', () => {
    expect(maskIdNumber('voter_id', 'AB#1234').ok).toBe(false);
  });
});

describe('retention and links', () => {
  it('purges retention days after check-out', () => {
    expect(idPurgeDate('2026-10-12', 30)).toBe('2026-11-11');
  });
});

describe('sniffIdFileType', () => {
  const bytes = (...b: number[]) =>
    new Uint8Array([...b, ...Array(12).fill(0)]);

  it('recognises the accepted types', () => {
    expect(sniffIdFileType(bytes(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(sniffIdFileType(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('image/png');
    expect(sniffIdFileType(bytes(0x25, 0x50, 0x44, 0x46))).toBe(
      'application/pdf',
    );
    expect(
      sniffIdFileType(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe('image/webp');
  });

  it('rejects anything else, whatever it claims to be', () => {
    expect(sniffIdFileType(bytes(0x3c, 0x73, 0x76, 0x67))).toBeNull(); // <svg
    expect(sniffIdFileType(bytes(0x4d, 0x5a))).toBeNull(); // exe
  });
});
