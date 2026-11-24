# apps/mobile — Application livreur (Expo / React Native)

Expo SDK 58, expo-router. Offline-first : optimisation TSP embarquée via
`@sira/tsp-core`, navigation déléguée par deep link à l'app GPS du téléphone.
Connexion persistante, base SQLite et synchronisation, création de missions
hors-ligne, exécution de tournée avec preuve photo et signature (gardées
30 jours sur le téléphone), GPS échantillonné à 30 s pendant la tournée,
carte MapLibre hors-ligne (extrait PMTiles du Grand Abidjan téléchargé depuis
l'API, glyphes et sprite embarqués). APK de release construit en local
(29 Mo, deux architectures ARM, bibliothèques natives compressées). À venir
(voir `REPRISE.md`) : essai sur appareil, exécution des parcours Maestro.

## Organisation

| Dossier       | Rôle                                                                                   |
| ------------- | -------------------------------------------------------------------------------------- |
| `app/`        | Écrans (expo-router). Minces : ils assemblent `src/core`, `src/i18n` et `src/theme`.   |
| `src/core/`   | Logique métier en TypeScript pur — **aucun import de `react-native`**. Testée en Node. |
| `src/i18n/`   | Textes en français ; le jeu de clés de `fr.ts` est le contrat de toute autre langue.   |
| `assets/map/` | Glyphes Noto Sans (OFL) et sprite Protomaps (MIT) de la carte, commités.               |
| `plugins/`    | Plugin Expo qui copie `assets/map` dans les assets Android au `prebuild`.              |
| `test/`       | Vitest, sur `src/core` et `src/i18n`.                                                  |

## Commandes

```bash
pnpm --filter @sira/mobile dev        # Metro
pnpm --filter @sira/mobile test       # Vitest
EXPO_OFFLINE=1 npx expo export --platform android   # bundle Hermes (vérifié en CI, < 8 Mo)
ANDROID_HOME=/chemin/sdk bash scripts/build-android.sh   # APK de release (< 60 Mo vérifié)
bash scripts/fetch-map-assets.sh      # glyphes et sprite (seulement en changeant de style)
maestro test .maestro -e SIRA_PHONE=... -e SIRA_PASSWORD=...   # émulateur ou téléphone
```

Les versions des modules natifs viennent de
`node_modules/expo/bundledNativeModules.json`, jamais choisies à la main.

Contraintes de sobriété à respecter dès le premier écran : APK < 60 Mo hors
tuiles, GPS échantillonné toutes les 30 s en tournée uniquement, thème à fort
contraste pour un usage en plein soleil, français par défaut.
