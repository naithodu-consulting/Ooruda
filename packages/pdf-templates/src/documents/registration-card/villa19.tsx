import * as React from 'react';

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import type { RegistrationCardPdfData } from './types';

/**
 * Villa 19's guest registration card, as the villa already prints it.
 *
 * This file is a faithful setting of the sheet the villa hands over at the
 * gate: the same letterhead, the same fields in the same order and in the
 * same grid, the same eight house rules in the same words, the same consent
 * line and signature block. Nothing here is shared with another villa on
 * purpose — the next property gets its own file beside this one, because its
 * sheet will differ in all of those things. Resist every urge to factor this
 * into a generic form builder.
 *
 * Two departures from the Word original, both agreed:
 *   - "SEC DEPOSIT" reads "SECURITY DEPOSIT", which is what it is (the
 *     refundable amount collected at check-in, not the tariff advance).
 *   - the occupancy rule takes its two numbers from Villa Settings instead of
 *     the frozen 14 / 8, so a signed card cannot contradict what the system
 *     enforces.
 *
 * Typeface: the Word file is set in Bodoni MT and Californian FB, which we do
 * not bundle. The letterhead uses the PDF built-in Times-Roman (a serif, no
 * embedding cost) and the body Noto Sans, the only family registered in this
 * package and the only one carrying ₹.
 */

const RULE = '#000000';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Noto Sans',
    fontSize: 8,
    paddingTop: 22,
    paddingHorizontal: 28,
    paddingBottom: 20,
    color: '#000000',
  },

  // ── Letterhead ───────────────────────────────────────────────────────────
  letterhead: { alignItems: 'center', marginBottom: 8 },
  wordmark: {
    fontFamily: 'Times-Roman',
    fontSize: 25,
    letterSpacing: 3,
  },
  brandLine: {
    fontFamily: 'Times-Roman',
    fontSize: 9,
    fontStyle: 'italic',
    marginTop: 1,
    marginBottom: 5,
  },
  legalName: { fontSize: 9, fontWeight: 'bold', textAlign: 'center' },
  letterheadLine: { fontSize: 7.5, textAlign: 'center', marginTop: 2 },

  title: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.6,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 8,
  },

  // ── Field grid ───────────────────────────────────────────────────────────
  grid: { borderTopWidth: 0.75, borderLeftWidth: 0.75, borderColor: RULE },
  row: { flexDirection: 'row' },
  cell: {
    borderRightWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: RULE,
    paddingHorizontal: 5,
    paddingTop: 3,
    paddingBottom: 3,
  },
  label: { fontSize: 7, fontWeight: 'bold', letterSpacing: 0.3 },
  value: { fontSize: 9, marginTop: 3 },
  footnote: { fontSize: 6.5, marginTop: 'auto' },

  // ── Terms ────────────────────────────────────────────────────────────────
  termsTitle: {
    fontSize: 9.5,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    marginTop: 10,
    marginBottom: 5,
  },
  termRow: { flexDirection: 'row', marginBottom: 3 },
  termLabel: { width: '31%', fontSize: 7.5, fontWeight: 'bold' },
  termText: { width: '69%', fontSize: 7.5 },

  consent: { fontSize: 8, marginTop: 10, marginBottom: 20 },
  signRow: { flexDirection: 'row', justifyContent: 'space-between' },
  signSlot: { width: '38%' },
  signLine: { borderTopWidth: 0.75, borderColor: RULE, marginBottom: 3 },
  signCaption: { fontSize: 7.5 },
});

function Cell(props: {
  label: string;
  value?: string | null;
  width: string;
  height: number;
  footnote?: string;
}) {
  return (
    <View style={[s.cell, { width: props.width, minHeight: props.height }]}>
      <Text style={s.label}>{props.label}</Text>
      {props.value ? <Text style={s.value}>{props.value}</Text> : null}
      {props.footnote ? <Text style={s.footnote}>{props.footnote}</Text> : null}
    </View>
  );
}

/** Blank box beside BOOKING ID, as the original sheet has it. */
function Filler(props: { width: string; height: number }) {
  return (
    <View style={[s.cell, { width: props.width, minHeight: props.height }]} />
  );
}

