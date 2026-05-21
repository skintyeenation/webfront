import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Avatar, Button, Card, Chip, Divider, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
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
  const isAdmin = role === 'admin';

  // No real auth yet — let the profile badge spoof admin in/out for demos.
  const toggleAdmin = () => dispatch(setRole(isAdmin ? 'member' : 'admin'));

  return (
    <PageContainer>
      <PageContent>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          {/* Tappable profile badge — spoofs admin in/out (dev only). */}
          <TouchableOpacity onPress={toggleAdmin} activeOpacity={0.8} style={{ width: 72, height: 72 }}>
            <Avatar.Icon size={72} icon="account" style={{ backgroundColor: theme.colors.primary }} />
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: isAdmin ? theme.colors.accent : theme.colors.darkDefault,
                borderWidth: 2,
                borderColor: theme.colors.background,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name={isAdmin ? 'shield-account' : 'shield-plus-outline'} size={16} color={isAdmin ? '#000' : theme.colors.primary} />
            </View>
          </TouchableOpacity>
          <Text style={{ color: theme.colors.text, fontSize: 18, marginTop: 10 }}>{name}</Text>
          <Chip
            compact
            style={{ marginTop: 6, backgroundColor: isAdmin ? theme.colors.accent : theme.colors.secondary }}
            textStyle={{ color: isAdmin ? '#000' : theme.colors.text, fontSize: 11 }}
          >
            {isAdmin ? 'ADMIN (spoofed)' : `role: ${role}`}
          </Chip>
          <Button
            mode={isAdmin ? 'outlined' : 'contained'}
            icon="shield-account"
            compact
            onPress={toggleAdmin}
            buttonColor={isAdmin ? undefined : theme.colors.accent}
            textColor={isAdmin ? theme.colors.accent : '#000'}
            style={{ marginTop: 12, borderColor: theme.colors.accent }}
          >
            {isAdmin ? 'Exit admin' : 'Spoof admin'}
          </Button>
          <Text style={{ color: theme.colors.textDarker, fontSize: 11, marginTop: 6 }}>No real sign-in yet — tap the badge to spoof admin.</Text>
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
