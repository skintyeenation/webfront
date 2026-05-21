import React from 'react';
import { Button } from 'react-native-paper';
import { useAppSelector } from 'skintyee/store';
import { theme } from 'skintyee/styles';

// Admin-only "+ Add …" affordance for list screens. Renders nothing for
// non-admins, so management actions live in-context but are gated by role.
export function AdminAddButton({ label, icon = 'plus', onPress }: { label: string; icon?: string; onPress: () => void }) {
  const role = useAppSelector((s) => s.auth.role);
  if (role !== 'admin') return null;
  return (
    <Button mode="contained" icon={icon} onPress={onPress} buttonColor={theme.colors.accent} textColor="#000" style={{ marginBottom: 12, alignSelf: 'flex-start' }}>
      {label}
    </Button>
  );
}
