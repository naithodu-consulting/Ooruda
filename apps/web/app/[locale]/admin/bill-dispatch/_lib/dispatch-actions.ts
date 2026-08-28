'use server';

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { isSuperAdmin } from '@kit/admin';
import {
  renderBillDispatchEmail,
  renderReceiptDispatchEmail,
} from '@kit/email-templates';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  getOrGenerateBillPdf,
  getOrGenerateReceiptPdf,
} from '~/home/[account]/billing/_lib/server/pdf-generation';
import { logAuditEvent } from '~/lib/audit-log';

const EMAIL_SENDER = process.env.EMAIL_SENDER;
if (!EMAIL_SENDER) throw new Error('EMAIL_SENDER env var is not set');

export interface SendBillEmailsInput {
  associationName: string;
  mode: 'bills' | 'receipts';
  items: {
    billId: string;
    paymentId: string | null;
    receiptId: string | null;
    unitNo: string;
    recipientName: string;
    recipientEmail: string;
    period: string;
    billNo: string;
    billType: string;
    totalAmount: number;
    paidAmount: number;
    dueDate: string;
    pdfUrl: string | null;
    receiptPdfUrl: string | null;
  }[];
}

export interface SendBillEmailsResult {
  sent: number;
  failed: { unitNo: string; reason: string }[];
}

/**
 * Returns the PDF bytes for a bill or receipt, generating it on-the-fly if
 * the cached storage path is missing (e.g. after a template-invalidating
 * migration). Admin-only: both generation calls bypass RLS auth.
 */
async function getPdfBytes(
  item: SendBillEmailsInput['items'][number],
  isBillMode: boolean,
): Promise<Buffer> {
  const admin = getSupabaseServerAdminClient();

  if (isBillMode) {
    const result = await getOrGenerateBillPdf(item.billId, { skipAuth: true });
    if (!result) throw new Error('Bill PDF could not be generated');

    if (result.bytes) return result.bytes;

    // Cache hit — signedUrl returned. Use item.pdfUrl (storage path) to
    // download, but if the storage object was deleted after the query snapshot,
    // createSignedUrl still succeeds — so we catch the 404 and force-regenerate.
    const storagePath = item.pdfUrl;
    if (!storagePath) {
      // pdf_url was null at query time but generation just cached it — re-read.
      const { data } = await admin
        .from('bills')
        .select('pdf_url')
        .eq('id', item.billId)
        .single();
      if (!data?.pdf_url)
        throw new Error('Bill PDF was generated but storage path is missing');
      return downloadFromStorage(admin, data.pdf_url);
    }
    try {
      return await downloadFromStorage(admin, storagePath);
    } catch {
      // Storage object missing (deleted after cache entry was written).
      // Null the cached path and regenerate.
      await admin
        .from('bills')
        .update({ pdf_url: null, pdf_generated_at: null })
        .eq('id', item.billId);
      const retry = await getOrGenerateBillPdf(item.billId, {
        skipAuth: true,
      });
      if (!retry?.bytes)
        throw new Error('Bill PDF could not be regenerated after storage miss');
      return retry.bytes;
    }
  }

  // Receipts mode
  if (!item.paymentId)
    throw new Error('No payment found for this bill — cannot generate receipt');

  const result = await getOrGenerateReceiptPdf(item.paymentId, {
    skipAuth: true,
  });
  if (!result) throw new Error('Receipt PDF could not be generated');

  if (result.bytes) return result.bytes;

  // Cache hit — resolve storage path via payment_id (matches generation call).
  const storagePath = item.receiptPdfUrl;
  if (!storagePath) {
    const { data } = await admin
      .from('receipts')
      .select('pdf_url')
      .eq('payment_id', item.paymentId)
      .single();
    if (!data?.pdf_url)
      throw new Error('Receipt PDF was generated but storage path is missing');
    return downloadFromStorage(admin, data.pdf_url);
  }
  try {
    return await downloadFromStorage(admin, storagePath);
  } catch {
    // Storage object missing — null cache and regenerate.
    await admin
      .from('receipts')
      .update({ pdf_url: null })
      .eq('payment_id', item.paymentId);
    const retry = await getOrGenerateReceiptPdf(item.paymentId, {
      skipAuth: true,
    });
    if (!retry?.bytes)
      throw new Error(
        'Receipt PDF could not be regenerated after storage miss',
      );
    return retry.bytes;
  }
}

