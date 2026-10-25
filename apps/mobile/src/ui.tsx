import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, touchTarget, typography } from './theme';

/** Briques d'interface communes : peu nombreuses, pour un rendu homogene au soleil. */

export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text
        style={[styles.buttonLabel, { color: primary ? colors.onPrimary : colors.primary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

export function Loading() {
  return (
    <Centered>
      <ActivityIndicator size="large" color={colors.primary} />
    </Centered>
  );
}

export function Message({
  text,
  tone = 'normal',
}: {
  text: string;
  tone?: 'normal' | 'danger';
}) {
  return (
    <Text
      accessibilityRole="alert"
      style={[styles.message, tone === 'danger' && { color: colors.danger }]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.background },
  dimmed: { opacity: 0.6 },
  buttonLabel: { fontSize: typography.button, fontWeight: '700' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  message: { fontSize: typography.body, color: colors.text, textAlign: 'center' },
});
