import React from 'react';
import { Divider, List, Text } from 'react-native-paper';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppSelector } from 'skintyee/store';
import { Role } from 'skintyee/models';
import { theme } from 'skintyee/styles';

interface MoreItem {
  route: string;
  label: string;
  description: string;
  icon: string;
  roles: Role[];
  root?: boolean; // navigate on the root navigator (e.g. the Account modal)
}

// Admin-only tools — grouped under the Admin tab for admins.
const ADMIN_ITEMS: MoreItem[] = [
  { route: 'timekeeping', label: 'Time Keeping', description: 'Worker hours & approvals', icon: 'clock-outline', roles: ['admin'] },
  { route: 'financials', label: 'Financial Records', description: 'Budgets & statements', icon: 'cash-multiple', roles: ['admin'] },
];

// General community items.
const COMMUNITY_ITEMS: MoreItem[] = [
  { route: 'directory', label: 'Band Member Directory', description: 'Members, council & staff', icon: 'account-group', roles: ['public', 'member', 'staff', 'admin'] },
  { route: 'meetings', label: 'Band Meetings', description: 'Agendas, schedules & minutes', icon: 'gavel', roles: ['member', 'staff', 'admin'] },
  { route: 'polls', label: 'Polling + Surveys', description: 'Surveys & vote on issues', icon: 'vote-outline', roles: ['public', 'member', 'staff', 'admin'] },
  // Staff submit their own timesheets here; admins use the Time Keeping tool above.
  { route: 'timekeeping', label: 'My Timesheets', description: 'Submit & view your hours', icon: 'clock-outline', roles: ['staff'] },
  { route: 'Account', label: 'Account & Role', description: 'Profile and role (dev)', icon: 'account-circle', roles: ['public', 'member', 'staff', 'admin'], root: true },
];

function Section({ title, items, role, navigation }: { title?: string; items: MoreItem[]; role: Role; navigation: any }) {
  const visible = items.filter((it) => it.roles.includes(role));
  if (visible.length === 0) return null;
  return (
    <>
      {title ? <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 4, marginLeft: 4 }}>{title.toUpperCase()}</Text> : null}
      {visible.map((it, i) => (
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
      ))}
    </>
  );
}

// Overflow menu — keeps the bottom tab bar to 5 items. For admins this is the
// "Admin" tab and surfaces admin tools first; for others it's "More".
export default function MoreMenu({ navigation }: any) {
  const role = useAppSelector((s) => s.auth.role);
  const isAdmin = role === 'admin';
  return (
    <PageContainer>
      <PageContent>
        {isAdmin ? <Section title="Admin tools" items={ADMIN_ITEMS} role={role} navigation={navigation} /> : null}
        <Section title={isAdmin ? 'Community' : undefined} items={COMMUNITY_ITEMS} role={role} navigation={navigation} />
      </PageContent>
    </PageContainer>
  );
}