async function downloadFromStorage(
  client: SupabaseClient,
  storagePath: string,
): Promise<Buffer> {
  const { data, error } = await client.storage
    .from('billing-documents')
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      `Could not download PDF from storage${error ? `: ${error.message}` : ''}`,
    );
  }

  return Buffer.from(await data.arrayBuffer());
}

/**
 * Bill numbers contain slashes ("DT/26-27/MNT/000006") which are path
 * separators — they must not reach an attachment filename.
 */
function toSafeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  attachmentBase64: string;
  attachmentName: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: EMAIL_SENDER,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      reply_to: EMAIL_SENDER,
      headers: {
        'List-Unsubscribe': `<mailto:${EMAIL_SENDER}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [{ name: 'email_type', value: 'bill_dispatch' }],
      attachments: [
        { filename: params.attachmentName, content: params.attachmentBase64 },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Email delivery failed (HTTP ${res.status})`);
  }
}

export async function sendBillEmailsAction(
  input: SendBillEmailsInput,
): Promise<SendBillEmailsResult> {
  if (!(await isSuperAdmin(getSupabaseServerClient()))) {
    throw new Error('Unauthorized');
  }

  const logger = await getLogger();
  const failed: { unitNo: string; reason: string }[] = [];
  let sent = 0;

  for (const item of input.items) {
    try {
      const isBillMode = input.mode === 'bills';

      // Auto-generate the PDF if the cache was invalidated (pdf_url = null).
      // getOrGenerateBillPdf / getOrGenerateReceiptPdf deduplicate concurrent
      // calls and stamp the result back to bills.pdf_url / receipts.pdf_url.
      const pdfBuffer = await getPdfBytes(item, isBillMode);
      const attachmentBase64 = pdfBuffer.toString('base64');

      const { html, subject } = isBillMode
        ? await renderBillDispatchEmail({
            ownerName: item.recipientName,
            unitNo: item.unitNo,
            billNo: item.billNo,
            billType: item.billType,
            period: item.period,
            totalAmount: item.totalAmount,
            dueDate: item.dueDate,
            associationName: input.associationName,
          })
        : await renderReceiptDispatchEmail({
            ownerName: item.recipientName,
            unitNo: item.unitNo,
            billNo: item.billNo,
            billType: item.billType,
            period: item.period,
            paidAmount: item.paidAmount,
            associationName: input.associationName,
          });

      const safeBillNo = toSafeFilename(item.billNo);
      const safePeriod = toSafeFilename(item.period);
      const attachmentName = isBillMode
        ? `Bill_${safeBillNo}_${safePeriod}.pdf`
        : `Receipt_${safeBillNo}_${safePeriod}.pdf`;

      await sendViaResend({
        to: item.recipientEmail,
        subject,
        html,
        attachmentBase64,
        attachmentName,
      });

      sent++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';

      // The client only ever sees the sanitized reason, so this is the only
      // place the underlying cause is recoverable.
      logger.error(
        {
          name: 'admin-audit',
          action: 'bill-dispatch-item-failed',
          unitNo: item.unitNo,
          billNo: item.billNo,
          error: err instanceof Error ? err.stack : String(err),
        },
        `Bill dispatch failed for unit ${item.unitNo}: ${reason}`,
      );

      void logAuditEvent({
        action: 'bill_dispatch.item.failed',
        entityType: 'bill',
        eventType: 'error',
        summary: `Bill dispatch failed for unit ${item.unitNo} (${input.associationName}): ${reason}`,
        metadata: {
          unitNo: item.unitNo,
          billNo: item.billNo,
          mode: input.mode,
        },
        useAdminClient: true,
      });

      failed.push({ unitNo: item.unitNo, reason });
    }
  }

  logger.info(
    {
      name: 'admin-audit',
      action: 'bill-dispatch',
      mode: input.mode,
      associationName: input.associationName,
      totalItems: input.items.length,
      sent,
      failedCount: failed.length,
    },
    'Bill dispatch completed',
  );

  void logAuditEvent({
    action: 'bill_dispatch.completed',
    entityType: 'bill',
    eventType: failed.length > 0 ? 'error' : 'user_action',
    summary: `Dispatched ${sent}/${input.items.length} ${input.mode} emails for ${input.associationName}`,
    metadata: {
      mode: input.mode,
      sent,
      failed: failed.length,
      associationName: input.associationName,
    },
    useAdminClient: true,
  });

  return { sent, failed };
}
