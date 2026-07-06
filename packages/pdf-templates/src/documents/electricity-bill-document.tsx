import * as React from 'react';

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

import { DocumentFooter } from '../components/document-footer';
import { DocumentHeader } from '../components/document-header';
import { formatINR, formatPeriodLabel } from '../lib/format';
import type { BillingEntityData } from './bill-document';

export interface ElectricityBillMeterRow {
  meterLabel: string;
  previousReading: number;
  currentReading: number;
  consumedUnits: number;
  blockRate: number;
  amount: number;
  loadKva?: number | null;
}

export interface ElectricityBillPdfData {
  association: {
    name: string;
    address: string | null;
    logoUrl: string | null;
    authorisedSignatory: string | null;
  };
  unit: { unitNo: string; doorNo?: string | null; floor?: number | null };
  billTo?: BillingEntityData | null;
  bill: {
    billNo: string;
    period: string;
    periodStart: string | null;
    periodEnd: string | null;
    dueDate: string;
    generatedAt: string;
    totalAmount: number;
    paidAmount: number;
  };
  meters: ElectricityBillMeterRow[];
  minimumCharge: number;
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Noto Sans',
    fontSize: 9,
    padding: 36,
    color: '#1e293b',
  },

  // ── Title strip ──────────────────────────────────────────────────────────
  titleStrip: {
    backgroundColor: '#1a3a5c',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 3,
    marginBottom: 14,
    alignItems: 'center',
  },
  titleText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // ── Bill meta row (To + Bill details) ────────────────────────────────────
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  toLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 3,
    letterSpacing: 0.5,
  },
  toUnit: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  toAssoc: {
    fontSize: 8,
    color: '#475569',
    marginTop: 1,
  },
  detailsBlock: {
    alignItems: 'flex-end',
    gap: 3,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 8,
  },
  detailLabel: {
    fontSize: 8,
    color: '#64748b',
    width: 54,
    textAlign: 'right',
  },
  detailValue: {
    fontSize: 8,
    fontWeight: 'bold',
    minWidth: 88,
  },
  billNoValue: {
    fontSize: 8,
    fontWeight: 'bold',
    minWidth: 88,
    color: '#1a3a5c',
  },

  // ── Meter readings table ──────────────────────────────────────────────────
  table: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 3,
    marginBottom: 10,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1a3a5c',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  tableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  minChargeRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fffbeb',
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderTopWidth: 2,
    borderTopColor: '#1a3a5c',
    backgroundColor: '#eaf0f7',
    fontWeight: 'bold',
    fontSize: 10,
  },
  colSl: { width: 22, fontSize: 8 },
  colMeter: { flexGrow: 1, flexBasis: 0 },
  colReading: { width: 52, textAlign: 'right' },
  colConsumed: { width: 54, textAlign: 'right' },
  colRate: { width: 52, textAlign: 'right' },
  colAmount: { width: 62, textAlign: 'right' },

  // ── Outstanding panel ─────────────────────────────────────────────────────
  outstandingPanel: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#fef2f2',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#fecaca',
  },

  // ── Signature row ─────────────────────────────────────────────────────────
  signatureRow: {
    marginTop: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    alignItems: 'center',
    width: 160,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    width: '100%',
    paddingTop: 4,
    textAlign: 'center',
    fontSize: 8,
    color: '#64748b',
  },
  signatureName: {
    fontSize: 8,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
    color: '#1e293b',
  },

  // ── Load note ─────────────────────────────────────────────────────────────
  loadNote: {
    marginBottom: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 3,
  },
  loadNoteText: {
    fontSize: 7.5,
    color: '#475569',
  },
});

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function periodLabel(bill: ElectricityBillPdfData['bill']): string {
  if (bill.periodStart && bill.periodEnd) {
    return `${formatShortDate(bill.periodStart)} to ${formatShortDate(bill.periodEnd)}`;
  }
  return formatPeriodLabel(bill.period);
}

