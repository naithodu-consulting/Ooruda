'use server';

import 'server-only';
import { isSuperAdmin } from '@kit/admin';
import {
  renderBillDispatchEmail,
  renderReceiptDispatchEmail,
} from '@kit/email-templates';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { DISPATCH_SENDER_EMAIL } from './dispatch-config';

export interface SendBillEmailsInput {
  associationName: string;
  mode: 'bills' | 'receipts';
  items: {
    billId: string;
    receiptId: string | null;
    unitNo: string;
    ownerName: string;
    ownerEmail: string;
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

async function fetchPdfAsBase64(storagePath: string): Promise<string | null> {
  const client = getSupabaseServerAdminClient();
  const { data, error } = await client.storage
    .from('billing-documents')
    .download(storagePath);
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer.toString('base64');
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
  attachmentBase64: string | null;
  attachmentName: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const body: Record<string, unknown> = {
    from: DISPATCH_SENDER_EMAIL,
    to: [params.to],
    subject: params.subject,
    html: params.html,
  };

  if (params.attachmentBase64) {
    body.attachments = [
      {
        filename: params.attachmentName,
        content: params.attachmentBase64,
      },
    ];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
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
      const pdfPath = isBillMode
        ? item.pdfUrl
        : (item.receiptPdfUrl ?? item.pdfUrl);

      const [attachmentBase64] = await Promise.all([
        pdfPath ? fetchPdfAsBase64(pdfPath) : Promise.resolve(null),
      ]);

      const { html, subject } = isBillMode
        ? await renderBillDispatchEmail({
            ownerName: item.ownerName,
            unitNo: item.unitNo,
            billNo: item.billNo,
            billType: item.billType,
            period: item.period,
            totalAmount: item.totalAmount,
            dueDate: item.dueDate,
            associationName: input.associationName,
          })
        : await renderReceiptDispatchEmail({
            ownerName: item.ownerName,
            unitNo: item.unitNo,
            billNo: item.billNo,
            billType: item.billType,
            period: item.period,
            paidAmount: item.paidAmount,
            associationName: input.associationName,
          });

      const safePeriod = item.period.replace('-', '_');
      const attachmentName = isBillMode
        ? `Bill_${item.billNo}_${safePeriod}.pdf`
        : `Receipt_${item.billNo}_${safePeriod}.pdf`;

      await sendViaResend({
        to: item.ownerEmail,
        subject,
        html,
        attachmentBase64,
        attachmentName,
      });

      sent++;
    } catch (err) {
      failed.push({
        unitNo: item.unitNo,
        reason: err instanceof Error ? err.message : 'Unknown error',
      });
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

  return { sent, failed };
}
