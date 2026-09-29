import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CROCKFORD,
  checkChar,
  formatBookingCode,
  normalizeBookingCode,
} from './booking-code';
import { addDays, isYmd, nightsIn, nightsList } from './dates';
import { VillaDbError, fromSiteError, fromSiteWriteError } from './errors';

// ── getVillaSite: admin client mocked (no database) ──────────────────────────

const adminFrom = vi.fn();
const adminRpc = vi.fn();

vi.mock('@kit/supabase/server-admin-client', () => ({
  getSupabaseServerAdminClient: () => ({ from: adminFrom, rpc: adminRpc }),
}));

function propertyRow(row: Record<string, unknown> | null) {
  adminFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
      }),
    }),
  });
}

const ACCOUNT = 'acc-1';
const PROPERTY = 'prop-1';
const LINKED = {
  id: PROPERTY,
  account_id: ACCOUNT,
  name: 'Villa 19',
  site_property_id: 'site-prop-1',
  booking_code_prefix: 'V19',
  status: 'active',
};

describe('booking codes (parity with the villa-booking database)', () => {
  it('accepts codes the site database actually generated', () => {
    for (const code of [
      'V19-KB0-AJG',
      'V19-STR-NP2',
      'V19-7WG-E0C',
      'V19-QH0-X2W',
      'V19-HC9-GH0',
    ]) {
      expect(normalizeBookingCode(code)).toBe(code);
    }
  });

  it('accepts what staff type: case, spaces, no hyphens, O/0 and I/L/1', () => {
    const code = formatBookingCode('V19', '10A0B');
    const body = code.replace(/^V19-/, '').replace('-', '');

    expect(normalizeBookingCode(code.toLowerCase())).toBe(code);
    expect(normalizeBookingCode(`V19 ${body}`)).toBe(code);
    expect(
      normalizeBookingCode(`v19${body.replace(/1/g, 'l').replace(/0/g, 'o')}`),
    ).toBe(code);
  });

  it('rejects every single-character typo in the random part', () => {
    const body = '7KQM4';
    const code = formatBookingCode('V19', body);

    for (let i = 0; i < 5; i++) {
      for (const c of CROCKFORD) {
        if (c === body[i]) continue;
        const typo = body.slice(0, i) + c + body.slice(i + 1);
        expect(
          normalizeBookingCode(
            `V19-${typo.slice(0, 3)}-${typo.slice(3)}${code.slice(-1)}`,
          ),
        ).toBeNull();
      }
    }
  });

  it('rejects swapped neighbours and junk', () => {
    const check = checkChar('7KQM4');
    expect(normalizeBookingCode(`V19K7QM4${check}`)).toBeNull();
    expect(normalizeBookingCode('')).toBeNull();
    expect(normalizeBookingCode('MNG-3F9A2C')).toBeNull(); // a hold reference, not a code
  });
});

