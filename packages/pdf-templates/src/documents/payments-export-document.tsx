import * as React from 'react';

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { CREAM, NAVY } from '../components/styles';
import { formatINR } from '../lib/format';

// A4 landscape usable width ~769pt. Column flex weights tuned so typical
// content (bill nos, amounts, references) never bleeds into adjacent cells.
// IMPORTANT: react-pdf only clips text via View overflow:'hidden', not Text.
// All cells are wrapped in <View style={cell(flex)}> for correct clipping.
const COL = {
  billNo: 2.8, // "TPC/26-27/MNT/000001"
  unit: 0.8, // "101"
  type: 1.5, // "Maintenance"
  payDate: 1.3, // "20 Jul 2026"
  mode: 1.2, // "Razorpay"
  amount: 1.4, // "₹19,860"
  advance: 1.2, // "₹1,360"
  reference: 1.8, // UTR / cheque ref
  status: 1.0, // "Paid"
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
    color: '#666',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  kpiValue: { fontSize: 10, fontWeight: 'bold', color: NAVY },
  thead: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 2,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowAlt: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: CREAM,
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 6,
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
  footerText: { fontSize: 7, color: '#666' },
  th: { fontSize: 7, color: '#fff', fontWeight: 'bold' },
  thR: { fontSize: 7, color: '#fff', fontWeight: 'bold', textAlign: 'right' },
  cell: { fontSize: 7.5, color: '#222' },
  cellR: { fontSize: 7.5, color: '#222', textAlign: 'right' },
  cellBold: { fontSize: 7.5, fontWeight: 'bold', color: NAVY },
  cellBoldR: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: NAVY,
    textAlign: 'right',
  },
});

// Cell container - View clips content at column boundary (Text overflow
// alone is unreliable in react-pdf's layout engine).
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

const BILL_TYPE_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  electricity: 'Electricity',
  other_charges: 'Other Charges',
  sinking_fund: 'Sinking Fund',
};

const PAYMENT_MODE_LABELS: Record<string, string> = {
  online: 'Online',
  cash: 'Cash',
  cheque: 'Cheque',
  neft: 'NEFT',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  razorpay: 'Razorpay',
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-';
  return new Date(iso.slice(0, 10)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export interface PaymentsExportRow {
  bill_no: string;
  period: string;
  unit_no: string;
  bill_type: string;
  total_amount: number;
  advance_applied: number;
  bill_status: string;
  payment_date: string | null;
  payment_mode: string | null;
  amount_paid: number | null;
  reference_no: string | null;
}

export interface PaymentsExportPdfData {
  association: AssociationBranding;
  filterLabel: string;
  generatedAt: string;
  rows: PaymentsExportRow[];
  totals: {
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    paymentCount: number;
  };
}

export function PaymentsExportDocument({
  data,
}: {
  data: PaymentsExportPdfData;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <DocumentHeader association={data.association} />

        <Text style={s.title}>Payments Export Report</Text>
        <Text style={s.subtitle}>
          {data.filterLabel} · Generated {data.generatedAt}
        </Text>

        {/* KPI summary */}
        <View style={s.kpiRow}>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Bills</Text>
            <Text style={s.kpiValue}>{data.rows.length}</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Payments</Text>
            <Text style={s.kpiValue}>{data.totals.paymentCount}</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Total Billed</Text>
            <Text style={s.kpiValue}>{formatINR(data.totals.totalBilled)}</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Collected</Text>
            <Text style={s.kpiValue}>
              {formatINR(data.totals.totalCollected)}
            </Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Outstanding</Text>
            <Text style={s.kpiValue}>
              {formatINR(data.totals.totalOutstanding)}
            </Text>
          </View>
        </View>

        {/* Table header */}
        <View style={s.thead}>
          <C flex={COL.billNo}>
            <Text style={s.th}>Bill No.</Text>
          </C>
          <C flex={COL.unit}>
            <Text style={s.th}>Unit</Text>
          </C>
          <C flex={COL.type}>
            <Text style={s.th}>Type</Text>
          </C>
          <C flex={COL.payDate}>
            <Text style={s.th}>Pay Date</Text>
          </C>
          <C flex={COL.mode}>
            <Text style={s.th}>Mode</Text>
          </C>
          <C flex={COL.amount} right>
            <Text style={s.thR}>Amount Paid</Text>
          </C>
          <C flex={COL.advance} right>
            <Text style={s.thR}>Advance</Text>
          </C>
          <C flex={COL.reference}>
            <Text style={s.th}>Reference</Text>
          </C>
          <C flex={COL.status}>
            <Text style={s.th}>Status</Text>
          </C>
        </View>

        {data.rows.map((r, i) => (
          <View key={i} style={i % 2 === 0 ? s.row : s.rowAlt}>
            <C flex={COL.billNo}>
              <Text style={s.cellBold}>{r.bill_no}</Text>
            </C>
            <C flex={COL.unit}>
              <Text style={s.cell}>{r.unit_no}</Text>
            </C>
            <C flex={COL.type}>
              <Text style={s.cell}>
                {BILL_TYPE_LABELS[r.bill_type] ?? r.bill_type}
              </Text>
            </C>
            <C flex={COL.payDate}>
              <Text style={s.cell}>{fmtDate(r.payment_date)}</Text>
            </C>
            <C flex={COL.mode}>
              <Text style={s.cell}>
                {r.payment_mode
                  ? (PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode)
                  : '-'}
              </Text>
            </C>
            <C flex={COL.amount} right>
              <Text style={s.cellR}>
                {r.amount_paid != null ? formatINR(r.amount_paid) : '-'}
              </Text>
            </C>
            <C flex={COL.advance} right>
              <Text style={s.cellR}>
                {r.advance_applied > 0 ? formatINR(r.advance_applied) : '-'}
              </Text>
            </C>
            <C flex={COL.reference}>
              <Text style={s.cell}>{r.reference_no ?? '-'}</Text>
            </C>
            <C flex={COL.status}>
              <Text style={s.cell}>{r.bill_status}</Text>
            </C>
          </View>
        ))}

        {/* Totals row */}
        <View style={s.totalRow}>
          <C flex={COL.billNo}>
            <Text style={s.cellBold}>
              Total ({data.totals.paymentCount} payments)
            </Text>
          </C>
          <C flex={COL.unit} />
          <C flex={COL.type} />
          <C flex={COL.payDate} />
          <C flex={COL.mode} />
          <C flex={COL.amount} right>
            <Text style={s.cellBoldR}>
              {formatINR(data.totals.totalCollected)}
            </Text>
          </C>
          <C flex={COL.advance} />
          <C flex={COL.reference} />
          <C flex={COL.status} />
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
