import 'server-only';
import { after } from 'next/server';

import type { BillingEntityData } from '@kit/pdf-templates';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { getAssociationRole, getCurrentUserId } from '~/lib/rbac';
import { loadPdfRenderer } from '~/lib/server/pdf-renderer';
const LOGO_MAX_PX = 208;
const LOGO_BUCKET = 'account_image';

// Cached processed logos - keyed by raw Storage URL. Survives the process
// lifetime so the logo download + sharp resize only happens once per deploy.
const logoCache = new Map<string, string>();
const logoInflight = new Map<string, Promise<string | null>>();

/**
 * Downloads the association logo from Supabase Storage via the admin client,
 * resizes it to fit 208×208 px, and converts it to a JPEG data URI.
 * Using the admin SDK (not a URL fetch) avoids SSRF filtering and works
 * identically in local dev and production.
 * Falls back to null on any error so PDF generation still succeeds logo-free.
 */
export async function preprocessLogoForPdf(
  rawUrl: string | null | undefined,
): Promise<string | null> {
  if (!rawUrl) return null;
  const cached = logoCache.get(rawUrl);
  if (cached) return cached;

  // Concurrent renders on a cold instance share one download + resize.
  let inflight = logoInflight.get(rawUrl);
  if (!inflight) {
    inflight = processLogo(rawUrl).finally(() => logoInflight.delete(rawUrl));
    logoInflight.set(rawUrl, inflight);
  }

  return inflight;
}

async function processLogo(rawUrl: string): Promise<string | null> {
  // Extract the storage object path from the URL.
  // Local:  http://127.0.0.1:54321/storage/v1/object/public/account_image/<path>
  // Remote: https://<ref>.supabase.co/storage/v1/object/public/account_image/<path>
  const marker = `/object/public/${LOGO_BUCKET}/`;
  const markerIdx = rawUrl.indexOf(marker);
  if (markerIdx === -1) return null;
  const storagePath = rawUrl.slice(markerIdx + marker.length).split('?')[0];
  if (!storagePath) return null;

  const logger = await getLogger();
  try {
    // account_image is a public bucket - prefer a direct HTTP fetch so that
    // cross-environment URLs resolve correctly (e.g. dev DB storing a
    // production Storage URL, which the dev admin client cannot access).
    // Fall back to the admin SDK download for cases where the direct fetch
    // fails (network policy, etc.).
    let buffer: Buffer | null = null;

    // Bounded: a slow Storage response must not stall the download - on a
    // timeout the admin SDK fallback runs, and failing that the PDF renders
    // without the logo.
    const res = await fetch(rawUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    }).catch((err) => {
      logger.warn(
        { rawUrl, err },
        'preprocessLogoForPdf: direct fetch failed, trying admin SDK',
      );
      return null;
    });

    if (res?.ok) {
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      if (res) {
        logger.warn(
          { rawUrl, status: res.status },
          'preprocessLogoForPdf: direct fetch non-OK, trying admin SDK',
        );
      }
      const admin = getSupabaseServerAdminClient();
      const { data, error } = await admin.storage
        .from(LOGO_BUCKET)
        .download(storagePath);
      if (error) {
        logger.error(
          { rawUrl, storagePath, error },
          'preprocessLogoForPdf: admin SDK download failed',
        );
        return null;
      }
      if (!data) return null;
      buffer = Buffer.from(await data.arrayBuffer());
    }

    if (!buffer) return null;

    const sharp = (await import('sharp')).default;
    // Check for alpha channel before JPEG conversion - JPEG has no transparency
    // support, so any alpha pixels map to black by default. Flatten against white
    // when the source has an alpha channel (PNG, WEBP, etc.) so the logo renders
    // on the white PDF background as intended.
    const instance = sharp(buffer);
    const { hasAlpha } = await instance.metadata();
    const jpeg = await instance
      .resize(LOGO_MAX_PX, LOGO_MAX_PX, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten(hasAlpha ? { background: '#ffffff' } : false)
      .jpeg({ quality: 75 })
      .toBuffer();
    const dataUri = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    logoCache.set(rawUrl, dataUri);
    return dataUri;
  } catch (err) {
    logger.error({ rawUrl, err }, 'preprocessLogoForPdf: unexpected error');
    return null;
  }
}
import { getActiveTenancyId } from '~/lib/unit-access';

const BUCKET = 'billing-documents';

const pendingPdfGenerations = new Map<string, Promise<GeneratedPdf | null>>();

/**
 * How a freshly rendered PDF is written to the Storage cache:
 * - 'background' (default for user downloads): the bytes go back to the
 *   caller immediately and the upload + pdf_url write run after the response
 *   via `after()`, taking two or three round trips off every cache miss.
 * - 'inline': awaited before returning - for server flows (pre-render,
 *   dispatch) that rely on pdf_url being set when the call resolves.
 */
type PersistMode = 'inline' | 'background';

interface GenerateOptions {
  skipAuth?: boolean;
  persist?: PersistMode;
}

function persistModeOf(opts?: GenerateOptions): PersistMode {
  return opts?.persist ?? (opts?.skipAuth ? 'inline' : 'background');
}

async function runPersist(mode: PersistMode, task: () => Promise<void>) {
  if (mode === 'inline') {
    await task();
    return;
  }

  // `after` needs a request scope; fall back to awaiting outside of one.
  try {
    after(task);
  } catch {
    await task();
  }
}

/**
 * Records a cached bill PDF's path - but only if the bill still has the
 * amounts and status that were rendered. A payment recorded while the PDF was
 * rendering or uploading changes those fields (and clears pdf_url in the
 * same trigger); writing the path anyway would cache a PDF showing the old
 * paid amount. When they differ nothing is written and the next download
 * renders afresh.
 */
