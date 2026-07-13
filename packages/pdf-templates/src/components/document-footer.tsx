import * as React from 'react';

import { Link, Text, View } from '@react-pdf/renderer';

import type { AssociationBranding } from './document-header';
import { GOLD, styles } from './styles';

interface Props {
  note: string;
  association: AssociationBranding;
}

export function DocumentFooter({ note, association }: Props) {
  const hasBank =
    association.bankAccountName ??
    association.bankAccountNumber ??
    association.bankName ??
    association.bankIfsc ??
    association.bankBranch;

  return (
    <View style={styles.footer} fixed>
      {hasBank ? (
        <>
          <View style={styles.footerRule} />

          <View style={styles.footerBankSection}>
            <View style={styles.footerBankCol}>
              {association.bankAccountName ? (
                <Text style={styles.footerBankText}>
                  Name:{' '}
                  <Text style={styles.footerBankValue}>
                    {association.bankAccountName}
                  </Text>
                </Text>
              ) : null}
              {association.bankAccountNumber ? (
                <Text style={styles.footerBankText}>
                  Account number:{' '}
                  <Text style={styles.footerBankValue}>
                    {association.bankAccountNumber}
                  </Text>
                </Text>
              ) : null}
              {association.bankName ? (
                <Text style={styles.footerBankText}>
                  Bank name:{' '}
                  <Text style={styles.footerBankValue}>
                    {association.bankName}
                  </Text>
                </Text>
              ) : null}
            </View>
            <View style={styles.footerBankCol}>
              {association.bankIfsc ? (
                <Text style={styles.footerBankText}>
                  IFSC:{' '}
                  <Text style={styles.footerBankValue}>
                    {association.bankIfsc}
                  </Text>
                </Text>
              ) : null}
              {association.bankBranch ? (
                <Text style={styles.footerBankText}>
                  Branch:{' '}
                  <Text style={styles.footerBankValue}>
                    {association.bankBranch}
                  </Text>
                </Text>
              ) : null}
            </View>
          </View>
        </>
      ) : null}

      <View style={styles.footerDarkBar}>
        <Text style={styles.footerDarkBarText}>{note}</Text>
        <Text style={styles.footerDarkBarText}>
          Generated from{' '}
          <Link
            src="https://ooruda.com/"
            style={{ color: GOLD, fontWeight: 'bold' }}
          >
            Ooruda
          </Link>
        </Text>
      </View>
    </View>
  );
}
