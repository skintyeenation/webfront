import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, ProgressBar, Text } from 'react-native-paper';
import moment from 'moment';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadPoll, voteOnPoll } from 'skintyee/store/modules/polls';
import { theme } from 'skintyee/styles';

export default function PollDetail({ route }: any) {
  const dispatch = useAppDispatch();
  const id = route?.params?.id;
  const { selected, loading } = useAppSelector((s) => s.polls);
  // Public users can view results but not vote; members and admins can vote.
  const role = useAppSelector((s) => s.auth.role);
  const canVote = role === 'member' || role === 'admin';
  const [voted, setVoted] = useState<string | null>(null);

  useEffect(() => {
    if (id) dispatch(loadPoll(id));
  }, [dispatch, id]);

  if (!selected || selected._id !== id) {
    return (
      <PageContainer>
        <PageContent>
          <NoContent loading={loading} message="Poll not found." />
        </PageContent>
      </PageContainer>
    );
  }

  const total = selected.options.reduce((s, o) => s + o.votes, 0) || 1;

  const onVote = (optionId: string) => {
    setVoted(optionId);
    dispatch(voteOnPoll({ pollId: selected._id, optionId }));
  };

  return (
    <PageContainer>
      <PageContent>
        <Text style={{ color: theme.colors.text, fontSize: 20, marginBottom: 4 }}>{selected.question}</Text>
        <Text style={{ color: theme.colors.textDarker, marginBottom: 4 }}>{selected.description}</Text>
        <Text style={{ color: theme.colors.accent, marginBottom: 16 }}>
          {selected.closed ? 'Closed' : `Closes ${moment(selected.closesAt).format('MMM D, YYYY')}`}
        </Text>

        {selected.options.map((o) => {
          const pct = o.votes / total;
          return (
            <Card key={o.id} style={{ marginBottom: 10, backgroundColor: theme.colors.darkDefault }}>
              <Card.Content>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.colors.text }}>{o.label}</Text>
                  <Text style={{ color: theme.colors.textDarker }}>{Math.round(pct * 100)}%</Text>
                </View>
                <ProgressBar progress={pct} color={theme.colors.primary} style={{ marginTop: 8, height: 6, backgroundColor: theme.colors.secondary }} />
                {canVote && !selected.closed ? (
                  <Button
                    mode="outlined"
                    compact
                    disabled={voted === o.id}
                    onPress={() => onVote(o.id)}
                    style={{ marginTop: 10, borderColor: theme.colors.defaultBorder }}
                    textColor={theme.colors.primary}
                  >
                    {voted === o.id ? 'Voted' : 'Vote'}
                  </Button>
                ) : null}
              </Card.Content>
            </Card>
          );
        })}

        {!canVote ? (
          <Text style={{ color: theme.colors.textDarker, marginTop: 8 }}>
            Voting is for band members. Switch to a Band Member or Admin role on the Account page (tap the profile badge to spoof admin) to cast a vote.
          </Text>
        ) : null}
      </PageContent>
    </PageContainer>
  );
}