export async function recordCachedBillPdf(
  bill: {
    id: string;
    total_amount: number;
    paid_amount: number;
    advance_applied: number | null;
    status: string;
  },
  storagePath: string,
) {
  let update = getSupabaseServerAdminClient()
    .from('bills')
    .update({
      pdf_url: storagePath,
      pdf_generated_at: new Date().toISOString(),
    })
    .eq('id', bill.id)
    .eq('total_amount', bill.total_amount)
    .eq('paid_amount', bill.paid_amount)
    .eq('status', bill.status);

  update =
    bill.advance_applied === null
      ? update.is('advance_applied', null)
      : update.eq('advance_applied', bill.advance_applied);

  return update;
}

/**
 * Signs a cached PDF path, or returns null when the object is missing. The
 * `download` option makes Storage serve it as an attachment named `filename`
 * (and carries the name in the URL for the client-side downloader).
 */
async function signCachedPdf(
  path: string | null | undefined,
  filename: string,
) {
  if (!path) return null;

  const { data } = await getSupabaseServerAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 300, { download: filename });

  return data?.signedUrl ?? null;
}

export interface GeneratedPdf {
  /** Raw bytes - set when the PDF was just rendered (cache miss). */
  bytes?: Buffer;
  /** Signed Storage URL - set when the PDF was already cached (cache hit). Redirect the browser here directly to avoid proxying through Next.js. */
  signedUrl?: string;
  filename: string;
}

/**
 * The `bills`/`payments` RLS policy only checks association membership
 * (`is_association_member`), not which unit a row belongs to - any role,
 * including tenant/prop_owner, can SELECT any bill in their association.
 * Unit-level scoping ("my unit only") is enforced at the app layer
 * everywhere else (see association-dashboard.tsx's owned/tenancy lookup),
 * so we replicate that same check here before serving a PDF.
 *
 * Owners may access every bill/receipt for a unit they own, regardless of
 * which tenancy was active when it was generated. Tenants may only access
 * bills/receipts attributed to their OWN tenancy (`billTenancyId`) - a bill
 * with no tenancy_id predates any tenant (self-occupied period) and stays
 * accessible, but a bill attributed to a *different* tenancy belongs to a
 * past or future tenant on the same unit and must stay hidden from this one.
 */
async function canAccessUnit(
  associationId: string,
  unitId: string,
  ownerId: string | null,
  billTenancyId: string | null,
): Promise<boolean> {
  const client = getSupabaseServerClient();
  const userId = await getCurrentUserId();

  if (!userId) {
    return false;
  }

  // The role and the caller's active tenancy on this unit are independent, so
  // they're looked up in parallel (the tenancy is only consulted for
  // owners/tenants).
  const [role, tenancyId] = await Promise.all([
    getAssociationRole(associationId),
    ownerId === userId
      ? Promise.resolve(null)
      : getActiveTenancyId(client, unitId, userId),
  ]);

  if (role === 'assoc_admin' || role === 'billing_operator') {
    return true;
  }

  if (!role) {
    return false;
  }

  if (ownerId && ownerId === userId) {
    return true;
  }

  if (!tenancyId) {
    return false;
  }

  return billTenancyId === null || billTenancyId === tenancyId;
}

type UnitBillingFields = {
  bill_to: string;
  owner_id: string | null;
  owner_is_company: boolean;
  owner_company_name: string | null;
  owner_company_address: string | null;
  owner_company_gstin: string | null;
};

type TenancyBillingRow = {
  tenant_id: string;
  is_company: boolean;
  company_name: string | null;
  company_address: string | null;
  company_gstin: string | null;
};

/**
 * Resolves the billing entity for a unit - used for BILL PDFs only.
 * - bill_to=auto: use the tenancy that was active when the bill was
 *   generated, if any, else owner.
 * - bill_to=owner: always owner.
 * - bill_to=tenant: use that tenancy if present, else fall back to owner.
 *
 * `tenancyId` is the specific tenancy row the bill was attributed to at
 * generation time (`bills.tenancy_id`) - NOT "whichever tenancy happens to
 * be active right now". Resolving against the current active tenancy would
 * make an old bill's "Bill To" name silently change to a new tenant's name
 * after a tenancy turnover and PDF cache regeneration.
 */
async function resolveBillingEntity(
  unit: UnitBillingFields,
  tenancyId: string | null,
): Promise<BillingEntityData> {
  const admin = getSupabaseServerAdminClient();

  let tenancy: TenancyBillingRow | null = null;

  if (unit.bill_to !== 'owner' && tenancyId) {
    const { data } = await admin
      .from('tenancies')
      .select(
        'tenant_id, is_company, company_name, company_address, company_gstin',
      )
      .eq('id', tenancyId)
      .maybeSingle();
    tenancy = (data as TenancyBillingRow | null) ?? null;
  }

  if (tenancy !== null) {
    if (tenancy.is_company) {
      return {
        isCompany: true,
        name: tenancy.company_name,
        companyAddress: tenancy.company_address,
        companyGstin: tenancy.company_gstin,
      };
    }
    // tenancies.tenant_id → auth.users(id), not profiles.id - PostgREST cannot
    // resolve profiles() as an embedded join from tenancies. Fetch separately.
    const { data: profileData } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', tenancy.tenant_id)
      .maybeSingle();
    return {
      isCompany: false,
      name: profileData?.full_name ?? null,
      companyAddress: null,
      companyGstin: null,
    };
  }

  // Bill to owner
  if (unit.owner_is_company) {
    return {
      isCompany: true,
      name: unit.owner_company_name,
      companyAddress: unit.owner_company_address,
      companyGstin: unit.owner_company_gstin,
    };
  }

  if (unit.owner_id) {
    const { data: profileData } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', unit.owner_id)
      .maybeSingle();
    const profile = profileData as { full_name: string | null } | null;
    return {
      isCompany: false,
      name: profile?.full_name ?? null,
      companyAddress: null,
      companyGstin: null,
    };
  }

  return {
    isCompany: false,
    name: null,
    companyAddress: null,
    companyGstin: null,
  };
}

