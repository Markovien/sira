import { Link, Stack, router } from 'expo-router';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { LocalMissionSummary } from '../src/core/local-db';
import { purgeProofs } from '../src/core/proofs';
import { useData, useLocal } from '../src/data';
import { formatMissionDate, t, type MessageKey } from '../src/i18n';
import { proofFiles } from '../src/platform/proof-files';
import { useSession } from '../src/session';
import { SyncBanner } from '../src/sync-banner';
import { colors, spacing, touchTarget, typography } from '../src/theme';
import { Button, Loading, Message } from '../src/ui';

export default function MissionsScreen() {
  const { state, logout } = useSession();
  const { db, syncState, sync } = useData();
  const missions = useLocal((local) => local.listMissions());
  // Un livreur de flotte execute les tournees qu'on lui affecte ; un
  // independant, administrateur de sa propre organisation, cree les siennes.
  const canCreate = state.status === 'signedIn' && state.user.role !== 'driver';

  function confirmLogout() {
    const lines = [
      syncState.pending > 0 ? t('home.logoutPending', { count: syncState.pending }) : null,
      t('home.logoutClears'),
    ].filter((line): line is string => line !== null);
    Alert.alert(t('home.logoutTitle'), lines.join('\n'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('home.logout'),
        style: 'destructive',
        onPress: () =>
          void db
            .reset()
            .then(() => purgeProofs(db, proofFiles, new Date()))
            .then(logout),
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('home.title'),
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={confirmLogout} hitSlop={12}>
              <Text style={styles.headerAction}>{t('home.logout')}</Text>
            </Pressable>
          ),
        }}
      />
      {missions === undefined ? (
        <Loading />
      ) : (
        <FlatList
          data={missions}
          keyExtractor={(mission) => mission.id}
          renderItem={({ item }) => <MissionRow mission={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <SyncBanner />
              {canCreate && (
                <Button
                  label={t('home.newMission')}
                  onPress={() => router.push('/missions/new')}
                />
              )}
            </View>
          }
          ListEmptyComponent={<Message text={t('home.empty')} />}
          refreshControl={
            <RefreshControl refreshing={syncState.syncing} onRefresh={() => void sync()} />
          }
          contentContainerStyle={styles.list}
        />
      )}
    </>
  );
}

function MissionRow({ mission }: { mission: LocalMissionSummary }) {
  const date = formatMissionDate(mission.date);
  return (
    <Link href={{ pathname: '/missions/[id]', params: { id: mission.id } }} asChild>
      <Pressable accessibilityRole="button" style={styles.row}>
        <Text style={styles.rowTitle}>{mission.label ?? t('mission.untitled', { date })}</Text>
        <Text style={styles.rowDetail}>
          {date} · {stopCountText(mission.stopCount)} ·{' '}
          {t(`mission.status.${mission.status}` satisfies MessageKey)}
        </Text>
        {mission.pendingChanges > 0 && (
          <Text style={styles.pending}>{t('mission.notSynced')}</Text>
        )}
      </Pressable>
    </Link>
  );
}

function stopCountText(count: number): string {
  return count === 1 ? t('mission.stopCountOne') : t('mission.stopCount', { count });
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  row: { minHeight: touchTarget, paddingVertical: spacing.md, gap: spacing.xs },
  rowTitle: { fontSize: typography.body + 2, fontWeight: '700', color: colors.text },
  rowDetail: { fontSize: typography.body, color: colors.textMuted },
  pending: { fontSize: typography.body, fontWeight: '600', color: colors.warning },
  separator: { height: 2, backgroundColor: colors.border },
  headerAction: { fontSize: typography.body, fontWeight: '700', color: colors.primary },
});
