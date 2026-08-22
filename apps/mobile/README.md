# apps/mobile — Application livreur (Expo / React Native)

**Créée en Phase 3** de la roadmap : offline-first (expo-sqlite), carte
MapLibre hors-ligne, optimisation TSP embarquée via `@sira/tsp-core`,
navigation déléguée par deep link à l'app GPS du téléphone, preuve de
livraison, file de synchronisation rejouée à la reconnexion.

Contraintes de sobriété à respecter dès le premier écran : APK < 60 Mo hors
tuiles, GPS échantillonné toutes les 30 s en tournée uniquement, thème à fort
contraste pour un usage en plein soleil, français par défaut.
