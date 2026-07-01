import 'server-only';
import { renderBillPdf, renderReceiptPdf } from '@kit/pdf-templates';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { getAssociationRole } from '~/lib/rbac';
import { checkUnitAccess } from '~/lib/unit-access';

const BUCKET = 'billing-documents';

const pendingPdfGenerations = new Map<string, Promise<GeneratedPdf | null>>();

export interface GeneratedPdf {
  /** Raw bytes — set when the PDF was just rendered (cache miss). */
  bytes?: Buffer;
  /** Signed Storage URL — set when the PDF was already cached (cache hit). Redirect the browser here directly to avoid proxying through Next.js. */
  signedUrl?: string;
  filename: string;
}

/**
 * The `bills`/`payments` RLS policy only checks association membership
 * (`is_association_member`), not which unit a row belongs to — any role,
 * including tenant/prop_owner, can SELECT any bill in their association.
 * Unit-level scoping ("my unit only") is enforced at the app layer
 * everywhere else (see association-dashboard.tsx's owned/tenancy lookup),
 * so we replicate that same check here before serving a PDF.
 */
async function canAccessUnit(
  associationId: string,
  unitId: string,
): Promise<boolean> {
  const role = await getAssociationRole(associationId);

  if (role === 'assoc_admin' || role === 'billing_operator') {
    return true;
  }

  if (!role) {
    return false;
  }

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return false;
  }

  return checkUnitAccess(client, unitId, user.id);
}

/**
 * Returns the cached bill PDF if one exists, otherwise renders it, caches it
 * in the private `billing-documents` bucket, and stamps `bills.pdf_url`.
 *
 * Authorization is two-layered: the RLS-bound select below confirms the
 * caller is at least a member of the bill's association, then
 * `canAccessUnit` confirms admins/billing operators can see any unit while
 * owners/tenants are restricted to units they actually own or rent.
 */
