import React, { ReactNode } from 'react';
import { SafeAreaView, ScrollView, View } from 'react-native';
import styles, { theme } from 'skintyee/styles';

// Layout primitives modeled on the ppt source's PageContainer/PageContent.

export interface PageContainerProps {
  children?: ReactNode;
}

export function PageContainer({ children }: PageContainerProps) {
  return <SafeAreaView style={styles.pageContainer}>{children}</SafeAreaView>;
}

export interface PageContentProps {
  children?: ReactNode;
  scroll?: boolean;
}

export function PageContent({ children, scroll = true }: PageContentProps) {
  if (!scroll) {
    return (
      <View style={[styles.pageContent, { backgroundColor: theme.colors.background }]}>
        <View style={styles.visibleContent}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView style={[styles.pageContent, { backgroundColor: theme.colors.background }]} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={styles.visibleContent}>{children}</View>
    </ScrollView>
  );
}
