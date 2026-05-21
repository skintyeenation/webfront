import React from 'react';
import { View } from 'react-native';
import { Appbar } from 'react-native-paper';
import { Logo } from './Logo';
import { theme } from 'skintyee/styles';

export interface AppHeaderProps {
  title?: string;
  navigation?: any;
  back?: any;
  options?: any;
  // STUB: shows a non-functional account action that routes to the Account screen
  // (the dev Role Switcher). A real build would show the signed-in user here.
  showAccount?: boolean;
}

// Header modeled on the ppt AppHeader, simplified (no search wiring yet).
export function AppHeader({ title, navigation, back, options, showAccount = true }: AppHeaderProps) {
  const headerTitle = options?.title ?? title ?? '';
  return (
    <Appbar.Header style={{ backgroundColor: theme.colors.darkDefault }} dark>
      {/* Skintyee logo, top-left. Back action (when present) sits just after it. */}
      <View style={{ paddingLeft: 12, paddingRight: 4 }}>
        <Logo size={26} />
      </View>
      {back ? <Appbar.BackAction onPress={() => navigation?.goBack()} /> : null}
      <Appbar.Content title={headerTitle} titleStyle={{ color: theme.colors.text, fontSize: 16 }} />
      {showAccount ? <Appbar.Action icon="account-circle" color={theme.colors.primary} onPress={() => navigation?.navigate?.('Account')} /> : null}
    </Appbar.Header>
  );
}
