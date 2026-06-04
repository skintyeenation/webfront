import React from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { Logo } from './Logo';
import { theme } from 'skintyee/styles';

// In-app splash shown briefly on launch (works on web + native without needing a
// platform splash image). The native/web boot splash colour is set in app.config.js.
export function SplashScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
      {/* Vertical lockup: bitmap mark above the wordmark. markScale=2.4
          makes the mark visibly the focal element while the wordmark
          stays at the splash text size. */}
      <Logo size={56} direction="column" markScale={2.4} />
      <Text style={{ color: theme.colors.textDarker, marginTop: 12, letterSpacing: 1 }}>First Nation</Text>
      <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 28 }} />
    </View>
  );
}
