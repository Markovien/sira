# apps/mobile — Application livreur (Expo / React Native)

Expo SDK 58, expo-router. Offline-first : optimisation TSP embarquée via
`@sira/tsp-core`, navigation déléguée par deep link à l'app GPS du téléphone.
Connexion persistante, base SQLite et synchronisation, création de missions,
hors-ligne, exécution de tournée avec preuve photo et signature (gardées
30 jours sur le téléphone). À venir (voir `REPRISE.md`) : carte MapLibre
hors-ligne, build Android Gradle local.

## Organisation

| Dossier     | Rôle                                                                                   |
| ----------- | -------------------------------------------------------------------------------------- |
| `app/`      | Écrans (expo-router). Minces : ils assemblent `src/core`, `src/i18n` et `src/theme`.   |
| `src/core/` | Logique métier en TypeScript pur — **aucun import de `react-native`**. Testée en Node. |
| `src/i18n/` | Textes en français ; le jeu de clés de `fr.ts` est le contrat de toute autre langue.   |
| `test/`     | Vitest, sur `src/core` et `src/i18n`.                                                  |

## Commandes

```bash
pnpm --filter @sira/mobile dev        # Metro
pnpm --filter @sira/mobile test       # Vitest
EXPO_OFFLINE=1 npx expo export --platform android   # bundle Hermes (vérifié en CI, < 8 Mo)
```

Les versions des modules natifs viennent de
`node_modules/expo/bundledNativeModules.json`, jamais choisies à la main.

Contraintes de sobriété à respecter dès le premier écran : APK < 60 Mo hors
tuiles, GPS échantillonné toutes les 30 s en tournée uniquement, thème à fort
contraste pour un usage en plein soleil, français par défaut.
