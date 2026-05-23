import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer, DarkTheme as NavDarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createMaterialBottomTabNavigator } from '@react-navigation/material-bottom-tabs';
import { Provider as PaperProvider, Portal } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { theme } from 'lookup/styles';
import { AppHeader } from 'lookup/components/layout';

import Home from 'lookup/components/pages/Home';
import BusinessLookup from 'lookup/components/pages/BusinessLookup';
import MoneyLookup from 'lookup/components/pages/MoneyLookup';
import NationsLookup from 'lookup/components/pages/NationsLookup';
import NationDetail from 'lookup/components/pages/NationDetail';
import Run from 'lookup/components/pages/Run';
import Results from 'lookup/components/pages/Results';
import History from 'lookup/components/pages/History';

const HomeStack = createStackNavigator();
const HomeNav = () => (
  <HomeStack.Navigator screenOptions={{ header: (props) => <AppHeader {...props} /> }}>
    <HomeStack.Screen name="Home" component={Home} options={{ title: '' }} />
    <HomeStack.Screen name="Run" component={Run} options={{ title: 'Running…' }} />
    <HomeStack.Screen name="Results" component={Results} options={{ title: 'Results' }} />
  </HomeStack.Navigator>
);

const BusinessStack = createStackNavigator();
const BusinessNav = () => (
  <BusinessStack.Navigator screenOptions={{ header: (props) => <AppHeader {...props} /> }}>
    <BusinessStack.Screen name="Business" component={BusinessLookup} options={{ title: 'Business' }} />
    <BusinessStack.Screen name="Run" component={Run} options={{ title: 'Running…' }} />
    <BusinessStack.Screen name="Results" component={Results} options={{ title: 'Results' }} />
  </BusinessStack.Navigator>
);

const MoneyStack = createStackNavigator();
const MoneyNav = () => (
  <MoneyStack.Navigator screenOptions={{ header: (props) => <AppHeader {...props} /> }}>
    <MoneyStack.Screen name="Money" component={MoneyLookup} options={{ title: 'Money' }} />
    <MoneyStack.Screen name="Run" component={Run} options={{ title: 'Running…' }} />
    <MoneyStack.Screen name="Results" component={Results} options={{ title: 'Results' }} />
  </MoneyStack.Navigator>
);

const NationsStack = createStackNavigator();
const NationsNav = () => (
  <NationsStack.Navigator screenOptions={{ header: (props) => <AppHeader {...props} /> }}>
    <NationsStack.Screen name="Nations" component={NationsLookup} options={{ title: 'Nations' }} />
    <NationsStack.Screen name="Run" component={Run} options={{ title: 'Running…' }} />
    <NationsStack.Screen name="Results" component={Results} options={{ title: 'Results' }} />
    <NationsStack.Screen name="NationDetail" component={NationDetail} options={{ title: 'Nation' }} />
  </NationsStack.Navigator>
);

const HistoryStack = createStackNavigator();
const HistoryNav = () => (
  <HistoryStack.Navigator screenOptions={{ header: (props) => <AppHeader {...props} /> }}>
    <HistoryStack.Screen name="HistoryList" component={History} options={{ title: 'History' }} />
    <HistoryStack.Screen name="Results" component={Results} options={{ title: 'Results' }} />
  </HistoryStack.Navigator>
);

const Tabs = createMaterialBottomTabNavigator();

const tabIcons: Record<string, string> = {
  Home: 'view-dashboard-outline',
  Nations: 'feather',
  Business: 'office-building-outline',
  Funding: 'cash-multiple',
  History: 'history',
};

export default function Application() {
  // Paper v5 needs an explicit icon source for Checkbox/Card.Title/Chip etc.,
  // otherwise the Icon component crashes the page at first render. Mirror what
  // @skintyee/app does.
  const paperSettings = { icon: (props: any) => <MaterialCommunityIcons {...props} /> };
  // Match React Navigation's theme to ours so the area outside the
  // centered (maxWidth 1100) content stays dark instead of bare-browser white.
  const navTheme = {
    ...NavDarkTheme,
    colors: {
      ...NavDarkTheme.colors,
      background: theme.colors.background,
      card: theme.colors.darkDefault,
      text: theme.colors.text,
      border: theme.colors.defaultBorder,
      primary: theme.colors.primary,
    },
  };
  return (
    <PaperProvider theme={theme as any} settings={paperSettings}>
      <Portal.Host>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <Tabs.Navigator
          activeColor={theme.colors.primary}
          inactiveColor={theme.colors.textDarker}
          barStyle={{ backgroundColor: theme.colors.darkDefault }}
          shifting={false}
          screenOptions={({ route }: any) => ({
            tabBarIcon: ({ color }: any) => (
              <MaterialCommunityIcons name={tabIcons[route.name] ?? 'circle'} size={22} color={color} />
            ),
          })}
        >
          <Tabs.Screen name="Home" component={HomeNav} />
          <Tabs.Screen name="Nations" component={NationsNav} />
          <Tabs.Screen name="Business" component={BusinessNav} />
          <Tabs.Screen name="Funding" component={MoneyNav} />
          <Tabs.Screen name="History" component={HistoryNav} />
        </Tabs.Navigator>
      </NavigationContainer>
      </Portal.Host>
    </PaperProvider>
  );
}
