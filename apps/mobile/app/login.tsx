import { Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import { describeError } from '../src/core/errors';
import { errorText, t } from '../src/i18n';
import { useSession } from '../src/session';
import { colors, spacing, touchTarget, typography } from '../src/theme';
import { Button, Message } from '../src/ui';

export default function LoginScreen() {
  const { login } = useSession();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await login(phone, password);
    } catch (e) {
      setError(errorText(describeError(e)));
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="height" style={styles.container}>
      <Stack.Screen options={{ title: t('login.title') }} />
      <Text style={styles.brand}>{t('app.name')}</Text>
      <Text style={styles.tagline}>{t('app.tagline')}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>{t('login.phone')}</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('login.phonePlaceholder')}
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{t('login.password')}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          onSubmitEditing={() => void submit()}
        />
      </View>

      {error && <Message text={error} tone="danger" />}
      <Button
        label={t(submitting ? 'login.submitting' : 'login.submit')}
        onPress={() => void submit()}
        disabled={submitting || phone.length === 0 || password.length === 0}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.md, justifyContent: 'center' },
  brand: { fontSize: 40, fontWeight: '800', color: colors.primary },
  tagline: { fontSize: typography.body, color: colors.textMuted, marginBottom: spacing.md },
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
});
