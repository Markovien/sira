import type { Stop } from '@sira/shared';
import { randomUUID } from 'expo-crypto';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import type { StopOutcome } from '../../../../src/core/local-db';
import { useData, useLocal } from '../../../../src/data';
import { t, type MessageKey } from '../../../../src/i18n';
import { proofPhotoUri, takeProofPhoto } from '../../../../src/platform/proof-files';
import { SignaturePad, SignaturePreview, type Signature } from '../../../../src/signature-pad';
import { colors, spacing, touchTarget, typography } from '../../../../src/theme';
import { Button, Loading, Message } from '../../../../src/ui';

type Status = StopOutcome['status'];

const REASONS = [
  'outcome.reasonAbsent',
  'outcome.reasonNotFound',
  'outcome.reasonRefused',
] as const;

export default function StopScreen() {
  const { id: missionId, stopId } = useLocalSearchParams<{ id: string; stopId: string }>();
  const { db, written } = useData();
  const mission = useLocal((local) => local.getMission(missionId));
  const [status, setStatus] = useState<Status | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  // Change a chaque effacement : remonte un pave vierge.
  const [padKey, setPadKey] = useState(0);
  const scroll = useRef<ScrollViewInstance>(null);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (mission === undefined) return <Loading />;
  const stop: Stop | undefined = mission?.stops.find((s) => s.id === stopId);
  if (!stop) return <Message text={t('error.unknown')} tone="danger" />;

  const finalReason = reason === 'other' ? otherReason.trim() : reason;
  const ready = status === 'delivered' || (status !== null && !!finalReason);

  // Le defilement est bloque pendant la signature, sinon le trace ferait
  // defiler la page : on amene d'abord le pave a l'ecran, sous le pli sinon.
  function startSigning() {
    setSigning(true);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 0);
  }

  async function photograph() {
    const name = await takeProofPhoto(randomUUID());
    if (name) setPhoto(name);
  }

  async function confirm() {
    if (!status || !stop) return;
    setSaving(true);
    const now = new Date();
    // Preuves d'abord : rattachees a l'arret, gardees 30 jours sur le telephone.
    if (photo) {
      await db.addProof({
        id: randomUUID(),
        stopId: stop.id,
        kind: 'photo',
        data: photo,
        createdAt: now.toISOString(),
      });
    }
    if (signature) {
      await db.addProof({
        id: randomUUID(),
        stopId: stop.id,
        kind: 'signature',
        data: JSON.stringify(signature),
        createdAt: now.toISOString(),
      });
    }
    const { clockWentBack } = await db.recordOutcome(
      missionId,
      stop.id,
      { status, failureReason: status === 'delivered' ? null : finalReason },
      now,
    );
    written();
    if (clockWentBack) {
      // Le livreur doit savoir que la saisie sera signalee, sans etre bloque.
      setNotice(t('outcome.clockWarning'));
      setTimeout(() => router.back(), 2_500);
      return;
    }
    router.back();
  }

  if (stop.status !== 'pending') {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: stop.label }} />
        <Message
          text={t('outcome.alreadyDone', {
            status: t(`stop.status.${stop.status}` satisfies MessageKey),
          })}
        />
      </View>
    );
  }

  return (
    <ScrollView ref={scroll} contentContainerStyle={styles.container} scrollEnabled={!signing}>
      <Stack.Screen options={{ title: stop.label }} />
      <Text style={styles.address}>{stop.addressText}</Text>
      {stop.informalDescription && <Text style={styles.hint}>{stop.informalDescription}</Text>}

      <Text style={styles.section}>{t('outcome.title')}</Text>
      <View style={styles.choices}>
        {(['delivered', 'failed', 'postponed'] as const).map((value) => (
          <View key={value} style={styles.choice}>
            <Button
              label={t(`outcome.${value}`)}
              variant={status === value ? 'primary' : 'secondary'}
              onPress={() => setStatus(value)}
            />
          </View>
        ))}
      </View>

      {status && status !== 'delivered' && (
        <>
          <Text style={styles.section}>{t('outcome.reason')}</Text>
          {REASONS.map((key) => (
            <Button
              key={key}
              label={t(key)}
              variant={reason === t(key) ? 'primary' : 'secondary'}
              onPress={() => setReason(t(key))}
            />
          ))}
          <Button
            label={t('outcome.reasonOther')}
            variant={reason === 'other' ? 'primary' : 'secondary'}
            onPress={() => setReason('other')}
          />
          {reason === 'other' && (
            <TextInput
              style={styles.input}
              value={otherReason}
              onChangeText={setOtherReason}
              placeholder={t('outcome.reasonPlaceholder')}
              placeholderTextColor={colors.textMuted}
              maxLength={400}
              autoFocus
            />
          )}
        </>
      )}

      {status === 'delivered' && (
        <>
          <Text style={styles.section}>{t('outcome.proof')}</Text>
          {photo && (
            <Image
              source={{ uri: proofPhotoUri(photo) }}
              style={styles.photo}
              accessibilityLabel={t('outcome.photoTaken')}
            />
          )}
          <Button
            label={t(photo ? 'outcome.retakePhoto' : 'outcome.takePhoto')}
            variant="secondary"
            onPress={() => void photograph()}
          />
          {signature && !signing && (
            <>
              <SignaturePreview signature={signature} />
              <Button label={t('outcome.resign')} variant="secondary" onPress={startSigning} />
            </>
          )}
          {signing ? (
            <>
              <SignaturePad key={padKey} onChange={setSignature} />
              <Button
                label={t('outcome.signatureDone')}
                onPress={() => setSigning(false)}
                disabled={!signature}
              />
              <Button
                label={t('outcome.clearSignature')}
                variant="secondary"
                onPress={() => {
                  setSignature(null);
                  setPadKey((k) => k + 1);
                }}
              />
            </>
          ) : (
            !signature && (
              <Button label={t('outcome.sign')} variant="secondary" onPress={startSigning} />
            )
          )}
        </>
      )}

      {notice && <Message text={notice} tone="danger" />}
      {status && (
        <Button
          label={t('outcome.confirm', { status: t(`outcome.${status}`) })}
          onPress={() => void confirm()}
          disabled={!ready || saving}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  address: { fontSize: typography.body + 2, fontWeight: '700', color: colors.text },
  hint: { fontSize: typography.body, color: colors.textMuted, fontStyle: 'italic' },
  section: {
    fontSize: typography.body,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  choices: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1 },
  input: {
    minHeight: touchTarget,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
    color: colors.text,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
  },
});
