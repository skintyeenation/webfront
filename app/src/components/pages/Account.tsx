import React from 'react';
import { View } from 'react-native';
import { Avatar, Button, Card, Divider, Text } from 'react-native-paper';
import { PageContainer, PageContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { setRole } from 'skintyee/store/modules/auth';
import { Role } from 'skintyee/models';
import { theme } from 'skintyee/styles';

const ROLES: { role: Role; label: string; desc: string }[] = [
  { role: 'public', label: 'Public', desc: 'Anyone — events & public records only' },
  { role: 'member', label: 'Band Member', desc: 'Members — meetings, directory, voting' },
  { role: 'admin', label: 'Admin / Staff', desc: 'Staff — time keeping & financials' },
];

/**
 * Account screen. Today this is the STUB Role Switcher — there is no real auth yet
 * (see STUBS.md). Flipping the role re-filters the navigation tabs and screen
 * content so each actor's experience can be demoed. Replace this with a real
 * profile + sign-in/out once an identity provider (e.g. Entra ID) is wired up.
 */
export default function Account() {
  const dispatch = useAppDispatch();
  const { role, name } = useAppSelector((s) => s.auth);

  return (
    <PageContainer>
      <PageContent>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Avatar.Icon size={64} icon="account" style={{ backgroundColor: theme.colors.primary }} />
          <Text style={{ color: theme.colors.text, fontSize: 18, marginTop: 10 }}>{name}</Text>
          <Text style={{ color: theme.colors.textDarker }}>Current role: {role}</Text>
        </View>

        <Text style={{ color: theme.colors.textDarker, marginBottom: 8 }}>Switch role (development only)</Text>
        <Card style={{ backgroundColor: theme.colors.darkDefault }}>
          <Card.Content>
            {ROLES.map((r, i) => (
              <View key={r.role}>
                {i > 0 ? <Divider style={{ marginVertical: 6 }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: theme.colors.text }}>{r.label}</Text>
                    <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{r.desc}</Text>
                  </View>
                  <Button
                    mode={role === r.role ? 'contained' : 'outlined'}
                    compact
                    onPress={() => dispatch(setRole(r.role))}
                    buttonColor={role === r.role ? theme.colors.primary : undefined}
                    textColor={role === r.role ? '#000' : theme.colors.primary}
                    style={{ borderColor: theme.colors.defaultBorder }}
                  >
                    {role === r.role ? 'Active' : 'Use'}
                  </Button>
                </View>
              </View>
            ))}
          </Card.Content>
        </Card>
      </PageContent>
    </PageContainer>
  );
}
