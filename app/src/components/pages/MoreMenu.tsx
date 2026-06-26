import React, { useCallback, useState } from 'react';
import { Badge, Card, Divider, List, Text } from 'react-native-paper';
import { useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppSelector } from 'skintyee/store';
import { apiFactory } from 'skintyee/store/apis';
import { Role } from 'skintyee/models';
import { theme } from 'skintyee/styles';
import {
  MoreItem,
  ACCOUNT_ITEMS,
  ADMIN_ITEMS,
  SYSTEM_ITEMS,
  TOOLS_ITEMS,
  ONBOARDING_ITEMS,
  COMMUNITY_ITEMS,
} from 'skintyee/components/pages/moreMenuItems';

function Section({ title, items, role, navigation }: { title?: string; items: MoreItem[]; role: Role; navigation: any }) {
  const visible = items.filter((it) => it.roles.includes(role));
  const { width } = useWindowDimensions();
  const wide = width >= 768; // desktop → card grid; phone → list rows
  if (visible.length === 0) return null;
  return (
    <>
      {title ? <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 4, marginLeft: 4 }}>{title.toUpperCase()}</Text> : null}
      {wide ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
          {visible.map((it) => (
            <Card
              key={it.route}
              mode="contained"
              style={{ width: 240, marginRight: 10, marginBottom: 10, backgroundColor: theme.colors.darkDefault }}
              onPress={() => navigation.navigate(it.route)}
            >
              <Card.Content style={{ paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <List.Icon icon={it.icon} color={theme.colors.primary} style={{ margin: 0, marginRight: 4 }} />
                  <Text style={{ color: theme.colors.text, fontWeight: '600', flex: 1 }}>{it.label}</Text>
                </View>
                {it.description ? <Text style={{ color: theme.colors.textDarker, fontSize: 12, marginTop: 4 }}>{it.description}</Text> : null}
              </Card.Content>
            </Card>
          ))}
        </View>
      ) : (
        visible.map((it, i) => (
          <React.Fragment key={it.route}>
            {i > 0 ? <Divider /> : null}
            <List.Item
              title={it.label}
              description={it.description}
              titleStyle={{ color: theme.colors.text }}
              descriptionStyle={{ color: theme.colors.textDarker }}
              left={() => <List.Icon icon={it.icon} color={theme.colors.primary} />}
              right={() => <List.Icon icon="chevron-right" color={theme.colors.textDarker} />}
              onPress={() => navigation.navigate(it.route)}
            />
          </React.Fragment>
        ))
      )}
    </>
  );
}

// Overflow menu — keeps the bottom tab bar to 5 items. For admins this is the
// "Admin" tab and surfaces admin tools first; for others it's "More".
export default function MoreMenu({ navigation }: any) {
  const role = useAppSelector((s) => s.auth.role);
  const signedIn = useAppSelector((s) => s.auth.signedIn);
  const isAdmin = role === 'admin';
  // Count of open (non-completed) onboarding assignments. When > 0 we
  // pin a "My onboarding" section above Tools with a red badge so the
  // worker sees they have something outstanding the moment they open
  // this screen.
  const [openOnboarding, setOpenOnboarding] = useState(0);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    // Admins can be onboarded too — surface "My Onboarding" for them when they
    // personally have open assignments, not just for staff/members.
    if (!signedIn) { setOpenOnboarding(0); return; }
    (async () => {
      try {
        const as = await apiFactory().onboarding.myAssignments();
        if (cancelled) return;
        setOpenOnboarding(as.filter((a) => !a.completedAt).length);
      } catch {
        if (!cancelled) setOpenOnboarding(0);
      }
    })();
    return () => { cancelled = true; };
  }, [signedIn]));

  return (
    <PageContainer>
      <PageContent>
        {/* Three sections, always in this order:
              1. Account & Role        — pinned at top for every role.
              2. Admin tools / Tools   — daily-work tiles. "Admin
                 tools" for admins (ADMIN_ITEMS); "Tools" for staff +
                 members (TOOLS_ITEMS, same routes as the admin
                 list).
              3. Community             — Polls + Financial Summary
                 at the bottom so the same browsing surface lives in
                 the same place across roles. */}
        <Section title="Account & Role" items={ACCOUNT_ITEMS} role={role} navigation={navigation} />
        {/* My Onboarding — pinned at the top above Admin tools / Tools
            (mandatory surface), for ANY role including admins. Only renders
            when the user has at least one open assignment. Red badge counts. */}
        {openOnboarding > 0 ? (
          <View>
            <Section title="MY ONBOARDING" items={ONBOARDING_ITEMS} role={role} navigation={navigation} />
            <View style={{ position: 'absolute', right: 12, top: 36 }}>
              <Badge style={{ backgroundColor: theme.colors.error }}>{openOnboarding}</Badge>
            </View>
          </View>
        ) : null}
        {isAdmin ? (
          <>
            <Section title="Admin tools" items={ADMIN_ITEMS} role={role} navigation={navigation} />
            <Section title="System" items={SYSTEM_ITEMS} role={role} navigation={navigation} />
          </>
        ) : (
          <Section title="Tools" items={TOOLS_ITEMS} role={role} navigation={navigation} />
        )}
        <Section title="Community" items={COMMUNITY_ITEMS} role={role} navigation={navigation} />
      </PageContent>
    </PageContainer>
  );
}
