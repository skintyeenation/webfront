import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer, DarkTheme as NavDarkTheme, useNavigationBuilder, TabRouter, TabActions, createNavigatorFactory } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { theme, APP_MAX_WIDTH } from 'skintyee/styles';
import { routeConfig } from 'skintyee/routes';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { refreshStoreForSignedInUser } from 'skintyee/store/refresh';
import { setNavPosition, setNavExpanded, DEFAULT_NAV_POSITION } from 'skintyee/store/modules/appState';
import { loadNavPosition, loadNavExpanded, saveNavExpanded } from 'skintyee/store/navPrefs';
import { moreSectionsFor } from 'skintyee/components/pages/moreMenuItems';
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
import Expenses from 'skintyee/components/pages/Expenses';
import AddExpense from 'skintyee/components/pages/AddExpense';
import ExpenseReports from 'skintyee/components/pages/ExpenseReports';
import ExpenseTagManager from 'skintyee/components/pages/ExpenseTagManager';
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
import Devices from 'skintyee/components/pages/Devices';
import DeviceDetail from 'skintyee/components/pages/DeviceDetail';
import ConfigureNotifications from 'skintyee/components/pages/ConfigureNotifications';
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
      <MoreStack.Screen
        name="more"
        component={MoreMenu}
        // `title: 'Menu'` is the documentTitle source for the browser tab
        // (NavigationContainer.documentTitle.formatter reads options.title).
        // The in-app AppHeader still shows the role-aware "Admin" / "More"
        // label via the custom `header` below — different surface, different
        // string by design.
        options={{ title: 'Menu', header: (props: any) => <AppHeader {...props} options={{ title: moreTitle }} /> }}
      />
      <MoreStack.Screen {...routeConfig.directory} component={Directory} />
      <MoreStack.Screen {...routeConfig.memberDetail} component={MemberDetail} />
      <MoreStack.Screen {...routeConfig.memberCreate} component={AddMember} />
      <MoreStack.Screen {...routeConfig.memberEdit} component={EditMember} />
      <MoreStack.Screen {...routeConfig.polls} component={Polls} />
      <MoreStack.Screen {...routeConfig.pollDetail} component={PollDetail} />
      <MoreStack.Screen {...routeConfig.timekeeping} component={TimeKeeping} />
      <MoreStack.Screen {...routeConfig.timekeepingReports} component={TimekeepingReports} />
      <MoreStack.Screen {...routeConfig.timesheetCreate} component={AddTimesheet} />
      <MoreStack.Screen {...routeConfig.expenses} component={Expenses} />
      <MoreStack.Screen {...routeConfig.expenseReports} component={ExpenseReports} />
      <MoreStack.Screen {...routeConfig.expenseTags} component={ExpenseTagManager} />
      <MoreStack.Screen {...routeConfig.expenseCreate} component={AddExpense} />
      {/* Public Records (bylaws / notices / reports / forms) used to be its
          own tab. Now reachable via the Admin Tools "Financial Records"
          item (and any deep nav). The screen itself is untouched. */}
      <MoreStack.Screen {...routeConfig.publicRecords} component={PublicRecords} />
      <MoreStack.Screen {...routeConfig.expenditureDetail} component={ExpenditureDetail} />
      <MoreStack.Screen {...routeConfig.documents} component={Documents} />
      <MoreStack.Screen {...routeConfig.documentCreate} component={EditDocument} />
      <MoreStack.Screen {...routeConfig.documentEdit} component={EditDocument} />
      <MoreStack.Screen {...routeConfig.devices} component={Devices} />
      <MoreStack.Screen {...routeConfig.deviceDetail} component={DeviceDetail} />
      <MoreStack.Screen {...routeConfig.configureNotifications} component={ConfigureNotifications} />
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

