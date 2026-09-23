import * as React from 'react';

import { Document, Page, Text, View } from '@react-pdf/renderer';

import { DocumentFooter } from '../components/document-footer';
import {
  DocumentHeader,
  type AssociationBranding,
} from '../components/document-header';
import { styles } from '../components/styles';
import { billTypeLabel } from '../lib/bill-type-labels';
import {
  formatINR,
  formatPeriodDateRange,
  formatShortDate,
  ordinalFloorLabel,
} from '../lib/format';
import type { BillingEntityData } from './bill-document';

export interface AdvanceApplicationPdfData {
  association: AssociationBranding;
  unit: { unitNo: string; doorNo?: string | null; floor?: number | null };
  billTo?: BillingEntityData | null;
  voucher: { voucherNo: string; appliedAt: string };
  application: {
    billNo: string;
    billType: string;
    period: string;
    amountApplied: number;
  };
}

function buildAddressLines(
  billTo: BillingEntityData | null | undefined,
  unit: AdvanceApplicationPdfData['unit'],
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
    unit.floor != null ? ordinalFloorLabel(unit.floor) : null,
    associationAddress,
  ]
    .filter(Boolean)
    .join(', ');
  if (floorAddr) lines.push(floorAddr);
  return lines;
}

export function AdvanceApplicationDocument({
  association,
  unit,
  billTo,
  voucher,
  application,
}: AdvanceApplicationPdfData) {
  const addressLines = buildAddressLines(billTo, unit, association.address);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocumentHeader association={association} />

        <View style={styles.docTitleBlock}>
          <Text style={styles.docTitle}>Advance Credit Voucher</Text>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaGridRow}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Voucher Number:</Text>
              <Text style={styles.metaValue}>{voucher.voucherNo}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Billing Period:</Text>
              <Text style={styles.metaValue}>
                {formatPeriodDateRange(application.period)}
              </Text>
            </View>
          </View>
          <View style={styles.metaGridRow}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice Number:</Text>
              <Text style={styles.metaValue}>{application.billNo}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Applied On:</Text>
              <Text style={styles.metaValue}>
                {formatShortDate(voucher.appliedAt)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Applied To</Text>
          {billTo?.name ? (
            <Text style={styles.billToName}>{billTo.name}</Text>
          ) : null}
          {addressLines.map((line, i) => (
            <Text style={styles.billToAddress} key={i}>
              {line}
            </Text>
          ))}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDescription, styles.tableHeaderText]}>
              Description
            </Text>
            <Text style={[styles.colDescription, styles.tableHeaderText]}>
              Invoice Ref
            </Text>
            <Text style={[styles.colAmount, styles.tableHeaderText]}>
              Amount Applied
            </Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.colDescription}>
              {'Advance applied - ' + billTypeLabel(application.billType)}
            </Text>
            <Text style={styles.colDescription}>{application.billNo}</Text>
            <Text style={[styles.colAmount, { textAlign: 'right' }]}>
              {formatINR(application.amountApplied)}
            </Text>
          </View>
        </View>

        <View style={styles.summaryBlock}>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRowTotal}>
            <Text>Amount Applied</Text>
            <Text>{formatINR(application.amountApplied)}</Text>
          </View>
        </View>

        <DocumentFooter
          note="This is a system-generated advance credit voucher confirming the application of pre-paid advance funds to the above invoice."
          association={association}
        />
      </Page>
    </Document>
  );
}
