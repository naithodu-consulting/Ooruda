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
    color: '#666',
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
    paddingRight: 6,
  },
  theadCellRight: {
    fontSize: 7.5,
    color: '#fff',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
    paddingRight: 8,
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
  cell: { flex: 1, fontSize: 8, color: '#222', paddingRight: 6 },
  cellRight: {
    flex: 1,
    fontSize: 8,
    color: '#222',
    textAlign: 'right',
    paddingRight: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7.5, color: '#666' },
});

// Column widths for the wide people-centric tables.
//
// Usable cell width is ~511pt (A4 595 − 72 page margins − 12 row padding).
// Equal `flex: 1` columns gave Phone only ~45pt, but "+919999999998" needs
// ~57pt at 8pt Noto Sans - it overflowed, wrapped, and collided with Role.
// These weights are sized to the widest real value each column holds.
const OCC_W = {
  unit: { flex: 1 }, // "G1 & G1A"
  type: { flex: 1 }, // "Shop"
  floor: { flex: 0.6 }, // single digit
  area: { flex: 0.9 }, // "4,965"
  status: { flex: 1 }, // "Occupied"
  occupant: { flex: 2 }, // wraps at spaces
  phone: { flex: 1.5 }, // "+919999999998" on one line
  role: { flex: 1.6 }, // "Owner + Tenant" on one line
  moveIn: { flex: 1.3 }, // "10 Jul 2026"
} as const;

// Ledger statement columns. Bill numbers ("TPC/26-27/MNT/000040") are the
// widest atom here and must not wrap, so they get the largest fixed share.
const LS_W = {
  date: { flex: 1.2 }, // "27 Aug 2026"
  unit: { flex: 0.9 }, // All-Units view only
  particulars: { flex: 2.4 }, // wraps at spaces
  billNo: { flex: 2 }, // "TPC/26-27/MNT/000040"
  debit: { flex: 1.1 },
  credit: { flex: 1.1 },
  balance: { flex: 1.2 },
} as const;

