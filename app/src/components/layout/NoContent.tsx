import React from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { theme } from 'skintyee/styles';

export interface NoContentProps {
  loading?: boolean;
  message?: string;
}

// Shared empty/loading state, matching the ppt feel.
export function NoContent({ loading = false, message = 'Nothing here yet.' }: NoContentProps) {
  return (
    <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
      {loading ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={{ color: theme.colors.textDarker }}>{message}</Text>}
    </View>
  );
}
