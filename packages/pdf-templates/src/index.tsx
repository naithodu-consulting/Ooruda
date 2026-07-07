import * as React from 'react';

import { renderToBuffer } from '@react-pdf/renderer';

import { registerPdfFonts } from './assets/fonts/register';
import { BillDocument, type BillPdfData } from './documents/bill-document';
import {
  ElectricityBillDocument,
  type ElectricityBillPdfData,
} from './documents/electricity-bill-document';
import {
  ReceiptDocument,
  type ReceiptPdfData,
} from './documents/receipt-document';

export type {
  BillPdfData,
  BillPdfLineItem,
  BillingEntityData,
} from './documents/bill-document';
export type {
  ElectricityBillPdfData,
  ElectricityBillMeterRow,
} from './documents/electricity-bill-document';
export type { ReceiptPdfData } from './documents/receipt-document';
export type { AssociationBranding } from './components/document-header';

export async function renderBillPdf(data: BillPdfData): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<BillDocument {...data} />);
}

export async function renderElectricityBillPdf(
  data: ElectricityBillPdfData,
): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<ElectricityBillDocument {...data} />);
}

export async function renderReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<ReceiptDocument {...data} />);
}
