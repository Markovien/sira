import type { GeocodeCandidate } from '@sira/shared';
import { randomUUID } from 'expo-crypto';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { KnownPlace } from '../../../src/core/local-db';
import { longPressPoint } from '../../../src/core/map-style';
import { useData } from '../../../src/data';
import { t } from '../../../src/i18n';
import { currentPosition } from '../../../src/platform/location';
import { useSession } from '../../../src/session';
import { colors, spacing, touchTarget, typography } from '../../../src/theme';
import { Button, Message } from '../../../src/ui';

interface Place {
  lat: number;
  lon: number;
  /** Ce que le livreur voit du lieu choisi. */
  name: string;
}

/** Laisser le livreur finir son mot avant d'interroger le reseau. */
const SEARCH_DEBOUNCE_MS = 500;

export default function AddStopScreen() {
  // lat/lon : arrivee depuis un appui long sur la carte.
  const params = useLocalSearchParams<{ id: string; lat?: string; lon?: string }>();
  const missionId = params.id;
  const fromMap =
    params.lat !== undefined && params.lon !== undefined
      ? longPressPoint([Number(params.lon), Number(params.lat)])
      : null;
  const { api } = useSession();
  const { db, written } = useData();

  const [query, setQuery] = useState('');
  const [known, setKnown] = useState<KnownPlace[]>([]);
  const [online, setOnline] = useState<GeocodeCandidate[] | 'unavailable' | null>(null);
  const [place, setPlace] = useState<Place | null>(() =>
    fromMap ? { ...fromMap, name: t('addStop.mapPoint') } : null,
  );
  const [nearby, setNearby] = useState<GeocodeCandidate[]>([]);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [informal, setInformal] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sources locale (immediate) puis en ligne (differee) — decisions.md, 25/10/2026.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setKnown([]);
      setOnline(null);
      return;
    }
    let current = true;
    void db.searchKnownPlaces(q).then((places) => current && setKnown(places));
    const timer = setTimeout(() => {
      api
        .searchAddresses(q)
        .then((result) => current && setOnline(result.candidates))
        .catch(() => current && setOnline('unavailable'));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, db, api]);

  // Point pose sur la carte : si une livraison a deja eu lieu tout pres, son
  // adresse et sa position confirmee valent mieux que le point du doigt. Hors
  // connexion, rien ne s'affiche et le point est garde tel quel.
  const mapLat = fromMap?.lat;
  const mapLon = fromMap?.lon;
  useEffect(() => {
    if (mapLat === undefined || mapLon === undefined) return;
    let current = true;
    api
      .nearbyAddresses({ lat: mapLat, lon: mapLon })
      .then((candidates) => current && setNearby(candidates))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [api, mapLat, mapLon]);

  function chooseKnown(p: KnownPlace) {
    setPlace({ lat: p.lat, lon: p.lon, name: p.label });
    setLabel(p.label);
    setAddress(p.addressText);
    setInformal(p.informalDescription ?? '');
  }

  function chooseCandidate(c: GeocodeCandidate) {
    setNearby([]);
    setPlace({ lat: c.lat, lon: c.lon, name: c.label });
    setAddress([c.label, c.commune, c.city].filter(Boolean).join(', '));
  }

  async function useMyPosition() {
    setNotice(null);
    const position = await currentPosition();
    if (!position) {
      setNotice(t('addStop.positionUnavailable'));
      return;
    }
    setPlace({ ...position, name: t('addStop.myPosition') });
  }

  async function save() {
    if (!place) return;
    setSaving(true);
    await db.addStop(
      missionId,
      {
        id: randomUUID(),
        label: label.trim(),
        lat: place.lat,
        lon: place.lon,
        addressText: address.trim(),
        informalDescription: informal.trim() || null,
        loadKg: 0,
        volumeL: 0,
        serviceMinutes: 5,
        priority: 'normal',
      },
      new Date(),
    );
    written();
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t('addStop.title') }} />

      {place ? (
        <View style={styles.chosen}>
          <Text style={styles.chosenText}>{t('addStop.place', { place: place.name })}</Text>
          <Button
            label={t('addStop.change')}
            variant="secondary"
            onPress={() => {
              setNearby([]);
              setPlace(null);
            }}
          />
          {nearby.length > 0 && <Text style={styles.section}>{t('addStop.nearby')}</Text>}
          {nearby.map((c) => (
            <Choice
              key={`${c.source}|${c.lat}|${c.lon}`}
              title={c.label}
              detail={[c.commune, c.city].filter(Boolean).join(', ')}
              onPress={() => chooseCandidate(c)}
            />
          ))}
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder={t('addStop.search')}
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          {known.length > 0 && <Text style={styles.section}>{t('addStop.known')}</Text>}
          {known.map((p) => (
            <Choice
              key={`${p.label}|${p.addressText}`}
              title={p.label}
              detail={p.informalDescription ?? p.addressText}
              onPress={() => chooseKnown(p)}
            />
          ))}
          {online === 'unavailable' && <Message text={t('addStop.onlineUnavailable')} />}
          {Array.isArray(online) && online.length > 0 && (
            <Text style={styles.section}>{t('addStop.online')}</Text>
          )}
          {Array.isArray(online) &&
            online.map((c) => (
              <Choice
                key={`${c.source}|${c.lat}|${c.lon}`}
                title={c.label}
                detail={[c.commune, c.city].filter(Boolean).join(', ')}
                onPress={() => chooseCandidate(c)}
              />
            ))}
          <Button
            label={t('addStop.useMyPosition')}
            variant="secondary"
            onPress={() => void useMyPosition()}
          />
          {notice && <Message text={notice} tone="danger" />}
        </>
      )}

      <Field label={t('addStop.label')} value={label} onChange={setLabel} testID="stop-label" />
      <Field
        label={t('addStop.address')}
        value={address}
        onChange={setAddress}
        testID="stop-address"
      />
      <Field
        label={t('addStop.informal')}
        value={informal}
        onChange={setInformal}
        multiline
        testID="stop-informal"
      />

      <Button
        label={t('addStop.save')}
        onPress={() => void save()}
        disabled={saving || !place || !label.trim() || !address.trim()}
      />
    </ScrollView>
  );
}

function Choice({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.choice}>
      <Text style={styles.choiceTitle}>{title}</Text>
      {detail.length > 0 && <Text style={styles.choiceDetail}>{detail}</Text>}
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  testID,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  /** Cible des parcours Maestro (`.maestro/`). */
  testID: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  section: { fontSize: typography.body, fontWeight: '700', color: colors.textMuted },
  chosen: { gap: spacing.sm },
  chosenText: { fontSize: typography.body + 2, fontWeight: '700', color: colors.success },
  choice: {
    minHeight: touchTarget,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  choiceTitle: { fontSize: typography.body, fontWeight: '700', color: colors.text },
  choiceDetail: { fontSize: typography.body - 2, color: colors.textMuted },
  field: { gap: spacing.xs },
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
  multiline: {
    minHeight: touchTarget * 2,
    textAlignVertical: 'top',
    paddingVertical: spacing.sm,
  },
});
