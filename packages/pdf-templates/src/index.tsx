import * as React from 'react';

import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer';

import { registerPdfFonts } from './assets/fonts/register';
import {
  AdvanceApplicationDocument,
  type AdvanceApplicationPdfData,
} from './documents/advance-application-document';
import { BillDocument, type BillPdfData } from './documents/bill-document';
import {
  BillsExportDocument,
  type BillsExportPdfData,
} from './documents/bills-export-document';
import {
  ElectricityBillDocument,
  type ElectricityBillPdfData,
} from './documents/electricity-bill-document';
import {
  ExpensesExportDocument,
  type ExpensesExportPdfData,
} from './documents/expenses-export-document';
import {
  PaymentsExportDocument,
  type PaymentsExportPdfData,
} from './documents/payments-export-document';
import {
  ReceiptDocument,
  type ReceiptPdfData,
} from './documents/receipt-document';
import {
  ReportDocument,
  type ReportPdfData,
} from './documents/report-document';
import {
  StatementDocument,
  type StatementPdfData,
} from './documents/statement-document';
import {
  VillaReportDocument,
  type VillaReportPdfData,
} from './documents/villa-report-document';

export type { AdvanceApplicationPdfData } from './documents/advance-application-document';
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
export { billTypeLabel, BILL_TYPE_LABELS } from './lib/bill-type-labels';
export type { ReportPdfData } from './documents/report-document';
export type {
  StatementPdfData,
  StatementPdfEntry,
} from './documents/statement-document';
export type {
  BillsExportPdfData,
  BillsExportRow,
} from './documents/bills-export-document';
export type {
  PaymentsExportPdfData,
  PaymentsExportRow,
} from './documents/payments-export-document';
export type {
  ExpensesExportPdfData,
  ExpenseExportRow,
} from './documents/expenses-export-document';
export type {
  VillaReportPdfData,
  VillaReportSection,
  VillaReportColumn,
  VillaReportKpi,
} from './documents/villa-report-document';

export async function renderAdvanceApplicationPdf(
  data: AdvanceApplicationPdfData,
): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<AdvanceApplicationDocument {...data} />);
}

export async function renderReportPdf(data: ReportPdfData): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<ReportDocument data={data} />);
}

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

export async function renderBillsExportPdf(
  data: BillsExportPdfData,
): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<BillsExportDocument data={data} />);
}

export async function renderVillaReportPdf(
  data: VillaReportPdfData,
): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<VillaReportDocument data={data} />);
}

export async function renderStatementPdf(
  data: StatementPdfData,
): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<StatementDocument {...data} />);
}

export async function renderExpensesExportPdf(
  data: ExpensesExportPdfData,
): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<ExpensesExportDocument data={data} />);
}

export async function renderPaymentsExportPdf(
  data: PaymentsExportPdfData,
): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<PaymentsExportDocument data={data} />);
}

let warmUp: Promise<void> | null = null;

/**
 * Primes the renderer once per process: registers the fonts and renders a
 * throwaway page that uses both weights. The first render in a process pays
 * for font parsing and layout-engine initialisation (~1s); callers start this
 * while their database queries are in flight so the real render is warm.
 * Safe to call repeatedly - it only ever runs once.
 */
export function warmPdfRenderer(): Promise<void> {
  warmUp ??= (async () => {
    registerPdfFonts();
    await renderToBuffer(
      <Document>
        <Page size="A4" style={{ fontFamily: 'Noto Sans' }}>
          <Text>Warm up ₹ 0123456789</Text>
          <Text style={{ fontWeight: 'bold' }}>Warm up ₹ 0123456789</Text>
        </Page>
      </Document>,
    );
  })().catch(() => {
    // A failed warm-up must never block a real render; allow a retry.
    warmUp = null;
  });

  return warmUp;
}
