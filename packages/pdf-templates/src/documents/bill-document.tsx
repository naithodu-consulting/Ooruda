import * as React from 'react';

import { Document, Page, Text, View } from '@react-pdf/renderer';

import { DocumentFooter } from '../components/document-footer';
import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { styles } from '../components/styles';
import { formatDateLong, formatINR, formatPeriodLabel } from '../lib/format';

export interface BillPdfLineItem {
  description: string;
  payer: 'Owner' | 'Tenant';
  gstApplicable: boolean;
  amount: number;
}

export interface BillPdfData {
  association: AssociationBranding & {
    gstEnabled: boolean;
    gstRate: number | null;
  };
  unit: { unitNo: string };
  bill: {
    billNo: string;
    period: string;
    dueDate: string;
    generatedAt: string;
    totalAmount: number;
    paidAmount: number;
    status: string;
  };
  lineItems: BillPdfLineItem[];
}

export function BillDocument({
  association,
  unit,
  bill,
  lineItems,
}: BillPdfData) {
  const taxableAmount = lineItems
    .filter((item) => item.gstApplicable)
    .reduce((sum, item) => sum + item.amount, 0);

  const showGst =
    association.gstEnabled && association.gstRate != null && taxableAmount > 0;
  const halfRate = showGst ? association.gstRate! / 2 : 0;
  const cgst = showGst ? (taxableAmount * halfRate) / 100 : 0;
  const sgst = cgst;
  const grandTotalWithGst = bill.totalAmount + cgst + sgst;
  const outstanding = Math.max(0, bill.totalAmount - bill.paidAmount);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocumentHeader
          association={association}
          docTitle="Bill"
          docNo={bill.billNo}
          docDate={formatDateLong(bill.generatedAt)}
        />

        <View style={[styles.section, styles.infoGrid]}>
          <View style={styles.infoCol}>
            <Text style={styles.sectionTitle}>Unit</Text>
            <Text>{unit.unitNo}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.sectionTitle}>Billing Period</Text>
            <Text>{formatPeriodLabel(bill.period)}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.sectionTitle}>Due Date</Text>
            <Text>{formatDateLong(bill.dueDate)}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.sectionTitle}>Status</Text>
            <Text>{bill.status}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Charges</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.colDescription}>Description</Text>
              <Text style={styles.colPayer}>Payer</Text>
              <Text style={styles.colGst}>GST</Text>
              <Text style={styles.colAmount}>Amount</Text>
            </View>
            {lineItems.map((item, i) => (
              <View style={styles.tableRow} key={i}>
                <Text style={styles.colDescription}>{item.description}</Text>
                <Text style={styles.colPayer}>{item.payer}</Text>
                <Text style={styles.colGst}>
                  {item.gstApplicable ? 'Yes' : '—'}
                </Text>
                <Text style={styles.colAmount}>{formatINR(item.amount)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.summaryBlock}>
          <View style={styles.summaryRow}>
            <Text>Subtotal</Text>
            <Text>{formatINR(bill.totalAmount)}</Text>
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
              <View style={styles.summaryRow}>
                <Text>Total incl. GST (reference)</Text>
                <Text>{formatINR(grandTotalWithGst)}</Text>
              </View>
            </>
          ) : null}

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

        <DocumentFooter note="This is a system-generated bill and does not require a signature." />
      </Page>
    </Document>
  );
}
