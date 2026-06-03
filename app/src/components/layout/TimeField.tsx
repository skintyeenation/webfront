import React, { useMemo, useState } from 'react';
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

// Build the 15-minute slot list once at module load.
// 00:00, 00:15, 00:30, …, 23:45 = 96 values.
const SLOTS_15MIN: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
})();

// Time-only picker constrained to 15-minute increments.
//
//   - Web: TouchableRipple anchor + Paper Menu with the slot list. All
//     dark-themed, brand-coloured selected state. The native <select>
//     and the OS-supplied <input type="time"> dropdown both looked
//     out-of-style and (in select's case) gross, so this is a self-
//     rendered dropdown that matches the rest of the form.
//   - Native: TextInput fallback (manual HH:mm entry). Future swap
//     point: same Paper Menu pattern works fine on RN; the native
//     path can adopt it once the on-screen keyboard story is sorted.
export function TimeField({ label, value, onChange, placeholder = '—', error, style }: TimeFieldProps) {
  const [open, setOpen] = useState(false);

  if (Platform.OS === 'web') {
    const anchorStyle: ViewStyle = {
      backgroundColor: theme.colors.darkDefault,
      borderWidth: 1,
      borderColor: error ? theme.colors.error : 'rgba(255,255,255,0.29)',
      borderRadius: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
    };

    return (
      <View style={style}>
        <Menu
          visible={open}
          onDismiss={() => setOpen(false)}
          anchor={
            <TouchableRipple onPress={() => setOpen(true)} style={anchorStyle}>
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={16}
                  color={theme.colors.textDarker}
                  style={{ marginRight: 6 }}
                />
                <View style={{ flex: 1 }}>
                  {/* Current value or placeholder */}
                  {/* No <Text> wrapper styling tricks — keeps the row
                      a fixed height matching the other Paper inputs. */}
                  <View>
                    <NativeText
                      style={{
                        color: value ? theme.colors.text : theme.colors.textDarker,
                        fontSize: 14,
                      }}
                    >
                      {value || placeholder}
                    </NativeText>
                  </View>
                </View>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={16}
                  color={theme.colors.textDarker}
                />
              </View>
            </TouchableRipple>
          }
          contentStyle={{ backgroundColor: theme.colors.darkDefault, maxHeight: 280 }}
        >
          <ScrollView style={{ maxHeight: 280 }}>
            {/* Blank/clear option */}
            <Menu.Item
              title="—"
              onPress={() => { onChange(''); setOpen(false); }}
              titleStyle={{ color: theme.colors.textDarker }}
            />
            {SLOTS_15MIN.map((slot) => {
              const selected = slot === value;
              return (
                <Menu.Item
                  key={slot}
                  title={slot}
                  onPress={() => { onChange(slot); setOpen(false); }}
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

// Lightweight Text wrapper for web — avoids importing Paper's Text just for
// one line inside the anchor (Paper's Text adds extra typography styles).
function NativeText({ children, style }: { children: React.ReactNode; style?: any }) {
  return React.createElement('span', { style }, children);
}
