import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Circle, G } from 'react-native-svg';
import { theme } from 'skintyee/styles';

export interface PieDatum {
  label: string;
  value: number;
  color: string;
}

export interface PieChartProps {
  data: PieDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
  formatValue?: (n: number) => string;
}

/**
 * Donut chart drawn with react-native-svg (works on web + native). Slices are
 * stroked arcs on a single circle via strokeDasharray. Includes a legend.
 */
export function PieChart({ data, size = 170, thickness = 26, centerLabel, centerSub, formatValue = (n) => String(n) }: PieChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = data.map((d) => {
    const frac = d.value / total;
    const seg = { color: d.color, dash: frac * circumference, gap: circumference - frac * circumference, rotation: (offset / total) * 360 };
    offset += d.value;
    return seg;
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            {/* track */}
            <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.secondary} strokeWidth={thickness} fill="none" />
            {segments.map((seg, i) => (
              <Circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={seg.color}
                strokeWidth={thickness}
                fill="none"
                strokeDasharray={`${seg.dash} ${seg.gap}`}
                strokeDashoffset={-(seg.rotation / 360) * circumference}
              />
            ))}
          </G>
        </Svg>
        {centerLabel ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>{centerLabel}</Text>
            {centerSub ? <Text style={{ color: theme.colors.textDarker, fontSize: 11 }}>{centerSub}</Text> : null}
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, paddingLeft: 16 }}>
        {data.map((d) => (
          <View key={d.label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color, marginRight: 8 }} />
            <Text style={{ color: theme.colors.text, fontSize: 12, flex: 1 }} numberOfLines={1}>{d.label}</Text>
            <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{formatValue(d.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
