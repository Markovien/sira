import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { navigationLinks, openFirst } from '../../src/core/navigation';
import {
  displayedStops,
  routeStopsOf,
  startPoint,
  type DisplayedStop,
} from '../../src/core/mission-view';
import { planRoute, type OnDeviceRoute } from '../../src/core/optimize';
import {
  errorText,
  formatClock,
  formatDistance,
  formatDuration,
  formatMissionDate,
  t,
  type MessageKey,
} from '../../src/i18n';
import { currentPosition } from '../../src/platform/location';
import { useSession } from '../../src/session';
import { colors, spacing, typography } from '../../src/theme';
import { Button, Centered, Loading, Message } from '../../src/ui';
import { useRequest } from '../../src/use-request';

interface Plan {
  route: OnDeviceRoute;
  departure: Date;
  fromPosition: boolean;
}

export default function MissionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const { data: mission, error, loading, reload } = useRequest(() => api.getMission(id));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (loading && !mission) return <Loading />;
  if (!mission) {
    return (
      <Centered>
        <Message text={error ? errorText(error) : t('error.unknown')} tone="danger" />
        <Button label={t('home.retry')} onPress={() => void reload()} variant="secondary" />
      </Centered>
    );
  }

  const title =
    mission.label ?? t('mission.untitled', { date: formatMissionDate(mission.date) });
  const remaining = routeStopsOf(mission.stops);

  async function optimize() {
    setOptimizing(true);
    setNotice(null);
    const position = await currentPosition();
    const start = startPoint(position, remaining);
    if (start) {
      const departure = new Date();
      // Hors connexion pour l'instant : les matrices OSRM via l'API arriveront
      // avec la synchronisation (lot 3).
      const route = planRoute({ start, stops: remaining, departure });
      setPlan({ route, departure, fromPosition: position !== null });
    }
    setOptimizing(false);
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
            {plan && <PlanSummary plan={plan} />}
            {notice && <Message text={notice} tone="danger" />}
            {remaining.length > 0 ? (
              <Button
                label={t(optimizing ? 'mission.optimizing' : 'mission.optimize')}
                onPress={() => void optimize()}
                disabled={optimizing}
              />
            ) : (
              mission.stops.length === 0 && <Message text={t('mission.noStops')} />
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <StopRow item={item} rank={index + 1} onGo={() => void goTo(item)} />
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
      {plan.route.source === 'fallback' && (
        <Text style={styles.planNote}>{t('route.estimateOffline')}</Text>
      )}
    </View>
  );
}

function StopRow({
  item,
  rank,
  onGo,
}: {
  item: DisplayedStop;
  rank: number;
  onGo: () => void;
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
      {pending && <Button label={t('stop.goThere')} onPress={onGo} variant="secondary" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.md },
  summary: { gap: spacing.md, marginBottom: spacing.md },
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
});
