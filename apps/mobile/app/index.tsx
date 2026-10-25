import type { MissionSummary } from '@sira/shared';
import { Link, Stack } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { errorText, formatMissionDate, t, type MessageKey } from '../src/i18n';
import { useSession } from '../src/session';
import { colors, spacing, touchTarget, typography } from '../src/theme';
import { Button, Centered, Loading, Message } from '../src/ui';
import { useRequest } from '../src/use-request';

export default function MissionsScreen() {
  const { api, logout } = useSession();
  const { data, error, loading, reload } = useRequest(() => api.listMissions());

  const header = (
    <Stack.Screen
      options={{
        title: t('home.title'),
        headerRight: () => (
          <Pressable accessibilityRole="button" onPress={() => void logout()} hitSlop={12}>
            <Text style={styles.headerAction}>{t('home.logout')}</Text>
          </Pressable>
        ),
      }}
    />
  );

  if (loading && !data)
    return (
      <>
        {header}
        <Loading />
      </>
    );

  if (error && !data) {
    return (
      <>
        {header}
        <Centered>
          <Message text={errorText(error)} tone="danger" />
          <Button label={t('home.retry')} onPress={() => void reload()} variant="secondary" />
        </Centered>
      </>
    );
  }

  return (
    <>
      {header}
      <FlatList
        data={data?.missions ?? []}
        keyExtractor={(mission) => mission.id}
        renderItem={({ item }) => <MissionRow mission={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          error ? <Message text={errorText(error)} tone="danger" /> : undefined
        }
        ListEmptyComponent={<Message text={t('home.empty')} />}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}
        contentContainerStyle={styles.list}
      />
    </>
  );
}

function MissionRow({ mission }: { mission: MissionSummary }) {
  const date = formatMissionDate(mission.date);
  return (
    <Link href={{ pathname: '/missions/[id]', params: { id: mission.id } }} asChild>
      <Pressable accessibilityRole="button" style={styles.row}>
        <Text style={styles.rowTitle}>{mission.label ?? t('mission.untitled', { date })}</Text>
        <Text style={styles.rowDetail}>
          {date} · {stopCountText(mission.stopCount)} ·{' '}
          {t(`mission.status.${mission.status}` satisfies MessageKey)}
        </Text>
      </Pressable>
    </Link>
  );
}

function stopCountText(count: number): string {
  return count === 1 ? t('mission.stopCountOne') : t('mission.stopCount', { count });
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, flexGrow: 1 },
  row: { minHeight: touchTarget, paddingVertical: spacing.md, gap: spacing.xs },
  rowTitle: { fontSize: typography.body + 2, fontWeight: '700', color: colors.text },
  rowDetail: { fontSize: typography.body, color: colors.textMuted },
  separator: { height: 2, backgroundColor: colors.border },
  headerAction: { fontSize: typography.body, fontWeight: '700', color: colors.primary },
});
