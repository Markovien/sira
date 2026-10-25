import { Pressable, StyleSheet, Text } from 'react-native';
import { useData } from './data';
import { formatClock, t } from './i18n';
import { colors, spacing, typography } from './theme';

/**
 * Etat de synchronisation, toujours visible en tete de liste : le livreur
 * doit savoir si ses saisies sont parties avant d'eteindre son telephone.
 * Un appui relance la synchronisation.
 */
export function SyncBanner() {
  const { syncState, sync } = useData();
  const { syncing, last, pending, rejected, lastSyncAt } = syncState;

  let text: string;
  let tone: string = colors.textMuted;
  if (syncing) text = t('sync.syncing');
  else if (last?.status === 'offline') {
    text = t('sync.offline');
    tone = colors.warning;
  } else if (lastSyncAt) text = t('sync.upToDate', { time: formatClock(new Date(lastSyncAt)) });
  else text = t('sync.never');

  return (
    <Pressable accessibilityRole="button" onPress={() => void sync()} style={styles.banner}>
      <Text style={[styles.text, { color: tone }]}>{text}</Text>
      {pending > 0 && (
        <Text style={[styles.text, { color: colors.warning }]}>
          {t('sync.pending', { count: pending })}
        </Text>
      )}
      {rejected > 0 && (
        <Text style={[styles.text, { color: colors.danger }]}>
          {t('sync.rejected', { count: rejected })}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { paddingVertical: spacing.sm, gap: spacing.xs },
  text: { fontSize: typography.body, fontWeight: '600' },
});
