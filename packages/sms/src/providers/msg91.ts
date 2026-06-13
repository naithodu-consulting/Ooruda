import type { ISmsProvider, SmsResponse } from '../types';

export class Msg91SmsProvider implements ISmsProvider {
  private readonly authKey = process.env.MSG91_AUTH_KEY ?? '';
  private readonly templateId = process.env.MSG91_TEMPLATE_ID ?? '';

  async sendOtp(phone: string, otp: string): Promise<SmsResponse> {
    if (!this.authKey || !this.templateId) {
      return {
        success: false,
        error: 'MSG91 credentials missing (MSG91_AUTH_KEY, MSG91_TEMPLATE_ID).',
      };
    }

    // MSG91 expects digits only with country code, no leading +
    let cleaned = phone.replace(/\D/g, '');
    if (phone.startsWith('+')) cleaned = phone.slice(1).replace(/\D/g, '');
    if (cleaned.length === 10) cleaned = '91' + cleaned;

    try {
      const res = await fetch(
        `https://control.msg91.com/api/v5/otp?template_id=${this.templateId}&mobile=${cleaned}&otp=${otp}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authkey: this.authKey,
          },
        },
      );
      const data = (await res.json()) as {
        type?: string;
        Status?: string;
        request_id?: string;
        message?: string;
      };

      if (res.ok && (data.type === 'success' || data.Status === 'Success')) {
        return { success: true, messageId: data.request_id ?? 'msg91-ok' };
      }
      return { success: false, error: data.message ?? 'MSG91 send failed.' };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
