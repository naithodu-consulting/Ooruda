// Shared constants for the bill dispatch feature.
// This file is imported by both the server action and the client component.
export const DISPATCH_SENDER_EMAIL = 'hello@ooruda.com';

export const VALID_BILL_TYPES = [
  'Maintenance',
  'Electricity',
  'Other Charges',
  'Sinking Fund',
] as const;

export type ValidBillType = (typeof VALID_BILL_TYPES)[number];
