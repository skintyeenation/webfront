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
// Order: Time Keeping → Band Management → Staff Management → Onboarding
// → Documents. Onboarding sits right above Documents because the two
// are paired (flows pull from the document library).
const ADMIN_ITEMS: MoreItem[] = [
  { route: 'timekeeping',      label: 'Time Keeping',      description: 'Worker hours & approvals',                                 icon: 'clock-outline',            roles: ['admin'] },
  { route: 'directory',        label: 'Band Management',   description: 'Members, council & staff — add, remove, manage groups',   icon: 'account-group',            roles: ['admin'] },
  { route: 'onboardingPeople', label: 'Staff Management',  description: 'People on file — band members + external contractors',    icon: 'account-supervisor',       roles: ['admin'] },
  { route: 'onboardingFlows',  label: 'Onboarding',        description: 'Design onboarding flows & track progress for new people', icon: 'clipboard-check-multiple', roles: ['admin'] },
  { route: 'documents',        label: 'Documents',         description: 'Forms, filings & PDFs by tag',                             icon: 'file-document-multiple',   roles: ['admin'] },
];

// "Tools" — non-admin everyday operational tiles. Mirrors the admin
// items 1:1 by route so a staff member's menu structure feels like a
// subset of the admin's. Items here render in the Tools section above
// the Community section so the bottom of the page consistently holds
// community-browsing surfaces (Polls, Financial Summary).
const TOOLS_ITEMS: MoreItem[] = [
  // Mirrors admin's "Time Keeping" entry.
  { route: 'timekeeping',   label: 'My Timesheets',         description: 'Submit & view your hours',                                 icon: 'clock-outline',         roles: ['staff'] },
  // Mirrors admin's "Band Management" entry — non-admins see it as
  // the read-only "Band Member Directory".
  { route: 'directory',     label: 'Band Member Directory', description: 'Members, council & staff',                                 icon: 'account-group',         roles: ['public', 'member', 'staff'] },
  // Mirrors admin's "Documents" entry — staff-visible read view.
  { route: 'documents',     label: 'Forms & Documents',     description: 'Forms, filings & PDFs by category',                       icon: 'file-document-outline', roles: ['member', 'staff'] },
];

// "Community" — bottom grouping on every role's view. Both admins and
// staff/members see Polls here; Financial Summary is public + member
// only (staff don't see it, admin reaches it via Admin tools if needed
// — but the admin view ALSO shows the community section so they get
// Polls there).
const COMMUNITY_ITEMS: MoreItem[] = [
  { route: 'polls',         label: 'Polling + Surveys',     description: 'Surveys & vote on issues',                                 icon: 'vote-outline',          roles: ['public', 'member', 'staff', 'admin'] },
  { route: 'publicRecords', label: 'Financial Summary',     description: 'Where the money goes — budgets, expenditures & projects', icon: 'chart-pie',             roles: ['public', 'member'] },
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
        {isAdmin ? (
          <Section title="Admin tools" items={ADMIN_ITEMS} role={role} navigation={navigation} />
        ) : (
          <Section title="Tools" items={TOOLS_ITEMS} role={role} navigation={navigation} />
        )}
        <Section title="Community" items={COMMUNITY_ITEMS} role={role} navigation={navigation} />
      </PageContent>
    </PageContainer>
  );
}
