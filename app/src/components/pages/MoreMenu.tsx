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

// Account & Role — sits at the top of the More page for every role
// (above Admin tools). Single item: "My Account" → the Account modal.
const ACCOUNT_ITEMS: MoreItem[] = [
  { route: 'Account', label: 'My Account', description: 'Profile, sign-in, and role', icon: 'account-circle', roles: ['public', 'member', 'staff', 'admin'], root: true },
];

// Admin-only tools — grouped under the Admin tab for admins.
//   - "Financial Records" now opens the existing Records screen (bylaws,
//     notices, reports, forms). The screen used to be its own bottom tab;
//     after we promoted Meetings to the tab, Records lives here.
//   - "Budgets & Statements" preserves access to the Financials screen,
//     which used to share the Financial Records label.
const ADMIN_ITEMS: MoreItem[] = [
  { route: 'timekeeping',   label: 'Time Keeping',         description: 'Worker hours & approvals',           icon: 'clock-outline', roles: ['admin'] },
  { route: 'publicRecords', label: 'Financial Records',    description: 'Bylaws, notices, reports & forms',   icon: 'file-document-outline', roles: ['admin'] },
  { route: 'financials',    label: 'Budgets & Statements', description: 'Financial records & program spend',  icon: 'cash-multiple', roles: ['admin'] },
];

// General community items.
const COMMUNITY_ITEMS: MoreItem[] = [
  { route: 'directory', label: 'Band Member Directory', description: 'Members, council & staff', icon: 'account-group', roles: ['public', 'member', 'staff', 'admin'] },
  { route: 'polls', label: 'Polling + Surveys', description: 'Surveys & vote on issues', icon: 'vote-outline', roles: ['public', 'member', 'staff', 'admin'] },
  // Staff submit their own timesheets here; admins use the Time Keeping tool above.
  { route: 'timekeeping', label: 'My Timesheets', description: 'Submit & view your hours', icon: 'clock-outline', roles: ['staff'] },
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
        {/* Account & Role pinned at the top for every role so signing
            in / switching role is always the first thing visible.
            Community is the everyday stuff and goes next. Admin tools
            sink to the bottom — they're a small, infrequent surface. */}
        <Section title="Account & Role" items={ACCOUNT_ITEMS} role={role} navigation={navigation} />
        <Section title="Community" items={COMMUNITY_ITEMS} role={role} navigation={navigation} />
        {isAdmin ? <Section title="Admin tools" items={ADMIN_ITEMS} role={role} navigation={navigation} /> : null}
      </PageContent>
    </PageContainer>
  );
}
