import * as React from 'react';

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { DocumentFooter } from '../components/document-footer';
import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { NAVY, styles as sharedStyles } from '../components/styles';
import {
  formatINR,
  formatPeriodDateRange,
  formatShortDate,
} from '../lib/format';
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
  association: AssociationBranding & {
    authorisedSignatory?: string | null;
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
  // ── Meter readings table ──────────────────────────────────────────────────
  table: {
    borderWidth: 1.25,
    borderColor: NAVY,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 10,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFCF0',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1.25,
    borderBottomColor: NAVY,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#000000',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  tableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  minChargeRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fffbeb',
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 2,
    borderTopColor: NAVY,
    backgroundColor: '#eaf0f7',
    fontWeight: 'bold',
    fontSize: 10,
  },
  colSl: { width: 22, fontSize: 8, color: '#000000' },
  colMeter: { flexGrow: 1, flexBasis: 0, color: '#000000' },
  colReading: { width: 52, textAlign: 'right', color: '#000000' },
  colConsumed: { width: 54, textAlign: 'right', color: '#000000' },
  colRate: { width: 52, textAlign: 'right', color: '#000000' },
  colAmount: { width: 62, textAlign: 'right', color: '#000000' },

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
    color: '#000000',
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

/** Bill-To address lines: [unit line, floor+association-address line], or company address as a single line. */
function buildAddressLines(
  billTo: BillingEntityData | null | undefined,
  unit: ElectricityBillPdfData['unit'],
  associationAddress: string | null,
): string[] {
  if (billTo?.isCompany && billTo.companyAddress) {
    return [billTo.companyAddress];
  }
  const lines: string[] = [];
  if (unit.doorNo) {
    lines.push(`${unit.unitNo}, ${unit.doorNo},`);
  } else {
    lines.push(`Unit ${unit.unitNo},`);
  }
  const floorAddr = [
    unit.floor != null ? `Floor ${unit.floor}` : null,
    associationAddress,
  ]
    .filter(Boolean)
    .join(', ');
  if (floorAddr) lines.push(floorAddr);
  return lines;
}

function periodLabel(bill: ElectricityBillPdfData['bill']): string {
  if (bill.periodStart && bill.periodEnd) {
    return `${formatShortDate(bill.periodStart)} - ${formatShortDate(bill.periodEnd)}`;
  }
  return formatPeriodDateRange(bill.period);
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
  const addressLines = buildAddressLines(billTo, unit, association.address);

  return (
    <Document>
      <Page size="A4" style={sharedStyles.page}>
        {/* Shared header: logo + name + address + contact strip */}
        <DocumentHeader association={association} />

        {/* Title */}
        <View style={sharedStyles.docTitleBlock}>
          <Text style={sharedStyles.docTitle}>Electricity Bill</Text>
        </View>

        {/* Metadata: row-paired 2-col grid */}
        <View style={sharedStyles.metaGrid}>
          <View style={sharedStyles.metaGridRow}>
            <View style={sharedStyles.metaRow}>
              <Text style={sharedStyles.metaLabel}>Invoice Number:</Text>
              <Text style={sharedStyles.metaValue}>{bill.billNo}</Text>
            </View>
            <View style={sharedStyles.metaRow}>
              <Text style={sharedStyles.metaLabel}>Billing Period:</Text>
              <Text style={sharedStyles.metaValue}>{periodLabel(bill)}</Text>
            </View>
          </View>
          <View style={sharedStyles.metaGridRow}>
            <View style={sharedStyles.metaRow}>
              <Text style={sharedStyles.metaLabel}>Due Date:</Text>
              <Text style={sharedStyles.metaValue}>
                {formatShortDate(bill.dueDate)}
              </Text>
            </View>
            <View style={sharedStyles.metaRow}>
              <Text style={sharedStyles.metaLabel}>Invoice Date:</Text>
              <Text style={sharedStyles.metaValue}>
                {formatShortDate(bill.generatedAt)}
              </Text>
            </View>
          </View>
        </View>

        {/* Bill To */}
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionTitle}>Bill To</Text>
          {billTo?.name ? (
            <Text style={sharedStyles.billToName}>{billTo.name}</Text>
          ) : null}
          {addressLines.map((line, i) => (
            <Text style={sharedStyles.billToAddress} key={i}>
              {line}
            </Text>
          ))}
          {billTo?.isCompany && billTo.companyGstin ? (
            <Text style={sharedStyles.billToAddress}>
              GSTIN: {billTo.companyGstin}
            </Text>
          ) : null}
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
              <Text style={s.colMeter}>
                {m.meterLabel.replace(/^SM[\s-]+/i, '')}
              </Text>
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
            <Text style={[s.colAmount, { color: NAVY }]}>
              {formatINR(bill.totalAmount)}
            </Text>
          </View>
        </View>

        {/* Sanctioned load note */}
        {meters.some((m) => m.loadKva != null) ? (
          <View style={s.loadNote}>
            <Text style={s.loadNoteText}>
              Sanctioned Load —{' '}
              {meters
                .filter((m) => m.loadKva != null)
                .map(
                  (m) =>
                    `${m.meterLabel.replace(/^SM[\s-]+/i, '')}: ${m.loadKva} kVA`,
                )
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

        {/* Signatures */}
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

        <DocumentFooter
          note="This is a system-generated bill and does not require a signature."
          association={association}
        />
      </Page>
    </Document>
  );
}