/**
 * Resolves the PAYER entity for RECEIPT PDFs - "Received From".
 *
 * Uses `paid_by_role` (the explicit choice made at payment time) rather than
 * `bill_to` (the billing preference on the unit), so the receipt always
 * reflects who actually paid, not who the bill was addressed to.
 *
 * - 'Owner': fetch owner profile / company details from the unit row.
 * - 'Tenant': fetch the tenant profile from `bills.tenancy_id`. Falls back
 *   to the owner if no tenancy is recorded (e.g. self-occupied period).
 */
async function resolvePayerEntity(
  paidByRole: string,
  unit: UnitBillingFields,
  tenancyId: string | null,
): Promise<BillingEntityData> {
  const admin = getSupabaseServerAdminClient();

  if (paidByRole === 'Tenant' && tenancyId) {
    const { data } = await admin
      .from('tenancies')
      .select(
        'tenant_id, is_company, company_name, company_address, company_gstin',
      )
      .eq('id', tenancyId)
      .maybeSingle();
    const tenancy = data as TenancyBillingRow | null;

    if (tenancy) {
      if (tenancy.is_company) {
        return {
          isCompany: true,
          name: tenancy.company_name,
          companyAddress: tenancy.company_address,
          companyGstin: tenancy.company_gstin,
        };
      }
      const { data: profileData } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', tenancy.tenant_id)
        .maybeSingle();
      return {
        isCompany: false,
        name:
          (profileData as { full_name: string | null } | null)?.full_name ??
          null,
        companyAddress: null,
        companyGstin: null,
      };
    }
    // Fall through to owner if tenancy_id was set but row no longer exists.
  }

  // Owner (or fallback)
  if (unit.owner_is_company) {
    return {
      isCompany: true,
      name: unit.owner_company_name,
      companyAddress: unit.owner_company_address,
      companyGstin: unit.owner_company_gstin,
    };
  }

  if (unit.owner_id) {
    const { data: profileData } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', unit.owner_id)
      .maybeSingle();
    return {
      isCompany: false,
      name:
        (profileData as { full_name: string | null } | null)?.full_name ?? null,
      companyAddress: null,
      companyGstin: null,
    };
  }

  return {
    isCompany: false,
    name: null,
    companyAddress: null,
    companyGstin: null,
  };
}

/**
 * Returns the cached bill PDF if one exists, otherwise renders it, caches it
 * in the private `billing-documents` bucket, and stamps `bills.pdf_url`.
 *
 * Authorization is two-layered: the RLS-bound select below confirms the
 * caller is at least a member of the bill's association, then
 * `canAccessUnit` confirms admins/billing operators can see any unit while
 * owners/tenants are restricted to units they actually own or rent.
 *
 * Pass `{ skipAuth: true }` only from server-side generation flows (e.g.
 * post-generation pre-render) where the caller is already authorised.
 */
