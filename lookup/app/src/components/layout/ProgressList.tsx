import React from 'react';
import { View, Text } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { theme } from 'lookup/styles';
import type { JobState, SourceMeta } from 'lookup/models';

interface Props {
  job: JobState;
  sources: SourceMeta[];
}

export default function ProgressList({ job, sources }: Props) {
  const byId = Object.fromEntries(sources.map((s) => [s.id, s]));
  return (
    <View>
      {job.options.sourceIds.map((sid) => {
        const meta = byId[sid];
        const st = job.perSource[sid] ?? { status: 'idle' };
        let badgeColor: string = theme.colors.textDarker;
        let icon = '○';
        if (st.status === 'running') {
          icon = '…';
          badgeColor = theme.colors.primary;
        } else if (st.status === 'done') {
          icon = '✔';
          badgeColor = theme.colors.success;
        } else if (st.status === 'error') {
          icon = '✖';
          badgeColor = theme.colors.error;
        }
        return (
          <View
            key={sid}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 8,
              borderBottomColor: theme.colors.defaultBorder,
              borderBottomWidth: 1,
            }}
          >
            <Text style={{ color: badgeColor, width: 22, fontSize: 16 }}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text }}>{meta?.name ?? sid}</Text>
              {st.status === 'running' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <ActivityIndicator size={12} color={theme.colors.primary} />
                  <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginLeft: 8 }}>fetching…</Text>
                </View>
              ) : null}
              {st.status === 'done' ? (
                <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>
                  {meta?.scrapable
                    ? `${st.count ?? 0} items`
                    : 'link only — open search to view results ↗'}
                </Text>
              ) : null}
              {st.status === 'error' ? (
                <Text style={{ color: theme.colors.error, fontSize: 12 }}>{st.error}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
