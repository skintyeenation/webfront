import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { theme } from 'skintyee/styles';

export interface LogoProps {
  size?: number;
  wordmark?: boolean;
  color?: string;
}

/**
 * Skintyee brand lockup — currently a PLACEHOLDER wordmark (a thunderbird-nod
 * icon + "Skintyee"), because no real logo asset is available yet.
 *
 * The skintyee.ca site uses a "thunderbird" header logo (a WordPress attachment,
 * sha1 48facf18… — see website/importer/build-home-elementor.php), but the local
 * WordPress uploads volume is empty so it couldn't be pulled. To use the real
 * logo, drop the file in as `app/assets/logo.png` and swap the body below for:
 *
 *   return <Image source={require('skintyee/../assets/logo.png')}
 *     resizeMode="contain" style={{ width: size * 4.2, height: size }} />;
 *
 * (A static require only resolves once the file exists.) See app/STUBS.md.
 */
export function Logo({ size = 28, wordmark = true, color = theme.colors.primary }: LogoProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <MaterialCommunityIcons name="bird" size={size} color={color} />
      {wordmark ? (
        <Text style={{ color: theme.colors.text, fontSize: size * 0.66, fontWeight: '700', marginLeft: 8, letterSpacing: 0.5 }}>Skintyee</Text>
      ) : null}
    </View>
  );
}
