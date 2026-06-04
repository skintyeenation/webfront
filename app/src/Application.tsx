import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createMaterialBottomTabNavigator } from '@react-navigation/material-bottom-tabs';
import { Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { theme } from 'skintyee/styles';
import { routeConfig } from 'skintyee/routes';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { refreshStoreForSignedInUser } from 'skintyee/store/refresh';
import { SplashScreen, AppHeader } from 'skintyee/components/layout';
import { Role } from 'skintyee/models';

import Dashboard from 'skintyee/components/pages/Dashboard';
import Directory from 'skintyee/components/pages/Directory';
import MemberDetail from 'skintyee/components/pages/MemberDetail';
import Events from 'skintyee/components/pages/Events';
import EventDetail from 'skintyee/components/pages/EventDetail';
import Meetings from 'skintyee/components/pages/Meetings';
import PublicRecords from 'skintyee/components/pages/PublicRecords';
import ExpenditureDetail from 'skintyee/components/pages/ExpenditureDetail';
import TimeKeeping from 'skintyee/components/pages/TimeKeeping';
import TimekeepingReports from 'skintyee/components/pages/TimekeepingReports';
import Polls from 'skintyee/components/pages/Polls';
import PollDetail from 'skintyee/components/pages/PollDetail';
import Notifications from 'skintyee/components/pages/Notifications';
import MoreMenu from 'skintyee/components/pages/MoreMenu';
import Account from 'skintyee/components/pages/Account';
import CreateEvent from 'skintyee/components/pages/CreateEvent';
import EditEvent from 'skintyee/components/pages/EditEvent';
import PostNotification from 'skintyee/components/pages/PostNotification';
import EditNotification from 'skintyee/components/pages/EditNotification';
import AddMember from 'skintyee/components/pages/AddMember';
import EditMember from 'skintyee/components/pages/EditMember';
import AddTimesheet from 'skintyee/components/pages/AddTimesheet';
import CreateMeeting from 'skintyee/components/pages/CreateMeeting';
import EditMeeting from 'skintyee/components/pages/EditMeeting';
import Documents from 'skintyee/components/pages/Documents';
import EditDocument from 'skintyee/components/pages/EditDocument';
import TagManager from 'skintyee/components/pages/TagManager';
import OnboardingFlows from 'skintyee/components/pages/OnboardingFlows';
import MyOnboarding from 'skintyee/components/pages/MyOnboarding';
import EditOnboardingFlow from 'skintyee/components/pages/EditOnboardingFlow';
import People from 'skintyee/components/pages/People';
import AssignmentTimeline from 'skintyee/components/pages/AssignmentTimeline';

// Five fixed tabs keep the bottom bar clean. Overflow features live under the
// 5th tab — "More" for public/members, "Admin" for admins (admin tools grouped
// there). Events + Notifications sit in the middle.
const CORE_TABS = ['Home', 'Events', 'Notifications', 'Meetings'] as const;

const tabIcons: Record<string, string> = {
  Home: 'view-dashboard-outline',
  Events: 'calendar-star',
  Notifications: 'bell-outline',
  // Material icon for a meeting / discussion — picked over 'gavel' which
  // reads as a courtroom action, and 'account-group' which is already
  // the bandGroups chip icon. 'forum' = grouped speech bubbles.
  Meetings: 'forum',
  Records: 'file-document-outline',
  More: 'dots-horizontal',
  Admin: 'shield-account',
};

// ---- Per-tab stack navigators (so detail screens keep the shared header) ----
const DashboardStack = createStackNavigator();
const DashboardNavigation = () => (
  <DashboardStack.Navigator>
    <DashboardStack.Screen {...routeConfig.dashboard} component={Dashboard} />
  </DashboardStack.Navigator>
);

const EventsStack = createStackNavigator();
const EventsNavigation = () => (
  <EventsStack.Navigator>
    <EventsStack.Screen {...routeConfig.events} component={Events} />
    <EventsStack.Screen {...routeConfig.eventDetail} component={EventDetail} />
    <EventsStack.Screen {...routeConfig.eventCreate} component={CreateEvent} />
    <EventsStack.Screen {...routeConfig.eventEdit} component={EditEvent} />
  </EventsStack.Navigator>
);

// Meetings is now a top-level tab (was inside MoreStack). Owns its
// detail + create + edit screens.
const MeetingsStack = createStackNavigator();
const MeetingsNavigation = () => (
  <MeetingsStack.Navigator>
    <MeetingsStack.Screen {...routeConfig.meetings} component={Meetings} />
    <MeetingsStack.Screen {...routeConfig.meetingCreate} component={CreateMeeting} />
    <MeetingsStack.Screen {...routeConfig.meetingEdit} component={EditMeeting} />
  </MeetingsStack.Navigator>
);

const NotificationsStack = createStackNavigator();
const NotificationsNavigation = () => (
  <NotificationsStack.Navigator>
    <NotificationsStack.Screen {...routeConfig.notifications} component={Notifications} />
    <NotificationsStack.Screen {...routeConfig.notificationCreate} component={PostNotification} />
    <NotificationsStack.Screen {...routeConfig.notificationEdit} component={EditNotification} />
  </NotificationsStack.Navigator>
);

// Overflow ("More" / "Admin") stack — holds everything that isn't a core tab.
const MoreStack = createStackNavigator();
const MoreNavigation = () => {
  const role = useAppSelector((s) => s.auth.role);
  const moreTitle = role === 'admin' ? 'Admin' : 'More';
  return (
    <MoreStack.Navigator>
      <MoreStack.Screen name="more" component={MoreMenu} options={{ header: (props: any) => <AppHeader {...props} options={{ title: moreTitle }} /> }} />
      <MoreStack.Screen {...routeConfig.directory} component={Directory} />
      <MoreStack.Screen {...routeConfig.memberDetail} component={MemberDetail} />
      <MoreStack.Screen {...routeConfig.memberCreate} component={AddMember} />
      <MoreStack.Screen {...routeConfig.memberEdit} component={EditMember} />
      <MoreStack.Screen {...routeConfig.polls} component={Polls} />
      <MoreStack.Screen {...routeConfig.pollDetail} component={PollDetail} />
      <MoreStack.Screen {...routeConfig.timekeeping} component={TimeKeeping} />
      <MoreStack.Screen {...routeConfig.timekeepingReports} component={TimekeepingReports} />
      <MoreStack.Screen {...routeConfig.timesheetCreate} component={AddTimesheet} />
      {/* Public Records (bylaws / notices / reports / forms) used to be its
          own tab. Now reachable via the Admin Tools "Financial Records"
          item (and any deep nav). The screen itself is untouched. */}
      <MoreStack.Screen {...routeConfig.publicRecords} component={PublicRecords} />
      <MoreStack.Screen {...routeConfig.expenditureDetail} component={ExpenditureDetail} />
      <MoreStack.Screen {...routeConfig.documents} component={Documents} />
      <MoreStack.Screen {...routeConfig.documentCreate} component={EditDocument} />
      <MoreStack.Screen {...routeConfig.documentEdit} component={EditDocument} />
      <MoreStack.Screen {...routeConfig.tagManager} component={TagManager} />
      <MoreStack.Screen {...routeConfig.onboardingFlows} component={OnboardingFlows} />
      <MoreStack.Screen {...routeConfig.onboardingFlowCreate} component={EditOnboardingFlow} />
      <MoreStack.Screen {...routeConfig.onboardingFlowEdit} component={EditOnboardingFlow} />
      <MoreStack.Screen {...routeConfig.onboardingPeople} component={People} />
      <MoreStack.Screen {...routeConfig.onboardingAssignment} component={AssignmentTimeline} />
      <MoreStack.Screen {...routeConfig.myOnboarding} component={MyOnboarding} />
    </MoreStack.Navigator>
  );
};

const tabComponents: Record<string, React.ComponentType<any>> = {
  Home: DashboardNavigation,
  Events: EventsNavigation,
  Notifications: NotificationsNavigation,
  Meetings: MeetingsNavigation,
};

const Tabs = createMaterialBottomTabNavigator();
const MainTabs = () => {
  const role = useAppSelector((s) => s.auth.role);
  const overflow = role === 'admin' ? 'Admin' : 'More';
  return (
    <Tabs.Navigator
      activeColor={theme.colors.text}
      inactiveColor={theme.colors.primary}
      barStyle={{ backgroundColor: theme.colors.background }}
      shifting={false}
    >
      {CORE_TABS.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          component={tabComponents[name]}
          options={{ tabBarIcon: ({ color }: { color: string }) => <MaterialCommunityIcons name={tabIcons[name]} color={color} size={22} /> }}
        />
      ))}
      <Tabs.Screen
        key={overflow}
        name={overflow}
        component={MoreNavigation}
        options={{ tabBarIcon: ({ color }: { color: string }) => <MaterialCommunityIcons name={tabIcons[overflow]} color={color} size={22} /> }}
      />
    </Tabs.Navigator>
  );
};