const DIR_W = {
  unit: { flex: 1 },
  name: { flex: 2.5 }, // wraps at spaces
  phone: { flex: 1.5 }, // "+919999999998" on one line
  email: { flex: 2.4 }, // "919999999998@ooruda.test"
  role: { flex: 1 }, // "Tenant"
  moveIn: { flex: 1.3 }, // "10 Jul 2026"
} as const;

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
  /** Unit-level breakdown sections (one per bill type when multiple types selected). */
  collectionUnitBreakdown?: {
    billTypeLabel: string;
    rows: {
      unit_no: string;
      bill_count: number;
      billed: number;
      collected: number;
      outstanding: number;
      status: 'paid' | 'partial' | 'unpaid' | 'overdue';
    }[];
  }[];
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
    byUnit?: {
      period: string;
      unit_no: string;
      prev_reading: number;
      curr_reading: number;
      consumed_units: number;
      minimum_charge: number;
      rate_per_unit: number | null;
      charged_amount: number;
    }[];
  };
  /** When set, only these sections are rendered in the PDF. */
  activeSections?: (
    | 'collection'
    | 'outstanding'
    | 'payments'
    | 'electricity'
  )[];
  /** Cash ledger entries - rendered instead of financial sections when present. */
  cashLedger?: {
    totalCredits: number;
    totalDebits: number;
    entries: {
      entry_date: string;
      unit_no: string;
      entry_type: string;
      bill_type: string;
      direction: 'credit' | 'debit';
      amount: number;
      paid_by_name: string;
      notes: string;
    }[];
  };
  /** Occupancy report rows - rendered instead of financial sections when present. */
  occupancy?: {
    rows: {
      unit_no: string;
      type: string;
      floor: number | null;
      area_sqft: number;
      status: 'Occupied' | 'Vacant';
      occupant_name: string | null;
      occupant_phone: string | null;
      occupant_email: string | null;
      occupant_role: string | null;
      move_in_date: string | null;
    }[];
  };
  /** Ledger statement rows - rendered instead of financial sections when present. */
  ledgerStatement?: {
    unitLabel: string;
    /** All-Units view shows which unit each entry belongs to. */
    showUnitColumn: boolean;
    rows: {
      entry_date: string;
      unit_no: string;
      particulars: string;
      bill_no: string | null;
      debit: number | null;
      credit: number | null;
      runningBalance: number;
      payment_status: 'active' | 'reversed' | 'partial_refund' | null;
    }[];
  };
  /** Directory rows - rendered instead of financial sections when present. */
  directory?: {
    rows: {
      unit_no: string;
      name: string;
      phone: string | null;
      email: string | null;
      role: 'Owner' | 'Tenant';
      move_in_date: string | null;
    }[];
  };
  /** Other Charges breakdown - rendered when tab === 'other_charges'. */
  otherCharges?: {
    rows: {
      charge_name: string;
      bill_count: number;
      billed: number;
      collected: number;
      outstanding: number;
    }[];
    unitRows?: {
      charge_name: string;
      unit_no: string;
      billed: number;
      collected: number;
      outstanding: number;
    }[];
  };
  /** GST summary rows - rendered instead of financial sections when present. */
  gstSummary?: {
    rows: {
      period: string;
      bill_type: string;
      bill_count: number;
      taxable_amount: number;
      gst_amount: number;
      total_amount: number;
      collected_total: number;
      collected_gst: number;
    }[];
  };
  /** Applied filters to disclose in the PDF header. */
  appliedFilters?: {
    unitNos?: string[]; // human-readable unit numbers
    billTypes?: string[]; // human-readable bill type labels
    collectedOnly?: boolean; // whether only units with payments are shown
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
  const reportTitle = data.occupancy
    ? 'Occupancy Report'
    : data.directory
      ? 'Tenant / Owner Directory'
      : data.ledgerStatement
        ? 'Unit Account Statement'
        : data.gstSummary
          ? 'GST Summary'
          : data.otherCharges
            ? 'Other Charges Report'
            : data.cashLedger
              ? 'Cash Ledger'
              : isSingleSection
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

  const ENTRY_TYPE_LABELS: Record<string, string> = {
    due: 'Bill Due',
    due_payment: 'Payment Received',
    advance_payment: 'Advance Deposit',
    advance_applied: 'Advance Applied',
    advance_received: 'Advance Received',
    advance_refund: 'Advance Refund',
    other: 'Other',
  };

  return (
    <Document>
      <Page size="A4" style={rStyles.page}>
        {/* Header */}
        <DocumentHeader association={data.association} />

        <Text style={rStyles.reportTitle}>{reportTitle}</Text>
        {/* A ledger statement is scoped by unit, not by period - labelling it
            "Period: Unit 201" would be nonsense. */}
        <Text style={rStyles.reportSubtitle}>
          {data.ledgerStatement
            ? data.periodLabel
            : `Period: ${data.periodLabel}`}
        </Text>

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
            {data.appliedFilters?.collectedOnly && (
              <Text style={{ fontSize: 8, color: '#1e40af', marginTop: 2 }}>
                View: Payments Received (units with collected amount only)
              </Text>
            )}
            <Text style={{ fontSize: 7, color: '#3b5fc0', marginTop: 3 }}>
              This report covers the selected units/types only.
            </Text>
          </View>
        )}

        {/* ── Section: Collection Summary ── */}
        {showSection('collection') && (
          <>
            <Text style={rStyles.sectionTitle} minPresenceAhead={60}>
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

            {/* ── Unit breakdown sections (one per bill type when multi-type selected) ── */}
            {(data.collectionUnitBreakdown ?? [])
              .filter((ub) => ub.rows.length > 0)
              .map((ub) => {
                const STATUS_LABEL: Record<string, string> = {
                  paid: 'Paid',
                  partial: 'Partial',
                  unpaid: 'Unpaid',
                  overdue: 'Overdue',
                };
                const ubTotal = ub.rows.reduce(
                  (s, r) => ({
                    billed: s.billed + r.billed,
                    collected: s.collected + r.collected,
                    outstanding: s.outstanding + r.outstanding,
                  }),
                  { billed: 0, collected: 0, outstanding: 0 },
                );
                return (
                  <React.Fragment key={ub.billTypeLabel}>
                    <Text
                      style={[
                        rStyles.sectionTitle,
                        { marginTop: 14, fontSize: 10 },
                      ]}
                      minPresenceAhead={60}
                    >
                      Unit Breakdown · {ub.billTypeLabel}
                    </Text>
                    <View style={rStyles.table}>
                      <View style={rStyles.thead}>
                        <Text style={[rStyles.theadCell, { flex: 1.5 }]}>
                          Unit
                        </Text>
                        <Text style={rStyles.theadCellRight}>Bills</Text>
                        <Text style={rStyles.theadCellRight}>Billed (₹)</Text>
                        <Text style={rStyles.theadCellRight}>
                          Collected (₹)
                        </Text>
                        <Text style={rStyles.theadCellRight}>
                          Outstanding (₹)
                        </Text>
                        <Text style={rStyles.theadCellRight}>Status</Text>
                      </View>
                      {ub.rows.map((r, i) => (
                        <View
                          key={r.unit_no}
                          style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                        >
                          <Text style={[rStyles.cell, { flex: 1.5 }]}>
                            {r.unit_no}
                          </Text>
                          <Text style={rStyles.cellRight}>{r.bill_count}</Text>
                          <Text style={rStyles.cellRight}>
                            {formatINR(r.billed)}
                          </Text>
                          <Text style={rStyles.cellRight}>
                            {formatINR(r.collected)}
                          </Text>
                          <Text style={rStyles.cellRight}>
                            {formatINR(r.outstanding)}
                          </Text>
                          <Text style={rStyles.cellRight}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Text>
                        </View>
                      ))}
                      {/* Totals row */}
                      <View
                        style={[rStyles.row, { backgroundColor: '#f0f0f0' }]}
                      >
                        <Text
                          style={[
                            rStyles.cell,
                            { flex: 1.5, fontWeight: 'bold' },
                          ]}
                        >
                          Total
                        </Text>
                        <Text
                          style={[rStyles.cellRight, { fontWeight: 'bold' }]}
                        >
                          {ub.rows.reduce((s, r) => s + r.bill_count, 0)}
                        </Text>
                        <Text
                          style={[rStyles.cellRight, { fontWeight: 'bold' }]}
                        >
                          {formatINR(ubTotal.billed)}
                        </Text>
                        <Text
                          style={[rStyles.cellRight, { fontWeight: 'bold' }]}
                        >
                          {formatINR(ubTotal.collected)}
                        </Text>
                        <Text
                          style={[rStyles.cellRight, { fontWeight: 'bold' }]}
                        >
                          {formatINR(ubTotal.outstanding)}
                        </Text>
                        <Text style={rStyles.cellRight} />
                      </View>
                    </View>
                  </React.Fragment>
                );
              })}
          </>
        )}

        {/* ── Section 2: Outstanding Dues ── */}
        {showSection('outstanding') && (
          <>
            <Text style={rStyles.sectionTitle} minPresenceAhead={60}>
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
              <View style={[rStyles.table, { fontSize: 8 }]}>
                <View style={rStyles.thead}>
                  <Text style={[rStyles.theadCell, { flex: 0.8 }]}>Unit</Text>
                  <Text style={[rStyles.theadCell, { flex: 1.8 }]}>
                    Bill No.
                  </Text>
                  <Text style={[rStyles.theadCell, { flex: 1.2 }]}>Type</Text>
                  <Text style={rStyles.theadCell}>Period</Text>
                  <Text style={rStyles.theadCellRight}>Outstanding</Text>
                  <Text style={rStyles.theadCell}>Due Date</Text>
                </View>
                {data.outstanding.topBills.slice(0, 20).map((b, i) => (
                  <View
                    key={b.bill_no}
                    style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                  >
                    <Text style={[rStyles.cell, { flex: 0.8 }]}>
                      {b.unit_no}
                    </Text>
                    <Text style={[rStyles.cell, { flex: 1.8 }]}>
                      {b.bill_no}
                    </Text>
                    <Text style={[rStyles.cell, { flex: 1.2 }]}>
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
            <Text style={rStyles.sectionTitle} minPresenceAhead={60}>
              {sectionLabel('payments', 'Payments Received')}
            </Text>
            <View style={rStyles.kpiRow} wrap={false}>
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
              {data.payments.byMode.slice(0, 5).map((m) => (
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
            <Text style={rStyles.sectionTitle} minPresenceAhead={60}>
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
                    {r.rate !== null ? formatINR(r.rate) : '-'}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Cash Ledger section ── */}
        {data.cashLedger && (
          <>
            <Text style={rStyles.sectionTitle} minPresenceAhead={60}>
              Cash Ledger
            </Text>
            <View style={rStyles.kpiRow}>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Total Credits</Text>
                <Text style={rStyles.kpiValue}>
                  {formatINR(data.cashLedger.totalCredits)}
                </Text>
              </View>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Total Debits</Text>
                <Text style={rStyles.kpiValue}>
                  {formatINR(data.cashLedger.totalDebits)}
                </Text>
              </View>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Net</Text>
                <Text style={rStyles.kpiValue}>
                  {formatINR(
                    data.cashLedger.totalCredits - data.cashLedger.totalDebits,
                  )}
                </Text>
              </View>
              <View style={rStyles.kpiBox}>
                <Text style={rStyles.kpiLabel}>Transactions</Text>
                <Text style={rStyles.kpiValue}>
                  {data.cashLedger.entries.length}
                </Text>
              </View>
            </View>
            <View style={rStyles.table}>
              <View style={rStyles.thead}>
                <Text style={rStyles.theadCell}>Date</Text>
                <Text style={rStyles.theadCell}>Unit</Text>
                <Text style={rStyles.theadCell}>Type</Text>
                <Text style={rStyles.theadCell}>Charge</Text>
                <Text style={rStyles.theadCell}>Paid By</Text>
                <Text style={[rStyles.theadCell, { flex: 0.5 }]}>CR/DR</Text>
                <Text style={rStyles.theadCellRight}>Amount</Text>
              </View>
              {data.cashLedger.entries.map((r, i) => (
                <View
                  key={i}
                  style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                >
                  <Text style={rStyles.cell}>{formatDate(r.entry_date)}</Text>
                  <Text style={rStyles.cell}>{r.unit_no}</Text>
                  <Text style={rStyles.cell}>
                    {ENTRY_TYPE_LABELS[r.entry_type] ?? r.entry_type}
                  </Text>
                  <Text style={rStyles.cell}>
                    {BILL_TYPE_LABELS[r.bill_type] ?? r.bill_type}
                  </Text>
                  <Text style={rStyles.cell}>{r.paid_by_name}</Text>
                  <Text style={[rStyles.cell, { flex: 0.5 }]}>
                    {r.direction === 'credit' ? 'CR' : 'DR'}
                  </Text>
                  <Text style={rStyles.cellRight}>{formatINR(r.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Unit-level meter readings (electricity tab only) ── */}
        {showSection('electricity') &&
          data.electricity.byUnit &&
          data.electricity.byUnit.length > 0 && (
            <>
              <Text
                style={[rStyles.sectionTitle, { marginTop: 14, fontSize: 10 }]}
                minPresenceAhead={60}
              >
                Unit-wise Meter Readings
              </Text>
              <View style={rStyles.table}>
                <View style={rStyles.thead}>
                  <Text style={[rStyles.theadCell, { flex: 1.5 }]}>Period</Text>
                  <Text style={rStyles.theadCell}>Unit</Text>
                  <Text style={rStyles.theadCellRight}>Prev. Reading</Text>
                  <Text style={rStyles.theadCellRight}>Curr. Reading</Text>
                  <Text style={rStyles.theadCellRight}>Units (kWh)</Text>
                  <Text style={rStyles.theadCellRight}>Min. Charge</Text>
                  <Text style={rStyles.theadCellRight}>Rate/kWh</Text>
                  <Text style={rStyles.theadCellRight}>Charged (₹)</Text>
                </View>
                {data.electricity.byUnit.map((r, i) => (
                  <View
                    key={`${r.period}-${r.unit_no}`}
                    style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                  >
                    <Text style={[rStyles.cell, { flex: 1.5 }]}>
                      {formatPeriodLabel(r.period)}
                    </Text>
                    <Text style={rStyles.cell}>{r.unit_no}</Text>
                    <Text style={rStyles.cellRight}>
                      {r.prev_reading.toFixed(2)}
                    </Text>
                    <Text style={rStyles.cellRight}>
                      {r.curr_reading.toFixed(2)}
                    </Text>
                    <Text style={rStyles.cellRight}>
                      {r.consumed_units.toFixed(2)}
                    </Text>
                    <Text style={rStyles.cellRight}>
                      {r.minimum_charge > 0 ? formatINR(r.minimum_charge) : '-'}
                    </Text>
                    <Text style={rStyles.cellRight}>
                      {r.rate_per_unit !== null
                        ? formatINR(r.rate_per_unit)
                        : '-'}
                    </Text>
                    <Text style={rStyles.cellRight}>
                      {formatINR(r.charged_amount)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

        {/* ── Occupancy Report section ── */}
        {data.occupancy &&
          (() => {
            const rows = data.occupancy!.rows;
            const occupied = rows.filter((r) => r.status === 'Occupied').length;
            const vacant = rows.length - occupied;
            const rate =
              rows.length > 0 ? Math.round((occupied / rows.length) * 100) : 0;
            return (
              <>
                <View style={rStyles.kpiRow}>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>TOTAL UNITS</Text>
                    <Text style={rStyles.kpiValue}>{rows.length}</Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>OCCUPIED</Text>
                    <Text style={[rStyles.kpiValue, { color: '#146f35' }]}>
                      {occupied}
                    </Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>VACANT</Text>
                    <Text style={[rStyles.kpiValue, { color: '#a14a06' }]}>
                      {vacant}
                    </Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>OCCUPANCY RATE</Text>
                    <Text style={rStyles.kpiValue}>{rate}%</Text>
                  </View>
                </View>
                <View style={[rStyles.table, { fontSize: 8 }]}>
                  {/* `fixed` repeats the header on every page of this table.
                      Safe here because occupancy renders as a standalone
                      single-table document. */}
                  <View style={rStyles.thead} fixed>
                    <Text style={[rStyles.theadCell, OCC_W.unit]}>Unit</Text>
                    <Text style={[rStyles.theadCell, OCC_W.type]}>Type</Text>
                    <Text style={[rStyles.theadCellRight, OCC_W.floor]}>
                      Floor
                    </Text>
                    <Text style={[rStyles.theadCellRight, OCC_W.area]}>
                      Area (sqft)
                    </Text>
                    <Text style={[rStyles.theadCell, OCC_W.status]}>
                      Status
                    </Text>
                    <Text style={[rStyles.theadCell, OCC_W.occupant]}>
                      Occupant
                    </Text>
                    <Text style={[rStyles.theadCell, OCC_W.phone]}>Phone</Text>
                    <Text style={[rStyles.theadCell, OCC_W.role]}>Role</Text>
                    <Text style={[rStyles.theadCell, OCC_W.moveIn]}>
                      Move-In
                    </Text>
                  </View>
                  {rows.map((r, i) => (
                    <View
                      key={r.unit_no}
                      style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                      wrap={false}
                    >
                      <Text style={[rStyles.cell, OCC_W.unit]}>
                        {r.unit_no}
                      </Text>
                      <Text style={[rStyles.cell, OCC_W.type]}>{r.type}</Text>
                      <Text style={[rStyles.cellRight, OCC_W.floor]}>
                        {r.floor ?? '-'}
                      </Text>
                      <Text style={[rStyles.cellRight, OCC_W.area]}>
                        {r.area_sqft.toLocaleString('en-IN')}
                      </Text>
                      <Text
                        style={[
                          rStyles.cell,
                          OCC_W.status,
                          {
                            color:
                              r.status === 'Occupied' ? '#146f35' : '#a14a06',
                          },
                        ]}
                      >
                        {r.status}
                      </Text>
                      <Text style={[rStyles.cell, OCC_W.occupant]}>
                        {r.occupant_name ?? '-'}
                      </Text>
                      <Text style={[rStyles.cell, OCC_W.phone]}>
                        {r.occupant_phone ?? '-'}
                      </Text>
                      <Text style={[rStyles.cell, OCC_W.role]}>
                        {r.occupant_role ?? '-'}
                      </Text>
                      <Text style={[rStyles.cell, OCC_W.moveIn]}>
                        {r.move_in_date
                          ? new Date(r.move_in_date).toLocaleDateString(
                              'en-IN',
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              },
                            )
                          : '-'}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            );
          })()}

        {/* ── Unit Account Statement section ── */}
        {data.ledgerStatement &&
          (() => {
            const ls = data.ledgerStatement!;
            const rows = ls.rows;
            const totalDebits = rows.reduce((s, r) => s + (r.debit ?? 0), 0);
            // Credit totals mirror the on-screen rule: a reversed payment
            // contributes nothing to the balance, so it must not inflate totals.
            const totalCredits = rows.reduce(
              (s, r) =>
                s + (r.payment_status === 'reversed' ? 0 : (r.credit ?? 0)),
              0,
            );
            const closing = rows[0]?.runningBalance ?? 0;
            const showUnit = ls.showUnitColumn;
            return (
              <>
                <View style={rStyles.kpiRow}>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>TOTAL DEBITS</Text>
                    <Text style={rStyles.kpiValue}>
                      {formatINR(totalDebits)}
                    </Text>
                    <Text style={{ fontSize: 7, color: '#666' }}>
                      Bills raised
                    </Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>TOTAL CREDITS</Text>
                    <Text style={[rStyles.kpiValue, { color: '#146f35' }]}>
                      {formatINR(totalCredits)}
                    </Text>
                    <Text style={{ fontSize: 7, color: '#666' }}>
                      Payments &amp; advances
                    </Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>CLOSING BALANCE</Text>
                    <Text
                      style={[
                        rStyles.kpiValue,
                        { color: closing < 0 ? '#b91c1c' : '#146f35' },
                      ]}
                    >
                      {formatINR(Math.abs(closing))}
                    </Text>
                    <Text style={{ fontSize: 7, color: '#666' }}>
                      {closing === 0
                        ? 'Settled'
                        : closing > 0
                          ? 'In credit'
                          : 'Outstanding'}
                    </Text>
                  </View>
                </View>
                <View style={[rStyles.table, { fontSize: 8 }]}>
                  <View style={rStyles.thead} fixed>
                    <Text style={[rStyles.theadCell, LS_W.date]}>Date</Text>
                    {showUnit && (
                      <Text style={[rStyles.theadCell, LS_W.unit]}>Unit</Text>
                    )}
                    <Text style={[rStyles.theadCell, LS_W.particulars]}>
                      Particulars
                    </Text>
                    <Text style={[rStyles.theadCell, LS_W.billNo]}>
                      Bill No.
                    </Text>
                    <Text style={[rStyles.theadCellRight, LS_W.debit]}>
                      Debit
                    </Text>
                    <Text style={[rStyles.theadCellRight, LS_W.credit]}>
                      Credit
                    </Text>
                    <Text style={[rStyles.theadCellRight, LS_W.balance]}>
                      Balance
                    </Text>
                  </View>
                  {rows.map((r, i) => (
                    <View
                      key={`${r.entry_date}-${r.bill_no ?? i}-${i}`}
                      style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                      wrap={false}
                    >
                      <Text style={[rStyles.cell, LS_W.date]}>
                        {formatDate(r.entry_date)}
                      </Text>
                      {showUnit && (
                        <Text style={[rStyles.cell, LS_W.unit]}>
                          {r.unit_no}
                        </Text>
                      )}
                      <Text style={[rStyles.cell, LS_W.particulars]}>
                        {r.particulars}
                        {r.payment_status === 'reversed' ? ' (Reversed)' : ''}
                        {r.payment_status === 'partial_refund'
                          ? ' (Partly refunded)'
                          : ''}
                      </Text>
                      <Text style={[rStyles.cell, LS_W.billNo]}>
                        {r.bill_no ?? '-'}
                      </Text>
                      <Text style={[rStyles.cellRight, LS_W.debit]}>
                        {r.debit !== null ? formatINR(r.debit) : ''}
                      </Text>
                      <Text style={[rStyles.cellRight, LS_W.credit]}>
                        {r.credit !== null ? formatINR(r.credit) : ''}
                      </Text>
                      <Text
                        style={[
                          rStyles.cellRight,
                          LS_W.balance,
                          {
                            color: r.runningBalance < 0 ? '#b91c1c' : '#146f35',
                          },
                        ]}
                      >
                        {formatINR(Math.abs(r.runningBalance))}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            );
          })()}

        {/* ── Directory section ── */}
        {data.directory &&
          (() => {
            const rows = data.directory!.rows;
            const owners = rows.filter((r) => r.role === 'Owner').length;
            const tenants = rows.length - owners;
            return (
              <>
                <View style={rStyles.kpiRow}>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>TOTAL ENTRIES</Text>
                    <Text style={rStyles.kpiValue}>{rows.length}</Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>OWNERS</Text>
                    <Text style={rStyles.kpiValue}>{owners}</Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>TENANTS</Text>
                    <Text style={[rStyles.kpiValue, { color: '#a14a06' }]}>
                      {tenants}
                    </Text>
                  </View>
                </View>
                <View style={[rStyles.table, { fontSize: 8 }]}>
                  {/* `fixed` repeats the header on every page - directory is a
                      standalone single-table document. */}
                  <View style={rStyles.thead} fixed>
                    <Text style={[rStyles.theadCell, DIR_W.unit]}>Unit</Text>
                    <Text style={[rStyles.theadCell, DIR_W.name]}>Name</Text>
                    <Text style={[rStyles.theadCell, DIR_W.phone]}>Phone</Text>
                    <Text style={[rStyles.theadCell, DIR_W.email]}>Email</Text>
                    <Text style={[rStyles.theadCell, DIR_W.role]}>Role</Text>
                    <Text style={[rStyles.theadCell, DIR_W.moveIn]}>
                      Move-In
                    </Text>
                  </View>
                  {rows.map((r, i) => (
                    <View
                      key={`${r.unit_no}-${r.role}-${i}`}
                      style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                      wrap={false}
                    >
                      <Text style={[rStyles.cell, DIR_W.unit]}>
                        {r.unit_no}
                      </Text>
                      <Text style={[rStyles.cell, DIR_W.name]}>{r.name}</Text>
                      <Text style={[rStyles.cell, DIR_W.phone]}>
                        {r.phone ?? '-'}
                      </Text>
                      <Text style={[rStyles.cell, DIR_W.email]}>
                        {r.email ?? '-'}
                      </Text>
                      <Text
                        style={[
                          rStyles.cell,
                          DIR_W.role,
                          { color: r.role === 'Owner' ? '#1d4ed8' : '#a14a06' },
                        ]}
                      >
                        {r.role}
                      </Text>
                      <Text style={[rStyles.cell, DIR_W.moveIn]}>
                        {r.move_in_date
                          ? new Date(r.move_in_date).toLocaleDateString(
                              'en-IN',
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              },
                            )
                          : '-'}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            );
          })()}

        {/* ── GST Summary section ── */}
        {data.gstSummary &&
          data.gstSummary.rows.length > 0 &&
          (() => {
            const rows = data.gstSummary!.rows;
            const totalTaxable = rows.reduce((s, r) => s + r.taxable_amount, 0);
            const totalGst = rows.reduce((s, r) => s + r.gst_amount, 0);
            const totalBilled = rows.reduce((s, r) => s + r.total_amount, 0);
            const totalCollected = rows.reduce((s, r) => {
              const ratio =
                r.total_amount > 0 ? r.gst_amount / r.total_amount : 0;
              return s + r.collected_total * ratio;
            }, 0);
            const rate =
              totalGst > 0 ? Math.round((totalCollected / totalGst) * 100) : 0;
            return (
              <>
                <View style={rStyles.kpiRow}>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>TOTAL TAXABLE</Text>
                    <Text style={rStyles.kpiValue}>
                      {formatINR(totalTaxable)}
                    </Text>
                    <Text style={{ fontSize: 7, color: '#666' }}>
                      excl. GST
                    </Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>TOTAL GST BILLED</Text>
                    <Text style={[rStyles.kpiValue, { color: '#a14a06' }]}>
                      {formatINR(totalGst)}
                    </Text>
                    <Text style={{ fontSize: 7, color: '#666' }}>
                      CGST + SGST
                    </Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>TOTAL BILLED</Text>
                    <Text style={rStyles.kpiValue}>
                      {formatINR(totalBilled)}
                    </Text>
                    <Text style={{ fontSize: 7, color: '#666' }}>
                      taxable + GST
                    </Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>GST COLLECTED</Text>
                    <Text style={[rStyles.kpiValue, { color: '#146f35' }]}>
                      {formatINR(totalCollected)}
                    </Text>
                    <Text style={{ fontSize: 7, color: '#666' }}>
                      {rate}% collection rate
                    </Text>
                  </View>
                </View>
                <View style={[rStyles.table, { fontSize: 8 }]}>
                  <View style={rStyles.thead}>
                    <Text style={[rStyles.theadCell, { flex: 1.5 }]}>
                      Period
                    </Text>
                    <Text style={[rStyles.theadCell, { flex: 2 }]}>
                      Charge Type
                    </Text>
                    <Text style={rStyles.theadCellRight}>Bills</Text>
                    <Text style={rStyles.theadCellRight}>Taxable</Text>
                    <Text
                      style={[rStyles.theadCellRight, { fontWeight: 'bold' }]}
                    >
                      GST Billed
                    </Text>
                    <Text style={rStyles.theadCellRight}>Total</Text>
                    <Text style={rStyles.theadCellRight}>GST Coll.</Text>
                    <Text style={rStyles.theadCellRight}>Pending</Text>
                  </View>
                  {rows.map((r, i) => {
                    const gstRatio =
                      r.total_amount > 0 ? r.gst_amount / r.total_amount : 0;
                    const collectedGst = r.collected_total * gstRatio;
                    const pendingGst = Math.max(0, r.gst_amount - collectedGst);
                    return (
                      <View
                        key={`${r.period}-${r.bill_type}`}
                        style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                      >
                        <Text style={[rStyles.cell, { flex: 1.5 }]}>
                          {formatPeriodLabel(r.period)}
                        </Text>
                        <Text style={[rStyles.cell, { flex: 2 }]}>
                          {BILL_TYPE_LABELS[r.bill_type] ?? r.bill_type}
                        </Text>
                        <Text style={rStyles.cellRight}>{r.bill_count}</Text>
                        <Text style={rStyles.cellRight}>
                          {formatINR(r.taxable_amount)}
                        </Text>
                        <Text
                          style={[rStyles.cellRight, { fontWeight: 'bold' }]}
                        >
                          {formatINR(r.gst_amount)}
                        </Text>
                        <Text style={rStyles.cellRight}>
                          {formatINR(r.total_amount)}
                        </Text>
                        <Text style={[rStyles.cellRight, { color: '#146f35' }]}>
                          {formatINR(collectedGst)}
                        </Text>
                        <Text
                          style={[
                            rStyles.cellRight,
                            { color: pendingGst > 0.01 ? '#a14a06' : '#666' },
                          ]}
                        >
                          {formatINR(pendingGst)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 7, color: '#666', marginTop: 8 }}>
                  Collected GST is estimated proportionally. Verify against your
                  GSTIN filings.
                </Text>
              </>
            );
          })()}

        {/* ── Other Charges section ── */}
        {data.otherCharges &&
          data.otherCharges.rows.length > 0 &&
          (() => {
            const rows = data.otherCharges!.rows;
            const totalBilled = rows.reduce((s, r) => s + r.billed, 0);
            const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
            const totalOutstanding = rows.reduce(
              (s, r) => s + r.outstanding,
              0,
            );
            const rate =
              totalBilled > 0
                ? Math.round((totalCollected / totalBilled) * 100)
                : 0;
            return (
              <>
                <View style={rStyles.kpiRow}>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>CHARGE TYPES</Text>
                    <Text style={rStyles.kpiValue}>{rows.length}</Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>TOTAL BILLED</Text>
                    <Text style={rStyles.kpiValue}>
                      {formatINR(totalBilled)}
                    </Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>COLLECTED</Text>
                    <Text style={[rStyles.kpiValue, { color: '#146f35' }]}>
                      {formatINR(totalCollected)}
                    </Text>
                    <Text style={{ fontSize: 7, color: '#666' }}>
                      {rate}% collection rate
                    </Text>
                  </View>
                  <View style={rStyles.kpiBox}>
                    <Text style={rStyles.kpiLabel}>OUTSTANDING</Text>
                    <Text
                      style={[
                        rStyles.kpiValue,
                        { color: totalOutstanding > 0 ? '#b91c1c' : '#666' },
                      ]}
                    >
                      {formatINR(totalOutstanding)}
                    </Text>
                  </View>
                </View>
                <View style={rStyles.table}>
                  <View style={rStyles.thead}>
                    <Text style={[rStyles.theadCell, { flex: 3 }]}>
                      Charge Name
                    </Text>
                    <Text style={rStyles.theadCellRight}>Bills</Text>
                    <Text style={rStyles.theadCellRight}>Billed</Text>
                    <Text style={rStyles.theadCellRight}>Collected</Text>
                    <Text style={rStyles.theadCellRight}>Outstanding</Text>
                    <Text style={rStyles.theadCellRight}>Rate</Text>
                  </View>
                  {rows.map((r, i) => {
                    const rate_ =
                      r.billed > 0
                        ? Math.round((r.collected / r.billed) * 100)
                        : 0;
                    return (
                      <View
                        key={r.charge_name}
                        style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                      >
                        <Text style={[rStyles.cell, { flex: 3 }]}>
                          {r.charge_name}
                        </Text>
                        <Text style={rStyles.cellRight}>{r.bill_count}</Text>
                        <Text style={rStyles.cellRight}>
                          {formatINR(r.billed)}
                        </Text>
                        <Text style={rStyles.cellRight}>
                          {formatINR(r.collected)}
                        </Text>
                        <Text
                          style={[
                            rStyles.cellRight,
                            { color: r.outstanding > 0 ? '#a14a06' : '#666' },
                          ]}
                        >
                          {formatINR(r.outstanding)}
                        </Text>
                        <Text style={rStyles.cellRight}>{rate_}%</Text>
                      </View>
                    );
                  })}
                  {/* Totals row */}
                  <View
                    style={[
                      rStyles.row,
                      {
                        borderTopWidth: 1,
                        borderTopStyle: 'solid',
                        borderTopColor: '#312e81',
                      },
                    ]}
                  >
                    <Text
                      style={[rStyles.cell, { flex: 3, fontWeight: 'bold' }]}
                    >
                      Total
                    </Text>
                    <Text style={rStyles.cellRight} />
                    <Text style={[rStyles.cellRight, { fontWeight: 'bold' }]}>
                      {formatINR(totalBilled)}
                    </Text>
                    <Text style={[rStyles.cellRight, { fontWeight: 'bold' }]}>
                      {formatINR(totalCollected)}
                    </Text>
                    <Text
                      style={[
                        rStyles.cellRight,
                        {
                          fontWeight: 'bold',
                          color: totalOutstanding > 0 ? '#b91c1c' : '#666',
                        },
                      ]}
                    >
                      {formatINR(totalOutstanding)}
                    </Text>
                    <Text style={[rStyles.cellRight, { fontWeight: 'bold' }]}>
                      {rate}%
                    </Text>
                  </View>
                </View>

                {/* Unit breakdown per charge type */}
                {data.otherCharges!.unitRows &&
                  data.otherCharges!.unitRows.length > 0 &&
                  rows.map((charge) => {
                    const units = data.otherCharges!.unitRows!.filter(
                      (u) => u.charge_name === charge.charge_name,
                    );
                    if (units.length === 0) return null;
                    const uBilled = units.reduce((s, u) => s + u.billed, 0);
                    const uCollected = units.reduce(
                      (s, u) => s + u.collected,
                      0,
                    );
                    const uOutstanding = units.reduce(
                      (s, u) => s + u.outstanding,
                      0,
                    );
                    return (
                      <React.Fragment key={charge.charge_name}>
                        <Text
                          style={[
                            rStyles.sectionTitle,
                            { marginTop: 14, fontSize: 10 },
                          ]}
                          minPresenceAhead={40}
                        >
                          Unit Breakdown · {charge.charge_name}
                        </Text>
                        <View style={[rStyles.table, { fontSize: 8 }]}>
                          <View style={rStyles.thead}>
                            <Text style={[rStyles.theadCell, { flex: 1.5 }]}>
                              Unit
                            </Text>
                            <Text style={rStyles.theadCellRight}>Billed</Text>
                            <Text style={rStyles.theadCellRight}>
                              Collected
                            </Text>
                            <Text style={rStyles.theadCellRight}>
                              Outstanding
                            </Text>
                          </View>
                          {units.map((u, i) => (
                            <View
                              key={u.unit_no}
                              style={i % 2 === 0 ? rStyles.row : rStyles.rowAlt}
                            >
                              <Text style={[rStyles.cell, { flex: 1.5 }]}>
                                {u.unit_no}
                              </Text>
                              <Text style={rStyles.cellRight}>
                                {formatINR(u.billed)}
                              </Text>
                              <Text style={rStyles.cellRight}>
                                {formatINR(u.collected)}
                              </Text>
                              <Text
                                style={[
                                  rStyles.cellRight,
                                  {
                                    color:
                                      u.outstanding > 0 ? '#a14a06' : '#666',
                                  },
                                ]}
                              >
                                {formatINR(u.outstanding)}
                              </Text>
                            </View>
                          ))}
                          {/* Sub-total */}
                          <View
                            style={[
                              rStyles.row,
                              {
                                borderTopWidth: 1,
                                borderTopStyle: 'solid',
                                borderTopColor: '#312e81',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                rStyles.cell,
                                { flex: 1.5, fontWeight: 'bold' },
                              ]}
                            >
                              Total
                            </Text>
                            <Text
                              style={[
                                rStyles.cellRight,
                                { fontWeight: 'bold' },
                              ]}
                            >
                              {formatINR(uBilled)}
                            </Text>
                            <Text
                              style={[
                                rStyles.cellRight,
                                { fontWeight: 'bold' },
                              ]}
                            >
                              {formatINR(uCollected)}
                            </Text>
                            <Text
                              style={[
                                rStyles.cellRight,
                                {
                                  fontWeight: 'bold',
                                  color: uOutstanding > 0 ? '#b91c1c' : '#666',
                                },
                              ]}
                            >
                              {formatINR(uOutstanding)}
                            </Text>
                          </View>
                        </View>
                      </React.Fragment>
                    );
                  })}
              </>
            );
          })()}

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