// Custom tab navigator: renders the same tab screens but with the nav as a
// bottom bar (default) OR a left side rail on desktop, toggled via the persisted
// `navPosition` preference (set from the header on wide screens). All screens
// stay mounted (display-toggled) so per-tab state survives switching.
function ShellTabs({ initialRouteName, children, screenOptions }: any) {
  const { state, navigation, descriptors, NavigationContent } = useNavigationBuilder(TabRouter, {
    initialRouteName, children, screenOptions,
  });
  const navPosition = useAppSelector((s) => s.app.navPosition);
  const navExpanded = useAppSelector((s) => s.app.navExpanded);
  const role = useAppSelector((s) => s.auth.role);
  const upn = useAppSelector((s) => s.auth.user?.upn);
  const dispatch = useAppDispatch();
  const { width } = useWindowDimensions();
  const leftRail = navPosition === 'left' && width >= 900;

  const toggleExpanded = () => {
    const next = !navExpanded;
    dispatch(setNavExpanded(next));
    saveNavExpanded(upn, next); // persist per-user (cross-platform)
  };

  // `expanded` only applies to the vertical (left-rail) variant: it renders the
  // tab name beside the icon instead of icon-only.
  const renderTabButton = (route: any, i: number, vertical: boolean, expanded = false) => {
    const focused = state.index === i;
    const color = focused ? theme.colors.text : theme.colors.primary;
    const icon = descriptors[route.key].options.tabBarIcon;
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !(event as any).defaultPrevented) {
        navigation.dispatch({ ...TabActions.jumpTo(route.name), target: state.key });
      }
    };
    if (vertical && expanded) {
      return (
        <TouchableOpacity
          key={route.key}
          accessibilityRole="button"
          accessibilityState={{ selected: focused }}
          onPress={onPress}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            paddingHorizontal: 14,
            marginHorizontal: 6,
            marginBottom: 2,
            borderRadius: 8,
            backgroundColor: focused ? theme.colors.background : 'transparent',
          }}
        >
          {icon ? icon({ focused, color, size: 24 }) : null}
          <Text style={{ color, fontSize: 13, fontWeight: focused ? '700' : '500', marginLeft: 16 }} numberOfLines={1}>
            {route.name}
          </Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        onPress={onPress}
        style={[
          { alignItems: 'center', justifyContent: 'center' },
          vertical ? { paddingVertical: 8, marginBottom: 18 } : { flex: 1, paddingVertical: 8 },
        ]}
      >
        {icon ? icon({ focused, color, size: 24 }) : null}
        {/* Bottom bar keeps text labels; the collapsed left rail is icon-only. */}
        {!vertical ? <Text style={{ color, fontSize: 10, marginTop: 3 }} numberOfLines={1}>{route.name}</Text> : null}
      </TouchableOpacity>
    );
  };

  // Expanded-rail only: the overflow (Admin/More) subsections as labelled rows.
  // Tapping one jumps to the overflow tab and deep-navigates its nested stack.
  const renderSubsections = (overflowName: string) => {
    const sections = moreSectionsFor(role, { includeAccount: false });
    return (
      <View style={{ marginTop: 2, marginBottom: 6 }}>
        {sections.map((sec) => (
          <View key={sec.title}>
            {sec.title ? (
              <Text style={{ color: theme.colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 10, marginBottom: 2, marginLeft: 18 }}>
                {sec.title.toUpperCase()}
              </Text>
            ) : null}
            {sec.items.map((it) => (
              <TouchableOpacity
                key={it.route}
                accessibilityRole="button"
                accessibilityLabel={it.label}
                onPress={() => (navigation as any).navigate(overflowName, { screen: it.route })}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingLeft: 24, paddingRight: 12 }}
              >
                <MaterialCommunityIcons name={it.icon} color={theme.colors.primary} size={18} />
                <Text style={{ color: theme.colors.text, fontSize: 12, marginLeft: 12 }} numberOfLines={1}>
                  {it.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    );
  };

  const railWidth = navExpanded ? 248 : 64;
  return (
    <NavigationContent>
      {/* On very wide screens (e.g. 4K) centre the whole shell — rail + content
          — as one block, capped at railWidth + APP_MAX_WIDTH. Without this the
          rail hugs the far-left edge while the (1200-capped) content centres in
          the middle, leaving a huge dead gap between the menu and the content. */}
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: leftRail ? 'center' : 'stretch' }}>
        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: leftRail ? railWidth + APP_MAX_WIDTH : undefined,
            flexDirection: leftRail ? 'row' : 'column',
          }}
        >
        {leftRail ? (
          <ScrollView
            // flexGrow/Shrink:0 — RN-web ScrollView defaults to flex:1, which
            // would make it grow past the fixed width and eat the content area.
            style={{ width: railWidth, flexGrow: 0, flexShrink: 0, backgroundColor: theme.colors.darkDefault }}
            contentContainerStyle={{ paddingTop: 6, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Apps/squares toggle — expands the rail to show labels + subsections. */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={navExpanded ? 'Collapse menu' : 'Expand menu'}
              onPress={toggleExpanded}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: navExpanded ? 'flex-start' : 'center',
                paddingVertical: 10,
                paddingHorizontal: navExpanded ? 18 : 0,
                marginBottom: 10,
              }}
            >
              <MaterialCommunityIcons
                name={navExpanded ? 'menu-open' : 'menu'}
                color={theme.colors.text}
                size={24}
              />
              {navExpanded ? (
                <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700', marginLeft: 14 }}>Menu</Text>
              ) : null}
            </TouchableOpacity>

            {state.routes.map((r, i) => {
              const isOverflow = r.name === 'Admin' || r.name === 'More';
              return (
                <React.Fragment key={r.key}>
                  {renderTabButton(r, i, true, navExpanded)}
                  {navExpanded && isOverflow ? renderSubsections(r.name) : null}
                </React.Fragment>
              );
            })}
          </ScrollView>
        ) : null}
        <View style={{ flex: 1 }}>
          {state.routes.map((route, i) => (
            <View key={route.key} style={[StyleSheet.absoluteFill, { display: state.index === i ? 'flex' : 'none' }]}>
              {descriptors[route.key].render()}
            </View>
          ))}
        </View>
        {!leftRail ? (
          <View style={{ flexDirection: 'row', backgroundColor: theme.colors.background, width: '100%', maxWidth: APP_MAX_WIDTH, alignSelf: 'center' }}>
            {state.routes.map((r, i) => renderTabButton(r, i, false))}
          </View>
        ) : null}
        </View>
      </View>
    </NavigationContent>
  );
}
const createShellTabNavigator = createNavigatorFactory(ShellTabs as any);

