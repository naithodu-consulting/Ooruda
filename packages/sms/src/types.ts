export interface SmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ISmsProvider {
  sendOtp(phone: string, otp: string): Promise<SmsResponse>;
  sendSms(phone: string, message: string): Promise<SmsResponse>;
}