export async function getOrGenerateBillPdf(
  billId: string,
  opts?: GenerateOptions,
): Promise<GeneratedPdf | null> {
  // Auth is checked independently for every caller before consulting the
  // dedup map - without this, a concurrent second request could receive the
  // shared in-flight promise before its auth is checked.
  if (!opts?.skipAuth) {
    const client = getSupabaseServerClient();
    const { data: billMeta } = await client
      .from('bills')
      .select(
        'association_id, unit_id, tenancy_id, bill_no, pdf_url, units(owner_id)',
      )
      .eq('id', billId)
      .maybeSingle();
    if (!billMeta) return null;

    // Cache-hit fast path: sign the cached object while the access check runs.
    // The URL is only handed back once the caller is authorised.
    const [authorized, signedUrl] = await Promise.all([
      canAccessUnit(
        billMeta.association_id,
        billMeta.unit_id,
        (billMeta.units as unknown as { owner_id: string | null } | null)
          ?.owner_id ?? null,
        billMeta.tenancy_id,
      ),
      signCachedPdf(billMeta.pdf_url, `${billMeta.bill_no}.pdf`),
    ]);
    if (!authorized) return null;

    if (signedUrl) {
      return { signedUrl, filename: `${billMeta.bill_no}.pdf` };
    }

    // Cache miss: start loading and warming the renderer now so it overlaps
    // with the data fetch below.
    void loadPdfRenderer().catch(() => undefined);
  }

  const cacheKey = `bill_${billId}`;
  if (pendingPdfGenerations.has(cacheKey)) {
    return pendingPdfGenerations.get(cacheKey)!;
  }

  const generate = async (): Promise<GeneratedPdf | null> => {
    const logger = await getLogger();
    const admin = getSupabaseServerAdminClient();

    // Fetch the bill using the admin client to ensure we get the full
    // nested association + accounts join (which might otherwise be filtered
    // by RLS for non-members, obscuring the logo). Auth was already confirmed
    // by canAccessUnit() before this generate() closure was entered - the
    // second check is intentionally removed to avoid 6+ serial DB calls.
    const { data: bill, error: billError } = await admin
      .from('bills')
      .select(
        `id, association_id, unit_id, period, bill_no, bill_type, total_amount, gst_amount, paid_amount, advance_applied, status, due_date, generated_at, pdf_url, tenancy_id,
         units(unit_no, door_no, floor, type, bill_to, owner_id, owner_is_company, owner_company_name, owner_company_address, owner_company_gstin),
         bill_line_items(description, gst_applicable, amount, area_sqft, rate_per_sqft),
         associations(address, gstin, pan_number, registration_number, gst_enabled, gst_rate, authorised_signatory, email, phone, bank_account_name, bank_account_number, bank_name, bank_ifsc, bank_branch, accounts(name, picture_url))`,
      )
      .eq('id', billId)
      .maybeSingle();

    if (billError) {
      logger.error(
        { billId, error: billError },
        'Failed to fetch bill for PDF generation',
      );
      return null;
    }

    if (!bill || !bill.units || !bill.associations) {
      logger.warn(
        { billId, found: !!bill },
        'Bill not found, or missing unit/association join, when generating PDF',
      );
      return null;
    }

    const filename = `${bill.bill_no}.pdf`;

    if (bill.pdf_url) {
      const signedUrl = await signCachedPdf(bill.pdf_url, filename);

      if (signedUrl) {
        return { signedUrl, filename };
      }
      // Signed URL creation failed (e.g. object missing) - fall through and regenerate.
    }

    const association = bill.associations;
    const lineItems = bill.bill_line_items ?? [];

    // Type-assert the extended unit fields Supabase's codegen doesn't see
    type ExtendedUnit = {
      unit_no: string;
      door_no: string | null;
      floor: number | null;
      bill_to: string;
      owner_id: string | null;
      owner_is_company: boolean;
      owner_company_name: string | null;
      owner_company_address: string | null;
      owner_company_gstin: string | null;
      type: string | null;
    };
    const unitData = bill.units as unknown as ExtendedUnit;

    type ExtendedAssoc = typeof association & {
      pan_number: string | null;
      email: string | null;
      phone: string | null;
      bank_account_name: string | null;
      bank_account_number: string | null;
      bank_name: string | null;
      bank_ifsc: string | null;
      bank_branch: string | null;
    };
    const assocData = association as unknown as ExtendedAssoc;
    const panNumber = assocData.pan_number ?? null;

    let bytes: Buffer;

    if (bill.bill_type === 'electricity') {
      // CommonArea sub-meters are stored with a placeholder unit_id (the first
      // unit by unit_no) due to the NOT NULL FK constraint. For a Common Area
      // bill, query by meter_type + units join instead of unit_id.
      const isCommonAreaBill = unitData.type === 'Common Area';

      // Fetch mescom_bill, sub_meters, billing entity, and logo in parallel -
      // none of these depend on each other.
      const [{ data: mescomBill }, { data: subMeters }, billTo, logoUrl] =
        await Promise.all([
          admin
            .from('mescom_bills')
            .select('id, invoice_amount, period_start, period_end')
            .eq('association_id', bill.association_id)
            .eq('period', bill.period)
            .maybeSingle(),
          isCommonAreaBill
            ? admin
                .from('sub_meters')
                .select(
                  'id, meter_label, load_kva, units!inner(association_id)',
                )
                .eq('meter_type', 'CommonArea')
                .eq('is_active', true)
                .eq('units.association_id', bill.association_id)
                .order('meter_label')
            : admin
                .from('sub_meters')
                .select('id, meter_label, load_kva')
                .eq('unit_id', bill.unit_id)
                // Exclude CommonArea meters: they carry a FK-placeholder unit_id
                // (the first unit), so they'd otherwise leak into that unit's bill.
                .neq('meter_type', 'CommonArea')
                .eq('is_active', true)
                .order('meter_label'),
          resolveBillingEntity(
            {
              bill_to: unitData.bill_to ?? 'auto',
              owner_id: unitData.owner_id,
              owner_is_company: unitData.owner_is_company ?? false,
              owner_company_name: unitData.owner_company_name ?? null,
              owner_company_address: unitData.owner_company_address ?? null,
              owner_company_gstin: unitData.owner_company_gstin ?? null,
            },
            bill.tenancy_id,
          ),
          preprocessLogoForPdf(association.accounts?.picture_url),
        ]);

      if (!mescomBill) {
        const logger = await getLogger();
        logger.warn(
          { billId: bill.id, period: bill.period },
          'generateElectricityBillPdf: no mescom bill found; rates will be zero',
        );
      }

      const subMeterIds = (subMeters ?? []).map((m) => m.id);

      // Fetch all readings for this mescom bill in one query.
      // Then partition: readings matching this unit's sub-meters → per-meter
      // breakdown table; all readings → denominator for the billing rate.
      // Rate = invoice ÷ sum of all sub-meter consumed units (distributes
      // transmission losses proportionally; includes CommonArea meters).
      const { data: allReadingsForBill } = mescomBill
        ? await admin
            .from('meter_readings')
            .select(
              'sub_meter_id, previous_reading, current_reading, consumed_units, minimum_charge',
            )
            .eq('mescom_bill_id', mescomBill.id)
        : { data: [] };

      const unitSubMeterIdSet = new Set(subMeterIds);
      const meterReadings = (allReadingsForBill ?? []).filter((r) =>
        unitSubMeterIdSet.has(r.sub_meter_id),
      );
      const totalSubMeterUnits = (allReadingsForBill ?? []).reduce(
        (sum, r) => sum + (r.consumed_units ?? 0),
        0,
      );

      const blockRate =
        mescomBill && totalSubMeterUnits > 0
          ? mescomBill.invoice_amount / totalSubMeterUnits
          : 0;

      const meterInfoById = new Map(
        (subMeters ?? []).map((m) => [
          m.id,
          { label: m.meter_label, loadKva: m.load_kva ?? null },
        ]),
      );

      let minimumCharge = 0;
      const meters = meterReadings.map((r) => {
        const consumed =
          r.consumed_units ?? r.current_reading - r.previous_reading;
        const amount = Math.round(consumed * blockRate * 100) / 100;
        minimumCharge += r.minimum_charge ?? 0;
        const info = meterInfoById.get(r.sub_meter_id);
        return {
          meterLabel: info?.label ?? r.sub_meter_id,
          previousReading: r.previous_reading,
          currentReading: r.current_reading,
          consumedUnits: consumed,
          blockRate,
          amount,
          loadKva: info?.loadKva ?? null,
        };
      });

      try {
        const { renderElectricityBillPdf } = await loadPdfRenderer();
        bytes = await renderElectricityBillPdf({
          association: {
            name: association.accounts?.name ?? 'Association',
            address: association.address,
            logoUrl,
            gstin: association.gstin,
            panNumber,
            registrationNumber: association.registration_number ?? null,
            authorisedSignatory: association.authorised_signatory,
            email: assocData.email ?? null,
            phone: assocData.phone ?? null,
            bankAccountName: assocData.bank_account_name ?? null,
            bankAccountNumber: assocData.bank_account_number ?? null,
            bankName: assocData.bank_name ?? null,
            bankIfsc: assocData.bank_ifsc ?? null,
            bankBranch: assocData.bank_branch ?? null,
          },
          unit: {
            unitNo: unitData.unit_no,
            doorNo: unitData.door_no ?? null,
            floor: unitData.floor ?? null,
          },
          billTo,
          bill: {
            billNo: bill.bill_no,
            period: bill.period,
            periodStart: mescomBill?.period_start ?? null,
            periodEnd: mescomBill?.period_end ?? null,
            dueDate: bill.due_date,
            generatedAt: bill.generated_at,
            totalAmount: bill.total_amount,
            paidAmount: bill.paid_amount,
            advanceApplied: bill.advance_applied ?? null,
          },
          meters,
          minimumCharge,
        });
      } catch (error) {
        logger.error(
          { billId, error },
          'Failed to render electricity bill PDF',
        );
        return null;
      }
    } else {
      const [billTo, logoUrl] = await Promise.all([
        resolveBillingEntity(
          {
            bill_to: unitData.bill_to ?? 'auto',
            owner_id: unitData.owner_id,
            owner_is_company: unitData.owner_is_company ?? false,
            owner_company_name: unitData.owner_company_name ?? null,
            owner_company_address: unitData.owner_company_address ?? null,
            owner_company_gstin: unitData.owner_company_gstin ?? null,
          },
          bill.tenancy_id,
        ),
        preprocessLogoForPdf(association.accounts?.picture_url),
      ]);
      try {
        const { renderBillPdf } = await loadPdfRenderer();
        bytes = await renderBillPdf({
          association: {
            name: association.accounts?.name ?? 'Association',
            address: association.address,
            gstin: association.gstin,
            panNumber,
            registrationNumber: association.registration_number ?? null,
            logoUrl,
            gstEnabled: association.gst_enabled,
            gstRate: association.gst_rate,
            email: assocData.email ?? null,
            phone: assocData.phone ?? null,
            bankAccountName: assocData.bank_account_name ?? null,
            bankAccountNumber: assocData.bank_account_number ?? null,
            bankName: assocData.bank_name ?? null,
            bankIfsc: assocData.bank_ifsc ?? null,
            bankBranch: assocData.bank_branch ?? null,
          },
          unit: {
            unitNo: unitData.unit_no,
            doorNo: unitData.door_no ?? null,
            floor: unitData.floor ?? null,
          },
          billTo,
          bill: {
            billNo: bill.bill_no,
            period: bill.period,
            dueDate: bill.due_date,
            generatedAt: bill.generated_at,
            totalAmount: bill.total_amount,
            gstAmount: bill.gst_amount ?? null,
            paidAmount: bill.paid_amount,
            advanceApplied: bill.advance_applied ?? 0,
            status: bill.status,
            billType: bill.bill_type,
          },
          lineItems: lineItems.map((item) => ({
            description: item.description,
            gstApplicable: item.gst_applicable,
            amount: item.amount,
            areaSqft: item.area_sqft ?? null,
            ratePerSqft: item.rate_per_sqft ?? null,
          })),
        });
      } catch (error) {
        logger.error({ billId, error }, 'Failed to render bill PDF');
        return null;
      }
    }

    const storagePath = `bills/${bill.association_id}/${bill.id}.pdf`;
    const pdfBytes = bytes;

    // Cache the render so later downloads (and ZIP exports) are signed-URL
    // hits. bills.pdf_url is only written once the object exists.
    await runPersist(persistModeOf(opts), async () => {
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        logger.error(
          { billId, storagePath, error: uploadError },
          'Failed to cache generated bill PDF in storage',
        );
        return;
      }

      await Promise.all([
        recordCachedBillPdf(bill, storagePath),
        logAuditEvent({
          associationId: bill.association_id,
          action: 'bill.pdf_generated',
          entityType: 'bill',
          entityId: billId,
          summary: `Generated PDF for bill ${bill.bill_no}`,
        }),
      ]);
    });

    return { bytes, filename };
  };

  const promise = generate();
  pendingPdfGenerations.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingPdfGenerations.delete(cacheKey);
  }
}

