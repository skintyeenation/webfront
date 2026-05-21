import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { theme } from 'skintyee/styles';

export interface BarDatum {
  label: string;
  value: number;
  // optional secondary value (e.g. budget) drawn as a faint track behind the bar
  max?: number;
  color?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  formatValue?: (n: number) => string;
}

/**
 * Lightweight horizontal bar chart built from plain Views — no charting library
 * or native deps, so it renders identically on web and native. Good enough for
 * the POC dashboard / transparency views.
 */
export function BarChart({ data, formatValue = (n) => String(n) }: BarChartProps) {
  const peak = Math.max(...data.map((d) => d.max ?? d.value), 1);
  return (
    <View>
      {data.map((d) => {
        const trackPct = (d.max ?? d.value) / peak;
        const fillPct = d.value / peak;
        const color = d.color ?? theme.colors.primary;
        return (
          <View key={d.label} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: theme.colors.text, fontSize: 13 }}>{d.label}</Text>
              <Text style={{ color: theme.colors.textDarker, fontSize: 13 }}>{formatValue(d.value)}</Text>
            </View>
            <View style={{ height: 10, backgroundColor: theme.colors.secondary, borderRadius: 5, overflow: 'hidden' }}>
              {/* budget track */}
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${trackPct * 100}%`, backgroundColor: 'rgba(255,255,255,0.08)' }} />
              {/* spent fill */}
              <View style={{ height: 10, width: `${fillPct * 100}%`, backgroundColor: color, borderRadius: 5 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
