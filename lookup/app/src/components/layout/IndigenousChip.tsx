import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { theme } from 'lookup/styles';

interface Props {
  value: boolean;
  onChange: (next: boolean) => void;
}

export default function IndigenousChip({ value, onChange }: Props) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: value ? theme.colors.accent : theme.colors.secondary,
        paddingVertical: 6,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 14,
          height: 14,
          marginRight: 8,
          borderWidth: 1,
          borderColor: value ? '#000' : theme.colors.textDarker,
          backgroundColor: value ? '#000' : 'transparent',
        }}
      />
      <Text style={{ color: value ? '#000' : theme.colors.text, fontWeight: '600', fontSize: 13 }}>
        Indigenous-only
      </Text>
    </Pressable>
  );
}
