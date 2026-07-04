import { StyleSheet } from '@react-pdf/renderer';

export const styles = StyleSheet.create({
  page: {
    fontFamily: 'Noto Sans',
    fontSize: 9,
    padding: 36,
    color: '#1e293b',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: '#1a3a5c',
    paddingBottom: 12,
    marginBottom: 16,
  },
  logo: {
    width: 48,
    height: 48,
    objectFit: 'contain',
  },
  brandBlock: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  associationName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  metaText: {
    fontSize: 8,
    color: '#64748b',
  },
  docTitleBlock: {
    alignItems: 'flex-end',
  },
  docTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoCol: {
    flexDirection: 'column',
    gap: 2,
  },
  table: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 2,
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
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  colDescription: { flexGrow: 1, flexBasis: 0 },
  colPayer: { width: 60 },
  colGst: { width: 40, textAlign: 'center' },
  colAmount: { width: 70, textAlign: 'right' },
  summaryBlock: {
    marginTop: 12,
    alignSelf: 'flex-end',
    width: 220,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  summaryRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    marginTop: 3,
    fontWeight: 'bold',
    fontSize: 10,
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
