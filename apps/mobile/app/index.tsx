import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../src/i18n';
import { colors, spacing, typography } from '../src/theme';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('home.title') }} />
      <Text style={styles.tagline}>{t('app.tagline')}</Text>
      <Text style={styles.empty}>{t('home.empty')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, gap: spacing.md },
  tagline: { fontSize: typography.body, color: colors.textMuted },
  empty: { fontSize: typography.body, color: colors.text },
});