describe('dates (half-open ranges, IST calendar dates)', () => {
  it('validates real calendar dates only', () => {
    expect(isYmd('2026-10-10')).toBe(true);
    expect(isYmd('2026-02-30')).toBe(false);
    expect(isYmd('2026-2-3')).toBe(false);
    expect(isYmd('10/10/2026')).toBe(false);
  });

  it('counts nights in [from, to)', () => {
    expect(nightsIn('2026-10-10', '2026-10-13')).toBe(3);
    expect(nightsIn('2026-12-31', '2027-01-02')).toBe(2);
    expect(nightsList('2026-10-10', '2026-10-13')).toEqual([
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
    ]);
  });

  it('refuses zero-night and reversed ranges (contract §3)', () => {
    expect(() => nightsIn('2026-10-10', '2026-10-10')).toThrow(VillaDbError);
    expect(() => nightsIn('2026-10-13', '2026-10-10')).toThrow(VillaDbError);
    expect(() => nightsIn('2026-10-10', 'soon')).toThrow(VillaDbError);
  });

  it('adds days across month and leap-year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('fromSiteError', () => {
  it('maps create_booking_atomic rejections', () => {
    expect(
      fromSiteError({
        message: 'DATE_UNAVAILABLE: Selected dates are already booked',
      }).code,
    ).toBe('DATE_UNAVAILABLE');
    expect(fromSiteError({ message: 'DATE_BLOCKED: maintenance' }).code).toBe(
      'DATE_BLOCKED',
    );
  });

  it('maps constraint and network failures', () => {
    expect(
      fromSiteError({ code: '23514', message: 'violates check' }).code,
    ).toBe('INVALID_INPUT');
    expect(fromSiteError({ code: '23505', message: 'duplicate' }).code).toBe(
      'CONFLICT',
    );
    expect(fromSiteError({ message: 'TypeError: fetch failed' }).code).toBe(
      'UNREACHABLE',
    );
    expect(fromSiteError({ message: 'weird' }).code).toBe('UNKNOWN');
  });

  it('never claims "nothing changed" after a write timed out', () => {
    const error = fromSiteWriteError({ message: 'This operation was aborted' });
    expect(error.code).toBe('UNCERTAIN');
    expect(error.message).toMatch(/may have been saved/);
    // Non-network write errors keep their meaning.
    expect(fromSiteWriteError({ message: 'DATE_BLOCKED: x' }).code).toBe(
      'DATE_BLOCKED',
    );
  });

  it('never exposes the raw database message to users', () => {
    const error = fromSiteError({
      code: 'XX000',
      message: 'relation secret_table',
    });
    expect(error.message).not.toContain('secret_table');
    expect(error.detail).toContain('secret_table');
  });
});

describe('getVillaSite', () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    adminFrom.mockReset();
    adminRpc.mockReset();
    delete process.env.VILLA_DB_LOCAL_OVERRIDE;
    delete process.env.VILLA_DB_URL;
    delete process.env.VILLA_DB_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  async function load() {
    return (await import('./client')).getVillaSite;
  }

  it('refuses a property of another account as NOT_FOUND', async () => {
    propertyRow({ ...LINKED, account_id: 'someone-else' });
    const getVillaSite = await load();

    await expect(getVillaSite(ACCOUNT, PROPERTY)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('refuses a property the owner switched off', async () => {
    propertyRow({ ...LINKED, status: 'inactive' });
    const getVillaSite = await load();

    await expect(getVillaSite(ACCOUNT, PROPERTY)).rejects.toMatchObject({
      code: 'INACTIVE',
    });
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('reports NOT_CONFIGURED when the property is not linked', async () => {
    propertyRow({ ...LINKED, site_property_id: null });
    const getVillaSite = await load();

    await expect(getVillaSite(ACCOUNT, PROPERTY)).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
  });

  it('reports NOT_CONFIGURED when Vault has no credentials', async () => {
    propertyRow(LINKED);
    adminRpc.mockResolvedValue({ data: [], error: null });
    const getVillaSite = await load();

    await expect(getVillaSite(ACCOUNT, PROPERTY)).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
    expect(adminRpc).toHaveBeenCalledWith('get_villa_site_credentials', {
      p_property_id: PROPERTY,
    });
  });

  it('connects with Vault credentials', async () => {
    propertyRow(LINKED);
    adminRpc.mockResolvedValue({
      data: [{ url: 'https://abc.supabase.co', service_key: 'k'.repeat(40) }],
      error: null,
    });
    const getVillaSite = await load();

    const site = await getVillaSite(ACCOUNT, PROPERTY);

    expect(site.sitePropertyId).toBe('site-prop-1');
    expect(site.bookingCodePrefix).toBe('V19');
    expect(site.client).toBeDefined();
  });

  it('uses the local override only for a localhost URL', async () => {
    propertyRow(LINKED);
    process.env.VILLA_DB_LOCAL_OVERRIDE = 'true';
    process.env.VILLA_DB_URL = 'http://127.0.0.1:54331';
    process.env.VILLA_DB_SERVICE_ROLE_KEY = 'k'.repeat(40);
    const getVillaSite = await load();

    await getVillaSite(ACCOUNT, PROPERTY);

    expect(adminRpc).not.toHaveBeenCalled();
  });

  it('ignores the override for a non-local URL and falls back to Vault', async () => {
    propertyRow(LINKED);
    process.env.VILLA_DB_LOCAL_OVERRIDE = 'true';
    process.env.VILLA_DB_URL = 'https://prod-project.supabase.co';
    process.env.VILLA_DB_SERVICE_ROLE_KEY = 'k'.repeat(40);
    adminRpc.mockResolvedValue({ data: [], error: null });
    const getVillaSite = await load();

    await expect(getVillaSite(ACCOUNT, PROPERTY)).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
    expect(adminRpc).toHaveBeenCalled();
  });
});
