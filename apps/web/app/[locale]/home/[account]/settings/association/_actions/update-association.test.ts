import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the association settings server action.
 *
 * These exercise the real authorization branch (`getAssociationRole`) and the
 * real Zod validation embedded in the action (GSTIN format, brand-colour hex,
 * status enum, billing-settings bounds) by driving the action with `FormData`
 * and asserting on both the returned state and the Supabase calls it makes.
 *
 * Supabase and the RBAC lookup are mocked so the test is database-free; what is
 * under test here is the action's own logic, not RLS (covered by pgTAP).
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────
const updateMock = vi.fn();
const upsertMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@kit/supabase/server-client', () => ({
  getSupabaseServerClient: () => ({ from: fromMock }),
}));

const getAssociationRole = vi.fn();

vi.mock('~/lib/rbac', () => ({
  getAssociationRole: (...args: unknown[]) => getAssociationRole(...args),
}));

import {
  toggleChargeTypeAction,
  updateAssociationAction,
} from './update-association';

const ASSOCIATION_ID = '11111111-1111-1111-1111-111111111111';

// A structurally valid Indian GSTIN: 2-digit state, 5 letters, 4 digits,
// 1 letter, 1 alnum, literal 'Z', 1 alnum.
const VALID_GSTIN = '29ABCDE1234F1Z5';

/**
 * Build a Supabase query-builder mock. `associations` is written with
 * `.update().eq()` and then `billing_settings` with `.upsert()`; both resolve
 * to the given per-write results in call order.
 */
function mockSupabase(results: Array<{ error: { message: string } | null }>) {
  let call = 0;
  const next = () => Promise.resolve(results[call++] ?? { error: null });

  eqMock.mockImplementation(next);
  upsertMock.mockImplementation(next);
  updateMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ update: updateMock, upsert: upsertMock });
}

function formDataFrom(fields: Record<string, string>) {
  const fd = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }

  return fd;
}

const validFields = {
  status: 'Active',
  address: '123 MG Road, Mangaluru',
  brand_colour: '#FCD469',
  gstin: VALID_GSTIN,
  gst_enabled: 'on',
  mescom_consumer_no: 'MES-998877',
  electricity_due_day: '15',
  maintenance_due_day: '15',
  other_charges_due_day: '15',
};

beforeEach(() => {
  vi.clearAllMocks();
  getAssociationRole.mockResolvedValue('assoc_admin');
  mockSupabase([{ error: null }, { error: null }]);
});

describe('updateAssociationAction - authorization', () => {
  it('rejects a billing_operator (association config is admin-only)', async () => {
    getAssociationRole.mockResolvedValue('billing_operator');

    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom(validFields),
    );

    expect(result).toEqual({
      success: false,
      error: 'You are not authorized to update this association.',
    });
    // No DB write should have been attempted.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it.each(['prop_owner', 'tenant'])('rejects a %s', async (role) => {
    getAssociationRole.mockResolvedValue(role);

    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom(validFields),
    );

    expect(result?.success).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects a user with no membership (null role)', async () => {
    getAssociationRole.mockResolvedValue(null);

    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom(validFields),
    );

    expect(result?.success).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('updateAssociationAction - happy path', () => {
  it('writes association + billing_settings and returns success for assoc_admin', async () => {
    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom(validFields),
    );

    expect(result).toEqual({ success: true });

    // associations updated, scoped to the association id.
    expect(fromMock).toHaveBeenNthCalledWith(1, 'associations');
    expect(updateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: 'Active',
        address: '123 MG Road, Mangaluru',
        brand_colour: '#FCD469',
        gstin: VALID_GSTIN,
        gst_enabled: true,
        mescom_consumer_no: 'MES-998877',
      }),
    );
    expect(eqMock).toHaveBeenNthCalledWith(1, 'id', ASSOCIATION_ID);

    // billing_settings upserted for this association (it may not have a row
    // yet), keyed on association_id, with the due days coerced to numbers.
    expect(fromMock).toHaveBeenNthCalledWith(2, 'billing_settings');
    expect(upsertMock).toHaveBeenCalledWith(
      {
        electricity_due_day: 15,
        maintenance_due_day: 15,
        other_charges_due_day: 15,
        association_id: ASSOCIATION_ID,
      },
      { onConflict: 'association_id' },
    );
  });

  it('coerces the gst_enabled checkbox: anything other than "on" is false', async () => {
    await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom({ ...validFields, gst_enabled: '' }),
    );

    expect(updateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ gst_enabled: false }),
    );
  });

  it('accepts an empty GSTIN (optional field, empty string allowed)', async () => {
    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom({ ...validFields, gstin: '' }),
    );

    expect(result).toEqual({ success: true });
  });
});