/**
 * Best-effort background PDF pre-render called after bill generation.
 * Skips auth - only invoke from server-side generation flows (generateBillsAction).
 * Errors are logged and swallowed so one failed render never blocks the others.
 */
export async function preRenderBillPdf(billId: string): Promise<void> {
  try {
    await getOrGenerateBillPdf(billId, { skipAuth: true });
  } catch (err) {
    const logger = await getLogger();
    logger.error(
      { billId, err },
      'preRenderBillPdf: background render failed - will render on first download instead',
    );
  }
}

/**
 * Schedules the documents a new payment affects to be rendered and cached
 * after the response: the payment's receipt, and its bill (whose cached PDF
 * the payment trigger just invalidated, since it prints the paid amount).
 * The first download of either is then a signed-URL hit instead of a render.
 *
 * Skips auth - only call from server flows that already recorded the payment.
 */
export function preRenderPaymentDocumentsAfterResponse(
  payments: { paymentId: string; billId: string }[],
) {
  if (payments.length === 0) return;

  after(async () => {
    const billIds = [...new Set(payments.map((p) => p.billId))];

    await Promise.all([
      ...payments.map(({ paymentId }) =>
        getOrGenerateReceiptPdf(paymentId, { skipAuth: true }).catch(
          async (err) => {
            const logger = await getLogger();
            logger.error(
              { paymentId, err },
              'Receipt pre-render failed - it will render on first download',
            );
          },
        ),
      ),
      ...billIds.map(preRenderBillPdf),
    ]);
  });
}

