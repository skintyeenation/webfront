import React from 'react';
import { View, Text } from 'react-native';
import { Card, Checkbox, Chip } from 'react-native-paper';
import type { SourceMeta } from 'lookup/models';
import { theme } from 'lookup/styles';

interface Props {
  sources: SourceMeta[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

export default function SourcePicker({ sources, selected, onToggle }: Props) {
  const groups: Record<string, SourceMeta[]> = {};
  for (const s of sources) {
    (groups[s.category] ||= []).push(s);
  }
  return (
    <View>
      {Object.entries(groups).map(([category, list]) => (
        <Card
          key={category}
          style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12, borderColor: theme.colors.defaultBorder, borderWidth: 1 }}
        >
          <Card.Title
            title={category}
            titleStyle={{ color: theme.colors.primary, fontSize: 14, fontFamily: theme.fonts.medium.fontFamily }}
          />
          <Card.Content>
            {list.map((s) => {
              const checked = selected.has(s.id);
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
                  <Checkbox
                    status={checked ? 'checked' : 'unchecked'}
                    color={theme.colors.primary}
                    onPress={() => onToggle(s.id)}
                  />
                  <View style={{ flex: 1, marginLeft: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{s.name}</Text>
                      {s.scrapable ? (
                        <Chip
                          compact
                          style={{ marginLeft: 8, backgroundColor: theme.colors.secondary, height: 22 }}
                          textStyle={{ color: theme.colors.success, fontSize: 10 }}
                        >
                          scrape
                        </Chip>
                      ) : (
                        <Chip
                          compact
                          style={{ marginLeft: 8, backgroundColor: theme.colors.secondary, height: 22 }}
                          textStyle={{ color: theme.colors.textDarker, fontSize: 10 }}
                        >
                          link only
                        </Chip>
                      )}
                      {s.autoSelectOnIndigenous ? (
                        <Chip
                          compact
                          style={{ marginLeft: 6, backgroundColor: theme.colors.secondary, height: 22 }}
                          textStyle={{ color: theme.colors.accent, fontSize: 10 }}
                        >
                          Indigenous
                        </Chip>
                      ) : null}
                      {s.requiresAuth ? (
                        <Chip
                          compact
                          style={{ marginLeft: 6, backgroundColor: theme.colors.secondary, height: 22 }}
                          textStyle={{ color: theme.colors.error, fontSize: 10 }}
                        >
                          {String(s.requiresAuth)}
                        </Chip>
                      ) : null}
                    </View>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 2 }}>{s.description}</Text>
                  </View>
                </View>
              );
            })}
          </Card.Content>
        </Card>
      ))}
    </View>
  );
}
