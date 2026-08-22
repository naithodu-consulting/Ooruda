import * as z from 'zod';

export const PAYMENT_MODES = [
  'Cash',
  'UPI',
  'NEFT/RTGS/IMPS',
  'Cheque',
  'Demand Draft',
  'Credit Card',
  'Debit Card',
  'NetBanking',
] as const;

export const ExpenseSchema = z.object({
  associationId: z.string().uuid(),
  title: z.string().min(1, 'Title is required').max(255),
  categoryId: z.string().uuid().nullable().optional(),
  subCategory: z.string().max(100).nullable().optional(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  gstAmount: z.coerce.number().min(0).nullable().optional(),
  payor: z.string().min(1).default('Association'),
  payeeId: z.string().uuid().nullable().optional(),
  payeeName: z.string().min(1, 'Payee name is required'),
  modeOfPayment: z.enum(PAYMENT_MODES),
  referenceNumber: z.string().max(100).nullable().optional(),
  invoiceNumber: z.string().max(100).nullable().optional(),
  dateOfPayment: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  notes: z.string().max(1000).nullable().optional(),
  recurring: z.boolean().default(false),
  recurringFrequency: z.string().nullable().optional(),
  linkedAmcId: z.string().uuid().nullable().optional(),
  attachmentUrl: z.string().url().nullable().optional(),
});

export const UpdateExpenseSchema = ExpenseSchema.partial().extend({
  id: z.string().uuid(),
  associationId: z.string().uuid(),
});

export const DeleteExpenseSchema = z.object({
  id: z.string().uuid(),
  associationId: z.string().uuid(),
});

export const CreateVendorSchema = z.object({
  associationId: z.string().uuid(),
  name: z.string().min(1, 'Vendor name is required').max(255),
  contactPerson: z.string().max(100).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().nullable().optional(),
  gstNumber: z.string().max(20).nullable().optional(),
  bankDetails: z.string().max(500).nullable().optional(),
});

export type ExpenseInput = z.infer<typeof ExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;
export type DeleteExpenseInput = z.infer<typeof DeleteExpenseSchema>;
export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;
