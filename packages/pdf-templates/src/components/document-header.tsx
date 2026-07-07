import * as React from 'react';

import { Image, Text, View } from '@react-pdf/renderer';

import { OorudaMark } from './ooruda-mark';
import { styles } from './styles';

export interface AssociationBranding {
  name: string;
  address: string | null;
  gstin: string | null;
  panNumber?: string | null;
  registrationNumber: string | null;
  logoUrl: string | null;
}

interface Props {
  association: AssociationBranding;
  docTitle: string;
  docNo: string;
  docDate: string;
}

export function DocumentHeader({
  association,
  docTitle,
  docNo,
  docDate,
}: Props) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.brandBlock}>
        {association.logoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
          <Image style={styles.logo} src={association.logoUrl} />
        ) : (
          // Falls back to the Ooruda brand mark until the association uploads its own logo.
          <OorudaMark size={40} />
        )}
        <View>
          <Text style={styles.associationName}>{association.name}</Text>
          {association.address ? (
            <Text style={styles.metaText}>{association.address}</Text>
          ) : null}
          {association.registrationNumber ? (
            <Text style={styles.metaText}>
              Reg. No: {association.registrationNumber}
            </Text>
          ) : null}
          {association.gstin ? (
            <Text style={styles.metaText}>GSTIN: {association.gstin}</Text>
          ) : association.panNumber ? (
            <Text style={styles.metaText}>PAN: {association.panNumber}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.docTitleBlock}>
        <Text style={styles.docTitle}>{docTitle}</Text>
        <Text style={styles.metaText}>No: {docNo}</Text>
        <Text style={styles.metaText}>Date: {docDate}</Text>
      </View>
    </View>
  );
}
