import * as z from 'zod';

export const SUB_METER_TYPES = ['Unit', 'CommonArea'] as const;

export const CreateSubMeterSchema = z.object({
  unitId: z.string().uuid('Choose a unit'),
  meterLabel: z
    .string()
    .trim()
    .min(1, 'Meter label is required')
    .max(50, 'Meter label is too long'),
  meterType: z.enum(SUB_METER_TYPES),
});

export type CreateSubMeterInput = z.input<typeof CreateSubMeterSchema>;

const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const CreateElectricityBillSchema = z.object({
  period: z
    .string()
    .regex(PERIOD_REGEX, "Use the 'YYYY-MM' format, e.g. 2026-06"),
  invoiceAmount: z.coerce
    .number()
    .positive('Invoice amount must be greater than 0'),
  blockConsumptionUnits: z.coerce
    .number()
    .positive('Consumption must be greater than 0')
    .int('Consumption units must be a full number'),
});

export type CreateMescomBillInput = z.input<typeof CreateElectricityBillSchema>;

export const MeterReadingEntrySchema = z
  .object({
    subMeterId: z.string().uuid(),
    previousReading: z.coerce.number().min(0, "Reading can't be negative"),
    currentReading: z.coerce.number().min(0, "Reading can't be negative"),
  })
  .refine((v) => v.currentReading >= v.previousReading, {
    message: 'Current reading must be at least the previous reading',
    path: ['currentReading'],
  });

export const RecordMeterReadingsSchema = z.object({
  electricityBillId: z.string().uuid(),
  readings: z.array(MeterReadingEntrySchema).min(1, 'Add at least one reading'),
});

export type RecordMeterReadingsInput = z.input<
  typeof RecordMeterReadingsSchema
>;
