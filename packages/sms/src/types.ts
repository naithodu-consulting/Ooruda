export interface SmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ISmsProvider {
  sendOtp(phone: string, otp: string): Promise<SmsResponse>;
  /**
   * Send a transactional SMS with a pre-registered DLT template.
   * @param phone  E.164 number e.g. +91XXXXXXXXXX
   * @param templateKey  Logical key identifying which template to use (e.g. 'bill_generated')
   * @param variables  Key-value pairs substituted into the template body
   */
  sendSms(
    phone: string,
    templateKey: string,
    variables: Record<string, string>,
  ): Promise<SmsResponse>;
}
