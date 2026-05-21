import React, { useEffect, useState } from 'react';
import { FlatList, TouchableOpacity, View } from 'react-native';
import { Card, Chip, SegmentedButtons, Text } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import moment from 'moment';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadPolls } from 'skintyee/store/modules/polls';
import { PollKind } from 'skintyee/models';
import { theme } from 'skintyee/styles';

export default function Polls({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.polls);
  const role = useAppSelector((s) => s.auth.role);
  const canVote = role !== 'public'; // members, staff, admins can vote
  // Toggle between informal Surveys and formal Votes (vote on issues).
  const [kind, setKind] = useState<PollKind>('survey');

  useEffect(() => {
    dispatch(loadPolls());
  }, [dispatch]);

  const visible = entities.filter((p) => p.kind === kind);

  return (
    <PageContainer>
      <PageContent>
        <SegmentedButtons
          value={kind}
          onValueChange={(v) => setKind(v as PollKind)}
          density="small"
          style={{ marginBottom: 14 }}
          buttons={[
            { value: 'survey', label: 'Surveys', icon: 'poll' },
            { value: 'vote', label: 'Vote on Issues', icon: 'vote-outline' },
          ]}
        />

        {visible.length === 0 ? (
          <NoContent loading={loading || !loaded} message={kind === 'vote' ? 'No active votes.' : 'No active surveys.'} />
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => {
              const total = item.options.reduce((s, o) => s + o.votes, 0);
              const showVote = item.kind === 'vote' && !item.closed && canVote;
              return (
                <TouchableOpacity onPress={() => navigation.navigate('pollDetail', { id: item._id })}>
                  <Card style={{ marginBottom: 12, backgroundColor: theme.colors.darkDefault }}>
                    <Card.Content>
                      <Text style={{ color: theme.colors.text, fontSize: 16 }}>{item.question}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                        <Chip compact style={{ backgroundColor: theme.colors.secondary, marginRight: 8 }} textStyle={{ color: theme.colors.text, fontSize: 11 }}>
                          {item.closed ? 'Closed' : `Closes ${moment(item.closesAt).fromNow()}`}
                        </Chip>
                        <Text style={{ color: theme.colors.textDarker, fontSize: 12 }}>{total} votes</Text>
                      </View>
                      {showVote ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                          <MaterialCommunityIcons name="vote-outline" size={18} color={theme.colors.primary} />
                          <Text style={{ color: theme.colors.primary, marginLeft: 6, fontSize: 13 }}>Tap to cast your vote ›</Text>
                        </View>
                      ) : null}
                    </Card.Content>
                  </Card>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
