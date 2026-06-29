import React, { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import moment from 'moment';
import { theme } from 'skintyee/styles';

export interface MonthCalendarProps {
  // date key 'YYYY-MM-DD' -> count of items on that day
  marks: Record<string, number>;
  selected?: string;
  onSelect: (dateKey: string) => void;
  initialMonth?: string; // 'YYYY-MM-DD' to anchor the displayed month
  // Show the item count as a numbered badge on the day (instead of a plain dot).
  showCount?: boolean;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Lightweight month calendar built from plain Views — no calendar library.
 * Days with items show a dot; tap a day to select it. Renders on web + native.
 */
export function MonthCalendar({ marks, selected, onSelect, initialMonth, showCount }: MonthCalendarProps) {
  const [cursor, setCursor] = useState(() => moment(initialMonth || undefined).startOf('month'));

  const todayKey = moment().format('YYYY-MM-DD');
  const startOfMonth = cursor.clone().startOf('month');
  const daysInMonth = cursor.daysInMonth();
  const leading = startOfMonth.day(); // 0=Sun

  const cells: (moment.Moment | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(startOfMonth.clone().date(d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View>
      {/* Month header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="chevron-left" iconColor={theme.colors.primary} size={22} onPress={() => setCursor(cursor.clone().subtract(1, 'month'))} />
        <Text style={{ color: theme.colors.text, fontSize: 16 }}>{cursor.format('MMMM YYYY')}</Text>
        <IconButton icon="chevron-right" iconColor={theme.colors.primary} size={22} onPress={() => setCursor(cursor.clone().add(1, 'month'))} />
      </View>

      {/* Weekday row */}
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', color: theme.colors.textDarker, fontSize: 11, marginBottom: 4 }}>{w}</Text>
        ))}
      </View>

      {/* Day grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((m, i) => {
          if (!m) return <View key={`b${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const key = m.format('YYYY-MM-DD');
          const count = marks[key] || 0;
          const isSelected = key === selected;
          const isToday = key === todayKey;
          return (
            <TouchableOpacity
              key={key}
              disabled={count === 0}
              onPress={() => onSelect(key)}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                  borderWidth: isToday && !isSelected ? 1 : 0,
                  borderColor: theme.colors.primary,
                }}
              >
                <Text style={{ color: isSelected ? '#000' : count > 0 ? theme.colors.text : theme.colors.textDarker, fontSize: 13 }}>{m.date()}</Text>
                {showCount && count > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -7,
                      minWidth: 17,
                      height: 17,
                      borderRadius: 9,
                      paddingHorizontal: 3,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.colors.accent,
                      borderWidth: 1.5,
                      borderColor: theme.colors.darkDefault,
                    }}
                  >
                    <Text style={{ color: '#000', fontSize: 10, fontWeight: '700' }}>{count}</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ height: 6, marginTop: 2 }}>
                {!showCount && count > 0 ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isSelected ? theme.colors.text : theme.colors.accent }} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
