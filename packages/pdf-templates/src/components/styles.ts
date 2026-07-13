import { StyleSheet } from '@react-pdf/renderer';

/** Brand indigo-purple used across all bill/receipt PDFs (name, title, table border, footer bar). */
export const NAVY = '#230344';
/** Table header background. */
export const CREAM = '#FFFCF0';
/** "Ooruda" link accent in the footer. */
export const GOLD = '#FFDE59';

export const styles = StyleSheet.create({
  page: {
    fontFamily: 'Noto Sans',
    fontSize: 9,
    paddingTop: 36,
    paddingHorizontal: 36,
    paddingBottom: 130, // leave room for bank-details + dark-bar footer
    color: '#000000',
  },

  // ── Header ───────────────────────────────────────────────────────────────
  headerLogoNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  logo: {
    width: 104,
    height: 104,
    objectFit: 'contain',
    marginRight: 14,
  },
  headerNameBlock: {
    flex: 1,
    alignItems: 'center',
  },
  associationName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: NAVY,
    textAlign: 'center',
  },
  headerAddress: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginTop: 3,
  },
  headerContactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginTop: 4,
    marginBottom: 6,
  },
  headerContactText: {
    fontSize: 8,
    color: '#000000',
  },
  headerRule: {
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    marginBottom: 6,
  },

  // ── Doc title ─────────────────────────────────────────────────────────────
  docTitleBlock: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  docTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // ── Metadata grid (2-col, row-paired) ────────────────────────────────────
  metaGrid: {
    flexDirection: 'column',
    gap: 3,
    marginBottom: 14,
  },
  metaGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 4,
  },
  metaLabel: {
    fontSize: 8.5,
    color: '#000000',
  },
  metaValue: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#000000',
  },

  // ── Bill To ───────────────────────────────────────────────────────────────
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 8.5,
    color: '#000000',
    marginBottom: 4,
  },
  billToName: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 2,
  },
  billToAddress: {
    fontSize: 8.5,
    color: '#000000',
    lineHeight: 1.4,
  },

  // ── Table ─────────────────────────────────────────────────────────────────
  table: {
    borderWidth: 1.25,
    borderColor: NAVY,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: CREAM,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1.25,
    borderBottomColor: NAVY,
  },
  tableHeaderText: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#000000',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  tableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  colDescription: { flexGrow: 1, flexBasis: 0, color: '#000000' },
  colArea: { width: 56, textAlign: 'right', color: '#000000' },
  colRate: { width: 56, textAlign: 'right', color: '#000000' },
  colGst: { width: 36, textAlign: 'center', color: '#000000' },
  colAmount: { width: 68, textAlign: 'right', color: '#000000' },

  // ── Summary / totals ──────────────────────────────────────────────────────
  summaryBlock: {
    alignSelf: 'flex-end',
    width: 240,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    fontSize: 9,
    color: '#000000',
  },
  summaryDivider: {
    borderBottomWidth: 0.75,
    borderBottomColor: '#000000',
    marginVertical: 4,
  },
  summaryRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    fontWeight: 'bold',
    fontSize: 10,
    color: '#000000',
  },

  // ── Footer (absolute, bottom of page) ────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerRule: {
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    marginHorizontal: 36,
    marginBottom: 8,
  },
  footerBankSection: {
    paddingHorizontal: 36,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerBankCol: {
    flexDirection: 'column',
    gap: 3,
  },
  footerBankText: {
    fontSize: 8,
    color: '#000000',
  },
  footerBankValue: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#000000',
  },
  footerDarkBar: {
    backgroundColor: NAVY,
    marginHorizontal: -36,
    paddingVertical: 8,
    paddingHorizontal: 36,
    alignItems: 'center',
    gap: 3,
  },
  footerDarkBarText: {
    fontSize: 7.5,
    color: '#ffffff',
    textAlign: 'center',
  },
});
