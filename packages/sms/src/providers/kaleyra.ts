import 'server-only';
import type { ISmsProvider, SmsResponse } from '../types';

/**
 * Kaleyra SMS/WhatsApp OTP provider.
 *
 * Environment variables:
 *   KALEYRA_API_KEY           — API key from Kaleyra dashboard
 *   KALEYRA_SID               — Account SID (e.g. AXIN1871893356IN)
 *   KALEYRA_SENDER_ID         — Registered sender/alphanumeric ID (e.g. ABCSOL)
 *   KALEYRA_SMS_TEMPLATE_ID   — DLT template ID (required for India)
 *   KALEYRA_REGION            — "IN" | "SG" | "EU" | "NA"  (default: "IN")
 *   KALEYRA_CHANNEL           — "sms" | "whatsapp"  (default: "sms")
 *
 * WhatsApp-specific (when KALEYRA_CHANNEL=whatsapp):
 *   KALEYRA_WA_FROM               — WhatsApp sender number (e.g. +919XXXXXXXXX)
 *   KALEYRA_WA_TEMPLATE_NAME      — Approved WA template name for OTP
 *   KALEYRA_WA_TEMPLATE_LANG      — Template language code (default: "en")
 *   KALEYRA_WA_HAS_COPY_BUTTON    — "true" if template has a copy-code button component
 *
 * NOTE: the Kaleyra send logic is intentionally duplicated in
 * apps/web/supabase/functions/custom-sms-hook/index.ts (Deno-compatible copy).
 * Keep both in sync when making changes here.
 */

// Region → API host mapping per Kaleyra docs
const REGION_HOSTS: Record<string, string> = {
  IN: 'api.in.kaleyra.io',
  SG: 'api.kaleyra.io',
  EU: 'api.eu.kaleyra.io',
  NA: 'api.na.kaleyra.io',
};

// Supabase always stores phone in E.164 (+91XXXXXXXXXX). Always emit + prefix.
function normalizePhone(phone: string): string {
  return `+${phone.replace(/\D/g, '')}`;
}

export class KaleyraProvider implements ISmsProvider {
  private readonly apiKey = process.env.KALEYRA_API_KEY ?? '';
  private readonly sid = process.env.KALEYRA_SID ?? '';
  private readonly senderId = process.env.KALEYRA_SENDER_ID ?? 'KLRHXA';
  private readonly smsTemplateId = process.env.KALEYRA_SMS_TEMPLATE_ID ?? '';
  private readonly region = (process.env.KALEYRA_REGION ?? 'IN').toUpperCase();
  private readonly channel = (process.env.KALEYRA_CHANNEL ?? 'sms').toLowerCase();
  private readonly waFrom = process.env.KALEYRA_WA_FROM ?? '';
  private readonly waTemplateName = process.env.KALEYRA_WA_TEMPLATE_NAME ?? '';
  private readonly waTemplateLang = process.env.KALEYRA_WA_TEMPLATE_LANG ?? 'en';
  private readonly waHasCopyButton = process.env.KALEYRA_WA_HAS_COPY_BUTTON === 'true';

  async sendOtp(phone: string, otp: string): Promise<SmsResponse> {
    if (!this.apiKey || !this.sid) {
      return { success: false, error: 'Kaleyra credentials missing (KALEYRA_API_KEY, KALEYRA_SID).' };
    }

    try {
      return this.channel === 'whatsapp'
        ? await this.sendWhatsAppOtp(phone, otp)
        : await this.sendSmsOtp(phone, otp);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  private async sendSmsOtp(phone: string, otp: string): Promise<SmsResponse> {
    const host = REGION_HOSTS[this.region] ?? REGION_HOSTS['IN']!;
    const url = `https://${host}/v1/${this.sid}/messages`;

    const body = new URLSearchParams({
      to: normalizePhone(phone),
      type: 'OTP',
      sender: this.senderId,
      body: `${otp} is your login verification code for Ooruda. Do not share it with anyone. Valid for 10 minutes.\r\n\r\n - Habbaa Solutions`,
    });

    if (this.smsTemplateId) {
      body.set('template_id', this.smsTemplateId);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'api-key': this.apiKey,
      },
      body: body.toString(),
    });

    const data = (await res.json()) as {
      data?: { id?: string; message_id?: string } | null;
      error?: { message?: string } | string;
    };

    if (res.ok && data.data) {
      return { success: true, messageId: data.data.id ?? data.data.message_id ?? 'kaleyra-ok' };
    }

    const errMsg =
      typeof data.error === 'string'
        ? data.error
        : (data.error?.message ?? `Kaleyra SMS failed (${res.status})`);
    return { success: false, error: errMsg };
  }

  private async sendWhatsAppOtp(phone: string, otp: string): Promise<SmsResponse> {
    if (!this.waFrom || !this.waTemplateName) {
      return {
        success: false,
        error: 'Kaleyra WhatsApp config missing (KALEYRA_WA_FROM, KALEYRA_WA_TEMPLATE_NAME).',
      };
    }

    const host = REGION_HOSTS[this.region] ?? REGION_HOSTS['IN']!;
    const url = `https://${host}/v2/${this.sid}/whatsapp/messages`;

    const components: object[] = [
      { type: 'body', parameters: [{ type: 'text', text: otp }] },
    ];

    // Only include button component for authentication templates with copy-code button
    if (this.waHasCopyButton) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: otp }],
      });
    }

    const payload = {
      to: normalizePhone(phone),
      from: this.waFrom,
      channel: 'whatsapp',
      content: {
        type: 'template',
        template: {
          name: this.waTemplateName,
          language: { code: this.waTemplateLang },
          components,
        },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      data?: { id?: string; message_id?: string } | null;
      error?: { message?: string } | string;
    };

    if (res.ok && data.data) {
      return { success: true, messageId: data.data.id ?? data.data.message_id ?? 'kaleyra-wa-ok' };
    }

    const errMsg =
      typeof data.error === 'string'
        ? data.error
        : (data.error?.message ?? `Kaleyra WhatsApp failed (${res.status})`);
    return { success: false, error: errMsg };
  }
}