/**
 * Same cache-then-generate pattern as getOrGenerateBillPdf, for a payment's receipt.
 */
export async function getOrGenerateReceiptPdf(
  paymentId: string,
  opts?: GenerateOptions,
): Promise<GeneratedPdf | null> {
  // Auth pre-check before the dedup map - see getOrGenerateBillPdf for rationale.
  if (!opts?.skipAuth) {
    const authClient = getSupabaseServerClient();
    const { data: paymentMeta } = await authClient
      .from('payments')
      .select(
        'association_id, bills(unit_id, tenancy_id, units(owner_id)), receipts(receipt_no, pdf_url)',
      )
      .eq('id', paymentId)
      .maybeSingle();
    if (!paymentMeta?.bills) return null;
    const bill = paymentMeta.bills as unknown as {
      unit_id: string;
      tenancy_id: string | null;
      units: { owner_id: string | null } | null;
    };
    const metaReceipt = paymentMeta.receipts as
      | { receipt_no: string; pdf_url: string | null }
      | { receipt_no: string; pdf_url: string | null }[]
      | null;
    const cachedReceipt = Array.isArray(metaReceipt)
      ? (metaReceipt[0] ?? null)
      : metaReceipt;

    // Cache-hit fast path: sign while the access check runs; the URL is only
    // returned once the caller is authorised.
    const [authorized, signedUrl] = await Promise.all([
      canAccessUnit(
        paymentMeta.association_id,
        bill.unit_id,
        bill.units?.owner_id ?? null,
        bill.tenancy_id,
      ),
      signCachedPdf(
        cachedReceipt?.pdf_url,
        `${cachedReceipt?.receipt_no ?? paymentId}.pdf`,
      ),
    ]);
    if (!authorized) return null;

    if (signedUrl && cachedReceipt) {
      return { signedUrl, filename: `${cachedReceipt.receipt_no}.pdf` };
    }

    void loadPdfRenderer().catch(() => undefined);
  }

  const cacheKey = `receipt_${paymentId}`;
  if (pendingPdfGenerations.has(cacheKey)) {
    return pendingPdfGenerations.get(cacheKey)!;
  }

  const generate = async (): Promise<GeneratedPdf | null> => {
    const logger = await getLogger();
    const admin = getSupabaseServerAdminClient();

    // Fast-path: check if the PDF is already cached without fetching heavy joins.
    const { data: quickCheck } = await admin
      .from('payments')
      .select('receipts(receipt_no, pdf_url)')
      .eq('id', paymentId)
      .maybeSingle();
    const quickReceipt = quickCheck?.receipts as
      | { receipt_no: string; pdf_url: string | null }
      | { receipt_no: string; pdf_url: string | null }[]
      | null;
    const existingPdfUrl = Array.isArray(quickReceipt)
      ? (quickReceipt[0]?.pdf_url ?? null)
      : (quickReceipt?.pdf_url ?? null);
    const existingReceiptNo = Array.isArray(quickReceipt)
      ? (quickReceipt[0]?.receipt_no ?? null)
      : (quickReceipt?.receipt_no ?? null);
    if (existingPdfUrl && existingReceiptNo) {
      const existingFilename = `${existingReceiptNo}.pdf`;
      const signedUrl = await signCachedPdf(existingPdfUrl, existingFilename);
      if (signedUrl) {
        return { signedUrl, filename: existingFilename };
      }
      // Object missing from storage - fall through to regenerate.
    }

    // Cache miss: fetch with full joins to render the PDF.
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(
        `id, association_id, amount, mode, reference_no, razorpay_payment_id, paid_at, paid_by_role,
         bills(bill_no, period, unit_id, tenancy_id, units(unit_no, door_no, floor, bill_to, owner_id, owner_is_company, owner_company_name, owner_company_address, owner_company_gstin), associations(address, gstin, pan_number, registration_number, email, phone, bank_account_name, bank_account_number, bank_name, bank_ifsc, bank_branch, accounts(name, picture_url))),
         receipts(id, receipt_no, pdf_url, generated_at)`,
      )
      .eq('id', paymentId)
      .maybeSingle();

    if (paymentError) {
      logger.error(
        { paymentId, error: paymentError },
        'Failed to fetch payment for receipt PDF generation',
      );
      return null;
    }

    const receipt = payment?.receipts;

    if (
      !payment ||
      !payment.bills ||
      !payment.bills.units ||
      !payment.bills.associations ||
      !receipt
    ) {
      logger.warn(
        { paymentId, found: !!payment, hasReceipt: !!receipt },
        'Payment not found, missing bill/unit/association join, or no receipt, when generating receipt PDF',
      );
      return null;
    }

    // Access was already checked before entering generate() (same unit and
    // tenancy as the joins above), so it isn't repeated here.

    const filename = `${receipt.receipt_no}.pdf`;

    if (receipt.pdf_url) {
      const signedUrl = await signCachedPdf(receipt.pdf_url, filename);

      if (signedUrl) {
        return { signedUrl, filename };
      }
      // Signed URL creation failed (e.g. object missing) - fall through and regenerate.
    }

    type ExtendedUnit = {
      unit_no: string;
      door_no: string | null;
      floor: number | null;
      bill_to: string;
      owner_id: string | null;
      owner_is_company: boolean;
      owner_company_name: string | null;
      owner_company_address: string | null;
      owner_company_gstin: string | null;
    };
    const unitData = payment.bills.units as unknown as ExtendedUnit;

    const association = payment.bills.associations;
    const paidByRole =
      (payment as unknown as { paid_by_role: string | null }).paid_by_role ??
      'Owner';
    const [billTo, logoUrl] = await Promise.all([
      resolvePayerEntity(paidByRole, unitData, payment.bills.tenancy_id),
      preprocessLogoForPdf(association.accounts?.picture_url),
    ]);
    type ExtendedAssoc = typeof association & {
      pan_number: string | null;
      email: string | null;
      phone: string | null;
      bank_account_name: string | null;
      bank_account_number: string | null;
      bank_name: string | null;
      bank_ifsc: string | null;
      bank_branch: string | null;
    };
    const assocData = association as unknown as ExtendedAssoc;

    let bytes: Buffer;

    try {
      const { renderReceiptPdf } = await loadPdfRenderer();
      bytes = await renderReceiptPdf({
        association: {
          name: association.accounts?.name ?? 'Association',
          address: association.address,
          gstin: association.gstin,
          panNumber: assocData.pan_number ?? null,
          registrationNumber: association.registration_number ?? null,
          logoUrl,
          email: assocData.email ?? null,
          phone: assocData.phone ?? null,
          bankAccountName: assocData.bank_account_name ?? null,
          bankAccountNumber: assocData.bank_account_number ?? null,
          bankName: assocData.bank_name ?? null,
          bankIfsc: assocData.bank_ifsc ?? null,
          bankBranch: assocData.bank_branch ?? null,
        },
        unit: {
          unitNo: unitData.unit_no,
          doorNo: unitData.door_no ?? null,
          floor: unitData.floor ?? null,
        },
        billTo,
        bill: { billNo: payment.bills.bill_no, period: payment.bills.period },
        receipt: {
          receiptNo: receipt.receipt_no,
          generatedAt: receipt.generated_at,
        },
        payment: {
          amount: payment.amount,
          mode: payment.mode,
          paidAt: payment.paid_at,
          referenceNo:
            (payment as unknown as { reference_no: string | null })
              .reference_no ??
            (payment.mode === 'Razorpay'
              ? ((payment as unknown as { razorpay_payment_id: string | null })
                  .razorpay_payment_id ?? null)
              : null),
        },
      });
    } catch (error) {
      logger.error({ paymentId, error }, 'Failed to render receipt PDF');
      return null;
    }

    const storagePath = `receipts/${payment.association_id}/${payment.id}.pdf`;
    const pdfBytes = bytes;

    await runPersist(persistModeOf(opts), async () => {
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        logger.error(
          { paymentId, storagePath, error: uploadError },
          'Failed to cache generated receipt PDF in storage',
        );
        return;
      }

      await Promise.all([
        admin
          .from('receipts')
          .update({ pdf_url: storagePath })
          .eq('id', receipt.id),
        logAuditEvent({
          associationId: payment.association_id,
          action: 'receipt.pdf_generated',
          entityType: 'receipt',
          entityId: receipt.id,
          summary: `Generated PDF for receipt ${receipt.receipt_no}`,
        }),
      ]);
    });

    return { bytes, filename };
  };

  const promise = generate();
  pendingPdfGenerations.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingPdfGenerations.delete(cacheKey);
  }
}