describe('updateAssociationAction - validation', () => {
  it('rejects a malformed GSTIN', async () => {
    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom({ ...validFields, gstin: 'NOT-A-GSTIN' }),
    );

    expect(result).toEqual({
      success: false,
      error: 'Invalid form data. Check GSTIN, PAN, IFSC, or email format.',
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects a brand colour that is not a 6-digit hex', async () => {
    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom({ ...validFields, brand_colour: 'red' }),
    );

    expect(result?.success).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects an out-of-enum status', async () => {
    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom({ ...validFields, status: 'Archived' }),
    );

    expect(result?.success).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects a due day above the safe 28-day ceiling', async () => {
    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom({ ...validFields, electricity_due_day: '31' }),
    );

    expect(result).toEqual({
      success: false,
      error: 'Invalid billing settings.',
    });
    // association validation passed, so the first write may have happened;
    // assert the billing write specifically did not.
    expect(fromMock).not.toHaveBeenCalledWith('billing_settings');
  });
});

describe('updateAssociationAction - surfaces DB errors', () => {
  it('hides the raw associations error behind a generic message', async () => {
    mockSupabase([{ error: { message: 'RLS: permission denied' } }]);

    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom(validFields),
    );

    // Raw database errors are sanitised (security hardening, v2.3): the user
    // gets a generic message with a support reference, never the DB text.
    expect(result?.success).toBe(false);
    expect(result?.error).not.toContain('RLS');
    expect(result?.error).toMatch(/\(ref: [\w-]+\)/);
    // Should not proceed to billing_settings once the first write failed.
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('hides the raw billing_settings error behind a generic message', async () => {
    mockSupabase([
      { error: null },
      { error: { message: 'billing write failed' } },
    ]);

    const result = await updateAssociationAction(
      ASSOCIATION_ID,
      null,
      formDataFrom(validFields),
    );

    expect(result?.success).toBe(false);
    expect(result?.error).not.toContain('billing write failed');
    expect(result?.error).toMatch(/\(ref: [\w-]+\)/);
  });
});

describe('toggleChargeTypeAction', () => {
  const CHARGE_TYPE_ID = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    // .update().eq().eq() chain → resolve on the terminal eq.
    const eqTerminal = vi.fn().mockResolvedValue({ error: null });
    const eqFirst = vi.fn().mockReturnValue({ eq: eqTerminal });

    updateMock.mockReturnValue({ eq: eqFirst });
    fromMock.mockReturnValue({ update: updateMock });
  });

  it.each(['assoc_admin', 'billing_operator'])(
    'allows %s to toggle a charge type',
    async (role) => {
      getAssociationRole.mockResolvedValue(role);

      const result = await toggleChargeTypeAction(
        ASSOCIATION_ID,
        CHARGE_TYPE_ID,
        false,
      );

      expect(result).toEqual({ success: true });
      expect(fromMock).toHaveBeenCalledWith('charge_types');
      expect(updateMock).toHaveBeenCalledWith({ is_active: false });
    },
  );

  it.each(['prop_owner', 'tenant'])(
    'forbids %s from toggling a charge type',
    async (role) => {
      getAssociationRole.mockResolvedValue(role);

      const result = await toggleChargeTypeAction(
        ASSOCIATION_ID,
        CHARGE_TYPE_ID,
        true,
      );

      expect(result).toEqual({
        success: false,
        error:
          "You don't have the required permission. Contact your association admin.",
      });
      expect(fromMock).not.toHaveBeenCalled();
    },
  );
});
