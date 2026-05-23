import React, { PropsWithChildren } from 'react';
import { ScrollView, View } from 'react-native';
import styles, { theme } from 'lookup/styles';

export default function PageContainer({ children }: PropsWithChildren) {
  return (
    <ScrollView style={[styles.pageContent, { backgroundColor: theme.colors.background }]} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={styles.visibleContent}>{children}</View>
    </ScrollView>
  );
}
