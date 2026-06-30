import * as React from 'react';

import { Document, Page, Text, View } from '@react-pdf/renderer';

import { DocumentFooter } from '../components/document-footer';
import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { styles } from '../components/styles';
import { formatDateLong, formatINR, formatPeriodLabel } from '../lib/format';

export interface ReceiptPdfData {
  association: AssociationBranding;
  unit: { unitNo: string };
  bill: { billNo: string; period: string };
  receipt: { receiptNo: string; generatedAt: string };
  payment: {
    amount: number;
    mode: string;
    paidByRole: 'Owner' | 'Tenant';
    paidAt: string;
  };
}

export function ReceiptDocument({
  association,
  unit,
  bill,
  receipt,
  payment,
}: ReceiptPdfData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocumentHeader
          association={association}
          docTitle="Payment Receipt"
          docNo={receipt.receiptNo}
          docDate={formatDateLong(receipt.generatedAt)}
        />

        <View style={[styles.section, styles.infoGrid]}>
          <View style={styles.infoCol}>
            <Text style={styles.sectionTitle}>Unit</Text>
            <Text>{unit.unitNo}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.sectionTitle}>Bill No.</Text>
            <Text>{bill.billNo}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.sectionTitle}>Billing Period</Text>
            <Text>{formatPeriodLabel(bill.period)}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.sectionTitle}>Paid By</Text>
            <Text>{payment.paidByRole}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.colDescription}>Mode</Text>
              <Text style={styles.colDescription}>Paid On</Text>
              <Text style={styles.colAmount}>Amount</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.colDescription}>{payment.mode}</Text>
              <Text style={styles.colDescription}>
                {formatDateLong(payment.paidAt)}
              </Text>
              <Text style={styles.colAmount}>{formatINR(payment.amount)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.summaryBlock}>
          <View style={styles.summaryRowTotal}>
            <Text>Amount Received</Text>
            <Text>{formatINR(payment.amount)}</Text>
          </View>
        </View>

        <DocumentFooter note="This is a system-generated receipt and does not require a signature." />
      </Page>
    </Document>
  );
}
