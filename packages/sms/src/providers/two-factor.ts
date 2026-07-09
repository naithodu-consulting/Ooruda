import type { ISmsProvider, SmsResponse } from '../types';

export class TwoFactorSmsProvider implements ISmsProvider {
  private readonly apiKey = process.env.TWOFACTOR_API_KEY ?? '';
  private readonly templateName = process.env.TWOFACTOR_TEMPLATE_NAME ?? '';

  async sendOtp(phone: string, otp: string): Promise<SmsResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        error: '2Factor API key missing (TWOFACTOR_API_KEY).',
      };
    }

    const cleaned = phone.replace(/\D/g, '');

    try {
      const url = this.templateName
        ? `https://2factor.in/API/V1/${this.apiKey}/SMS/${cleaned}/${otp}/${this.templateName}`
        : `https://2factor.in/API/V1/${this.apiKey}/SMS/${cleaned}/${otp}`;

      const res = await fetch(url);
      const data = (await res.json()) as { Status?: string; Details?: string };

      if (res.ok && data.Status === 'Success') {
        return { success: true, messageId: data.Details };
      }
      return { success: false, error: data.Details ?? '2Factor send failed.' };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async sendSms(phone: string, message: string): Promise<SmsResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        error: '2Factor API key missing (TWOFACTOR_API_KEY).',
      };
    }

    const cleaned = phone.replace(/\D/g, '');

    try {
      // 2Factor TRANS_SMS API: delivers arbitrary transactional text messages.
      const encoded = encodeURIComponent(message);
      const url = `https://2factor.in/API/V1/${this.apiKey}/TRANS_SMS/${cleaned}/${encoded}`;
      const res = await fetch(url);
      const data = (await res.json()) as { Status?: string; Details?: string };

      if (res.ok && data.Status === 'Success') {
        return { success: true, messageId: data.Details };
      }
      return { success: false, error: data.Details ?? '2Factor send failed.' };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
