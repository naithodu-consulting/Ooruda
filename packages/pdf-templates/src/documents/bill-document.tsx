import * as React from 'react';

import { Document, Page, Text, View } from '@react-pdf/renderer';

import { DocumentFooter } from '../components/document-footer';
import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { styles } from '../components/styles';
import {
  formatINR,
  formatPeriodDateRange,
  formatPeriodLabel,
  formatShortDate,
  ordinalFloorLabel,
} from '../lib/format';

export interface BillingEntityData {
  isCompany: boolean;
  name: string | null;
  companyAddress: string | null;
  companyGstin: string | null;
}

export interface BillPdfLineItem {
  description: string;
  gstApplicable: boolean;
  amount: number;
  /** Unit area (sq ft) used to compute this line item — set only for per-sqft charges. */
  areaSqft?: number | null;
  /** Rate per sq ft used to compute this line item — set only for per-sqft charges. */
  ratePerSqft?: number | null;
}

export interface BillPdfData {
  association: AssociationBranding & {
    gstEnabled: boolean;
    gstRate: number | null;
  };
  unit: { unitNo: string; doorNo?: string | null; floor?: number | null };
  bill: {
    billNo: string;
    period: string;
    dueDate: string;
    generatedAt: string;
    totalAmount: number;
    gstAmount: number | null;
    paidAmount: number;
    status: string;
    billType?: string | null;
  };
  lineItems: BillPdfLineItem[];
  billTo?: BillingEntityData | null;
}

/** Bill-To address lines: [unit line, floor+association-address line], or company address as a single line. */
function buildAddressLines(
  billTo: BillingEntityData | null | undefined,
  unit: BillPdfData['unit'],
  associationAddress: string | null,
): string[] {
  if (billTo?.isCompany && billTo.companyAddress) {
    return [billTo.companyAddress];
  }
  const lines: string[] = [];
  if (unit.doorNo) {
    lines.push(`${unit.unitNo}, ${unit.doorNo},`);
  } else {
    lines.push(`Unit ${unit.unitNo},`);
  }
  const floorAddr = [
    unit.floor != null ? ordinalFloorLabel(unit.floor) : null,
    associationAddress,
  ]
    .filter(Boolean)
    .join(', ');
  if (floorAddr) lines.push(floorAddr);
  return lines;
}

export function BillDocument({
  association,
  unit,
  bill,
  lineItems,
  billTo,
}: BillPdfData) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  const gstTotal =
    bill.gstAmount ??
    (() => {
      if (!association.gstEnabled || association.gstRate == null) return 0;
      const taxable = lineItems
        .filter((item) => item.gstApplicable)
        .reduce((sum, item) => sum + item.amount, 0);
      return taxable > 0 ? (taxable * association.gstRate) / 100 : 0;
    })();

  const showGst = gstTotal > 0 && association.gstRate != null;
  const halfRate = showGst ? association.gstRate! / 2 : 0;
  const cgst = Math.round((gstTotal / 2) * 100) / 100;
  const sgst = Math.round((gstTotal - cgst) * 100) / 100;
  const outstanding = Math.max(0, bill.totalAmount - bill.paidAmount);

  const addressLines = buildAddressLines(billTo, unit, association.address);

  // Only show Area/Rate columns when at least one line item is a per-sqft
  // charge — an association fully on a per-unit/flat maintenance model
  // never populates these, so its bills render the plain 2-column table.
  const hasAreaColumns = lineItems.some((item) => item.areaSqft != null);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header: logo + name + address + contact strip */}
        <DocumentHeader association={association} />

        {/* INVOICE title */}
        <View style={styles.docTitleBlock}>
          <Text style={styles.docTitle}>Invoice</Text>
        </View>

        {/* Metadata: row-paired 2-col grid */}
        <View style={styles.metaGrid}>
          <View style={styles.metaGridRow}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice Number:</Text>
              <Text style={styles.metaValue}>{bill.billNo}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Billing Period:</Text>
              <Text style={styles.metaValue}>
                {formatPeriodDateRange(bill.period)}
              </Text>
            </View>
          </View>
          <View style={styles.metaGridRow}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Due Date:</Text>
              <Text style={styles.metaValue}>
                {formatShortDate(bill.dueDate)}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice Date:</Text>
              <Text style={styles.metaValue}>
                {formatShortDate(bill.generatedAt)}
              </Text>
            </View>
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill To</Text>
          {billTo?.name ? (
            <Text style={styles.billToName}>{billTo.name}</Text>
          ) : null}
          {addressLines.map((line, i) => (
            <Text style={styles.billToAddress} key={i}>
              {line}
            </Text>
          ))}
          {billTo?.isCompany && billTo.companyGstin ? (
            <Text style={styles.billToAddress}>
              GSTIN: {billTo.companyGstin}
            </Text>
          ) : null}
        </View>

        {/* Charges table */}
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDescription, styles.tableHeaderText]}>
              Description
            </Text>
            {hasAreaColumns ? (
              <>
                <Text style={[styles.colArea, styles.tableHeaderText]}>
                  Area (sq.ft)
                </Text>
                <Text style={[styles.colRate, styles.tableHeaderText]}>
                  Rate/sq.ft
                </Text>
              </>
            ) : null}
            <Text style={[styles.colGst, styles.tableHeaderText]}>GST</Text>
            <Text style={[styles.colAmount, styles.tableHeaderText]}>
              Amount
            </Text>
          </View>
          {lineItems.map((item, i) => (
            <View
              style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
              key={i}
            >
              <Text style={[styles.colDescription, { fontWeight: 'bold' }]}>
                {bill.billType === 'other_charges'
                  ? item.description
                  : `${item.description} for ${formatPeriodLabel(bill.period)}`}
              </Text>
              {hasAreaColumns ? (
                <>
                  <Text style={styles.colArea}>
                    {item.areaSqft != null ? item.areaSqft : '—'}
                  </Text>
                  <Text style={styles.colRate}>
                    {item.ratePerSqft != null ? item.ratePerSqft : '—'}
                  </Text>
                </>
              ) : null}
              <Text style={[styles.colGst, { textAlign: 'center' }]}>
                {item.gstApplicable ? 'Yes' : '—'}
              </Text>
              <Text style={[styles.colAmount, { textAlign: 'right' }]}>
                {formatINR(item.amount)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.summaryBlock}>
          <View style={styles.summaryRow}>
            <Text>Subtotal</Text>
            <Text>{formatINR(subtotal)}</Text>
          </View>

          {showGst ? (
            <>
              <View style={styles.summaryRow}>
                <Text>CGST @ {halfRate}%</Text>
                <Text>{formatINR(cgst)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text>SGST @ {halfRate}%</Text>
                <Text>{formatINR(sgst)}</Text>
              </View>
            </>
          ) : null}

          <View style={styles.summaryDivider} />
          <View style={styles.summaryRowTotal}>
            <Text>Bill Amount (Payable)</Text>
            <Text>{formatINR(bill.totalAmount)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Paid</Text>
            <Text>{formatINR(bill.paidAmount)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Outstanding</Text>
            <Text>{formatINR(outstanding)}</Text>
          </View>
        </View>

        <DocumentFooter
          note="This is a system-generated bill and does not require a signature."
          association={association}
        />
      </Page>
    </Document>
  );
}
