import React, { useEffect } from 'react';
import { FlatList, View } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import { PageContainer, PageContent, NoContent } from 'skintyee/components/layout';
import { useAppDispatch, useAppSelector } from 'skintyee/store';
import { loadFinancials } from 'skintyee/store/modules/financials';
import { theme } from 'skintyee/styles';

const currency = (n: number) => `$${n.toLocaleString('en-CA')}`;

// Admin only — gated in routes. Financial records.
export default function Financials() {
  const dispatch = useAppDispatch();
  const { entities, loading, loaded } = useAppSelector((s) => s.financials);

  useEffect(() => {
    dispatch(loadFinancials());
  }, [dispatch]);

  return (
    <PageContainer>
      <PageContent>
        {entities.length === 0 ? (
          <NoContent loading={loading || !loaded} message="No financial records." />
        ) : (
          <FlatList
            data={entities}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <Card style={{ marginBottom: 10, backgroundColor: theme.colors.darkDefault }}>
                <Card.Content>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: theme.colors.text, fontSize: 16, flex: 1 }}>{item.title}</Text>
                    <Text style={{ color: theme.colors.success, fontSize: 16 }}>{currency(item.amount)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    <Chip compact style={{ backgroundColor: theme.colors.secondary, marginRight: 8 }} textStyle={{ color: theme.colors.text, fontSize: 11 }}>
                      {item.category}
                    </Chip>
                    <Text style={{ color: theme.colors.textDarker }}>{item.period}</Text>
                  </View>
                  {item.notes ? <Text style={{ color: theme.colors.textDarker, marginTop: 6 }}>{item.notes}</Text> : null}
                </Card.Content>
              </Card>
            )}
          />
        )}
      </PageContent>
    </PageContainer>
  );
}
