import * as React from 'react';

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { CREAM, NAVY } from '../components/styles';

/**
 * A villa report rendered as a real document rather than a printout of the
 * screen: the figures are laid out for paper, every table carries its own
 * header on each page it spills onto, and nothing on-screen (charts, filter
 * pills, pagination) leaks into it.
 *
 * Deliberately generic. The villa reports screen has six tabs whose tables
 * share no shape at all, so the caller flattens whichever tab was open into
 * KPI tiles and column/row sections, and this file only knows how to set
 * them. A seventh tab needs no change here.
 */

export interface VillaReportColumn {
  label: string;
  /** Column width as a flex share. Defaults to 1. */
  width?: number;
  align?: 'left' | 'right';
}

export interface VillaReportSection {
  title: string;
  columns: VillaReportColumn[];
  rows: string[][];
  /** Rendered as a bold band under the last row, e.g. a totals line. */
  total?: string[];
  /** Shown in place of the table when there is nothing in the period. */
  emptyText?: string;
  /** A sentence under the title, e.g. what the figures exclude. */
  note?: string;
}

export interface VillaReportKpi {
  label: string;
  value: string;
  sub?: string;
}

export interface VillaReportPdfData {
  villaName: string;
  /** The tab this report came from, e.g. "GST Summary". */
  title: string;
  /** "01 Sep 2026 - 30 Sep 2026" */
  periodLabel: string;
  generatedAt: string;
  generatedBy: string;
  kpis: VillaReportKpi[];
  sections: VillaReportSection[];
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Noto Sans',
    fontSize: 9,
    paddingTop: 34,
    paddingHorizontal: 34,
    paddingBottom: 46,
    color: '#000000',
  },
  villaName: { fontSize: 14, fontWeight: 'bold', color: NAVY },
  headerRule: {
    borderBottomWidth: 1,
    borderBottomColor: NAVY,
    marginTop: 8,
    marginBottom: 14,
  },
  reportTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: NAVY,
    textAlign: 'center',
  },
  reportSubtitle: {
    fontSize: 9,
    color: '#555',
    textAlign: 'center',
    marginTop: 3,
    marginBottom: 16,
  },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  kpiBox: {
    width: '23.5%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    padding: 8,
    backgroundColor: CREAM,
  },
  kpiLabel: {
    fontSize: 7,
    color: '#666',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  kpiValue: { fontSize: 11, fontWeight: 'bold', color: NAVY },
  kpiSub: { fontSize: 7, color: '#777', marginTop: 2 },
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
  sectionNote: { fontSize: 8, color: '#666', marginBottom: 6 },
  empty: { fontSize: 9, color: '#777', paddingVertical: 8 },
  thead: {
    flexDirection: 'row',
    backgroundColor: NAVY,
    padding: '4 6',
    borderRadius: 2,
  },
  theadCell: { fontSize: 7.5, color: '#fff', fontWeight: 'bold' },
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
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  cell: { fontSize: 8, color: '#222' },
  totalRow: {
    flexDirection: 'row',
    padding: '4 6',
    borderTopWidth: 1,
    borderTopColor: NAVY,
  },
  totalCell: { fontSize: 8, fontWeight: 'bold', color: NAVY },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 34,
    right: 34,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7.5, color: '#666' },
});

function cellStyle(col: VillaReportColumn | undefined) {
  return {
    flex: col?.width ?? 1,
    textAlign: (col?.align ?? 'left') as 'left' | 'right',
    paddingRight: col?.align === 'right' ? 4 : 6,
  };
}

function Table({ section }: { section: VillaReportSection }) {
  if (section.rows.length === 0) {
    return (
      <Text style={s.empty}>
        {section.emptyText ?? 'Nothing recorded in this period.'}
      </Text>
    );
  }

  return (
    <View>
      {/* `fixed` repeats the header on every page the table runs onto. */}
      <View style={s.thead} fixed>
        {section.columns.map((c, i) => (
          <Text key={i} style={[s.theadCell, cellStyle(c)]}>
            {c.label}
          </Text>
        ))}
      </View>

      {section.rows.map((row, r) => (
        <View key={r} style={r % 2 === 1 ? s.rowAlt : s.row} wrap={false}>
          {row.map((value, i) => (
            <Text key={i} style={[s.cell, cellStyle(section.columns[i])]}>
              {value}
            </Text>
          ))}
        </View>
      ))}

      {section.total ? (
        <View style={s.totalRow} wrap={false}>
          {section.total.map((value, i) => (
            <Text key={i} style={[s.totalCell, cellStyle(section.columns[i])]}>
              {value}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function VillaReportDocument({ data }: { data: VillaReportPdfData }) {
  return (
    <Document
      title={`${data.villaName} - ${data.title}`}
      author="Ooruda"
      subject={data.periodLabel}
    >
      <Page size="A4" style={s.page}>
        <View fixed>
          <Text style={s.villaName}>{data.villaName}</Text>
          <View style={s.headerRule} />
        </View>

        <Text style={s.reportTitle}>{data.title}</Text>
        <Text style={s.reportSubtitle}>{data.periodLabel}</Text>

        {data.kpis.length > 0 ? (
          <View style={s.kpiRow}>
            {data.kpis.map((k, i) => (
              <View key={i} style={s.kpiBox}>
                <Text style={s.kpiLabel}>{k.label}</Text>
                <Text style={s.kpiValue}>{k.value}</Text>
                {k.sub ? <Text style={s.kpiSub}>{k.sub}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {data.sections.map((section, i) => (
          <View key={i}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            {section.note ? (
              <Text style={s.sectionNote}>{section.note}</Text>
            ) : null}
            <Table section={section} />
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Generated {data.generatedAt} by {data.generatedBy} · Ooruda
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
