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
  formatShortDate,
  ordinalFloorLabel,
} from '../lib/format';
import type { BillingEntityData } from './bill-document';

export interface ReceiptPdfData {
  association: AssociationBranding;
  unit: { unitNo: string; doorNo?: string | null; floor?: number | null };
  billTo?: BillingEntityData | null;
  bill: { billNo: string; period: string };
  receipt: { receiptNo: string; generatedAt: string };
  payment: {
    amount: number;
    mode: string;
    paidAt: string;
    referenceNo?: string | null;
  };
}

/** Bill-To address lines: [unit line, floor+association-address line], or company address as a single line. */
function buildAddressLines(
  billTo: BillingEntityData | null | undefined,
  unit: ReceiptPdfData['unit'],
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

export function ReceiptDocument({
  association,
  unit,
  billTo,
  bill,
  receipt,
  payment,
}: ReceiptPdfData) {
  const addressLines = buildAddressLines(billTo, unit, association.address);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header: logo + name + address + contact strip */}
        <DocumentHeader association={association} />

        {/* Title */}
        <View style={styles.docTitleBlock}>
          <Text style={styles.docTitle}>Payment Receipt</Text>
        </View>

        {/* Metadata: row-paired 2-col grid */}
        <View style={styles.metaGrid}>
          <View style={styles.metaGridRow}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Receipt Number:</Text>
              <Text style={styles.metaValue}>{receipt.receiptNo}</Text>
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
              <Text style={styles.metaLabel}>Invoice Number:</Text>
              <Text style={styles.metaValue}>{bill.billNo}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Payment Date:</Text>
              <Text style={styles.metaValue}>
                {formatShortDate(payment.paidAt)}
              </Text>
            </View>
          </View>
        </View>

        {/* Received From */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Received From</Text>
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

        {/* Payment details table */}
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDescription, styles.tableHeaderText]}>
              Mode
            </Text>
            <Text style={[styles.colDescription, styles.tableHeaderText]}>
              Reference
            </Text>
            <Text style={[styles.colAmount, styles.tableHeaderText]}>
              Amount
            </Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.colDescription}>{payment.mode}</Text>
            <Text style={styles.colDescription}>
              {payment.referenceNo ?? '—'}
            </Text>
            <Text style={[styles.colAmount, { textAlign: 'right' }]}>
              {formatINR(payment.amount)}
            </Text>
          </View>
        </View>

        {/* Total */}
        <View style={styles.summaryBlock}>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRowTotal}>
            <Text>Amount Received</Text>
            <Text>{formatINR(payment.amount)}</Text>
          </View>
        </View>

        <DocumentFooter
          note="This is a system-generated receipt and does not require a signature."
          association={association}
        />
      </Page>
    </Document>
  );
}
