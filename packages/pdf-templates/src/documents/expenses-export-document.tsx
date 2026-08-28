import * as React from 'react';

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { CREAM, NAVY } from '../components/styles';
import { formatINR } from '../lib/format';

// A4 landscape. Column flex weights tuned to expense row content.
const COL = {
  date: 1.2,
  title: 2.8,
  category: 1.6,
  payee: 1.8,
  mode: 1.4,
  amount: 1.3,
};

const s = StyleSheet.create({
  page: {
    fontFamily: 'Noto Sans',
    fontSize: 8.5,
    paddingTop: 28,
    paddingHorizontal: 32,
    paddingBottom: 44,
    color: '#000000',
  },
  title: {
    fontSize: 12,
    fontWeight: 'bold',
    color: NAVY,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    padding: 7,
    backgroundColor: CREAM,
  },
  kpiLabel: {
    fontSize: 6.5,
    color: '#888',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  kpiValue: { fontSize: 10, fontWeight: 'bold', color: NAVY },
  thead: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: NAVY,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 2,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowAlt: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: CREAM,
  },
  totalRow: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: NAVY,
    marginTop: 1,
    borderRadius: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: '#888' },
  th: { fontSize: 7, color: '#fff', fontWeight: 'bold' },
  thR: { fontSize: 7, color: '#fff', fontWeight: 'bold', textAlign: 'right' },
  cell: { fontSize: 7.5, color: '#222' },
  cellMuted: { fontSize: 7, color: '#888' },
  cellR: { fontSize: 7.5, color: '#222', textAlign: 'right' },
  cellBold: { fontSize: 7.5, fontWeight: 'bold', color: NAVY },
  cellBoldR: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: NAVY,
    textAlign: 'right',
  },
});

function C({
  flex,
  right,
  children,
}: {
  flex: number;
  right?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flex,
        overflow: 'hidden',
        alignItems: right ? 'flex-end' : 'flex-start',
      }}
    >
      {children}
    </View>
  );
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export interface ExpenseExportRow {
  date_of_payment: string;
  title: string;
  category_name: string | null;
  payee_name: string;
  mode_of_payment: string;
  amount: number;
  gst_amount: number | null;
  reference_number: string | null;
}

export interface ExpensesExportPdfData {
  association: AssociationBranding;
  filterLabel: string;
  generatedAt: string;
  expenses: ExpenseExportRow[];
  totalAmount: number;
  totalGst: number;
}

export function ExpensesExportDocument({
  data,
}: {
  data: ExpensesExportPdfData;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <DocumentHeader association={data.association} />

        <Text style={s.title}>Expense Report</Text>
        <Text style={s.subtitle}>
          {data.filterLabel} · Generated {data.generatedAt}
        </Text>

        {/* KPI summary */}
        <View style={s.kpiRow}>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Entries</Text>
            <Text style={s.kpiValue}>{data.expenses.length}</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Total Spend</Text>
            <Text style={s.kpiValue}>{formatINR(data.totalAmount)}</Text>
          </View>
          {data.totalGst > 0 && (
            <View style={s.kpiBox}>
              <Text style={s.kpiLabel}>Total GST</Text>
              <Text style={s.kpiValue}>{formatINR(data.totalGst)}</Text>
            </View>
          )}
          {data.totalGst > 0 && (
            <View style={s.kpiBox}>
              <Text style={s.kpiLabel}>Total (incl. GST)</Text>
              <Text style={s.kpiValue}>
                {formatINR(data.totalAmount + data.totalGst)}
              </Text>
            </View>
          )}
        </View>

        {/* Table header */}
        <View style={s.thead}>
          <C flex={COL.date}>
            <Text style={s.th}>Date</Text>
          </C>
          <C flex={COL.title}>
            <Text style={s.th}>Title / Reference</Text>
          </C>
          <C flex={COL.category}>
            <Text style={s.th}>Category</Text>
          </C>
          <C flex={COL.payee}>
            <Text style={s.th}>Payee</Text>
          </C>
          <C flex={COL.mode}>
            <Text style={s.th}>Mode</Text>
          </C>
          <C flex={COL.amount} right>
            <Text style={s.thR}>Amount</Text>
          </C>
        </View>

        {data.expenses.map((e, i) => {
          const rowStyle = i % 2 === 0 ? s.row : s.rowAlt;
          return (
            <View key={i} style={rowStyle}>
              <C flex={COL.date}>
                <Text style={s.cell}>{fmtDate(e.date_of_payment)}</Text>
              </C>
              <C flex={COL.title}>
                <Text style={s.cellBold}>{e.title}</Text>
                {e.reference_number ? (
                  <Text style={s.cellMuted}>Ref: {e.reference_number}</Text>
                ) : null}
              </C>
              <C flex={COL.category}>
                <Text style={s.cell}>{e.category_name ?? '—'}</Text>
              </C>
              <C flex={COL.payee}>
                <Text style={s.cell}>{e.payee_name}</Text>
              </C>
              <C flex={COL.mode}>
                <Text style={s.cell}>{e.mode_of_payment}</Text>
              </C>
              <C flex={COL.amount} right>
                <Text style={s.cellR}>{formatINR(e.amount)}</Text>
                {e.gst_amount ? (
                  <Text style={s.cellMuted}>
                    +{formatINR(e.gst_amount)} GST
                  </Text>
                ) : null}
              </C>
            </View>
          );
        })}

        {/* Totals row */}
        <View style={s.totalRow}>
          <C flex={COL.date} />
          <C flex={COL.title}>
            <Text style={s.cellBold}>
              Total ({data.expenses.length} entries)
            </Text>
          </C>
          <C flex={COL.category} />
          <C flex={COL.payee} />
          <C flex={COL.mode} />
          <C flex={COL.amount} right>
            <Text style={s.cellBoldR}>{formatINR(data.totalAmount)}</Text>
            {data.totalGst > 0 ? (
              <Text style={s.cellMuted}>+{formatINR(data.totalGst)} GST</Text>
            ) : null}
          </C>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Generated {data.generatedAt} · {data.association.name}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
