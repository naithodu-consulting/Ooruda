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
  email?: string | null;
  phone?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  bankIfsc?: string | null;
  bankBranch?: string | null;
}

interface Props {
  association: AssociationBranding;
}

export function DocumentHeader({ association }: Props) {
  const contactId = association.gstin
    ? `GSTIN: ${association.gstin}`
    : association.panNumber
      ? `PAN - ${association.panNumber}`
      : null;

  return (
    <View>
      {/* Row 1: logo + name + address */}
      <View style={styles.headerLogoNameRow}>
        {association.logoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image style={styles.logo} src={association.logoUrl} />
        ) : (
          <View style={{ marginRight: 14 }}>
            <OorudaMark size={96} />
          </View>
        )}
        <View style={styles.headerNameBlock}>
          <Text style={styles.associationName}>{association.name}</Text>
          {association.address ? (
            <Text style={styles.headerAddress}>{association.address}</Text>
          ) : null}
        </View>
      </View>

      {/* Contact strip: email | PAN/GSTIN | phone */}
      {(association.email ?? contactId ?? association.phone) ? (
        <View style={styles.headerContactRow}>
          <Text style={styles.headerContactText}>
            {association.email ? `Email: ${association.email}` : ''}
          </Text>
          <Text style={styles.headerContactText}>{contactId ?? ''}</Text>
          <Text style={styles.headerContactText}>
            {association.phone ? `Phone No: ${association.phone}` : ''}
          </Text>
        </View>
      ) : null}

      {/* Single separator below contact row */}
      <View style={styles.headerRule} />
    </View>
  );
}
