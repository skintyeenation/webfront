import React from 'react';
import { Platform, View, StyleProp, ViewStyle } from 'react-native';
import { TextInput } from 'react-native-paper';
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

// Time-only "HH:mm" picker. Sibling of DateTimeField but trimmed down for
// the timesheet rows where the date is implied by the row's day.
//
//   - Web: real native <input type="time"> — gets the OS time picker (the
//     Chrome / Safari one with the spinner + 24h mode honoring locale).
//   - Native (iOS/Android): TextInput fallback with HH:mm validation
//     surfaced via the `error` prop. A future revision can swap this for
//     @react-native-community/datetimepicker if we want the OS picker
//     on phones too.
export function TimeField({ label, value, onChange, placeholder = 'HH:mm', error, style }: TimeFieldProps) {
  if (Platform.OS === 'web') {
    // 15-min slot list: 00:00, 00:15, 00:30, …, 23:45.
    // Rendered as a native <select> so the dropdown shows ONLY these
    // options instead of an open time picker with every minute.
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    const selectStyle: any = {
      colorScheme: 'dark',
      backgroundColor: theme.colors.darkDefault,
      color: theme.colors.text,
      border: `1px solid ${error ? theme.colors.error : 'rgba(255,255,255,0.29)'}`,
      borderRadius: 4,
      padding: '8px 10px',
      fontSize: 14,
      fontFamily: 'inherit',
      width: '100%',
      boxSizing: 'border-box',
      appearance: 'none',
      WebkitAppearance: 'none',
    };
    return (
      <View style={style}>
        {React.createElement('select', {
          value: value || '',
          style: selectStyle,
          onChange: (e: any) => onChange(e.target.value || ''),
        }, [
          // Blank option so empty value is selectable + acts as placeholder
          React.createElement('option', { key: '__blank', value: '' }, placeholder ?? '—'),
          ...slots.map((s) => React.createElement('option', { key: s, value: s }, s)),
        ])}
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
