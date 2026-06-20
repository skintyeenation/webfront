import React from 'react';
import { Platform, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import moment from 'moment';
import { theme } from 'skintyee/styles';

export interface DateTimeFieldProps {
  label: string;
  value: string; // ISO datetime
  onChange: (iso: string) => void;
  withTime?: boolean;
}

/**
 * Cross-platform date (+ optional time) picker.
 * - Web: real native HTML <input type="date"> / <input type="time"> pickers
 *   (no extra dependency, and avoids the web-bundling issues a native picker
 *   library would bring).
 * - Native: TextInput fallback (YYYY-MM-DD / HH:mm).
 */
export function DateTimeField({ label, value, onChange, withTime = true }: DateTimeFieldProps) {
  const m = moment(value);
  const dateStr = m.isValid() ? m.format('YYYY-MM-DD') : '';
  const timeStr = m.isValid() ? m.format('HH:mm') : '12:00';

  if (Platform.OS === 'web') {
    const inputStyle: any = {
      colorScheme: 'dark',
      backgroundColor: theme.colors.darkDefault,
      color: theme.colors.text,
      border: '1px solid rgba(255,255,255,0.29)',
      borderRadius: 4,
      padding: '10px',
      fontSize: 14,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      flex: 1,
    };
    return (
      <View style={{ marginBottom: 10 }}>
        <Text style={{ color: theme.colors.textDarker, marginBottom: 6 }}>{label}</Text>
        <View style={{ flexDirection: 'row' }}>
          {React.createElement('input', {
            type: 'date',
            value: dateStr,
            style: { ...inputStyle, marginRight: withTime ? 8 : 0 },
            onChange: (e: any) => onChange(moment(`${e.target.value} ${timeStr}`, 'YYYY-MM-DD HH:mm').toISOString()),
          })}
          {withTime
            ? React.createElement('input', {
                type: 'time',
                value: timeStr,
                style: inputStyle,
                onChange: (e: any) => onChange(moment(`${dateStr} ${e.target.value}`, 'YYYY-MM-DD HH:mm').toISOString()),
              })
            : null}
        </View>
      </View>
    );
  }

  // Native fallback: text inputs.
  return (
    <View style={{ flexDirection: 'row' }}>
      <TextInput
        label={withTime ? `${label} (date)` : label}
        value={dateStr}
        onChangeText={(d) => onChange(moment(`${d} ${timeStr}`, 'YYYY-MM-DD HH:mm').toISOString())}
        mode="outlined"
        placeholder="YYYY-MM-DD"
        style={{ flex: 1, marginRight: withTime ? 8 : 0, marginBottom: 10 }}
      />
      {withTime ? (
        <TextInput
          label="Time"
          value={timeStr}
          onChangeText={(t) => onChange(moment(`${dateStr} ${t}`, 'YYYY-MM-DD HH:mm').toISOString())}
          mode="outlined"
          placeholder="HH:mm"
          style={{ width: 110, marginBottom: 10 }}
        />
      ) : null}
    </View>
  );
}
