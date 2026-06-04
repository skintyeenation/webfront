import React from 'react';
import { AppHeader } from 'skintyee/components/layout';

// Route configuration, modeled on the ppt routes.tsx: each entry carries a name and
// navigation options (including the shared AppHeader). Tabs are gated by role in
// Application.tsx.
// `titleLong` is the expanded form shown on tablets / desktop web — see
// AppHeader's LONG_TITLE_BREAKPOINT. Falls back to `title` on phones.
const header = (title: string, titleLong?: string) => (props: any) =>
  <AppHeader {...props} options={{ title, titleLong }} />;

export const routeConfig = {
  // Tabs
  dashboard: { name: 'dashboard', options: { title: 'Home', header: header('Dashboard') } },
  directory: { name: 'directory', options: { title: 'Directory', header: header('Management Directory', 'Band Management Directory') } },
  events: { name: 'events', options: { title: 'Events', header: header('Community Events') } },
  meetings: { name: 'meetings', options: { title: 'Meetings', header: header('Band Meetings') } },
  publicRecords: { name: 'publicRecords', options: { title: 'Records', header: header('Records') } },
  expenditureDetail: { name: 'expenditureDetail', options: { title: 'Breakdown', header: header('Expenditure Breakdown') } },
  timekeeping: { name: 'timekeeping', options: { title: 'Time', header: header('Time Keeping') } },
  timekeepingReports: { name: 'timekeepingReports', options: { title: 'Reports', header: header('Timesheet Reports') } },
  polls: { name: 'polls', options: { title: 'Polls', header: header('Polling + Surveys') } },
  notifications: { name: 'notifications', options: { title: 'Alerts', header: header('Notifications') } },
  more: { name: 'more', options: { title: 'More', header: header('More') } },
  // Detail screens
  memberDetail: { name: 'memberDetail', options: { title: 'Member', header: header('Member') } },
  eventDetail: { name: 'eventDetail', options: { title: 'Event', header: header('Event') } },
  pollDetail: { name: 'pollDetail', options: { title: 'Poll', header: header('Poll') } },
  // Admin create screens
  eventCreate: { name: 'eventCreate', options: { title: 'New event', header: header('New Event') } },
  eventEdit: { name: 'eventEdit', options: { title: 'Edit event', header: header('Edit Event') } },
  notificationCreate: { name: 'notificationCreate', options: { title: 'Post', header: header('Post Notification') } },
  notificationEdit: { name: 'notificationEdit', options: { title: 'Edit', header: header('Edit Notification') } },
  memberCreate: { name: 'memberCreate', options: { title: 'Add member', header: header('Add Member') } },
  memberEdit: { name: 'memberEdit', options: { title: 'Edit member', header: header('Edit Member') } },
  timesheetCreate: { name: 'timesheetCreate', options: { title: 'Timesheet', header: header('Timesheet') } },
  meetingCreate: { name: 'meetingCreate', options: { title: 'New meeting', header: header('Schedule Meeting') } },
  meetingEdit: { name: 'meetingEdit', options: { title: 'Edit meeting', header: header('Edit Meeting') } },
  documents: { name: 'documents', options: { title: 'Documents', header: header('Documents') } },
  documentCreate: { name: 'documentCreate', options: { title: 'Add document', header: header('Add Document') } },
  documentEdit: { name: 'documentEdit', options: { title: 'Edit document', header: header('Edit Document') } },
  tagManager: { name: 'tagManager', options: { title: 'Tag Manager', header: header('Tag Manager') } },
  onboardingFlows: { name: 'onboardingFlows', options: { title: 'Onboarding', header: header('Onboarding') } },
  onboardingFlowCreate: { name: 'onboardingFlowCreate', options: { title: 'New flow', header: header('New Onboarding Flow') } },
  onboardingFlowEdit: { name: 'onboardingFlowEdit', options: { title: 'Edit flow', header: header('Edit Onboarding Flow') } },
  onboardingPeople: { name: 'onboardingPeople', options: { title: 'People', header: header('People') } },
  onboardingAssignment: { name: 'onboardingAssignment', options: { title: 'Assignment', header: header('Assignment') } },
  myOnboarding: { name: 'myOnboarding', options: { title: 'My Onboarding', header: header('My Onboarding') } },
  // Account / role switcher
  account: { name: 'account', options: { title: 'Account', header: header('Account') } },
};
