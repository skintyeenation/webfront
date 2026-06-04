import React from 'react';
import { Image, View } from 'react-native';
import { Text } from 'react-native-paper';
import { theme } from 'skintyee/styles';

export interface LogoProps {
  /**
   * Drives the wordmark font size. The bitmap mark scales relative to
   * this so the lockup stays proportional across header (size=26) and
   * splash (size=56) usage.
   */
  size?: number;
  /**
   * 'row'    — bitmap left of "Skin Tyee" wordmark (header usage).
   * 'column' — bitmap above the wordmark (splash usage).
   */
  direction?: 'row' | 'column';
  /**
   * Hide the bitmap mark (text-only). Useful if a screen needs the
   * wordmark inline somewhere narrow.
   */
  hideMark?: boolean;
  /**
   * Scales the bitmap relative to the default (mark height = `size`).
   * Mostly used by the splash to make the mark significantly larger
   * than the wordmark it sits above.
   */
  markScale?: number;
}

/**
 * Skin Tyee brand lockup — Indigenous mark + "Skin Tyee" wordmark.
 *
 * Mark source: `assets/skintyee-logo.png`, lifted from the live
 * skintyeefirstnation.org header logo with the white background
 * flood-filled out to transparent (see commit message for the
 * Pillow recipe). Render via `<Image source={require(...)}>`
 * so Metro bundles the asset on web + native.
 */
export function Logo({ size = 26, direction = 'row', hideMark = false, markScale = 1 }: LogoProps) {
  const markSize = size * markScale;
  const wordmark = (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ color: theme.colors.primary, fontSize: size * 0.78, fontWeight: '700', letterSpacing: 0.5 }}>Skin</Text>
      <Text style={{ color: theme.colors.text, fontSize: size * 0.78, fontWeight: '700', letterSpacing: 0.5, marginLeft: 4 }}>Tyee</Text>
    </View>
  );

  if (hideMark) return wordmark;

  const mark = (
    <Image
      source={require('../../../assets/skintyee-logo.png')}
      resizeMode="contain"
      style={{ width: markSize, height: markSize }}
      accessibilityLabel="Skin Tyee logo"
    />
  );

  if (direction === 'column') {
    return (
      <View style={{ alignItems: 'center' }}>
        {mark}
        <View style={{ marginTop: 12 }}>{wordmark}</View>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ marginRight: 8 }}>{mark}</View>
      {wordmark}
    </View>
  );
}
