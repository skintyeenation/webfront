import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Chip, HelperText, Text } from 'react-native-paper';
import { apiFactory } from 'skintyee/store/apis';
import { SecurityGroup } from 'skintyee/services/api/ApiService';
import { theme } from 'skintyee/styles';

// Shared chip selector for Entra security-group memberships. Lifted out
// of EditMember.tsx so the new AddMember provisioning flow can drop the
// same picker into the create form (see docs/features/member-provisioning.md).
//
// The catalog is fetched on mount (admin endpoint), grouped by kind
// (entra / m365), and rendered as togglable chips. Selected slugs flow
// through as a controlled Set<string> via the `value` prop.

export interface SecurityGroupPickerProps {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  // Catalog injected from above when the parent already has it cached
  // (avoids a second network call). Without it, the picker self-fetches.
  catalog?: SecurityGroup[];
  // Optional pre-confirm callback fired before the picker flips a "sensitive"
  // group (the only one today is 'admins'). The parent can show a Confirm
  // dialog and resolve true to accept, false to cancel the toggle.
  onConfirmSensitive?: (slug: string) => Promise<boolean>;
}

const SENSITIVE_SLUGS = new Set(['admins']);

export function SecurityGroupPicker({ value, onChange, catalog: catalogProp, onConfirmSensitive }: SecurityGroupPickerProps) {
  const [catalog, setCatalog] = useState<SecurityGroup[]>(catalogProp ?? []);
  const [loading, setLoading] = useState(!catalogProp);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (catalogProp) { setCatalog(catalogProp); return; }
    let cancelled = false;
    (async () => {
      try {
        const groups = await apiFactory().admin.securityGroups();
        if (!cancelled) setCatalog(groups);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [catalogProp]);

  const byKind = useMemo(() => {
    const out: Record<SecurityGroup['kind'], SecurityGroup[]> = { entra: [], m365: [] };
    for (const g of catalog) out[g.kind].push(g);
    return out;
  }, [catalog]);

  const toggle = async (slug: string) => {
    const wasOn = value.has(slug);
    // Sensitive slugs need explicit confirmation when going ON.
    if (!wasOn && SENSITIVE_SLUGS.has(slug) && onConfirmSensitive) {
      const ok = await onConfirmSensitive(slug);
      if (!ok) return;
    }
    const next = new Set(value);
    if (wasOn) next.delete(slug); else next.add(slug);
    onChange(next);
  };

  if (loading) return <ActivityIndicator style={{ marginVertical: 12 }} />;
  if (error) return <HelperText type="error" visible>Couldn't load groups: {error}</HelperText>;

  const renderSection = (title: string, items: SecurityGroup[]) =>
    items.length === 0 ? null : (
      <View style={{ marginBottom: 14 }} key={title}>
        <Text style={{ color: theme.colors.textDarker, fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>
          {title.toUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {items.map((g) => {
            const on = value.has(g.slug);
            return (
              <Chip
                key={g.slug}
                selected={on}
                showSelectedCheck
                onPress={() => toggle(g.slug)}
                style={{
                  marginRight: 8,
                  marginBottom: 8,
                  backgroundColor: on ? theme.colors.primary : theme.colors.secondary,
                }}
                textStyle={{ color: on ? '#000' : theme.colors.text, fontSize: 12 }}
              >
                {g.displayName.replace(/^Skin Tyee /, '')}
              </Chip>
            );
          })}
        </View>
      </View>
    );

  return (
    <View>
      {renderSection('Security groups', byKind.entra)}
      {renderSection('Microsoft 365 groups', byKind.m365)}
    </View>
  );
}
