import type { ISmsProvider, SmsResponse } from '../types';

export class MockSmsProvider implements ISmsProvider {
  async sendOtp(phone: string, otp: string): Promise<SmsResponse> {
    console.log('\n[SMS MOCK] ===========================');
    console.log(`[SMS MOCK] Phone: ${phone}`);
    console.log(`[SMS MOCK] OTP:   ${otp}`);
    console.log('[SMS MOCK] ===========================\n');
    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      success: true,
      messageId: `mock-${Math.random().toString(36).slice(2, 9)}`,
    };
  }

  async sendSms(phone: string, message: string): Promise<SmsResponse> {
    console.log('\n[SMS MOCK] ===========================');
    console.log(`[SMS MOCK] Phone:   ${phone}`);
    console.log(`[SMS MOCK] Message: ${message}`);
    console.log('[SMS MOCK] ===========================\n');
    return {
      success: true,
      messageId: `mock-${Math.random().toString(36).slice(2, 9)}`,
    };
  }
}
