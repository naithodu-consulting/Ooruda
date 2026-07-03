import * as React from 'react';

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { formatDateLong, formatINR, formatPeriodLabel } from '../lib/format';

export interface ElectricityBillMeterRow {
  meterLabel: string;
  previousReading: number;
  currentReading: number;
  consumedUnits: number;
  blockRate: number;
  amount: number;
}

export interface ElectricityBillPdfData {
  association: {
    name: string;
    address: string | null;
    authorisedSignatory: string | null;
  };
  unit: { unitNo: string };
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
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#3B82F6',
    paddingBottom: 10,
    marginBottom: 10,
  },
  assocName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  assocAddress: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    color: '#1e293b',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  toBlock: {
    flexDirection: 'column',
    gap: 2,
  },
  toLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  toUnit: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  toAssoc: {
    fontSize: 9,
    color: '#475569',
  },
  detailsBlock: {
    alignItems: 'flex-end',
    flexDirection: 'column',
    gap: 3,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 6,
  },
  detailLabel: {
    fontSize: 8,
    color: '#64748b',
    width: 52,
    textAlign: 'right',
  },
  detailValue: {
    fontSize: 8,
    fontWeight: 'bold',
    minWidth: 90,
  },
  table: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 2,
    marginBottom: 10,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 2,
    borderTopColor: '#1e293b',
    fontWeight: 'bold',
    fontSize: 10,
  },
  colMeter: { flexGrow: 1, flexBasis: 0 },
  colReading: { width: 50, textAlign: 'right' },
  colConsumed: { width: 54, textAlign: 'right' },
  colRate: { width: 52, textAlign: 'right' },
  colAmount: { width: 60, textAlign: 'right' },
  signatureBlock: {
    marginTop: 32,
    alignSelf: 'flex-end',
    alignItems: 'center',
    width: 150,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    width: '100%',
    paddingTop: 4,
    textAlign: 'center',
    fontSize: 8,
    color: '#475569',
  },
  signatureName: {
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: '#94a3b8',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
});

function formatDate(value: string): string {
  return formatDateLong(value);
}

function periodLabel(bill: ElectricityBillPdfData['bill']): string {
  if (bill.periodStart && bill.periodEnd) {
    const start = formatDate(bill.periodStart);
    const end = formatDate(bill.periodEnd);
    return `${start} – ${end}`;
  }
  return formatPeriodLabel(bill.period);
}

export function ElectricityBillDocument({
  association,
  unit,
  bill,
  meters,
  minimumCharge,
}: ElectricityBillPdfData) {
  const outstanding = Math.max(0, bill.totalAmount - bill.paidAmount);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.assocName}>{association.name}</Text>
          {association.address ? (
            <Text style={s.assocAddress}>{association.address}</Text>
          ) : null}
        </View>

        {/* Title */}
        <Text style={s.title}>Electricity Charges</Text>

        {/* To + Bill details side by side */}
        <View style={s.metaRow}>
          <View style={s.toBlock}>
            <Text style={s.toLabel}>Bill To</Text>
            <Text style={s.toUnit}>Unit {unit.unitNo}</Text>
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
              <Text style={s.detailLabel}>Date</Text>
              <Text style={s.detailValue}>{formatDate(bill.generatedAt)}</Text>
            </View>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Due Date</Text>
              <Text style={s.detailValue}>{formatDate(bill.dueDate)}</Text>
            </View>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Bill No</Text>
              <Text style={s.detailValue}>{bill.billNo}</Text>
            </View>
          </View>
        </View>

        {/* Meter readings table */}
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={s.colMeter}>Meter</Text>
            <Text style={s.colReading}>Previous</Text>
            <Text style={s.colReading}>Current</Text>
            <Text style={s.colConsumed}>Consumed</Text>
            <Text style={s.colRate}>Rate/Unit</Text>
            <Text style={s.colAmount}>Amount</Text>
          </View>

          {meters.map((m, i) => (
            <View style={s.tableRow} key={i}>
              <Text style={s.colMeter}>{m.meterLabel}</Text>
              <Text style={s.colReading}>{m.previousReading}</Text>
              <Text style={s.colReading}>{m.currentReading}</Text>
              <Text style={s.colConsumed}>{m.consumedUnits}</Text>
              <Text style={s.colRate}>₹{m.blockRate.toFixed(2)}</Text>
              <Text style={s.colAmount}>{formatINR(m.amount)}</Text>
            </View>
          ))}

          {minimumCharge > 0 ? (
            <View style={s.tableRow}>
              <Text style={{ ...s.colMeter, color: '#64748b' }}>
                Minimum Charge
              </Text>
              <Text style={s.colReading} />
              <Text style={s.colReading} />
              <Text style={s.colConsumed} />
              <Text style={s.colRate} />
              <Text style={s.colAmount}>{formatINR(minimumCharge)}</Text>
            </View>
          ) : null}

          <View style={s.totalRow}>
            <Text style={s.colMeter}>Total</Text>
            <Text style={s.colReading} />
            <Text style={s.colReading} />
            <Text style={s.colConsumed} />
            <Text style={s.colRate} />
            <Text style={s.colAmount}>{formatINR(bill.totalAmount)}</Text>
          </View>
        </View>

        {/* Outstanding (if partial/unpaid) */}
        {outstanding > 0 ? (
          <View
            style={{
              alignSelf: 'flex-end',
              flexDirection: 'row',
              gap: 6,
              marginBottom: 4,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 8 }}>Paid</Text>
            <Text style={{ fontSize: 8 }}>{formatINR(bill.paidAmount)}</Text>
            <Text style={{ color: '#64748b', fontSize: 8, marginLeft: 8 }}>
              Outstanding
            </Text>
            <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#dc2626' }}>
              {formatINR(outstanding)}
            </Text>
          </View>
        ) : null}

        {/* Authorised signatory */}
        {association.authorisedSignatory ? (
          <View style={s.signatureBlock}>
            <Text style={s.signatureLine}>Authorised Signatory</Text>
            <Text style={s.signatureName}>
              {association.authorisedSignatory}
            </Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>
            This is a system-generated bill and does not require a physical
            signature.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
