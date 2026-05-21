import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent, AdminAddButton } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadTimeEntries, approveTimeEntry } from 'skintyee/store/modules/timekeeping';
import { theme } from 'skintyee/styles';

const cleanName = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').trim();

// Time keeping. Staff submit/view their own timesheets; admins see everyone's
// and can approve. Reachable for staff ("My Timesheets") and admins ("Time Keeping").
export default function TimeKeeping({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.timekeeping);
  const role = useAppSelector((s) => s.auth.role);
  const me = cleanName(useAppSelector((s) => s.auth.name));
  const isAdmin = role === 'admin';

  useEffect(() => {
    dispatch(loadTimeEntries());
  }, [dispatch]);

  // Admins see all entries; staff/members see only their own.
  const visible = isAdmin ? entities : entities.filter((e) => e.workerName === me);
  const totalHours = visible.reduce((sum, e) => sum + e.hours, 0);

  return (
    <PageContainer>
      <PageContent>
        <AdminAddButton label="Add timesheet" icon="clock-plus-outline" roles={['staff', 'admin']} onPress={() => navigation.navigate('timesheetCreate')} />

        {visible.length === 0 ? (
          <NoContent loading={loading || !loaded} message={isAdmin ? 'No time entries logged.' : 'You have no timesheets yet.'} />
        ) : (
          <>
            <Text style={{ color: theme.colors.textDarker, marginBottom: 10 }}>
              {isAdmin ? 'All workers' : 'Your timesheets'} · {totalHours} hrs total
            </Text>
            {visible.map((item) => (
              <Card key={item._id} style={{ marginBottom: 10, backgroundColor: theme.colors.darkDefault }}>
                <Card.Content>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.colors.text, fontSize: 16 }}>{item.workerName}</Text>
                    <Chip compact style={{ backgroundColor: item.approved ? theme.colors.success : theme.colors.secondary }} textStyle={{ color: item.approved ? '#000' : theme.colors.text, fontSize: 11 }}>
                      {item.approved ? 'Approved' : 'Pending'}
                    </Chip>
                  </View>
                  <Text style={{ color: theme.colors.accent, marginTop: 4 }}>{item.hours} hrs · {moment(item.date).format('MMM D')}</Text>
                  <Text style={{ color: theme.colors.textDarker, marginTop: 2 }}>{item.task}</Text>
                  {isAdmin && !item.approved ? (
                    <Button mode="outlined" compact icon="check" textColor={theme.colors.success} style={{ marginTop: 8, alignSelf: 'flex-start', borderColor: theme.colors.success }} onPress={() => dispatch(approveTimeEntry(item._id))}>
                      Approve
                    </Button>
                  ) : null}
                </Card.Content>
              </Card>
            ))}
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}
