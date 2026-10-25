import * as Network from 'expo-network';

/**
 * Appelle `onReconnect` a chaque retour du reseau. Un evenement du systeme,
 * pas une scrutation : rien ne tourne tant que l'etat ne change pas.
 */
export function onReconnect(onReconnect: () => void): () => void {
  let online: boolean | null = null;
  const subscription = Network.addNetworkStateListener((state) => {
    // `isInternetReachable` peut rester indefini un instant : on ne le tient
    // pour faux que s'il l'est explicitement.
    const now = state.isConnected === true && state.isInternetReachable !== false;
    if (online === false && now) onReconnect();
    online = now;
  });
  return () => subscription.remove();
}
