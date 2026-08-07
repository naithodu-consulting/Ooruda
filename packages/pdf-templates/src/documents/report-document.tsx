import * as React from 'react';

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { CREAM, NAVY } from '../components/styles';
import { formatINR } from '../lib/format';

const rStyles = StyleSheet.create({
  page: {
    fontFamily: 'Noto Sans',
    fontSize: 9,
    paddingTop: 36,
    paddingHorizontal: 36,
    paddingBottom: 48,
    color: '#000000',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: NAVY,
    marginTop: 18,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: NAVY,
  },
  reportTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: NAVY,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 2,
  },
  reportSubtitle: {
    fontSize: 9,
    color: '#555',
    textAlign: 'center',
    marginBottom: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  kpiBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    padding: 8,
    backgroundColor: CREAM,
  },
  kpiLabel: {
    fontSize: 7,
    color: '#888',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  kpiValue: { fontSize: 11, fontWeight: 'bold', color: NAVY },
  table: {
    marginTop: 4,
  },
  thead: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    padding: '4 6',
    borderRadius: 2,
  },
  theadCell: {
    fontSize: 7.5,
    color: '#fff',
    fontWeight: 'bold',
    flex: 1,
  },
  theadCellRight: {
    fontSize: 7.5,
    color: '#fff',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    padding: '3 6',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  rowAlt: {
    flexDirection: 'row',
    padding: '3 6',
    backgroundColor: CREAM,
  },
  cell: { flex: 1, fontSize: 8, color: '#222' },
  cellRight: { flex: 1, fontSize: 8, color: '#222', textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7.5, color: '#888' },
});

const BILL_TYPE_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  electricity: 'Electricity',
  other_charges: 'Other Charges',
  sinking_fund: 'Sinking Fund',
};

export interface ReportPdfData {
  association: AssociationBranding;
  periodLabel: string;
  generatedAt: string;
  generatedBy: string;
  collection: {
    totalBilled: number;
    totalCollected: number;
    billCount: number;
    byPeriod: {
      period: string;
      billed: number;
      collected: number;
      bill_count: number;
    }[];
  };
  outstanding: {
    totalOutstanding: number;
    overdueCount: number;
    topBills: {
      unit_no: string;
      bill_no: string;
      bill_type: string;
      period: string;
      outstanding: number;
      due_date: string;
    }[];
  };
  payments: {
    total: number;
    count: number;
    byMode: { mode: string; amount: number }[];
    recentPayments: {
      paid_at: string;
      unit_no: string;
      bill_no: string;
      amount: number;
      mode: string;
    }[];
  };
  electricity: {
    totalCost: number;
    totalUnits: number;
    byPeriod: {
      period: string;
      invoice_amount: number;
      block_units: number;
      rate: number | null;
    }[];
  };
  /** When set, only these sections are rendered in the PDF. */
  activeSections?: (
    | 'collection'
    | 'outstanding'
    | 'payments'
    | 'electricity'
  )[];
  /** Applied filters to disclose in the PDF header. */
  appliedFilters?: {
    unitNos?: string[]; // human-readable unit numbers
    billTypes?: string[]; // human-readable bill type labels
  };
}

function formatPeriodLabel(p: string) {
  const [y, m] = p.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1).toLocaleString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
}

