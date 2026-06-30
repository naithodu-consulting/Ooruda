import * as React from 'react';

import { Text, View } from '@react-pdf/renderer';

import { styles } from './styles';

export function DocumentFooter({ note }: { note: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{note}</Text>
    </View>
  );
}