const Tabs = createShellTabNavigator();
const MainTabs = () => {
  const role = useAppSelector((s) => s.auth.role);
  const overflow = role === 'admin' ? 'Admin' : 'More';
  return (
    <Tabs.Navigator>
      {CORE_TABS.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          component={tabComponents[name]}
          options={{ tabBarIcon: ({ color }: { color: string }) => <MaterialCommunityIcons name={tabIcons[name]} color={color} size={24} /> }}
        />
      ))}
      <Tabs.Screen
        key={overflow}
        name={overflow}
        component={MoreNavigation}
        options={{ tabBarIcon: ({ color }: { color: string }) => <MaterialCommunityIcons name={tabIcons[overflow]} color={color} size={24} /> }}
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
  const { signedIn, bypassed, role, user } = useAppSelector((s) => s.auth);
  const allowedIn = signedIn || bypassed;

  // When the user transitions from anonymous → signed-in (or boots into
  // an already-signed-in session restored from localStorage), every
  // role-gated slice needs to refetch. Without this they keep the
  // empty/limited public-role responses that loaded before sign-in,
  // and the user lands on screens with no data + no apparent buttons.
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!signedIn) {
      // Logged out → reset to the default placement + collapsed (toggle is hidden).
      dispatch(setNavPosition(DEFAULT_NAV_POSITION));
      dispatch(setNavExpanded(false));
      return;
    }
    refreshStoreForSignedInUser(dispatch, role);
    // Load this user's saved nav placement + rail expanded state (per-user,
    // cross-platform via AsyncStorage).
    loadNavPosition(user?.upn).then((p) => dispatch(setNavPosition(p)));
    loadNavExpanded(user?.upn).then((e) => dispatch(setNavExpanded(e)));
  }, [dispatch, signedIn, role, user?.upn]);

  return (
    <PaperProvider theme={customTheme} settings={{ icon: (props: any) => <MaterialCommunityIcons {...props} /> }}>
      <StatusBar style="light" />
      {booting ? (
        <SplashScreen />
      ) : (
      // Key the NavigationContainer on `allowedIn` so React fully
      // unmounts the pre-auth Account-only navigator and remounts the
      // tabs navigator when the user signs in mid-session. Without
      // the key change, React Navigation's internal state from the
      // old tree lingers — the user lands on the post-auth navigator
      // but stays focused on the leftover Account route with no tab
      // bar. Refreshing the page forced a clean remount, which is the
      // bug Lucas hit on app.skintyee.ca's first sign-in.
      <NavigationContainer
        key={allowedIn ? 'authed' : 'guest'}
        // Dark nav theme so the area behind the (1200px-capped) bottom tab bar
        // and screens is the app background, not React Navigation's default
        // light grey — which showed as a white band on wide/4K screens.
        theme={{
          ...NavDarkTheme,
          colors: {
            ...NavDarkTheme.colors,
            background: theme.colors.background,
            card: theme.colors.darkDefault,
            text: theme.colors.text,
            primary: theme.colors.primary,
          },
        }}
        // Browser-tab title format: "Skin Tyee · <Page>". Without this,
        // React Navigation web defaults to just the route's title — so
        // the user saw "Account" instead of "Skin Tyee · Account". The
        // bare app name (no route yet) renders "Skin Tyee".
        documentTitle={{
          formatter: (options, route) => {
            const page = (options?.title ?? route?.name ?? '').trim();
            return page ? `Skin Tyee · ${page}` : 'Skin Tyee';
          },
        }}
      >
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
