import React from 'react';
import { AppHeader } from 'skintyee/components/layout';

// Route configuration, modeled on the ppt routes.tsx: each entry carries a name and
// navigation options (including the shared AppHeader). Tabs are gated by role in
// Application.tsx.
const header = (title: string) => (props: any) => <AppHeader {...props} options={{ title }} />;

export const routeConfig = {
  // Tabs
  directory: { name: 'directory', options: { title: 'Directory', header: header('Band Member Directory') } },
  events: { name: 'events', options: { title: 'Events', header: header('Community Events') } },
  meetings: { name: 'meetings', options: { title: 'Meetings', header: header('Band Meetings') } },
  publicRecords: { name: 'publicRecords', options: { title: 'Records', header: header('Public Records') } },
  timekeeping: { name: 'timekeeping', options: { title: 'Time', header: header('Time Keeping') } },
  financials: { name: 'financials', options: { title: 'Finance', header: header('Financial Records') } },
  polls: { name: 'polls', options: { title: 'Polls', header: header('Polling + Surveys') } },
  // Detail screens
  memberDetail: { name: 'memberDetail', options: { title: 'Member', header: header('Member') } },
  eventDetail: { name: 'eventDetail', options: { title: 'Event', header: header('Event') } },
  pollDetail: { name: 'pollDetail', options: { title: 'Poll', header: header('Poll') } },
  // Account / role switcher
  account: { name: 'account', options: { title: 'Account', header: header('Account') } },
};
