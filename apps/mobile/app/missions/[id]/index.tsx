import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import type { Coordinates } from '@sira/shared';
import {
  displayedStops,
  routeStopsOf,
  startPoint,
  type DisplayedStop,
} from '../../../src/core/mission-view';
import { navigationLinks, openFirst } from '../../../src/core/navigation';
import { planRoute, type OnDeviceRoute, type RoutedMatrices } from '../../../src/core/optimize';
import { useLocal } from '../../../src/data';
import {
  formatClock,
  formatDistance,
  formatDuration,
  formatMissionDate,
  t,
  type MessageKey,
} from '../../../src/i18n';
import { currentPosition } from '../../../src/platform/location';
import { useSession } from '../../../src/session';
import { colors, spacing, typography } from '../../../src/theme';
import { Button, Loading, Message } from '../../../src/ui';

interface Plan {
  route: OnDeviceRoute;
  departure: Date;
  fromPosition: boolean;
}

export default function MissionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, state } = useSession();
  const mission = useLocal((db) => db.getMission(id));
  const pending = useLocal((db) => db.missionsWithPendingChanges());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (mission === undefined) return <Loading />;
  if (mission === null) return <Message text={t('error.unknown')} tone="danger" />;

  const title =
    mission.label ?? t('mission.untitled', { date: formatMissionDate(mission.date) });
  const remaining = routeStopsOf(mission.stops);
  // Un arret du plan a ete traite depuis : le plan affiche ne vaut plus pour
  // la suite, un appui recalcule l'ordre des arrets restants depuis ici.
  const stale =
    plan !== null &&
    plan.route.stops.some((p) => !remaining.some((stop) => stop.id === p.stopId));
  const canEdit =
    state.status === 'signedIn' && state.user.role !== 'driver' && mission.status === 'draft';

  async function optimize() {
    setOptimizing(true);
    setNotice(null);
    const position = await currentPosition();
    const start = startPoint(position, remaining);
    if (start) {
      const departure = new Date();
      const routed = await routedMatrices([start, ...remaining]);
      const route = planRoute({
        start,
        stops: remaining,
        departure,
        ...(routed ? { routed } : {}),
      });
      setPlan({ route, departure, fromPosition: position !== null });
    }
    setOptimizing(false);
  }

  /** Matrices OSRM si le reseau repond vite, sinon repli (decisions.md, 25/10/2026). */
  async function routedMatrices(points: Coordinates[]): Promise<RoutedMatrices | null> {
    if (points.length < 2) return null;
    try {
      return await api.routingTable(points);
    } catch {
      return null;
    }
  }

  async function goTo({ stop }: DisplayedStop) {
    const opened = await openFirst(navigationLinks(stop, 'google', stop.label), (url) =>
      Linking.openURL(url),
    );
    if (!opened) setNotice(t('stop.noNavigationApp'));
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title }} />
      <FlatList
        data={displayedStops(mission.stops, plan)}
        keyExtractor={({ stop }) => stop.id}
        ListHeaderComponent={
          <View style={styles.summary}>
            {pending?.has(mission.id) && (
              <Text style={styles.pending}>{t('mission.notSynced')}</Text>
            )}
            {plan && <PlanSummary plan={plan} />}
            {notice && <Message text={notice} tone="danger" />}
            {remaining.length > 0 && (
              <Button
                label={t(
                  optimizing
                    ? 'mission.optimizing'
                    : stale
                      ? 'mission.reoptimize'
                      : 'mission.optimize',
                )}
                onPress={() => void optimize()}
                disabled={optimizing}
              />
            )}
            {canEdit && (
              <Button
                label={t('mission.addStop')}
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/missions/[id]/add-stop',
                    params: { id: mission.id },
                  })
                }
              />
            )}
            {mission.stops.length === 0 && <Message text={t('mission.noStops')} />}
          </View>
        }
        renderItem={({ item, index }) => (
          <StopRow
            item={item}
            rank={index + 1}
            onGo={() => void goTo(item)}
            onRecord={() =>
              router.push({
                pathname: '/missions/[id]/stops/[stopId]',
                params: { id: mission.id, stopId: item.stop.id },
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function PlanSummary({ plan }: { plan: Plan }) {
  return (
    <View style={styles.planBox}>
      <Text style={styles.planLine}>
        {t('route.duration', { duration: formatDuration(plan.route.totalSeconds) })}
      </Text>
      <Text style={styles.planLine}>
        {t('route.distance', { distance: formatDistance(plan.route.distanceMeters) })}
      </Text>
      <Text style={styles.planNote}>
        {t(plan.fromPosition ? 'mission.startFromPosition' : 'mission.startFromFirstStop')}
      </Text>
      <Text style={styles.planNote}>
        {t(plan.route.source === 'osrm' ? 'route.estimateRouted' : 'route.estimateOffline')}
      </Text>
    </View>
  );
}

function StopRow({
  item,
  rank,
  onGo,
  onRecord,
}: {
  item: DisplayedStop;
  rank: number;
  onGo: () => void;
  onRecord: () => void;
}) {
  const { stop, eta } = item;
  const pending = stop.status === 'pending';
  return (
    <View style={styles.stop}>
      <Text style={styles.stopTitle}>
        {rank}. {stop.label}
      </Text>
      <Text style={styles.stopText}>{stop.addressText}</Text>
      {stop.informalDescription && (
        <Text style={styles.stopHint}>{stop.informalDescription}</Text>
      )}
      <Text style={[styles.stopText, !pending && { color: colors.success }]}>
        {t(`stop.status.${stop.status}` satisfies MessageKey)}
        {eta ? ` · ${t('stop.eta', { time: formatClock(eta) })}` : ''}
      </Text>
      {pending && (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button label={t('stop.goThere')} onPress={onGo} variant="secondary" />
          </View>
          <View style={styles.action}>
            <Button label={t('stop.record')} onPress={onRecord} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.md },
  summary: { gap: spacing.md, marginBottom: spacing.md },
  pending: { fontSize: typography.body, fontWeight: '600', color: colors.warning },
  planBox: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.xs,
  },
  planLine: { fontSize: typography.body + 2, fontWeight: '700', color: colors.text },
  planNote: { fontSize: typography.body, color: colors.textMuted },
  stop: { paddingVertical: spacing.md, gap: spacing.xs },
  stopTitle: { fontSize: typography.body + 2, fontWeight: '700', color: colors.text },
  stopText: { fontSize: typography.body, color: colors.text },
  stopHint: { fontSize: typography.body, color: colors.textMuted, fontStyle: 'italic' },
  separator: { height: 2, backgroundColor: colors.border },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
