import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Card, Checkbox, Chip } from 'react-native-paper';
import type { SourceMeta } from 'lookup/models';
import { theme } from 'lookup/styles';

interface Props {
  sources: SourceMeta[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[], select: boolean) => void;
}

export default function SourcePicker({ sources, selected, onToggle, onSelectAll }: Props) {
  const groups: Record<string, SourceMeta[]> = {};
  for (const s of sources) {
    (groups[s.category] ||= []).push(s);
  }
  const allIds = sources.map((s) => s.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = allIds.some((id) => selected.has(id));
  const masterStatus: 'checked' | 'unchecked' | 'indeterminate' = allSelected ? 'checked' : someSelected ? 'indeterminate' : 'unchecked';
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Checkbox
          status={masterStatus}
          color={theme.colors.primary}
          uncheckedColor={theme.colors.textDarker}
          onPress={() => onSelectAll(allIds, !allSelected)}
        />
        <Pressable onPress={() => onSelectAll(allIds, !allSelected)}>
          <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
            {allSelected ? 'Deselect all' : 'Select all'} <Text style={{ color: theme.colors.textDarker, fontWeight: '400' }}>({selected.size}/{allIds.length})</Text>
          </Text>
        </Pressable>
      </View>
      {Object.entries(groups).map(([category, list]) => {
        const groupIds = list.map((s) => s.id);
        const groupAll = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
        const groupSome = groupIds.some((id) => selected.has(id));
        const groupStatus: 'checked' | 'unchecked' | 'indeterminate' = groupAll ? 'checked' : groupSome ? 'indeterminate' : 'unchecked';
        return (
        <Card
          key={category}
          style={{ backgroundColor: theme.colors.darkDefault, marginBottom: 12, borderColor: theme.colors.defaultBorder, borderWidth: 1 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingTop: 8 }}>
            <Checkbox
              status={groupStatus}
              color={theme.colors.primary}
              uncheckedColor={theme.colors.textDarker}
              onPress={() => onSelectAll(groupIds, !groupAll)}
            />
            <Pressable onPress={() => onSelectAll(groupIds, !groupAll)}>
              <Text style={{ color: theme.colors.primary, fontSize: 14, fontWeight: '500' }}>
                {category} <Text style={{ color: theme.colors.textDarker }}>({list.filter((s) => selected.has(s.id)).length}/{list.length})</Text>
              </Text>
            </Pressable>
          </View>
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
                          style={{ marginLeft: 8, backgroundColor: theme.colors.secondary }}
                          textStyle={{ color: theme.colors.success, fontSize: 10 }}
                        >
                          scrape
                        </Chip>
                      ) : (
                        <Chip
                          compact
                          style={{ marginLeft: 8, backgroundColor: theme.colors.secondary }}
                          textStyle={{ color: theme.colors.textDarker, fontSize: 10 }}
                        >
                          link only
                        </Chip>
                      )}
                      {s.autoSelectOnIndigenous ? (
                        <Chip
                          compact
                          style={{ marginLeft: 6, backgroundColor: theme.colors.secondary }}
                          textStyle={{ color: theme.colors.accent, fontSize: 10 }}
                        >
                          Indigenous
                        </Chip>
                      ) : null}
                      {s.requiresAuth ? (
                        <Chip
                          compact
                          style={{ marginLeft: 6, backgroundColor: theme.colors.secondary }}
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
        );
      })}
    </View>
  );
}