export function ElectricityBillDocument({
  association,
  unit,
  billTo,
  bill,
  meters,
  minimumCharge,
}: ElectricityBillPdfData) {
  const outstanding = Math.max(0, bill.totalAmount - bill.paidAmount);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Shared header: logo + name + address + bill no + date */}
        <DocumentHeader
          association={{
            name: association.name,
            address: association.address,
            gstin: null,
            registrationNumber: null,
            logoUrl: association.logoUrl,
          }}
          docTitle="Electricity Bill"
          docNo={bill.billNo}
          docDate={formatShortDate(bill.generatedAt)}
        />

        {/* Title strip */}
        <View style={s.titleStrip}>
          <Text style={s.titleText}>Electricity Charges</Text>
        </View>

        {/* To + Bill details */}
        <View style={s.metaRow}>
          <View>
            <Text style={s.toLabel}>Bill To</Text>
            {billTo?.name ? <Text style={s.toUnit}>{billTo.name}</Text> : null}
            {billTo?.isCompany && billTo.companyAddress ? (
              <Text style={s.toAssoc}>{billTo.companyAddress}</Text>
            ) : (
              <>
                <Text style={billTo?.name ? s.toAssoc : s.toUnit}>
                  {unit.doorNo
                    ? `${unit.unitNo} / ${unit.doorNo}`
                    : `Unit ${unit.unitNo}`}
                </Text>
                {unit.floor != null ? (
                  <Text style={s.toAssoc}>{`Floor ${unit.floor}`}</Text>
                ) : null}
              </>
            )}
            {billTo?.isCompany && billTo.companyGstin ? (
              <Text style={s.toAssoc}>GSTIN: {billTo.companyGstin}</Text>
            ) : null}
            <Text style={s.toAssoc}>{association.name}</Text>
          </View>

          <View style={s.detailsBlock}>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Month</Text>
              <Text style={s.detailValue}>
                {formatPeriodLabel(bill.period)}
              </Text>
            </View>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Period</Text>
              <Text style={s.detailValue}>{periodLabel(bill)}</Text>
            </View>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Due Date</Text>
              <Text style={s.detailValue}>{formatShortDate(bill.dueDate)}</Text>
            </View>
          </View>
        </View>

        {/* Meter readings table */}
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.colSl, s.tableHeaderText]}>SL</Text>
            <Text style={[s.colMeter, s.tableHeaderText]}>Description</Text>
            <Text style={[s.colReading, s.tableHeaderText]}>Previous</Text>
            <Text style={[s.colReading, s.tableHeaderText]}>Current</Text>
            <Text style={[s.colConsumed, s.tableHeaderText]}>Units</Text>
            <Text style={[s.colRate, s.tableHeaderText]}>Rate/Unit</Text>
            <Text style={[s.colAmount, s.tableHeaderText]}>Amount</Text>
          </View>

          {meters.map((m, i) => (
            <View style={i % 2 === 0 ? s.tableRow : s.tableRowAlt} key={i}>
              <Text style={s.colSl}>{i + 1}</Text>
              <Text style={s.colMeter}>{m.meterLabel}</Text>
              <Text style={s.colReading}>{m.previousReading}</Text>
              <Text style={s.colReading}>{m.currentReading}</Text>
              <Text style={s.colConsumed}>{m.consumedUnits}</Text>
              <Text style={s.colRate}>₹{m.blockRate.toFixed(2)}</Text>
              <Text style={s.colAmount}>{formatINR(m.amount)}</Text>
            </View>
          ))}

          {minimumCharge > 0 ? (
            <View style={s.minChargeRow}>
              <Text style={s.colSl}>{meters.length + 1}</Text>
              <Text style={[s.colMeter, { color: '#92400e' }]}>
                Minimum Charge
              </Text>
              <Text style={s.colReading} />
              <Text style={s.colReading} />
              <Text style={s.colConsumed} />
              <Text style={s.colRate} />
              <Text style={[s.colAmount, { color: '#92400e' }]}>
                {formatINR(minimumCharge)}
              </Text>
            </View>
          ) : null}

          <View style={s.totalRow}>
            <Text style={s.colSl} />
            <Text style={s.colMeter}>Total</Text>
            <Text style={s.colReading} />
            <Text style={s.colReading} />
            <Text style={s.colConsumed} />
            <Text style={s.colRate} />
            <Text style={[s.colAmount, { color: '#1a3a5c' }]}>
              {formatINR(bill.totalAmount)}
            </Text>
          </View>
        </View>

        {/* Sanctioned load note (if any meter has a load) */}
        {meters.some((m) => m.loadKva != null) ? (
          <View style={s.loadNote}>
            <Text style={s.loadNoteText}>
              Sanctioned Load —{' '}
              {meters
                .filter((m) => m.loadKva != null)
                .map((m) => `${m.meterLabel}: ${m.loadKva} kVA`)
                .join('  |  ')}
            </Text>
          </View>
        ) : null}

        {/* Outstanding amount (if partial/unpaid) */}
        {outstanding > 0 ? (
          <View style={s.outstandingPanel}>
            <Text style={{ fontSize: 8, color: '#64748b' }}>Paid</Text>
            <Text style={{ fontSize: 8 }}>{formatINR(bill.paidAmount)}</Text>
            <Text style={{ fontSize: 8, color: '#64748b', marginLeft: 10 }}>
              Outstanding
            </Text>
            <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#dc2626' }}>
              {formatINR(outstanding)}
            </Text>
          </View>
        ) : null}

        {/* Receiver + Authorised Signatory */}
        <View style={s.signatureRow}>
          <View style={s.signatureBlock}>
            <Text style={{ fontSize: 20, color: '#e2e8f0', marginBottom: 4 }}>
              {''}
            </Text>
            <Text style={s.signatureLine}>Receiver's Signature</Text>
          </View>

          <View style={s.signatureBlock}>
            <Text style={{ fontSize: 20, color: '#e2e8f0', marginBottom: 4 }}>
              {''}
            </Text>
            <Text style={s.signatureLine}>Authorised Signatory</Text>
            {association.authorisedSignatory ? (
              <Text style={s.signatureName}>
                {association.authorisedSignatory}
              </Text>
            ) : null}
          </View>
        </View>

        <DocumentFooter note="This is a computer-generated bill and does not require a physical signature." />
      </Page>
    </Document>
  );
}