function formatDate(iso: string) {
  return new Date(iso.slice(0, 10)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const TAB_TITLES: Record<string, string> = {
  collection: 'Collection Summary',
  outstanding: 'Outstanding Dues',
  payments: 'Payments Received',
  electricity: 'Electricity Summary',
};

export function ReportDocument({ data }: { data: ReportPdfData }) {
  const showSection = (
    s: 'collection' | 'outstanding' | 'payments' | 'electricity',
  ) => activeSections.includes(s);

  // When scoped to a single tab, use that tab's title; otherwise generic
  const activeSections = data.activeSections ?? [
    'collection',
    'outstanding',
    'payments',
    'electricity',
  ];
  const isSingleSection = activeSections.length === 1;
  const reportTitle = isSingleSection
    ? (TAB_TITLES[activeSections[0]!] ?? 'Financial Report')
    : 'Financial Report';

  // Compute 1-based ordinal for each section based on which sections are shown
  const sectionIndex = (
    s: 'collection' | 'outstanding' | 'payments' | 'electricity',
  ) => activeSections.indexOf(s) + 1;

  const sectionLabel = (
    s: 'collection' | 'outstanding' | 'payments' | 'electricity',
    name: string,
  ) => (isSingleSection ? name : `${sectionIndex(s)}. ${name}`);

  const hasFilters =
    (data.appliedFilters?.unitNos?.length ?? 0) > 0 ||
    (data.appliedFilters?.billTypes?.length ?? 0) > 0;

  const collectionPct =
    data.collection.totalBilled > 0
      ? Math.round(
          (data.collection.totalCollected / data.collection.totalBilled) * 100,
        )
      : 0;

  return (
    <Document>
      <Page size="A4" style={rStyles.page}>
        {/* Header */}
        <DocumentHeader association={data.association} />

        <Text style={rStyles.reportTitle}>{reportTitle}</Text>
        <Text style={rStyles.reportSubtitle}>Period: {data.periodLabel}</Text>

        {/* ── Applied-filter disclosure ── */}
        {hasFilters && (
          <View
            style={{
              marginBottom: 12,
              padding: '6 10',
              backgroundColor: '#f0f4ff',
              borderRadius: 4,
              borderWidth: 1,
              borderColor: '#c7d6f7',
            }}
          >
            <Text
              style={{
                fontSize: 7.5,
                fontWeight: 'bold',
                color: '#1e3a8a',
                marginBottom: 3,
              }}
            >
              FILTERS APPLIED
            </Text>
            {(data.appliedFilters?.unitNos?.length ?? 0) > 0 && (
              <Text style={{ fontSize: 8, color: '#1e40af' }}>
                Units: {data.appliedFilters!.unitNos!.join(', ')}
              </Text>
            )}
            {(data.appliedFilters?.billTypes?.length ?? 0) > 0 && (
              <Text style={{ fontSize: 8, color: '#1e40af', marginTop: 2 }}>
                Charge types: {data.appliedFilters!.billTypes!.join(', ')}
              </Text>
            )}
            <Text style={{ fontSize: 7, color: '#3b5fc0', marginTop: 3 }}>
              This report covers the selected units/types only — not the full
              association.
            </Text>
          </View>
        )}

        {/* ── Section: Collection Summary ── */}
        {showSection('collection') && (
          <>
            <Text style={rStyles.sectionTitle}>
              {sectionLabel('collection', 'Collection Summary')}
            </Text>
            <View style={rStyles.kpiRow}>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Total Billed</Text>
                <Text style={rStyles.kpiValue}>
                  {formatINR(data.collection.totalBilled)}
                </Text>
              </View>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Total Collected</Text>
                <Text style={rStyles.kpiValue}>
                  {formatINR(data.collection.totalCollected)}
                </Text>
              </View>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Outstanding</Text>
                <Text style={rStyles.kpiValue}>
                  {formatINR(
                    data.collection.totalBilled -
                      data.collection.totalCollected,
                  )}
                </Text>
              </View>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Collection Rate</Text>
                <Text style={rStyles.kpiValue}>{collectionPct}%</Text>
              </View>
            </View>

            <View style={rStyles.table}>
              <View style={rStyles.thead}>
                <Text style={[rStyles.theadCell, { flex: 2 }]}>Period</Text>
                <Text style={rStyles.theadCellRight}>Bills</Text>
                <Text style={rStyles.theadCellRight}>Billed</Text>
                <Text style={rStyles.theadCellRight}>Collected</Text>
                <Text style={rStyles.theadCellRight}>Outstanding</Text>
              </View>
              {data.collection.byPeriod.slice(0, 18).map((r, i) => (
                <View
                  key={r.period}
                  style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                >
                  <Text style={[rStyles.cell, { flex: 2 }]}>
                    {formatPeriodLabel(r.period)}
                  </Text>
                  <Text style={rStyles.cellRight}>{r.bill_count}</Text>
                  <Text style={rStyles.cellRight}>{formatINR(r.billed)}</Text>
                  <Text style={rStyles.cellRight}>
                    {formatINR(r.collected)}
                  </Text>
                  <Text style={rStyles.cellRight}>
                    {formatINR(r.billed - r.collected)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Section 2: Outstanding Dues ── */}
        {showSection('outstanding') && (
          <>
            <Text style={rStyles.sectionTitle}>
              {sectionLabel('outstanding', 'Outstanding Dues')}
            </Text>
            <View style={rStyles.kpiRow}>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Total Outstanding</Text>
                <Text style={rStyles.kpiValue}>
                  {formatINR(data.outstanding.totalOutstanding)}
                </Text>
              </View>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Overdue Bills</Text>
                <Text style={rStyles.kpiValue}>
                  {data.outstanding.overdueCount}
                </Text>
              </View>
            </View>

            {data.outstanding.topBills.length > 0 && (
              <View style={rStyles.table}>
                <View style={rStyles.thead}>
                  <Text style={rStyles.theadCell}>Unit</Text>
                  <Text style={rStyles.theadCell}>Bill No.</Text>
                  <Text style={rStyles.theadCell}>Type</Text>
                  <Text style={rStyles.theadCell}>Period</Text>
                  <Text style={rStyles.theadCellRight}>Outstanding</Text>
                  <Text style={rStyles.theadCell}>Due Date</Text>
                </View>
                {data.outstanding.topBills.slice(0, 20).map((b, i) => (
                  <View
                    key={b.bill_no}
                    style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                  >
                    <Text style={rStyles.cell}>{b.unit_no}</Text>
                    <Text style={rStyles.cell}>{b.bill_no}</Text>
                    <Text style={rStyles.cell}>
                      {BILL_TYPE_LABELS[b.bill_type] ?? b.bill_type}
                    </Text>
                    <Text style={rStyles.cell}>
                      {formatPeriodLabel(b.period)}
                    </Text>
                    <Text style={rStyles.cellRight}>
                      {formatINR(b.outstanding)}
                    </Text>
                    <Text style={rStyles.cell}>{formatDate(b.due_date)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── Section 3: Payments ── */}
        {showSection('payments') && (
          <>
            <Text style={rStyles.sectionTitle}>
              {sectionLabel('payments', 'Payments Received')}
            </Text>
            <View style={rStyles.kpiRow}>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Total Collected</Text>
                <Text style={rStyles.kpiValue}>
                  {formatINR(data.payments.total)}
                </Text>
              </View>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Transactions</Text>
                <Text style={rStyles.kpiValue}>{data.payments.count}</Text>
              </View>
              {data.payments.byMode.slice(0, 3).map((m) => (
                <View key={m.mode} style={rStyles.kpiBox}>
                  <Text style={rStyles.kpiLabel}>{m.mode}</Text>
                  <Text style={rStyles.kpiValue}>{formatINR(m.amount)}</Text>
                </View>
              ))}
            </View>

            {data.payments.recentPayments.length > 0 && (
              <View style={rStyles.table}>
                <View style={rStyles.thead}>
                  <Text style={rStyles.theadCell}>Date</Text>
                  <Text style={rStyles.theadCell}>Unit</Text>
                  <Text style={rStyles.theadCell}>Bill No.</Text>
                  <Text style={rStyles.theadCellRight}>Amount</Text>
                  <Text style={rStyles.theadCell}>Mode</Text>
                </View>
                {data.payments.recentPayments.slice(0, 20).map((p, i) => (
                  <View
                    key={i}
                    style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                  >
                    <Text style={rStyles.cell}>{formatDate(p.paid_at)}</Text>
                    <Text style={rStyles.cell}>{p.unit_no}</Text>
                    <Text style={rStyles.cell}>{p.bill_no}</Text>
                    <Text style={rStyles.cellRight}>{formatINR(p.amount)}</Text>
                    <Text style={rStyles.cell}>{p.mode}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── Section 4: Electricity ── */}
        {showSection('electricity') && data.electricity.byPeriod.length > 0 && (
          <>
            <Text style={rStyles.sectionTitle}>
              {sectionLabel('electricity', 'Electricity Summary')}
            </Text>
            <View style={rStyles.kpiRow}>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Total Cost</Text>
                <Text style={rStyles.kpiValue}>
                  {formatINR(data.electricity.totalCost)}
                </Text>
              </View>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Total Block Units</Text>
                <Text style={rStyles.kpiValue}>
                  {data.electricity.totalUnits.toLocaleString('en-IN')} kWh
                </Text>
              </View>
            </View>
            <View style={rStyles.table}>
              <View style={rStyles.thead}>
                <Text style={[rStyles.theadCell, { flex: 2 }]}>Period</Text>
                <Text style={rStyles.theadCellRight}>Invoice Amount</Text>
                <Text style={rStyles.theadCellRight}>Block Units</Text>
                <Text style={rStyles.theadCellRight}>Rate / kWh</Text>
              </View>
              {data.electricity.byPeriod.map((r, i) => (
                <View
                  key={r.period}
                  style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                >
                  <Text style={[rStyles.cell, { flex: 2 }]}>
                    {formatPeriodLabel(r.period)}
                  </Text>
                  <Text style={rStyles.cellRight}>
                    {formatINR(r.invoice_amount)}
                  </Text>
                  <Text style={rStyles.cellRight}>{r.block_units}</Text>
                  <Text style={rStyles.cellRight}>
                    {r.rate !== null ? formatINR(r.rate) : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Footer */}
        <View style={rStyles.footer} fixed>
          <Text style={rStyles.footerText}>
            Generated on {data.generatedAt} by {data.generatedBy}
          </Text>
          <Text
            style={rStyles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
