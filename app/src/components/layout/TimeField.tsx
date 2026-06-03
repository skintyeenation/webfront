import React, { useState } from 'react';
import { Platform, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { Menu, TextInput, TouchableRipple } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { theme } from 'skintyee/styles';

export interface TimeFieldProps {
  label?: string;
  /** "HH:mm" 24h string; empty string allowed. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  error?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HOURS: string[]   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES: string[] = ['00', '15', '30', '45'];

// Parse "HH:mm" → { h, m }. Either field can be undefined when partial.
function parse(value: string): { h?: string; m?: string } {
  if (!value) return {};
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return {};
  const hh = m[1].padStart(2, '0');
  const mm = m[2];
  return { h: HOURS.includes(hh) ? hh : undefined, m: MINUTES.includes(mm) ? mm : undefined };
}

// Two-selector time picker — hour menu + 15-min menu.
//
//   - Web: TouchableRipple anchors styled like the other dark form
//     fields. Tap the hour or the minute to open its own Paper Menu.
//     Picking a value updates that segment; emits "HH:mm" only when
//     both are set (otherwise empty string so downstream validation
//     can show the row as incomplete).
//   - Native: TextInput fallback. Same Paper Menu pattern would adopt
//     to RN, but the on-screen keyboard story is cleaner with manual
//     entry for now.
export function TimeField({ label, value, onChange, placeholder = '—:—', error, style }: TimeFieldProps) {
  const { h, m } = parse(value);
  const [openH, setOpenH] = useState(false);
  const [openM, setOpenM] = useState(false);

  const update = (nextH?: string, nextM?: string) => {
    if (nextH && nextM) onChange(`${nextH}:${nextM}`);
    else                onChange('');
  };

  if (Platform.OS === 'web') {
    const segmentStyle: ViewStyle = {
      flex: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    };
    const containerStyle: ViewStyle = {
      backgroundColor: theme.colors.darkDefault,
      borderWidth: 1,
      borderColor: error ? theme.colors.error : 'rgba(255,255,255,0.29)',
      borderRadius: 4,
      flexDirection: 'row',
      alignItems: 'center',
    };

    const segmentText = (val?: string, fallback = '--') => (
      <NativeText
        style={{
          color: val ? theme.colors.text : theme.colors.textDarker,
          fontSize: 14,
          letterSpacing: 1,
        }}
      >
        {val ?? fallback}
      </NativeText>
    );

    return (
      <View style={style}>
        <View style={containerStyle}>
          {/* Leading clock icon */}
          <View style={{ paddingLeft: 8 }}>
            <MaterialCommunityIcons name="clock-outline" size={16} color={theme.colors.textDarker} />
          </View>

          {/* Hour selector */}
          <Menu
            visible={openH}
            onDismiss={() => setOpenH(false)}
            anchor={
              <TouchableRipple onPress={() => setOpenH(true)} style={segmentStyle}>
                {segmentText(h, '--')}
              </TouchableRipple>
            }
            contentStyle={{ backgroundColor: theme.colors.darkDefault, maxHeight: 280 }}
          >
            <ScrollView style={{ maxHeight: 280 }}>
              {HOURS.map((hh) => {
                const selected = hh === h;
                return (
                  <Menu.Item
                    key={hh}
                    title={hh}
                    onPress={() => { update(hh, m); setOpenH(false); }}
                    titleStyle={{
                      color: selected ? theme.colors.primary : theme.colors.text,
                      fontWeight: selected ? '700' : '400',
                    }}
                    leadingIcon={selected ? 'check' : undefined}
                  />
                );
              })}
            </ScrollView>
          </Menu>

          {/* Separator */}
          <NativeText style={{ color: theme.colors.textDarker, fontSize: 14 }}>:</NativeText>

          {/* Minute selector */}
          <Menu
            visible={openM}
            onDismiss={() => setOpenM(false)}
            anchor={
              <TouchableRipple onPress={() => setOpenM(true)} style={segmentStyle}>
                {segmentText(m, '--')}
              </TouchableRipple>
            }
            contentStyle={{ backgroundColor: theme.colors.darkDefault }}
          >
            {MINUTES.map((mm) => {
              const selected = mm === m;
              return (
                <Menu.Item
                  key={mm}
                  title={mm}
                  onPress={() => { update(h, mm); setOpenM(false); }}
                  titleStyle={{
                    color: selected ? theme.colors.primary : theme.colors.text,
                    fontWeight: selected ? '700' : '400',
                  }}
                  leadingIcon={selected ? 'check' : undefined}
                />
              );
            })}
          </Menu>

          {/* Trailing chevron */}
          <View style={{ paddingRight: 8 }}>
            <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.textDarker} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <TextInput
      dense
      mode="outlined"
      label={label}
      value={value || ''}
      onChangeText={onChange}
      placeholder={placeholder}
      style={style as any}
      error={error}
      keyboardType="numbers-and-punctuation"
    />
  );
}

// Lightweight Text wrapper for web (avoids Paper Text's extra typography).
function NativeText({ children, style }: { children: React.ReactNode; style?: any }) {
  return React.createElement('span', { style }, children);
}
