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
    // Style notes:
    //   colorScheme:'dark' tells the browser to render the calendar-
    //   picker popup in dark mode (Chromium).
    //   accentColor: the brand orange tints the picker UI (Chrome/Edge).
    //   webkitTextFillColor: Safari ignores `color` on time inputs.
    //   appearance: 'textfield' + the calendar-picker-indicator filter
    //   suppress the chunky native clock button.
    const inputStyle: any = {
      colorScheme: 'dark',
      accentColor: theme.colors.primary,
      backgroundColor: theme.colors.darkDefault,
      color: theme.colors.text,
      WebkitTextFillColor: theme.colors.text,
      border: `1px solid ${error ? theme.colors.error : 'rgba(255,255,255,0.18)'}`,
      borderRadius: 4,
      padding: '6px 8px',
      fontSize: 14,
      fontFamily: 'inherit',
      width: '100%',
      boxSizing: 'border-box',
      outline: 'none',
    };
    return (
      <View style={style}>
        {/* One-shot style block that hides the chunky clock-icon
            picker indicator + tones the up/down spinner in webkit.
            Scoped by className so we don't leak it onto every input. */}
        {React.createElement('style', null, `
          .skintyee-time-input::-webkit-calendar-picker-indicator { display: none; -webkit-appearance: none; }
          .skintyee-time-input::-webkit-inner-spin-button,
          .skintyee-time-input::-webkit-clear-button { display: none; }
          .skintyee-time-input { caret-color: ${theme.colors.primary}; }
          .skintyee-time-input:focus { border-color: ${theme.colors.primary} !important; }
        `)}
        {React.createElement('input', {
          type: 'time',
          className: 'skintyee-time-input',
          value: value || '',
          step: 60,
          placeholder,
          style: inputStyle,
          onChange: (e: any) => onChange(e.target.value || ''),
        })}
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
