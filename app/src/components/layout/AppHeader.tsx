import React from 'react';
import { TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Appbar, Avatar } from 'react-native-paper';
import { Logo } from './Logo';
import { useAppSelector } from 'skintyee/store';
import Config from 'skintyee/config';
import { theme } from 'skintyee/styles';

export interface AppHeaderProps {
  title?: string;
  navigation?: any;
  back?: any;
  options?: any;
  // Toggle the right-side account action. The avatar shown there
  // resolves in this order (matches the Account page header cascade):
  //   1. Microsoft 365 profile photo (when signed in + directory says hasPhoto)
  //   2. Initials over the brand background (any time we have a name)
  //   3. Generic person icon (only when truly nothing)
  showAccount?: boolean;
}

// Derive 2-letter initials from a display name. "Lucas Lopatka" → "LL",
// "System Admin" → "SA", "Madonna" → "M". Falls back to '?'.
function initialsOf(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function photoUrl(memberId: string): string | undefined {
  if (!Config.apiServer || Config.apiServer === 'mock' || !/^https?:\/\//.test(Config.apiServer)) {
    return undefined;
  }
  return `${Config.apiServer.replace(/\/+$/, '')}/v1/directory/${memberId}/photo`;
}

// Header modeled on the ppt AppHeader, simplified (no search wiring yet).
// Responsive title — routes can supply a longer form via options.titleLong
// to render on roomier viewports. Phones get the short form; tablets +
// desktop web get the descriptive one.
const LONG_TITLE_BREAKPOINT = 600;

export function AppHeader({ title, navigation, back, options, showAccount = true }: AppHeaderProps) {
  const { width } = useWindowDimensions();
  const short = options?.title ?? title ?? '';
  const long  = options?.titleLong;
  const headerTitle = long && width >= LONG_TITLE_BREAKPOINT ? long : short;
  const { name, signedIn, user } = useAppSelector((s) => s.auth);
  const directory = useAppSelector((s) => s.directory.entities);

  const myUpn = (user?.upn ?? '').toLowerCase();
  const me = myUpn
    ? (directory as any[]).find((m) => (m.upn ?? '').toLowerCase() === myUpn)
    : undefined;
  const photoSrc = me?.hasPhoto ? photoUrl(me._id) : undefined;
  const ini = initialsOf(name);
  const hasName = !!(name && name.trim() && ini !== '?');

  return (
    <Appbar.Header style={{ backgroundColor: theme.colors.darkDefault }} dark>
      {/* Skintyee logo, top-left. Back action (when present) sits just after it. */}
      <View style={{ paddingLeft: 12, paddingRight: 4 }}>
        <Logo size={26} />
      </View>
      {back ? <Appbar.BackAction onPress={() => navigation?.goBack()} /> : null}
      <Appbar.Content title={headerTitle} titleStyle={{ color: theme.colors.text, fontSize: 16 }} />

      {showAccount ? (
        photoSrc ? (
          <TouchableOpacity
            onPress={() => navigation?.navigate?.('Account')}
            style={{ marginRight: 12 }}
            accessibilityLabel="Account"
          >
            <Avatar.Image size={32} source={{ uri: photoSrc }} />
          </TouchableOpacity>
        ) : hasName ? (
          <TouchableOpacity
            onPress={() => navigation?.navigate?.('Account')}
            style={{ marginRight: 12 }}
            accessibilityLabel="Account"
          >
            <Avatar.Text
              size={32}
              label={ini}
              color="#000"
              style={{ backgroundColor: signedIn ? theme.colors.primary : theme.colors.secondary }}
              labelStyle={{ fontSize: 13, fontWeight: '600' }}
            />
          </TouchableOpacity>
        ) : (
          <Appbar.Action icon="account-circle" color={theme.colors.primary} onPress={() => navigation?.navigate?.('Account')} />
        )
      ) : null}
    </Appbar.Header>
  );
}