export async function getOrGenerateBillPdf(
  billId: string,
): Promise<GeneratedPdf | null> {
  const cacheKey = `bill_${billId}`;
  if (pendingPdfGenerations.has(cacheKey)) {
    return pendingPdfGenerations.get(cacheKey)!;
  }

  const generate = async (): Promise<GeneratedPdf | null> => {
    const logger = await getLogger();
    const admin = getSupabaseServerAdminClient();

    // Fetch the bill using the admin client to ensure we get the full
    // nested association + accounts join (which might otherwise be filtered
    // by RLS for non-members, obscuring the logo). We manually authorize
    // the user via `canAccessUnit` immediately below.
    const { data: bill, error: billError } = await admin
      .from('bills')
      .select(
        `id, association_id, unit_id, period, bill_no, total_amount, paid_amount, status, due_date, generated_at, pdf_url,
         units(unit_no),
         bill_line_items(description, payer, gst_applicable, amount),
         associations(address, gstin, gst_enabled, gst_rate, accounts(name, picture_url))`,
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

    if (!(await canAccessUnit(bill.association_id, bill.unit_id))) {
      logger.warn(
        { billId, associationId: bill.association_id, unitId: bill.unit_id },
        "Caller is not authorized to access this bill's unit",
      );
      return null;
    }

    const filename = `${bill.bill_no}.pdf`;

    if (bill.pdf_url) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(bill.pdf_url, 300);

      if (signed?.signedUrl) {
        return { signedUrl: signed.signedUrl, filename };
      }
      // Signed URL creation failed (e.g. object missing) — fall through and regenerate.
    }

    const association = bill.associations;
    const lineItems = bill.bill_line_items ?? [];

    let bytes: Buffer;

    try {
      bytes = await renderBillPdf({
        association: {
          name: association.accounts?.name ?? 'Association',
          address: association.address,
          gstin: association.gstin,
          logoUrl: association.accounts?.picture_url ?? null,
          gstEnabled: association.gst_enabled,
          gstRate: association.gst_rate,
        },
        unit: { unitNo: bill.units.unit_no },
        bill: {
          billNo: bill.bill_no,
          period: bill.period,
          dueDate: bill.due_date,
          generatedAt: bill.generated_at,
          totalAmount: bill.total_amount,
          paidAmount: bill.paid_amount,
          status: bill.status,
        },
        lineItems: lineItems.map((item) => ({
          description: item.description,
          payer: item.payer as 'Owner' | 'Tenant',
          gstApplicable: item.gst_applicable,
          amount: item.amount,
        })),
      });
    } catch (error) {
      logger.error({ billId, error }, 'Failed to render bill PDF');
      throw error;
    }

    const storagePath = `bills/${bill.association_id}/${bill.id}.pdf`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      logger.error(
        { billId, storagePath, error: uploadError },
        'Failed to cache generated bill PDF in storage',
      );
    } else {
      await admin
        .from('bills')
        .update({
          pdf_url: storagePath,
          pdf_generated_at: new Date().toISOString(),
        })
        .eq('id', billId);

      await logAuditEvent({
        associationId: bill.association_id,
        action: 'bill.pdf_generated',
        entityType: 'bill',
        entityId: billId,
        summary: `Generated PDF for bill ${bill.bill_no}`,
      });
    }

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
 * Same cache-then-generate pattern as getOrGenerateBillPdf, for a payment's receipt.
 */
export async function getOrGenerateReceiptPdf(
  paymentId: string,
): Promise<GeneratedPdf | null> {
  const cacheKey = `receipt_${paymentId}`;
  if (pendingPdfGenerations.has(cacheKey)) {
    return pendingPdfGenerations.get(cacheKey)!;
  }

  const generate = async (): Promise<GeneratedPdf | null> => {
    const logger = await getLogger();
    const admin = getSupabaseServerAdminClient();

    // Fetch the payment using the admin client to ensure we get the full
    // nested association + accounts join (which might otherwise be filtered
    // by RLS for non-members, obscuring the logo). We manually authorize
    // the user via `canAccessUnit` immediately below.
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(
        `id, association_id, amount, mode, paid_by_role, paid_at,
         bills(bill_no, period, unit_id, units(unit_no), associations(address, gstin, accounts(name, picture_url))),
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

    if (!(await canAccessUnit(payment.association_id, payment.bills.unit_id))) {
      logger.warn(
        {
          paymentId,
          associationId: payment.association_id,
          unitId: payment.bills.unit_id,
        },
        "Caller is not authorized to access this payment's unit",
      );
      return null;
    }

    const filename = `${receipt.receipt_no}.pdf`;

    if (receipt.pdf_url) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(receipt.pdf_url, 300);

      if (signed?.signedUrl) {
        return { signedUrl: signed.signedUrl, filename };
      }
      // Signed URL creation failed (e.g. object missing) — fall through and regenerate.
    }

    const association = payment.bills.associations;

    let bytes: Buffer;

    try {
      bytes = await renderReceiptPdf({
        association: {
          name: association.accounts?.name ?? 'Association',
          address: association.address,
          gstin: association.gstin,
          logoUrl: association.accounts?.picture_url ?? null,
        },
        unit: { unitNo: payment.bills.units.unit_no },
        bill: { billNo: payment.bills.bill_no, period: payment.bills.period },
        receipt: {
          receiptNo: receipt.receipt_no,
          generatedAt: receipt.generated_at,
        },
        payment: {
          amount: payment.amount,
          mode: payment.mode,
          paidByRole: payment.paid_by_role as 'Owner' | 'Tenant',
          paidAt: payment.paid_at,
        },
      });
    } catch (error) {
      logger.error({ paymentId, error }, 'Failed to render receipt PDF');
      throw error;
    }

    const storagePath = `receipts/${payment.association_id}/${payment.id}.pdf`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      logger.error(
        { paymentId, storagePath, error: uploadError },
        'Failed to cache generated receipt PDF in storage',
      );
    } else {
      await admin
        .from('receipts')
        .update({ pdf_url: storagePath })
        .eq('id', receipt.id);

      await logAuditEvent({
        associationId: payment.association_id,
        action: 'receipt.pdf_generated',
        entityType: 'receipt',
        entityId: receipt.id,
        summary: `Generated PDF for receipt ${receipt.receipt_no}`,
      });
    }

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
