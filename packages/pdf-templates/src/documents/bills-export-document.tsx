import * as React from 'react';

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { CREAM, NAVY } from '../components/styles';
import { formatINR } from '../lib/format';

// A4 landscape usable width ~769pt. Column flex weights tuned to typical
// content so nothing bleeds. IMPORTANT: react-pdf only clips text via View
// overflow:'hidden' — all cells are wrapped in <C flex> for correct clipping.
const COL = {
  billNo: 2.8, // "TPC/26-27/MNT/000001"
  period: 1.2, // "Jul 2026"
  unit: 0.8, // "101"
  type: 1.5, // "Maintenance"
  total: 1.4, // "₹19,860"
  paid: 1.4,
  outstanding: 1.4,
  status: 1.0, // "Overdue"
  dueDate: 1.5, // "20 Jul 2026"
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
  footerText: { fontSize: 7, color: '#888' },
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

// Cell container — View clips content at column boundary. Text overflow alone
// is unreliable in react-pdf's layout engine.
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

function fmtPeriod(p: string) {
  const [y, m] = p.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1).toLocaleString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso.slice(0, 10)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export interface BillsExportRow {
  bill_no: string;
  period: string;
  unit_no: string;
  bill_type: string;
  total_amount: number;
  paid_amount: number;
  outstanding: number;
  gst_amount: number | null;
  status: string;
  due_date: string;
}

export interface BillsExportPdfData {
  association: AssociationBranding;
  filterLabel: string;
  generatedAt: string;
  bills: BillsExportRow[];
  totals: {
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
  };
}

export function BillsExportDocument({ data }: { data: BillsExportPdfData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <DocumentHeader association={data.association} />

        <Text style={s.title}>Bills Export Report</Text>
        <Text style={s.subtitle}>
          {data.filterLabel} · Generated {data.generatedAt}
        </Text>

        {/* KPI summary */}
        <View style={s.kpiRow}>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Bills</Text>
            <Text style={s.kpiValue}>{data.bills.length}</Text>
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
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Collection Rate</Text>
            <Text style={s.kpiValue}>
              {data.totals.totalBilled > 0
                ? `${Math.round((data.totals.totalCollected / data.totals.totalBilled) * 100)}%`
                : '—'}
            </Text>
          </View>
        </View>

        {/* Table header */}
        <View style={s.thead}>
          <C flex={COL.billNo}>
            <Text style={s.th}>Bill No.</Text>
          </C>
          <C flex={COL.period}>
            <Text style={s.th}>Period</Text>
          </C>
          <C flex={COL.unit}>
            <Text style={s.th}>Unit</Text>
          </C>
          <C flex={COL.type}>
            <Text style={s.th}>Type</Text>
          </C>
          <C flex={COL.total} right>
            <Text style={s.thR}>Total</Text>
          </C>
          <C flex={COL.paid} right>
            <Text style={s.thR}>Paid</Text>
          </C>
          <C flex={COL.outstanding} right>
            <Text style={s.thR}>Outstanding</Text>
          </C>
          <C flex={COL.status}>
            <Text style={s.th}>Status</Text>
          </C>
          <C flex={COL.dueDate}>
            <Text style={s.th}>Due Date</Text>
          </C>
        </View>

        {data.bills.map((b, i) => (
          <View key={b.bill_no + i} style={i % 2 === 0 ? s.row : s.rowAlt}>
            <C flex={COL.billNo}>
              <Text style={s.cellBold}>{b.bill_no}</Text>
            </C>
            <C flex={COL.period}>
              <Text style={s.cell}>{fmtPeriod(b.period)}</Text>
            </C>
            <C flex={COL.unit}>
              <Text style={s.cell}>{b.unit_no}</Text>
            </C>
            <C flex={COL.type}>
              <Text style={s.cell}>
                {BILL_TYPE_LABELS[b.bill_type] ?? b.bill_type}
              </Text>
            </C>
            <C flex={COL.total} right>
              <Text style={s.cellR}>{formatINR(b.total_amount)}</Text>
            </C>
            <C flex={COL.paid} right>
              <Text style={s.cellR}>{formatINR(b.paid_amount)}</Text>
            </C>
            <C flex={COL.outstanding} right>
              <Text style={s.cellR}>{formatINR(b.outstanding)}</Text>
            </C>
            <C flex={COL.status}>
              <Text style={s.cell}>{b.status}</Text>
            </C>
            <C flex={COL.dueDate}>
              <Text style={s.cell}>{fmtDate(b.due_date)}</Text>
            </C>
          </View>
        ))}

        {/* Totals row */}
        <View style={s.totalRow}>
          <C flex={COL.billNo}>
            <Text style={s.cellBold}>Total ({data.bills.length} bills)</Text>
          </C>
          <C flex={COL.period} />
          <C flex={COL.unit} />
          <C flex={COL.type} />
          <C flex={COL.total} right>
            <Text style={s.cellBoldR}>
              {formatINR(data.totals.totalBilled)}
            </Text>
          </C>
          <C flex={COL.paid} right>
            <Text style={s.cellBoldR}>
              {formatINR(data.totals.totalCollected)}
            </Text>
          </C>
          <C flex={COL.outstanding} right>
            <Text style={s.cellBoldR}>
              {formatINR(data.totals.totalOutstanding)}
            </Text>
          </C>
          <C flex={COL.status} />
          <C flex={COL.dueDate} />
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
