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
import { useAppSelector } from 'skintyee/store';
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
import Financials from 'skintyee/components/pages/Financials';
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

// Five fixed tabs keep the bottom bar clean. Overflow features live under the
// 5th tab — "More" for public/members, "Admin" for admins (admin tools grouped
// there). Events + Notifications sit in the middle.
const CORE_TABS = ['Home', 'Events', 'Notifications', 'Records'] as const;

const tabIcons: Record<string, string> = {
  Home: 'view-dashboard-outline',
  Events: 'calendar-star',
  Notifications: 'bell-outline',
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

const RecordsStack = createStackNavigator();
const RecordsNavigation = () => (
  <RecordsStack.Navigator>
    <RecordsStack.Screen {...routeConfig.publicRecords} component={PublicRecords} />
    <RecordsStack.Screen {...routeConfig.expenditureDetail} component={ExpenditureDetail} />
  </RecordsStack.Navigator>
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
      <MoreStack.Screen {...routeConfig.meetings} component={Meetings} />
      <MoreStack.Screen {...routeConfig.meetingCreate} component={CreateMeeting} />
      <MoreStack.Screen {...routeConfig.meetingEdit} component={EditMeeting} />
      <MoreStack.Screen {...routeConfig.polls} component={Polls} />
      <MoreStack.Screen {...routeConfig.pollDetail} component={PollDetail} />
      <MoreStack.Screen {...routeConfig.timekeeping} component={TimeKeeping} />
      <MoreStack.Screen {...routeConfig.timesheetCreate} component={AddTimesheet} />
      <MoreStack.Screen {...routeConfig.financials} component={Financials} />
    </MoreStack.Navigator>
  );
};

const tabComponents: Record<string, React.ComponentType<any>> = {
  Home: DashboardNavigation,
  Events: EventsNavigation,
  Notifications: NotificationsNavigation,
  Records: RecordsNavigation,
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

  return (
    <PaperProvider theme={customTheme} settings={{ icon: (props: any) => <MaterialCommunityIcons {...props} /> }}>
      <StatusBar style="light" />
      {booting ? (
        <SplashScreen />
      ) : (
      <NavigationContainer>
        <RootStack.Navigator>
          <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <RootStack.Screen name="Account" component={Account} options={{ presentation: 'modal', ...routeConfig.account.options }} />
        </RootStack.Navigator>
      </NavigationContainer>
      )}
    </PaperProvider>
  );
}
