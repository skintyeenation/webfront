import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createMaterialBottomTabNavigator } from '@react-navigation/material-bottom-tabs';
import { Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { theme } from 'skintyee/styles';
import { routeConfig } from 'skintyee/routes';
import { useAppSelector } from 'skintyee/store';
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
import Account from 'skintyee/components/pages/Account';

// Which tabs each actor (role) sees. Derived from the SkinTyee.drawio.pdf diagram.
// Events + Notifications are kept centered in the tab bar for every role.
const tabsByRole: Record<Role, string[]> = {
  public: ['Home', 'Events', 'Notifications', 'Records', 'Polls'],
  member: ['Home', 'Directory', 'Events', 'Notifications', 'Meetings', 'Records', 'Polls'],
  admin: ['Home', 'Directory', 'Meetings', 'Events', 'Notifications', 'Records', 'Time', 'Finance', 'Polls'],
};

const tabIcons: Record<string, string> = {
  Home: 'view-dashboard-outline',
  Directory: 'account-group',
  Events: 'calendar-star',
  Notifications: 'bell-outline',
  Meetings: 'gavel',
  Records: 'file-document-outline',
  Time: 'clock-outline',
  Finance: 'cash-multiple',
  Polls: 'vote-outline',
};

// ---- Per-tab stack navigators (so detail screens keep the shared header) ----
const DashboardStack = createStackNavigator();
const DashboardNavigation = () => (
  <DashboardStack.Navigator>
    <DashboardStack.Screen {...routeConfig.dashboard} component={Dashboard} />
  </DashboardStack.Navigator>
);

const DirectoryStack = createStackNavigator();
const DirectoryNavigation = () => (
  <DirectoryStack.Navigator>
    <DirectoryStack.Screen {...routeConfig.directory} component={Directory} />
    <DirectoryStack.Screen {...routeConfig.memberDetail} component={MemberDetail} />
  </DirectoryStack.Navigator>
);

const EventsStack = createStackNavigator();
const EventsNavigation = () => (
  <EventsStack.Navigator>
    <EventsStack.Screen {...routeConfig.events} component={Events} />
    <EventsStack.Screen {...routeConfig.eventDetail} component={EventDetail} />
  </EventsStack.Navigator>
);

const MeetingsStack = createStackNavigator();
const MeetingsNavigation = () => (
  <MeetingsStack.Navigator>
    <MeetingsStack.Screen {...routeConfig.meetings} component={Meetings} />
  </MeetingsStack.Navigator>
);

const RecordsStack = createStackNavigator();
const RecordsNavigation = () => (
  <RecordsStack.Navigator>
    <RecordsStack.Screen {...routeConfig.publicRecords} component={PublicRecords} />
    <RecordsStack.Screen {...routeConfig.expenditureDetail} component={ExpenditureDetail} />
  </RecordsStack.Navigator>
);

const TimeStack = createStackNavigator();
const TimeNavigation = () => (
  <TimeStack.Navigator>
    <TimeStack.Screen {...routeConfig.timekeeping} component={TimeKeeping} />
  </TimeStack.Navigator>
);

const FinanceStack = createStackNavigator();
const FinanceNavigation = () => (
  <FinanceStack.Navigator>
    <FinanceStack.Screen {...routeConfig.financials} component={Financials} />
  </FinanceStack.Navigator>
);

const PollsStack = createStackNavigator();
const PollsNavigation = () => (
  <PollsStack.Navigator>
    <PollsStack.Screen {...routeConfig.polls} component={Polls} />
    <PollsStack.Screen {...routeConfig.pollDetail} component={PollDetail} />
  </PollsStack.Navigator>
);

const NotificationsStack = createStackNavigator();
const NotificationsNavigation = () => (
  <NotificationsStack.Navigator>
    <NotificationsStack.Screen {...routeConfig.notifications} component={Notifications} />
  </NotificationsStack.Navigator>
);

const tabComponents: Record<string, React.ComponentType<any>> = {
  Home: DashboardNavigation,
  Directory: DirectoryNavigation,
  Events: EventsNavigation,
  Notifications: NotificationsNavigation,
  Meetings: MeetingsNavigation,
  Records: RecordsNavigation,
  Time: TimeNavigation,
  Finance: FinanceNavigation,
  Polls: PollsNavigation,
};

const Tabs = createMaterialBottomTabNavigator();
const MainTabs = () => {
  const role = useAppSelector((s) => s.auth.role);
  const visibleTabs = tabsByRole[role] ?? tabsByRole.public;
  return (
    <Tabs.Navigator
      activeColor={theme.colors.text}
      inactiveColor={theme.colors.primary}
      barStyle={{ backgroundColor: theme.colors.background }}
      shifting={false}
    >
      {visibleTabs.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          component={tabComponents[name]}
          options={{
            tabBarIcon: ({ color }: { color: string }) => <MaterialCommunityIcons name={tabIcons[name]} color={color} size={22} />,
          }}
        />
      ))}
    </Tabs.Navigator>
  );
};

// ---- Root stack: tabs + the Account (role switcher) modal ----
const RootStack = createStackNavigator();

export default function Application() {
  const customTheme = { ...theme } as any;
  return (
    <PaperProvider theme={customTheme} settings={{ icon: (props: any) => <MaterialCommunityIcons {...props} /> }}>
      <StatusBar style="light" />
      <NavigationContainer>
        <RootStack.Navigator>
          <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <RootStack.Screen name="Account" component={Account} options={{ presentation: 'modal', ...routeConfig.account.options }} />
        </RootStack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
