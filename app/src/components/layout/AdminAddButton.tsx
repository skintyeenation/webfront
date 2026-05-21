import React from 'react';
import { Button } from 'react-native-paper';
import { useAppSelector } from 'skintyee/store';
import { Role } from 'skintyee/models';
import { theme } from 'skintyee/styles';

// Role-gated "+ Add …" affordance for list screens. Defaults to admin-only;
// pass `roles` to allow others (e.g. staff submitting timesheets).
export function AdminAddButton({ label, icon = 'plus', onPress, roles = ['admin'] }: { label: string; icon?: string; onPress: () => void; roles?: Role[] }) {
  const role = useAppSelector((s) => s.auth.role);
  if (!roles.includes(role)) return null;
  return (
    <Button mode="contained" icon={icon} onPress={onPress} buttonColor={theme.colors.accent} textColor="#000" style={{ marginBottom: 12, alignSelf: 'flex-start' }}>
      {label}
    </Button>
  );
}
