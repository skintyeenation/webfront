import React from 'react';
import { View, Text } from 'react-native';
import { Appbar } from 'react-native-paper';
import { theme } from 'lookup/styles';

interface Props {
  title?: string;
  navigation?: any;
  // RN navigation passes an object with { title } when there's a previous screen.
  back?: boolean | { title?: string };
  // Tolerate extra props passed by createStackNavigator's `header` option.
  [k: string]: any;
}

export default function AppHeader({ title, navigation, back }: Props) {
  return (
    <Appbar.Header style={{ backgroundColor: theme.colors.darkDefault, elevation: 0 }}>
      {back ? <Appbar.BackAction onPress={() => navigation?.goBack?.()} color={theme.colors.primary} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginLeft: back ? 0 : 12 }}>
        <Text style={{ fontFamily: theme.fonts.bold.fontFamily, fontWeight: '700', fontSize: 20, color: theme.colors.primary }}>
          Skin
        </Text>
        <Text style={{ fontFamily: theme.fonts.bold.fontFamily, fontWeight: '700', fontSize: 20, color: theme.colors.text, marginLeft: 4 }}>
          Tyee
        </Text>
        <Text style={{ fontFamily: theme.fonts.medium.fontFamily, fontSize: 13, color: theme.colors.textDarker, marginLeft: 10 }}>
          Lookup
        </Text>
        {title ? (
          <Text style={{ fontFamily: theme.fonts.regular.fontFamily, fontSize: 14, color: theme.colors.textDarker, marginLeft: 14 }}>
            · {title}
          </Text>
        ) : null}
      </View>
    </Appbar.Header>
  );
}
