import * as React from 'react';

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { CREAM, NAVY } from '../components/styles';
import { formatINR, formatShortDate } from '../lib/format';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Noto Sans',
    fontSize: 8.5,
    paddingTop: 32,
    paddingHorizontal: 32,
    paddingBottom: 48,
    color: '#1a1a1a',
  },
  titleBlock: {
    marginTop: 10,
    marginBottom: 14,
    alignItems: 'center',
  },
  title: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  subtitle: { fontSize: 8.5, color: '#555', marginTop: 2 },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  summaryBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 4,
    padding: 8,
  },
  summaryLabel: { fontSize: 7.5, color: '#666', marginBottom: 2 },
  summaryValue: { fontSize: 11, fontWeight: 'bold', color: NAVY },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableHeaderText: { color: '#fff', fontWeight: 'bold', fontSize: 7.5 },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRowAlt: { backgroundColor: CREAM },
  colDate: { width: '12%' },
  colDesc: { flex: 1 },
  colDebit: { width: '13%', textAlign: 'right' },
  colCredit: { width: '13%', textAlign: 'right' },
  colBalance: { width: '15%', textAlign: 'right' },
  openingRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    backgroundColor: '#f1f5f9',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  openingText: { fontWeight: 'bold', color: '#374151' },
  redText: { color: '#dc2626' },
  greenText: { color: '#16a34a' },
  footer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7.5, color: '#666' },
  closingRow: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  closingText: { color: '#fff', fontWeight: 'bold', fontSize: 8 },
});

export interface StatementPdfEntry {
  date: string;
  description: string;
  subtext?: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface StatementPdfData {
  association: AssociationBranding;
  unit: { unitNo: string };
  period: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  entries: StatementPdfEntry[];
  generatedAt: string;
}

function balanceLabel(balance: number): string {
  if (balance === 0) return '₹0';
  return `${formatINR(Math.abs(balance))} ${balance > 0 ? 'CR' : 'DR'}`;
}

export function StatementDocument({
  association,
  unit,
  period,
  openingBalance,
  closingBalance,
  totalDebit,
  totalCredit,
  entries,
  generatedAt,
}: StatementPdfData) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <DocumentHeader association={association} />

        <View style={s.titleBlock}>
          <Text style={s.title}>Account Statement</Text>
          <Text style={s.subtitle}>
            Unit {unit.unitNo} · {period}
          </Text>
        </View>

        {/* Summary tiles */}
        <View style={s.summaryRow}>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Opening Balance</Text>
            <Text
              style={[
                s.summaryValue,
                openingBalance < 0 ? s.redText : s.greenText,
              ]}
            >
              {balanceLabel(openingBalance)}
            </Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Total Debits</Text>
            <Text style={[s.summaryValue, s.redText]}>
              {formatINR(totalDebit)}
            </Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Total Credits</Text>
            <Text style={[s.summaryValue, s.greenText]}>
              {formatINR(totalCredit)}
            </Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Closing Balance</Text>
            <Text
              style={[
                s.summaryValue,
                closingBalance < 0 ? s.redText : s.greenText,
              ]}
            >
              {balanceLabel(closingBalance)}
            </Text>
          </View>
        </View>

        {/* Table header */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colDate]}>DATE</Text>
          <Text style={[s.tableHeaderText, s.colDesc]}>DESCRIPTION</Text>
          <Text style={[s.tableHeaderText, s.colDebit]}>DEBIT</Text>
          <Text style={[s.tableHeaderText, s.colCredit]}>CREDIT</Text>
          <Text style={[s.tableHeaderText, s.colBalance]}>BALANCE</Text>
        </View>

        {/* Opening balance row */}
        <View style={s.openingRow}>
          <Text style={[s.openingText, s.colDate]} />
          <Text style={[s.openingText, s.colDesc]}>Opening Balance</Text>
          <Text style={[s.openingText, s.colDebit]} />
          <Text style={[s.openingText, s.colCredit]} />
          <Text style={[s.openingText, s.colBalance]}>
            {balanceLabel(openingBalance)}
          </Text>
        </View>

        {/* Transaction rows */}
        {entries.map((e, i) => (
          <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
            <Text style={s.colDate}>{formatShortDate(e.date)}</Text>
            <View style={s.colDesc}>
              <Text>{e.description}</Text>
              {e.subtext ? (
                <Text style={{ fontSize: 7, color: '#888', marginTop: 1 }}>
                  {e.subtext}
                </Text>
              ) : null}
            </View>
            <Text style={[s.colDebit, e.debit > 0 ? s.redText : {}]}>
              {e.debit > 0 ? formatINR(e.debit) : ''}
            </Text>
            <Text style={[s.colCredit, e.credit > 0 ? s.greenText : {}]}>
              {e.credit > 0 ? formatINR(e.credit) : ''}
            </Text>
            <Text
              style={[
                s.colBalance,
                e.runningBalance < 0
                  ? s.redText
                  : e.runningBalance > 0
                    ? s.greenText
                    : {},
              ]}
            >
              {balanceLabel(e.runningBalance)}
            </Text>
          </View>
        ))}

        {/* Closing balance row */}
        <View style={s.closingRow}>
          <Text style={[s.closingText, s.colDate]} />
          <Text style={[s.closingText, s.colDesc]}>Closing Balance</Text>
          <Text style={[s.closingText, s.colDebit]} />
          <Text style={[s.closingText, s.colCredit]} />
          <Text style={[s.closingText, s.colBalance]}>
            {balanceLabel(closingBalance)}
          </Text>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>
            Generated on {formatShortDate(generatedAt)} · This is a
            system-generated statement.
          </Text>
          <Text style={s.footerText}>{association.name}</Text>
        </View>
      </Page>
    </Document>
  );
}
