import * as React from 'react';

import { Document, Page, Text, View } from '@react-pdf/renderer';

import { DocumentFooter } from '../components/document-footer';
import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { styles } from '../components/styles';
import { formatDateLong, formatINR, formatPeriodLabel } from '../lib/format';

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
    /** Stored GST total (CGST + SGST) included in totalAmount. Null for pre-GST or non-GST bills. */
    gstAmount: number | null;
    paidAmount: number;
    status: string;
  };
  lineItems: BillPdfLineItem[];
  billTo?: BillingEntityData | null;
}

export function BillDocument({
  association,
  unit,
  bill,
  lineItems,
  billTo,
}: BillPdfData) {
  // Line item amounts are always pre-GST base amounts.
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  // Use stored gst_amount when available (new bills). Fall back to computing
  // from line items for legacy bills that pre-date the gst_amount column.
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
  // totalAmount already includes GST for new bills; use it as the payable amount.
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
            <Text style={styles.sectionTitle}>Bill To</Text>
            {billTo?.name ? (
              <Text style={{ fontWeight: 'bold' }}>{billTo.name}</Text>
            ) : null}
            {billTo?.isCompany && billTo.companyAddress ? (
              <Text style={{ fontSize: 8, color: '#475569', marginTop: 1 }}>
                {billTo.companyAddress}
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 8, color: '#475569', marginTop: 1 }}>
                  {unit.doorNo
                    ? `${unit.unitNo} / ${unit.doorNo}`
                    : `Unit ${unit.unitNo}`}
                </Text>
                {unit.floor != null ? (
                  <Text style={{ fontSize: 8, color: '#475569' }}>
                    {`Floor ${unit.floor}`}
                  </Text>
                ) : null}
                {association.address ? (
                  <Text style={{ fontSize: 8, color: '#475569' }}>
                    {association.address}
                  </Text>
                ) : null}
              </>
            )}
            {billTo?.isCompany && billTo.companyGstin ? (
              <Text style={{ fontSize: 8, color: '#475569' }}>
                GSTIN: {billTo.companyGstin}
              </Text>
            ) : null}
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
              <Text style={styles.colGst}>GST</Text>
              <Text style={styles.colAmount}>Amount</Text>
            </View>
            {lineItems.map((item, i) => (
              <View style={styles.tableRow} key={i}>
                <Text style={styles.colDescription}>{item.description}</Text>
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

        <DocumentFooter note="Electronically Generated, does not require Signature." />
      </Page>
    </Document>
  );
}
