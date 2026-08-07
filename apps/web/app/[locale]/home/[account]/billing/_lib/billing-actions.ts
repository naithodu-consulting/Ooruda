'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { sendBillGeneratedNotifications } from '~/lib/notify';
import { getAssociationRole } from '~/lib/rbac';

import { getCashLedgerBalance } from '../../cash-ledger/_lib/cash-ledger-service';
import {
  type GenerateBillsInput,
  GenerateBillsSchema,
  type VoidBillInput,
  VoidBillSchema,
  type VoidBillsBulkInput,
  VoidBillsBulkSchema,
} from './billing-schema';
import { preRenderBillPdf } from './server/pdf-generation';

const BILLING_PATH = '/home/[account]/billing';

type ActionResult = { success: boolean; error?: string };
type GenerateBillsResult = ActionResult & {
  created?: number;
  skipped?: number;
};

async function requireBillingAccess(
  associationId: string,
): Promise<string | null> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin' && role !== 'billing_operator') {
    return 'Only an association admin or billing operator can do that.';
  }

  return null;
}

async function requireAdminAccess(
  associationId: string,
): Promise<string | null> {
  const role = await getAssociationRole(associationId);

  if (role !== 'assoc_admin') {
    return 'Only an association admin can do that.';
  }

  return null;
}

