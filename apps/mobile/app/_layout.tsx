import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { DataProvider } from '../src/data';
import { SessionProvider, useSession } from '../src/session';
import { colors, typography } from '../src/theme';
import { Loading } from '../src/ui';

function RootStack() {
  const { state } = useSession();
  // La lecture du Keystore prend quelques millisecondes : ne rien router
  // avant, sinon l'ecran de connexion clignote a chaque ouverture.
  if (state.status === 'loading') return <Loading />;
  const signedIn = state.status === 'signedIn';

  const stack = (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontSize: typography.title, fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="missions/new" />
        <Stack.Screen name="missions/[id]/index" />
        <Stack.Screen name="missions/[id]/add-stop" />
        <Stack.Screen name="missions/[id]/stops/[stopId]" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );

  return signedIn ? <WithData userId={state.user.id}>{stack}</WithData> : stack;
}

function WithData({ userId, children }: { userId: string; children: ReactNode }) {
  return <DataProvider userId={userId}>{children}</DataProvider>;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <RootStack />
    </SessionProvider>
  );
}