/**
 * Returns the cached advance application PDF if one exists, otherwise renders
 * it and caches it in the private `billing-documents` bucket.
 *
 * Authorization mirrors getOrGenerateReceiptPdf: any member of the association
 * may request the PDF, but owners/tenants are further restricted to units they
 * own or rent via `canAccessUnit`.
 */
export async function getOrGenerateAdvanceApplicationPdf(
  voucherNo: string,
  opts?: Pick<GenerateOptions, 'persist'>,
): Promise<GeneratedPdf | null> {
  const authClient = getSupabaseServerClient();

  const { data: receiptMeta } = await authClient
    .from('advance_application_receipts')
    .select('id, association_id, unit_id, pdf_url, applied_at, units(owner_id)')
    .eq('voucher_no', voucherNo)
    .maybeSingle();

  if (!receiptMeta) return null;

  type ReceiptMeta = {
    id: string;
    association_id: string;
    unit_id: string;
    pdf_url: string | null;
    applied_at: string;
    units: { owner_id: string | null } | null;
  };
  const meta = receiptMeta as ReceiptMeta;

  // Sign the cached object while the access check runs; the URL is only
  // returned once the caller is authorised.
  const [authorized, signedUrl] = await Promise.all([
    canAccessUnit(
      meta.association_id,
      meta.unit_id,
      meta.units?.owner_id ?? null,
      null, // advance applications are not tenancy-scoped; any current tenant may access
    ),
    signCachedPdf(meta.pdf_url, `${voucherNo}.pdf`),
  ]);
  if (!authorized) return null;

  if (signedUrl) {
    return { signedUrl, filename: `${voucherNo}.pdf` };
  }

  void loadPdfRenderer().catch(() => undefined);

  const cacheKey = `advance_application_${voucherNo}`;
  if (pendingPdfGenerations.has(cacheKey)) {
    return pendingPdfGenerations.get(cacheKey)!;
  }

  const generate = async (): Promise<GeneratedPdf | null> => {
    const logger = await getLogger();
    const admin = getSupabaseServerAdminClient();

    const filename = `${voucherNo}.pdf`;

    // Fetch full record for PDF generation.
    // Use authClient - advance_application_receipts has REVOKE ALL FROM service_role.
    const { data: receipt, error } = await authClient
      .from('advance_application_receipts')
      .select(
        `id, voucher_no, bill_type, amount, applied_at,
         bills(bill_no, period, unit_id, tenancy_id,
           units(unit_no, door_no, floor, bill_to, owner_id, owner_is_company, owner_company_name, owner_company_address, owner_company_gstin),
           associations(address, gstin, pan_number, registration_number, email, phone, bank_account_name, bank_account_number, bank_name, bank_ifsc, bank_branch, accounts(name, picture_url)))`,
      )
      .eq('voucher_no', voucherNo)
      .maybeSingle();

    if (error) {
      logger.error(
        { voucherNo, error },
        'Failed to fetch advance application receipt for PDF generation',
      );
      return null;
    }

    type FullReceipt = {
      id: string;
      voucher_no: string;
      bill_type: string;
      amount: number;
      applied_at: string;
      bills: {
        bill_no: string;
        period: string;
        unit_id: string;
        tenancy_id: string | null;
        units: {
          unit_no: string;
          door_no: string | null;
          floor: number | null;
          bill_to: string;
          owner_id: string | null;
          owner_is_company: boolean;
          owner_company_name: string | null;
          owner_company_address: string | null;
          owner_company_gstin: string | null;
        } | null;
        associations: {
          address: string | null;
          gstin: string | null;
          pan_number: string | null;
          registration_number: string | null;
          email: string | null;
          phone: string | null;
          bank_account_name: string | null;
          bank_account_number: string | null;
          bank_name: string | null;
          bank_ifsc: string | null;
          bank_branch: string | null;
          accounts: { name: string | null; picture_url: string | null } | null;
        } | null;
      } | null;
    };

    const r = receipt as FullReceipt | null;

    if (!r?.bills?.units || !r.bills.associations) {
      logger.warn(
        { voucherNo },
        'Advance application receipt missing bill/unit/association join',
      );
      return null;
    }

    const unitData = r.bills.units;
    const association = r.bills.associations;

    // Resolve "Received From" as whoever paid the advance into the ledger.
    // The advance_application_receipts row is a debit; the original credit
    // entries for that unit/bill_type carry paid_by_user_id and paid_by_name.
    // Use the most recent advance credit as the attributed payer - it is the
    // best approximation when multiple deposits exist.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cashLedgerAdmin = admin as any;
    const advancePayerEntityPromise: Promise<BillingEntityData> =
      Promise.resolve(
        cashLedgerAdmin
          .from('cash_ledger')
          .select('paid_by_user_id, paid_by_name')
          .eq('unit_id', meta.unit_id)
          .eq('bill_type', r.bill_type)
          .eq('entry_type', 'advance_payment')
          .eq('direction', 'credit')
          .order('entry_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ).then(async ({ data: creditEntry }: { data: unknown }) => {
        if (!creditEntry) {
          // No advance credit found - fall back to owner.
          return resolvePayerEntity('Owner', unitData, null);
        }
        const entry = creditEntry as {
          paid_by_user_id: string | null;
          paid_by_name: string;
        };
        if (entry.paid_by_user_id) {
          const { data: profile } = await admin
            .from('profiles')
            .select('full_name')
            .eq('id', entry.paid_by_user_id)
            .maybeSingle();
          return {
            isCompany: false,
            name:
              (profile as { full_name: string | null } | null)?.full_name ??
              entry.paid_by_name ??
              null,
            companyAddress: null,
            companyGstin: null,
          } satisfies BillingEntityData;
        }
        // paid_by_user_id is null - admin entered free-text name
        return {
          isCompany: false,
          name: entry.paid_by_name || null,
          companyAddress: null,
          companyGstin: null,
        } satisfies BillingEntityData;
      });

    const [billTo, logoUrl] = await Promise.all([
      advancePayerEntityPromise,
      preprocessLogoForPdf(association.accounts?.picture_url),
    ]);

    let bytes: Buffer;
    try {
      const { renderAdvanceApplicationPdf } = await loadPdfRenderer();
      bytes = await renderAdvanceApplicationPdf({
        association: {
          name: association.accounts?.name ?? 'Association',
          address: association.address,
          gstin: association.gstin,
          panNumber: association.pan_number ?? null,
          registrationNumber: association.registration_number ?? null,
          logoUrl,
          email: association.email ?? null,
          phone: association.phone ?? null,
          bankAccountName: association.bank_account_name ?? null,
          bankAccountNumber: association.bank_account_number ?? null,
          bankName: association.bank_name ?? null,
          bankIfsc: association.bank_ifsc ?? null,
          bankBranch: association.bank_branch ?? null,
        },
        unit: {
          unitNo: unitData.unit_no,
          doorNo: unitData.door_no ?? null,
          floor: unitData.floor ?? null,
        },
        billTo,
        voucher: {
          voucherNo: r.voucher_no,
          appliedAt: r.applied_at,
        },
        application: {
          billNo: r.bills.bill_no,
          billType: r.bill_type,
          period: r.bills.period,
          amountApplied: Number(r.amount),
        },
      });
    } catch (renderError) {
      logger.error(
        { voucherNo, error: renderError },
        'Failed to render advance application PDF',
      );
      return null;
    }

    const storagePath = `advance-applications/${meta.association_id}/${voucherNo}.pdf`;
    const pdfBytes = bytes;

    await runPersist(opts?.persist ?? 'background', async () => {
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        logger.error(
          { voucherNo, storagePath, error: uploadError },
          'Failed to cache advance application PDF',
        );
        return;
      }

      const [{ error: updateError }] = await Promise.all([
        admin
          .from('advance_application_receipts')
          .update({ pdf_url: storagePath })
          .eq('id', meta.id),
        logAuditEvent({
          associationId: meta.association_id,
          action: 'receipt.pdf_generated',
          entityType: 'advance_application_receipt',
          entityId: meta.id,
          summary: `Generated PDF for advance application voucher ${voucherNo}`,
        }),
      ]);

      if (updateError) {
        logger.error(
          { voucherNo, error: updateError },
          'Failed to record cached advance application PDF path',
        );
      }
    });

    return { bytes, filename };
  };

  const promise = generate();
  pendingPdfGenerations.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingPdfGenerations.delete(cacheKey);
  }
}
