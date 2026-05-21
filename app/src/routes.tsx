import React from 'react';
import { AppHeader } from 'skintyee/components/layout';

// Route configuration, modeled on the ppt routes.tsx: each entry carries a name and
// navigation options (including the shared AppHeader). Tabs are gated by role in
// Application.tsx.
const header = (title: string) => (props: any) => <AppHeader {...props} options={{ title }} />;

export const routeConfig = {
  // Tabs
  dashboard: { name: 'dashboard', options: { title: 'Home', header: header('Dashboard') } },
  directory: { name: 'directory', options: { title: 'Directory', header: header('Band Member Directory') } },
  events: { name: 'events', options: { title: 'Events', header: header('Community Events') } },
  meetings: { name: 'meetings', options: { title: 'Meetings', header: header('Band Meetings') } },
  publicRecords: { name: 'publicRecords', options: { title: 'Records', header: header('Public Records · Transparency') } },
  expenditureDetail: { name: 'expenditureDetail', options: { title: 'Breakdown', header: header('Expenditure Breakdown') } },
  timekeeping: { name: 'timekeeping', options: { title: 'Time', header: header('Time Keeping') } },
  financials: { name: 'financials', options: { title: 'Finance', header: header('Financial Records') } },
  polls: { name: 'polls', options: { title: 'Polls', header: header('Polling + Surveys') } },
  notifications: { name: 'notifications', options: { title: 'Alerts', header: header('Notifications') } },
  more: { name: 'more', options: { title: 'More', header: header('More') } },
  // Detail screens
  memberDetail: { name: 'memberDetail', options: { title: 'Member', header: header('Member') } },
  eventDetail: { name: 'eventDetail', options: { title: 'Event', header: header('Event') } },
  pollDetail: { name: 'pollDetail', options: { title: 'Poll', header: header('Poll') } },
  // Admin create screens
  eventCreate: { name: 'eventCreate', options: { title: 'New event', header: header('New Event') } },
  notificationCreate: { name: 'notificationCreate', options: { title: 'Post', header: header('Post Notification') } },
  memberCreate: { name: 'memberCreate', options: { title: 'Add member', header: header('Add Member') } },
  timesheetCreate: { name: 'timesheetCreate', options: { title: 'Timesheet', header: header('Add Timesheet') } },
  meetingCreate: { name: 'meetingCreate', options: { title: 'New meeting', header: header('Schedule Meeting') } },
  // Account / role switcher
  account: { name: 'account', options: { title: 'Account', header: header('Account') } },
};