// ---- Root stack: tabs + the Account (role switcher) modal ----
const RootStack = createStackNavigator();

export default function Application() {
  const customTheme = { ...theme } as any;
  // Brief in-app splash on launch (shows the Skintyee logo over the dark bg).
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1600);
    return () => clearTimeout(t);
  }, []);

  // Sign-in gate — block all tabs until the user either:
  //   • Signs in via Microsoft Entra (signedIn === true), OR
  //   • Explicitly chooses a role via the dev Role Switcher (bypassed === true)
  // Initial launch: signedIn=false, bypassed=false → render the Account
  // screen full-page (which has both the Microsoft button + dev role
  // switcher). After either path completes, the tabs appear.
  const { signedIn, bypassed, role } = useAppSelector((s) => s.auth);
  const allowedIn = signedIn || bypassed;

  // When the user transitions from anonymous → signed-in (or boots into
  // an already-signed-in session restored from localStorage), every
  // role-gated slice needs to refetch. Without this they keep the
  // empty/limited public-role responses that loaded before sign-in,
  // and the user lands on screens with no data + no apparent buttons.
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!signedIn) return;
    refreshStoreForSignedInUser(dispatch, role);
  }, [dispatch, signedIn, role]);

  return (
    <PaperProvider theme={customTheme} settings={{ icon: (props: any) => <MaterialCommunityIcons {...props} /> }}>
      <StatusBar style="light" />
      {booting ? (
        <SplashScreen />
      ) : (
      <NavigationContainer>
        {!allowedIn ? (
          // Pre-sign-in: show only the Account screen (no tabs).
          // The Account screen contains BOTH the Microsoft sign-in button
          // AND the dev Role Switcher. Picking either path flips the gate.
          <RootStack.Navigator>
            <RootStack.Screen
              name="Account"
              component={Account}
              options={{ ...routeConfig.account.options, headerShown: true }}
            />
          </RootStack.Navigator>
        ) : (
          <RootStack.Navigator>
            <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <RootStack.Screen name="Account" component={Account} options={{ presentation: 'modal', ...routeConfig.account.options }} />
          </RootStack.Navigator>
        )}
      </NavigationContainer>
      )}
    </PaperProvider>
  );
}
