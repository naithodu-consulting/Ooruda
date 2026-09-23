// Shared constants for the bill dispatch feature.
// This file is imported by both the server action and the client component.
// Display-only label for the Bill Dispatch UI - cosmetic, not functional.
// The actual Resend `from` address is read from process.env.EMAIL_SENDER at send time.
export const DISPATCH_SENDER_DISPLAY = 'hello@ooruda.com';

export const VALID_BILL_TYPES = [
  'Maintenance',
  'Electricity',
  'Other Charges',
  'Sinking Fund',
] as const;

export type ValidBillType = (typeof VALID_BILL_TYPES)[number];
