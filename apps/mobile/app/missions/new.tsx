import { randomUUID } from 'expo-crypto';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { abidjanDay } from '../../src/core/dates';
import { useData } from '../../src/data';
import { formatMissionDate, t } from '../../src/i18n';
import { colors, spacing, touchTarget, typography } from '../../src/theme';
import { Button } from '../../src/ui';

export default function NewMissionScreen() {
  const { db, written } = useData();
  const [label, setLabel] = useState('');
  const [offset, setOffset] = useState<0 | 1>(0);
  const [saving, setSaving] = useState(false);
  const day = abidjanDay(new Date(), offset);

  async function create() {
    setSaving(true);
    const id = randomUUID();
    const trimmed = label.trim();
    // Ecrite en local d'abord : la mission existe tout de suite, reseau ou non.
    await db.createMission(
      { id, date: day, ...(trimmed ? { label: trimmed } : {}) },
      new Date(),
    );
    written();
    router.replace({ pathname: '/missions/[id]', params: { id } });
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('newMission.title') }} />
      <Text style={styles.label}>{t('newMission.label')}</Text>
      <TextInput
        style={styles.input}
        value={label}
        onChangeText={setLabel}
        placeholder={t('newMission.labelPlaceholder')}
        placeholderTextColor={colors.textMuted}
        maxLength={160}
      />
      <Text style={styles.label}>{t('newMission.day')}</Text>
      <View style={styles.choices}>
        {([0, 1] as const).map((value) => (
          <View key={value} style={styles.choice}>
            <Button
              label={t(value === 0 ? 'newMission.today' : 'newMission.tomorrow')}
              variant={offset === value ? 'primary' : 'secondary'}
              onPress={() => setOffset(value)}
            />
          </View>
        ))}
      </View>
      <Text style={styles.hint}>{formatMissionDate(`${day}T00:00:00.000Z`)}</Text>
      <Button label={t('newMission.create')} onPress={() => void create()} disabled={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  label: { fontSize: typography.body, fontWeight: '700', color: colors.text },
  input: {
    minHeight: touchTarget,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
    color: colors.text,
  },
  choices: { flexDirection: 'row', gap: spacing.md },
  choice: { flex: 1 },
  hint: { fontSize: typography.body, color: colors.textMuted },
});
