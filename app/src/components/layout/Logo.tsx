import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { theme } from 'skintyee/styles';

export interface LogoProps {
  size?: number;
  color?: string;
}

/**
 * Skin Tyee brand lockup.
 *
 * PLACEHOLDER: this is a plain text wordmark, NOT the real logo — no logo asset
 * is available yet (the local WordPress uploads volume is empty; skintyee.ca uses
 * a "thunderbird" header logo, WP attachment sha1 48facf18…, see
 * website/importer/build-home-elementor.php). No invented icon is used.
 *
 * To use the real logo, drop the file in as `app/assets/logo.png` and render it:
 *   return <Image source={require('skintyee/../assets/logo.png')}
 *     resizeMode="contain" style={{ width: size * 4.5, height: size }} />;
 * (A static require only resolves once the file exists.) See app/STUBS.md.
 */
export function Logo({ size = 26 }: LogoProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ color: theme.colors.primary, fontSize: size * 0.78, fontWeight: '700', letterSpacing: 0.5 }}>Skin</Text>
      <Text style={{ color: theme.colors.text, fontSize: size * 0.78, fontWeight: '700', letterSpacing: 0.5, marginLeft: 4 }}>Tyee</Text>
    </View>
  );
}