export function Villa19RegistrationCardDocument({
  data,
}: {
  data: RegistrationCardPdfData;
}) {
  const { letterhead: head, occupancy } = data;

  const contact = [
    head.phone && `Phone: ${head.phone}`,
    head.email && `Email: ${head.email}`,
  ]
    .filter(Boolean)
    .join('    ');

  // The eight house rules, verbatim from the villa's sheet apart from the two
  // typo fixes ("will be collected", "Quiet hours, 10 PM") and the occupancy
  // numbers, which are now this villa's live settings.
  const terms: [string, string][] = [
    [
      'Registered guests only:',
      'Government photo ID must be provided at check-in for every guest.',
    ],
    ['Visitors:', 'Unregistered visitors are not permitted on the premises.'],
    [
      'Occupancy:',
      `Up to ${occupancy.maxGuests} guests are permitted, with charges applicable beyond ${occupancy.includedGuests} guests.`,
    ],
    [
      'No parties:',
      'Parties, loud gatherings and commercial activities are not permitted.',
    ],
    [
      'Quiet hours, 10 PM to 7 AM:',
      'Please keep noise to a minimum and respect the neighborhood.',
    ],
    [
      'No smoking villa:',
      'Smoking is prohibited inside the villa. Cleaning and restoration charges apply for violations.',
    ],
    ['No Pets:', 'Pets are not permitted anywhere on the property.'],
    [
      'Care for the property:',
      'Guests shall use the villa, furnishings and amenities responsibly. Charges (if any) towards damages incurred will be collected from the guests.',
    ],
  ];

  return (
    <Document
      title={`Guest registration card ${data.bookingId}`}
      author={head.legalName ?? head.villaName}
    >
      <Page size="A4" style={s.page}>
        <View style={s.letterhead}>
          <Text style={s.wordmark}>VILLA19</Text>
          <Text style={s.brandLine}>by Habbaa</Text>
          {head.legalName ? (
            <Text style={s.legalName}>{head.legalName}</Text>
          ) : null}
          {head.legalAddress ? (
            <Text style={s.letterheadLine}>{head.legalAddress}</Text>
          ) : null}
          {contact ? <Text style={s.letterheadLine}>{contact}</Text> : null}
          {head.gstin ? (
            <Text style={s.letterheadLine}>GSTIN: {head.gstin}</Text>
          ) : null}
        </View>

        <Text style={s.title}>GUEST REGISTRATION CARD</Text>

        <View style={s.grid}>
          <View style={s.row}>
            <Cell
              label="BOOKING ID:"
              value={data.bookingId}
              width="23.7%"
              height={30}
            />
            <Filler width="76.3%" height={30} />
          </View>

          <View style={s.row}>
            <Cell
              label="SALUTATION:"
              value={data.salutation ?? ''}
              width="23.7%"
              height={32}
            />
            <Cell
              label="FIRST NAME:"
              value={data.firstName || data.guestName}
              width="39.1%"
              height={32}
            />
            <Cell
              label="LAST NAME:"
              value={data.lastName ?? ''}
              width="37.2%"
              height={32}
            />
          </View>

          <View style={s.row}>
            <Cell label="ARRIVAL FROM:" width="50.7%" height={32} />
            <Cell label="NEXT DESTINATION:" width="49.3%" height={32} />
          </View>

          <View style={s.row}>
            <Cell label="PURPOSE OF VISIT:" width="100%" height={38} />
          </View>

          <View style={s.row}>
            <Cell label="PERMANENT ADDRESS:" width="56%" height={74} />
            <Cell
              label="COMPANY INFO*:"
              value={data.companyInfo}
              width="44%"
              height={74}
              footnote="*Please include GST details if GST invoice is needed."
            />
          </View>

          <View style={s.row}>
            <Cell
              label="EMAIL ID:"
              value={data.email}
              width="56%"
              height={32}
            />
            <Cell
              label="MOBILE NO:"
              value={data.mobile}
              width="44%"
              height={32}
            />
          </View>

          <View style={s.row}>
            <Cell label="NATIONALITY:" width="29.9%" height={32} />
            <Cell label="DATE OF BIRTH:" width="31.9%" height={32} />
            <Cell
              label="GOVERNMENT ID TYPE / NUMBER:"
              value={data.govtIdType}
              width="38.2%"
              height={32}
            />
          </View>

          <View style={s.row}>
            <Cell
              label="ARRIVAL DATE & TIME:"
              value={data.arrival}
              width="50.7%"
              height={32}
            />
            <Cell
              label="DEPARTURE DATE & TIME:"
              value={data.departure}
              width="49.3%"
              height={32}
            />
          </View>

          <View style={s.row}>
            <Cell
              label="NUMBER OF GUESTS:"
              value={data.numberOfGuests}
              width="100%"
              height={30}
            />
          </View>

          <View style={s.row}>
            <Cell
              label="MODE OF PAYMENT:"
              value={data.modeOfPayment}
              width="100%"
              height={30}
            />
          </View>

          <View style={s.row}>
            <Cell
              label="SECURITY DEPOSIT:"
              value={data.securityDeposit}
              width="57.7%"
              height={32}
            />
            <Cell
              label="TARIFF:"
              value={data.tariff}
              width="42.3%"
              height={32}
            />
          </View>

          <View style={s.row}>
            <Cell
              label="REMARKS:"
              value={data.remarks}
              width="100%"
              height={38}
            />
          </View>
        </View>

        <Text style={s.termsTitle}>TERMS &amp; CONDITIONS</Text>

        {terms.map(([label, text]) => (
          <View key={label} style={s.termRow}>
            <Text style={s.termLabel}>{label}</Text>
            <Text style={s.termText}>{text}</Text>
          </View>
        ))}

        <Text style={s.consent}>
          I have carefully read and understood the above terms and agree to
          abide by them
        </Text>

        <View style={s.signRow}>
          <View style={s.signSlot}>
            <Text style={{ fontSize: 8.5, minHeight: 12, marginBottom: 2 }}>
              {data.checkInDateFormatted}
            </Text>
            <View style={s.signLine} />
            <Text style={s.signCaption}>Date</Text>
          </View>
          <View style={s.signSlot}>
            <View style={{ minHeight: 12, marginBottom: 2 }} />
            <View style={s.signLine} />
            <Text style={s.signCaption}>Guest Signature</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