export async function generateBillsAction(
  associationId: string,
  input: GenerateBillsInput,
): Promise<GenerateBillsResult> {
  const roleError = await requireBillingAccess(associationId);

  if (roleError) {
    return { success: false, error: roleError };
  }

  const parsed = GenerateBillsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const { period, billType } = parsed.data;
  const client = getSupabaseServerClient();

  // Fetch units first — we need unitIds before the parallel wave below.
  const { data: units } = await client
    .from('units')
    .select('id, unit_no, type, area_sqft')
    .eq('association_id', associationId);

  const unitRows = units ?? [];

  if (unitRows.length === 0) {
    return { success: false, error: 'Add units before generating bills.' };
  }

  const unitIds = unitRows.map((u) => u.id);

  // All of these are independent of each other — fire in parallel.
  const [
    { data: chargeTypes },
    { data: activeTenancies },
    { data: overrides },
    { data: billingSettings },
    { data: association, error: associationError },
    { data: existingBills },
  ] = await Promise.all([
    client
      .from('charge_types')
      .select(
        'id, key, name, calc_method, rate_or_amount, default_payer, gst_applicable',
      )
      .eq('association_id', associationId)
      .eq('is_active', true),
    client
      .from('tenancies')
      .select('id, unit_id')
      .in('unit_id', unitIds)
      .eq('status', 'active'),
    client
      .from('unit_charge_overrides')
      .select(
        'unit_id, charge_type_id, payer_override, rate_or_amount_override, is_excluded',
      )
      .in('unit_id', unitIds),
    client
      .from('billing_settings')
      .select('electricity_due_day, maintenance_due_day, other_charges_due_day')
      .eq('association_id', associationId)
      .single(),
    client
      .from('associations')
      .select('gst_enabled, gst_rate, accounts!inner(name, slug)')
      .eq('id', associationId)
      .single(),
    client
      .from('bills')
      .select('unit_id, bill_no')
      .eq('association_id', associationId)
      .eq('period', period)
      .neq('status', 'Void'),
  ]);

  const activeChargeTypes = chargeTypes ?? [];

  if (activeChargeTypes.length === 0) {
    return { success: false, error: 'No active charge types to bill.' };
  }

  if (associationError || !association) {
    return {
      success: false,
      error: 'Could not load association settings.',
    };
  }

  const tenancyIdByUnit = new Map(
    (activeTenancies ?? []).map((t) => [t.unit_id, t.id]),
  );

  const overrideByKey = new Map(
    (overrides ?? []).map((o) => [`${o.unit_id}:${o.charge_type_id}`, o]),
  );

  const gstEnabled = association.gst_enabled ?? false;
  const gstRate = association.gst_rate ?? 0;
  const assocAccounts = association.accounts as {
    name?: string;
    slug?: string;
  } | null;
  const associationName = assocAccounts?.name ?? '';
  const accountSlug = assocAccounts?.slug ?? '';
  const calculateDueDate = (billingPeriod: string, day: number) =>
    `${billingPeriod}-${String(day).padStart(2, '0')}`;
  // Electricity bills are due in the NEXT calendar month after the billing period.
  const elecPeriod = (() => {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(y!, m!, 1); // JS months are 0-indexed, so m (1-based) = next month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const elecDueDate = calculateDueDate(
    elecPeriod,
    billingSettings?.electricity_due_day ?? 10,
  );
  const maintDueDate = calculateDueDate(
    period,
    billingSettings?.maintenance_due_day ?? 10,
  );
  const otherDueDate = calculateDueDate(
    period,
    billingSettings?.other_charges_due_day ?? 10,
  );

  const otherChargesCT = activeChargeTypes.find(
    (c) => c.key === 'other_charges',
  );
  const sinkingFundCT = activeChargeTypes.find((c) => c.key === 'sinking_fund');
  const hasElectricityChargeType = activeChargeTypes.some(
    (c) => c.calc_method === 'electricity',
  );

  type PendingRow = {
    id: string;
    unit_id: string | null;
    label: string;
    amount: number;
    split_mode: string | null;
    due_date: string | null;
  };

  // Fetch pending other/sinking charges and the MESCOM bill in parallel.
  const [
    { data: pendingCharges },
    { data: pendingSinkingCharges },
    { data: mescomBill },
  ] = await Promise.all([
    otherChargesCT
      ? client
          .from('pending_other_charges')
          .select('id, unit_id, label, amount, split_mode, due_date')
          .eq('association_id', associationId)
          .eq('period', period)
          .eq('billed', false)
      : Promise.resolve({ data: [] as PendingRow[] }),
    // pending_sinking_fund_charges is not yet in generated types — cast to any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sinkingFundCT
      ? (client as any)
          .from('pending_sinking_fund_charges')
          .select('id, unit_id, label, amount, split_mode, due_date')
          .eq('association_id', associationId)
          .eq('period', period)
          .eq('billed', false)
      : Promise.resolve({ data: [] as PendingRow[] }),
    hasElectricityChargeType
      ? client
          .from('mescom_bills')
          .select('invoice_amount')
          .eq('association_id', associationId)
          .eq('period', period)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const pendingRows = pendingCharges ?? [];
  const pendingSinkingRows = (pendingSinkingCharges ?? []) as PendingRow[];

  let blockRate: number | null = null;
  const consumedByUnit: Record<string, number> = {};
  const minimumChargeByUnit: Record<string, number> = {};

  if (hasElectricityChargeType && mescomBill && mescomBill.invoice_amount > 0) {
    const { data: subMeters } = await client
      .from('sub_meters')
      .select('id, unit_id, meter_type')
      .in('unit_id', unitIds);

    const subMeterIds = (subMeters ?? []).map((m) => m.id);
    const subMeterMap = new Map((subMeters ?? []).map((m) => [m.id, m]));
    // CommonArea sub-meters are stored with unit_id pointing to the first unit
    // (FK placeholder). During billing we redirect their consumption to whichever
    // unit has type = 'Common Area' so the amounts land in the right bill.
    const commonAreaUnit = unitRows.find((u) => u.type === 'Common Area');

    if (subMeterIds.length > 0) {
      const { data: readings } = await client
        .from('meter_readings')
        .select('sub_meter_id, consumed_units, minimum_charge')
        .eq('period', period)
        .in('sub_meter_id', subMeterIds);

      let totalSubMeterUnits = 0;
      for (const r of readings ?? []) {
        const sm = subMeterMap.get(r.sub_meter_id);
        if (!sm) continue;
        const targetUnitId =
          sm.meter_type === 'CommonArea' && commonAreaUnit
            ? commonAreaUnit.id
            : sm.unit_id;
        consumedByUnit[targetUnitId] =
          (consumedByUnit[targetUnitId] ?? 0) + (r.consumed_units ?? 0);
        minimumChargeByUnit[targetUnitId] =
          (minimumChargeByUnit[targetUnitId] ?? 0) + (r.minimum_charge ?? 0);
        totalSubMeterUnits += r.consumed_units ?? 0;
      }

      if (totalSubMeterUnits > 0) {
        blockRate = mescomBill.invoice_amount / totalSubMeterUnits;
      } else {
        const logger = await getLogger();
        logger.warn(
          { associationId, period },
          'generateBills: no sub-meter readings found; electricity blockRate stays null',
        );
      }
    }
  }

  // existingBills was already fetched in the parallel wave above.
  const existingByUnit = new Map<string, string[]>();
  for (const b of existingBills ?? []) {
    const list = existingByUnit.get(b.unit_id) ?? [];
    list.push(b.bill_no);
    existingByUnit.set(b.unit_id, list);
  }

  let created = 0;
  let skipped = 0;
  let sinkingCreated = 0;

  const roundToTwoDecimals = (val: number) => Math.round(val * 100) / 100;

  const shouldGenElec = billType === 'All' || billType === 'Electricity';
  const shouldGenMaint = billType === 'All' || billType === 'Maintenance';
  const shouldGenOther = billType === 'All' || billType === 'Other Charges';
  const shouldGenSinking = billType === 'All' || billType === 'Sinking Fund';

  // Process units in concurrent batches so bill-type RPCs (allocate_bill_no,
  // create_bill_with_items) run in parallel across units rather than serially.
  // Each bill type hits a separate sequence counter so there is no DB-level
  // contention between types; different units with the same type do serialize
  // on that counter, but the I/O overlap from batching still cuts wall-clock
  // time substantially (e.g. 100 units × 3 types: ~13 batches vs 300 serial).
  const UNIT_BATCH_SIZE = 8;
  let firstBatchError: string | null = null;

  for (
    let batchStart = 0;
    batchStart < unitRows.length;
    batchStart += UNIT_BATCH_SIZE
  ) {
    if (firstBatchError) break;
    const batch = unitRows.slice(batchStart, batchStart + UNIT_BATCH_SIZE);

    const batchErrors = await Promise.all(
      batch.map(async (unit) => {
        const existing = existingByUnit.get(unit.id) || [];
        const hasElec = existing.some(
          (b: string) => b.includes('-ELEC-') || b.includes('/ELT/'),
        );
        const hasMaint = existing.some(
          (b: string) => b.includes('-MANT-') || b.includes('/MNT/'),
        );
        const hasOther = existing.some(
          (b: string) => b.includes('-OTHR-') || b.includes('/OTH/'),
        );
        const hasSinking = existing.some((b: string) => b.includes('/SNK/'));

        // Does this unit have any staged (unbilled) pending charges? Ad-hoc
        // charges are always billable, even if the unit already has an OTH/SNK bill,
        // so their presence must prevent the "already fully billed" skip below.
        const hasPendingForUnit =
          shouldGenOther &&
          pendingRows.some(
            (pc) => pc.unit_id === null || pc.unit_id === unit.id,
          );
        const hasPendingSinkingForUnit =
          shouldGenSinking &&
          pendingSinkingRows.some(
            (pc) => pc.unit_id === null || pc.unit_id === unit.id,
          );

        if (unit.type === 'Common Area') {
          if (hasElec) {
            skipped++;
            return null; // already billed, skip this unit
          }
        } else {
          if (
            hasElec &&
            hasMaint &&
            hasOther &&
            hasSinking &&
            !hasPendingForUnit &&
            !hasPendingSinkingForUnit
          ) {
            skipped++;
            return null; // already fully billed, skip this unit
          }
        }

        type LineItem = {
          charge_type_id: string;
          description: string;
          payer: string;
          gst_applicable: boolean;
          amount: number;
          area_sqft?: number;
          rate_per_sqft?: number;
        };

        const elecItems: LineItem[] = [];
        const maintItems: LineItem[] = [];
        const otherItems: LineItem[] = [];
        const sinkingItems: LineItem[] = [];

        // Map charge types to correct bill type
        for (const chargeType of activeChargeTypes) {
          const override = overrideByKey.get(`${unit.id}:${chargeType.id}`);

          if (override?.is_excluded) {
            continue;
          }

          const payer = override?.payer_override ?? chargeType.default_payer;
          let amount: number;

          if (chargeType.calc_method === 'electricity') {
            if (blockRate === null) continue;
            const consumed = consumedByUnit[unit.id] ?? 0;
            const minCharge = minimumChargeByUnit[unit.id] ?? 0;
            amount = consumed * blockRate + minCharge;

            elecItems.push({
              charge_type_id: chargeType.id,
              description: chargeType.name,
              payer,
              gst_applicable: chargeType.gst_applicable,
              amount: roundToTwoDecimals(amount),
            });
          } else {
            const rate =
              override?.rate_or_amount_override ?? chargeType.rate_or_amount;

            if (rate === null || rate === undefined) {
              continue;
            }

            const isPerSqft = chargeType.calc_method === 'per_sqft';
            amount = isPerSqft ? rate * unit.area_sqft : rate;

            const item: LineItem = {
              charge_type_id: chargeType.id,
              description: chargeType.name,
              payer,
              gst_applicable: chargeType.gst_applicable,
              amount: roundToTwoDecimals(amount),
              ...(isPerSqft
                ? { area_sqft: unit.area_sqft, rate_per_sqft: rate }
                : {}),
            };

            if (chargeType.key === 'maintenance') {
              maintItems.push(item);
            } else if (chargeType.key === 'sinking_fund') {
              // sinking_fund is ad-hoc (no rate set); items come from
              // pending_sinking_fund_charges below, not from the charge type rate.
              // Skip here to avoid double-counting.
            } else if (chargeType.key !== 'other_charges') {
              // e.g. water or custom types map to Other Charges bill
              otherItems.push(item);
            }
          }
        }

        // Build per-due-date groups of pending charges for this unit.
        // null key = use the default otherDueDate (merged with base otherItems).
        const pendingByDueDate = new Map<string | null, LineItem[]>();
        if (otherChargesCT) {
          for (const pc of pendingRows) {
            if (pc.unit_id !== null && pc.unit_id !== unit.id) continue;

            let pcAmount: number;
            if (pc.unit_id === null) {
              if (pc.split_mode === 'per_sqft') {
                if (unit.area_sqft == null) continue;
                pcAmount = roundToTwoDecimals(pc.amount * unit.area_sqft);
              } else {
                pcAmount = roundToTwoDecimals(pc.amount);
              }
            } else {
              pcAmount = roundToTwoDecimals(pc.amount);
            }

            const key = pc.due_date ?? null;
            const group = pendingByDueDate.get(key) ?? [];
            group.push({
              charge_type_id: otherChargesCT.id,
              description: pc.label,
              payer: otherChargesCT.default_payer ?? 'Owner',
              gst_applicable: otherChargesCT.gst_applicable ?? false,
              amount: pcAmount,
            });
            pendingByDueDate.set(key, group);
          }
        }

        // Null-date pending charges use the default `otherDueDate`. They are kept
        // separate from the base recurring `otherItems` so that ad-hoc charges
        // added after the first OTH bill can still be billed (see generation below).
        const nullDatePending = pendingByDueDate.get(null) ?? [];

        // Build sinking fund line items from pending_sinking_fund_charges.
        if (sinkingFundCT) {
          for (const pc of pendingSinkingRows) {
            if (pc.unit_id !== null && pc.unit_id !== unit.id) continue;

            let pcAmount: number;
            if (pc.unit_id === null) {
              if (pc.split_mode === 'per_sqft') {
                if (unit.area_sqft == null) continue;
                pcAmount = roundToTwoDecimals(pc.amount * unit.area_sqft);
              } else {
                pcAmount = roundToTwoDecimals(pc.amount);
              }
            } else {
              pcAmount = roundToTwoDecimals(pc.amount);
            }

            sinkingItems.push({
              charge_type_id: sinkingFundCT.id,
              description: pc.label,
              payer: sinkingFundCT.default_payer ?? 'Owner',
              gst_applicable: sinkingFundCT.gst_applicable ?? false,
              amount: pcAmount,
            });
          }
        }

        // Helper to generate bill
        const generateSpecificBill = async (
          type: string,
          typePrefix: string,
          items: LineItem[],
          dueDate: string,
        ) => {
          if (items.length === 0) return true; // nothing to bill

          const { data: billNo, error: seqError } = await client.rpc(
            'allocate_bill_no',
            {
              p_association_id: associationId,
              p_bill_type: typePrefix,
              p_period: period,
            },
          );
          if (seqError || !billNo) {
            await logAuditEvent({
              associationId,
              action: 'bills.generation.failed',
              entityType: 'bill',
              eventType: 'error',
              summary: `Failed to allocate bill number for ${typePrefix} in period ${period}: ${seqError?.message ?? 'no bill number returned'}`,
            });
            return false;
          }

          const baseTotal = roundToTwoDecimals(
            items.reduce((sum, li) => sum + li.amount, 0),
          );

          // Compute GST on taxable line items when the association is GST-registered.
          let gstAmount: number | null = null;
          if (gstEnabled && gstRate > 0) {
            const taxableBase = items
              .filter((li) => li.gst_applicable)
              .reduce((sum, li) => sum + li.amount, 0);
            if (taxableBase > 0) {
              gstAmount = roundToTwoDecimals((taxableBase * gstRate) / 100);
            }
          }

          const totalAmount = roundToTwoDecimals(baseTotal + (gstAmount ?? 0));

          const billCategory =
            typePrefix === 'ELT'
              ? 'electricity'
              : typePrefix === 'OTH'
                ? 'other_charges'
                : typePrefix === 'SNK'
                  ? 'sinking_fund'
                  : 'maintenance';

          // Check cash ledger for any advance credit for this unit + bill type.
          let advanceApplied = 0;
          try {
            const balance = await getCashLedgerBalance(
              client,
              unit.id,
              billCategory,
            );
            if (balance > 0) {
              advanceApplied = roundToTwoDecimals(
                Math.min(balance, totalAmount),
              );
            }
          } catch {
            // Non-fatal: proceed without advance if balance check fails.
          }

          const { error: rpcError } = await client
            .rpc('create_bill_with_items', {
              p_association_id: associationId,
              p_unit_id: unit.id,
              p_period: period,
              p_bill_no: billNo,
              p_due_date: dueDate,
              p_total_amount: totalAmount,
              p_line_items: items,
              p_bill_type: billCategory,
              p_gst_amount: gstAmount,
              p_tenancy_id: tenancyIdByUnit.get(unit.id) ?? null,
              p_advance_applied: advanceApplied,
            })
            .returns<string>();

          if (rpcError) {
            await logAuditEvent({
              associationId,
              action: 'bills.generation.failed',
              entityType: 'bill',
              eventType: 'error',
              summary: `Failed to generate ${type} bill for period ${period} (unit ${unit.id}): ${rpcError.message}`,
            });
            return false;
          }

          // The advance_applied ledger debit is written atomically inside
          // create_bill_with_items — no separate call needed here.

          created += 1;
          return true;
        };

        // Build the list of bill types to generate for this unit, then fire them
        // in parallel. Each type hits a different sequence counter so there's no
        // DB-level contention between them.
        const billsToGenerate: { type: string; promise: Promise<boolean> }[] =
          [];

        if (unit.type === 'Common Area') {
          if (!hasElec && shouldGenElec)
            billsToGenerate.push({
              type: 'electricity',
              promise: generateSpecificBill(
                'Electricity',
                'ELT',
                elecItems,
                elecDueDate,
              ),
            });
        } else {
          if (!hasElec && shouldGenElec)
            billsToGenerate.push({
              type: 'electricity',
              promise: generateSpecificBill(
                'Electricity',
                'ELT',
                elecItems,
                elecDueDate,
              ),
            });
          if (!hasMaint && shouldGenMaint)
            billsToGenerate.push({
              type: 'maintenance',
              promise: generateSpecificBill(
                'Maintenance',
                'MNT',
                maintItems,
                maintDueDate,
              ),
            });
          if (shouldGenOther) {
            if (!hasOther) {
              // First OTH bill for this unit/period: bill base recurring charges
              // together with any default-due-date (null) pending charges.
              const firstBillItems = [...otherItems, ...nullDatePending];
              if (firstBillItems.length > 0)
                billsToGenerate.push({
                  type: 'other charges',
                  promise: generateSpecificBill(
                    'Other Charges',
                    'OTH',
                    firstBillItems,
                    otherDueDate,
                  ),
                });
            } else if (nullDatePending.length > 0) {
              // An OTH bill already exists, so the base recurring charges are
              // already billed. Bill only the newly-added default-due-date pending
              // charges as a separate OTH bill (ad-hoc charges are always billable).
              billsToGenerate.push({
                type: 'other charges',
                promise: generateSpecificBill(
                  'Other Charges',
                  'OTH',
                  nullDatePending,
                  otherDueDate,
                ),
              });
            }
            // Specific-due-date pending charge groups always generate a new bill,
            // regardless of whether a prior OTH bill already exists for the period.
            for (const [dueDate, items] of pendingByDueDate) {
              if (dueDate === null) continue; // handled above
              if (items.length === 0) continue;
              billsToGenerate.push({
                type: 'other charges',
                promise: generateSpecificBill(
                  'Other Charges',
                  'OTH',
                  items,
                  dueDate,
                ),
              });
            }
          }

          // Sinking Fund — ad-hoc. Each distinct collection generates a new SNK bill.
          // If an SNK bill already exists for this period, skip silently — the admin
          // should void the existing bill before re-collecting for the same period.
          if (shouldGenSinking && sinkingItems.length > 0) {
            if (!hasSinking) {
              const snkDueDate =
                pendingSinkingRows.find(
                  (pc) => pc.unit_id === unit.id && pc.due_date,
                )?.due_date ??
                pendingSinkingRows.find(
                  (pc) => pc.unit_id === null && pc.due_date,
                )?.due_date ??
                otherDueDate;
              billsToGenerate.push({
                type: 'sinking fund',
                promise: generateSpecificBill(
                  'Sinking Fund',
                  'SNK',
                  sinkingItems,
                  snkDueDate,
                ),
              });
            }
            // hasSinking=true: bill already exists for this period; staged charges
            // remain unbilled so the admin can act intentionally (void + re-generate).
          }
        }

        const results = await Promise.all(
          billsToGenerate.map((b) => b.promise),
        );
        const failedTypes = billsToGenerate
          .filter((_, i) => !results[i])
          .map((b) => b.type);
        if (failedTypes.length > 0) {
          return `Failed to generate ${failedTypes.join(', ')} bill${failedTypes.length > 1 ? 's' : ''}`;
        }

        // Track how many SNK bills were generated in this run (separate from `created`
        // which spans all types — needed to gate the mark-billed step accurately).
        if (billsToGenerate.some((b) => b.type === 'sinking fund')) {
          sinkingCreated += 1;
        }
        return null; // success for this unit
      }),
    ); // end batch.map

    firstBatchError = batchErrors.find((e) => e !== null) ?? null;
  } // end batch loop

  if (firstBatchError) {
    return { success: false, error: firstBatchError };
  }

  // Schedule background PDF pre-render so every first download is a cache hit (~0.8s vs 7-8s).
  // Runs after the action response is sent; Vercel extends the lambda lifetime for `after` callbacks.
  // Best-effort: a failed render is logged and the bill falls back to on-demand rendering.
  {
    const { data: unrenderedBills } = await client
      .from('bills')
      .select('id')
      .eq('association_id', associationId)
      .eq('period', period)
      .is('pdf_url', null);

    const preRenderIds = (unrenderedBills ?? []).map((b) => b.id);
    if (preRenderIds.length > 0) {
      const PDF_PRE_RENDER_CONCURRENCY = 3;
      after(async () => {
        for (
          let i = 0;
          i < preRenderIds.length;
          i += PDF_PRE_RENDER_CONCURRENCY
        ) {
          await Promise.allSettled(
            preRenderIds
              .slice(i, i + PDF_PRE_RENDER_CONCURRENCY)
              .map(preRenderBillPdf),
          );
        }
      });
    }
  }

  // Mark unbilled pending charges as billed now that bills are generated.
  // Only do this when the relevant type was actually part of this run.
  if (shouldGenOther && created > 0 && pendingRows.length > 0) {
    const pendingIds = pendingRows.map((r) => r.id);
    await client
      .from('pending_other_charges')
      .update({ billed: true })
      .in('id', pendingIds);
  }
  if (shouldGenSinking && sinkingCreated > 0 && pendingSinkingRows.length > 0) {
    const sinkingIds = pendingSinkingRows.map((r) => r.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any)
      .from('pending_sinking_fund_charges')
      .update({ billed: true })
      .in('id', sinkingIds);
  }

  if (created > 0) {
    const monthName = new Date(`${period}-01T00:00:00`).toLocaleString(
      'en-IN',
      { month: 'long' },
    );
    const [periodYear] = period.split('-');
    try {
      await logAuditEvent({
        associationId,
        action: 'bills.generated',
        entityType: 'bill',
        summary: `Generated ${created} bill${created === 1 ? '' : 's'} for ${monthName} ${periodYear}`,
      });
    } catch {
      // non-fatal: bills are committed; audit log failure must not shadow the result
    }

    // Fire bill-generated notifications for all newly created bills via after()
    // so it never blocks the response.
    after(async () => {
      const adminClient = getSupabaseServerAdminClient();

      // Bills with units — no tenancies join (no FK from bills→tenancies)
      const { data: newBills } = await adminClient
        .from('bills')
        .select(`
          id, bill_no, bill_type, total_amount, due_date,
          units!inner(id, unit_no, owner_id)
        `)
        .eq('association_id', associationId)
        .eq('period', period)
        .neq('status', 'Void')
        .order('bill_no', { ascending: true })
        .limit(500);

      if (!newBills?.length) return;

      // Fetch active tenancies for these units separately
      const unitIds = [
        ...new Set(
          newBills
            .map((b) => {
              const unit = Array.isArray(b.units) ? b.units[0] : b.units;
              return unit?.id;
            })
            .filter(Boolean),
        ),
      ] as string[];

      const { data: activeTenancies } = await adminClient
        .from('tenancies')
        .select('unit_id, tenant_id')
        .in('unit_id', unitIds)
        .eq('status', 'active');

      const tenancyByUnit = new Map(
        (activeTenancies ?? []).map((t) => [t.unit_id, t.tenant_id]),
      );

      const billedUnits = newBills.map((b) => {
        const unit = Array.isArray(b.units) ? b.units[0] : b.units;
        return {
          unitId: unit?.id ?? '',
          unitNo: unit?.unit_no ?? '',
          ownerUserId: unit?.owner_id ?? null,
          activeTenantUserId: tenancyByUnit.get(unit?.id ?? '') ?? null,
          billNo: b.bill_no,
          billType: b.bill_type,
          period,
          totalAmount: b.total_amount,
          dueDate: b.due_date,
        };
      });

      await sendBillGeneratedNotifications({
        associationId,
        associationName,
        accountSlug,
        billedUnits,
      });
    });
  }

  revalidatePath(BILLING_PATH, 'page');

  return { success: true, created, skipped };
}

export interface PendingOtherCharge {
  id: string;
  unit_id: string | null;
  label: string;
  amount: number;
  split_mode: string | null;
  due_date: string | null;
  billed: boolean;
}

export async function addOtherChargeToUnitAction(
  associationId: string,
  input: {
    unit_id: string;
    period: string;
    label: string;
    amount: number;
    due_date?: string | null;
  },
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  if (!input.label.trim())
    return { success: false, error: 'Label is required.' };
  if (input.amount <= 0)
    return { success: false, error: 'Amount must be positive.' };

  const client = getSupabaseServerClient();

  const { data: unit, error: unitError } = await client
    .from('units')
    .select('id')
    .eq('id', input.unit_id)
    .eq('association_id', associationId)
    .single();

  if (unitError || !unit) {
    return { success: false, error: 'Unit not found in this association.' };
  }

  const { error } = await client.from('pending_other_charges').insert({
    association_id: associationId,
    unit_id: input.unit_id,
    period: input.period,
    label: input.label.trim(),
    amount: input.amount,
    split_mode: null,
    due_date: input.due_date ?? null,
  });

  if (error) return { success: false, error: error.message };
  revalidatePath(BILLING_PATH, 'page');
  return { success: true };
}

export async function bulkAddOtherChargeAction(
  associationId: string,
  input: {
    period: string;
    label: string;
    amount: number;
    split_mode: 'flat' | 'per_sqft';
    due_date?: string | null;
  },
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  if (!input.label.trim())
    return { success: false, error: 'Label is required.' };
  if (input.amount <= 0)
    return { success: false, error: 'Amount must be positive.' };
  if (input.split_mode !== 'flat' && input.split_mode !== 'per_sqft')
    return { success: false, error: 'Invalid split mode.' };

  const client = getSupabaseServerClient();
  const { error } = await client.from('pending_other_charges').insert({
    association_id: associationId,
    unit_id: null,
    period: input.period,
    label: input.label.trim(),
    amount: input.amount,
    split_mode: input.split_mode,
    due_date: input.due_date ?? null,
  });

  if (error) return { success: false, error: error.message };
  revalidatePath(BILLING_PATH, 'page');
  return { success: true };
}

export async function removePendingOtherChargeAction(
  associationId: string,
  chargeId: string,
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  const client = getSupabaseServerClient();

  const { data: charge } = await client
    .from('pending_other_charges')
    .select('billed')
    .eq('id', chargeId)
    .eq('association_id', associationId)
    .single();

  if (charge?.billed) {
    return {
      success: false,
      error: 'This charge has already been billed and cannot be removed.',
    };
  }

  const { error } = await client
    .from('pending_other_charges')
    .delete()
    .eq('id', chargeId)
    .eq('association_id', associationId)
    .eq('billed', false);

  if (error) return { success: false, error: error.message };
  revalidatePath(BILLING_PATH, 'page');
  return { success: true };
}

export interface OtherChargeImportRow {
  unit_no: string;
  label: string;
  amount: number;
}

export interface OtherChargeImportResult {
  success: boolean;
  imported: number;
  skipped: string[];
  error?: string;
}

export async function bulkImportOtherChargesAction(
  associationId: string,
  period: string,
  rows: OtherChargeImportRow[],
): Promise<OtherChargeImportResult> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return {
      success: false,
      imported: 0,
      skipped: [],
      error: 'Invalid period format. Expected YYYY-MM.',
    };
  }

  const roleError = await requireBillingAccess(associationId);
  if (roleError) {
    return { success: false, imported: 0, skipped: [], error: roleError };
  }

  const client = getSupabaseServerClient();

  const { data: units } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', associationId);

  const unitByNo = new Map<string, string>(
    (units ?? []).map((u) => [u.unit_no.toLowerCase().trim(), u.id]),
  );

  const skipped: string[] = [];
  const toInsert = [];

  for (const row of rows) {
    const unitNoNorm = row.unit_no.toLowerCase().trim();
    const unitId = unitByNo.get(unitNoNorm);

    if (!unitId) {
      skipped.push(`Unit "${row.unit_no}" not found`);
      continue;
    }

    if (!row.label.trim()) {
      skipped.push(`Row for Unit "${row.unit_no}" has empty label`);
      continue;
    }

    if (row.amount <= 0) {
      skipped.push(
        `Row for Unit "${row.unit_no}" has invalid amount: ${row.amount}`,
      );
      continue;
    }

    toInsert.push({
      association_id: associationId,
      unit_id: unitId,
      period,
      label: row.label.trim(),
      amount: row.amount,
      split_mode: null,
    });
  }

  if (toInsert.length > 0) {
    const { error } = await client
      .from('pending_other_charges')
      .insert(toInsert);
    if (error) {
      return { success: false, imported: 0, skipped, error: error.message };
    }
  }

  revalidatePath(BILLING_PATH, 'page');
  return { success: true, imported: toInsert.length, skipped };
}

// ── Sinking Fund CRUD ────────────────────────────────────────────────────────

export interface PendingSinkingFundCharge {
  id: string;
  unit_id: string | null;
  label: string;
  amount: number;
  split_mode: string | null;
  due_date: string | null;
  billed: boolean;
}

export async function addSinkingFundChargeToUnitAction(
  associationId: string,
  input: {
    unit_id: string;
    period: string;
    label: string;
    amount: number;
    due_date?: string | null;
  },
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  if (!/^\d{4}-\d{2}$/.test(input.period))
    return { success: false, error: 'Invalid period format.' };
  if (!input.label.trim())
    return { success: false, error: 'Label is required.' };
  if (input.amount <= 0)
    return { success: false, error: 'Amount must be positive.' };

  const client = getSupabaseServerClient();

  const { data: unit, error: unitError } = await client
    .from('units')
    .select('id')
    .eq('id', input.unit_id)
    .eq('association_id', associationId)
    .single();

  if (unitError || !unit)
    return { success: false, error: 'Unit not found in this association.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from('pending_sinking_fund_charges')
    .insert({
      association_id: associationId,
      unit_id: input.unit_id,
      period: input.period,
      label: input.label.trim(),
      amount: input.amount,
      split_mode: null,
      due_date: input.due_date ?? null,
    });

  if (error) return { success: false, error: error.message };
  revalidatePath(BILLING_PATH, 'page');
  return { success: true };
}

export async function bulkAddSinkingFundChargeAction(
  associationId: string,
  input: {
    period: string;
    label: string;
    amount: number;
    split_mode: 'flat' | 'per_sqft';
    due_date?: string | null;
  },
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  if (!/^\d{4}-\d{2}$/.test(input.period))
    return { success: false, error: 'Invalid period format.' };
  if (!input.label.trim())
    return { success: false, error: 'Label is required.' };
  if (input.amount <= 0)
    return { success: false, error: 'Amount must be positive.' };

  const client = getSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from('pending_sinking_fund_charges')
    .insert({
      association_id: associationId,
      unit_id: null,
      period: input.period,
      label: input.label.trim(),
      amount: input.amount,
      split_mode: input.split_mode,
      due_date: input.due_date ?? null,
    });

  if (error) return { success: false, error: error.message };
  revalidatePath(BILLING_PATH, 'page');
  return { success: true };
}

export async function removePendingSinkingFundChargeAction(
  associationId: string,
  chargeId: string,
): Promise<ActionResult> {
  const roleError = await requireBillingAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  const client = getSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: charge } = await (client as any)
    .from('pending_sinking_fund_charges')
    .select('billed')
    .eq('id', chargeId)
    .eq('association_id', associationId)
    .single();

  if (charge?.billed) {
    return {
      success: false,
      error: 'This charge has already been billed and cannot be removed.',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from('pending_sinking_fund_charges')
    .delete()
    .eq('id', chargeId)
    .eq('association_id', associationId)
    .eq('billed', false);

  if (error) return { success: false, error: error.message };
  revalidatePath(BILLING_PATH, 'page');
  return { success: true };
}

const BILLING_DOCUMENTS_BUCKET = 'billing-documents';

/**
 * Super-admin-only bulk delete: wipes every bill (cascading to
 * bill_line_items, payments, receipts) for the association, resets bill
 * numbering, and cleans up orphaned cached PDFs from storage.
 *
 * Authorization is enforced inside the `super_admin_delete_all_bills` RPC
 * itself (security definer, checks `is_super_admin()`) — NOT via the
 * `assoc_admin`-scoped `requireBillingAccess` helper used elsewhere in this
 * file, because a super admin viewing an "opened workspace" resolves to
 * `assoc_admin` too (see `getAssociationRole`), so that check alone can't
 * tell a real customer admin apart from a super admin doing a mass wipe.
 */
export async function deleteAllBillsAction(associationId: string): Promise<
  ActionResult & {
    deletedBills?: number;
    deletedPayments?: number;
    deletedReceipts?: number;
  }
> {
  const client = getSupabaseServerClient();

  const { data: isSuperAdmin } = await client.rpc('is_super_admin');
  if (!isSuperAdmin) {
    return { success: false, error: 'Only a super admin can do that.' };
  }

  const { data, error } = await client
    .rpc('super_admin_delete_all_bills', { p_association_id: associationId })
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Best-effort cleanup of cached PDFs orphaned by the delete above — the
  // storage bucket has no FK/cascade tie to the bills table.
  const admin = getSupabaseServerAdminClient();
  for (const prefix of [
    `bills/${associationId}`,
    `receipts/${associationId}`,
  ]) {
    const { data: objects } = await admin.storage
      .from(BILLING_DOCUMENTS_BUCKET)
      .list(prefix);
    if (objects && objects.length > 0) {
      await admin.storage
        .from(BILLING_DOCUMENTS_BUCKET)
        .remove(objects.map((o) => `${prefix}/${o.name}`));
    }
  }

  await logAuditEvent({
    associationId,
    action: 'bills.bulk_deleted',
    entityType: 'bill',
    summary: `Deleted ${data.deleted_bills} bills, ${data.deleted_payments} payments, ${data.deleted_receipts} receipts (super admin bulk delete)`,
  });

  revalidatePath(BILLING_PATH, 'page');
  revalidatePath('/home/[account]/payments', 'page');

  return {
    success: true,
    deletedBills: data.deleted_bills,
    deletedPayments: data.deleted_payments,
    deletedReceipts: data.deleted_receipts,
  };
}

// ── Void bill ─────────────────────────────────────────────────────────────────

export async function voidBillAction(
  associationId: string,
  input: VoidBillInput,
): Promise<ActionResult> {
  const roleError = await requireAdminAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  const parsed = VoidBillSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const { billId, reason } = parsed.data;
  const client = getSupabaseServerClient();

  const { error } = await client.rpc('void_bill', {
    p_bill_id: billId,
    p_reason: reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  after(() =>
    logAuditEvent({
      associationId,
      action: 'bill.voided',
      entityType: 'bill',
      entityId: billId,
      summary: `Bill cancelled. Reason: ${reason}`,
    }),
  );

  revalidatePath(BILLING_PATH, 'page');

  return { success: true };
}

export async function voidBillsBulkAction(
  associationId: string,
  input: VoidBillsBulkInput,
): Promise<ActionResult & { voided?: number }> {
  const roleError = await requireAdminAccess(associationId);
  if (roleError) return { success: false, error: roleError };

  const parsed = VoidBillsBulkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Please check the form.',
    };
  }

  const { period, billType, reason } = parsed.data;
  const client = getSupabaseServerClient();

  const { data, error } = await client.rpc('void_bills_bulk', {
    p_association_id: associationId,
    p_period: period,
    p_bill_type: billType,
    p_reason: reason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const voided = data as unknown as number;

  after(() =>
    logAuditEvent({
      associationId,
      action: 'bill.bulk_voided',
      entityType: 'bill',
      summary: `Bulk cancelled ${voided} bills for ${period} (type: ${billType}). Reason: ${reason}`,
    }),
  );

  revalidatePath(BILLING_PATH, 'page');

  return { success: true, voided };
}
