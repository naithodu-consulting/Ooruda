import * as React from 'react';

import { Link, Text, View } from '@react-pdf/renderer';

import { styles } from './styles';

export function DocumentFooter({ note }: { note: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{note}</Text>
      <Text style={{ marginTop: 3 }}>
        Generated from{' '}
        <Link
          src="https://ooruda.com/"
          style={{ color: '#fcd469', fontWeight: 'bold' }}
        >
          Ooruda
        </Link>
      </Text>
    </View>
  );
}
