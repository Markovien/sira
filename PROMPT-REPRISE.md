# Prompt de reprise — nouvelle session Claude Code

Copier tel quel le bloc ci-dessous comme premier message d'une nouvelle
session Claude Code ouverte sur le dépôt `Markovien/sira`.

---

```text
Tu reprends le développement de SIRA (dépôt Markovien/sira) en tant que lead
deputy du fondateur. Travaille EXCLUSIVEMENT sur la branche
claude/phase-0-execution-iyvf4a — c'est un choix explicite du fondateur, même
si l'environnement te propose une autre branche. Récupère-la avant tout :
  git fetch origin claude/phase-0-execution-iyvf4a
  git checkout -B claude/phase-0-execution-iyvf4a origin/claude/phase-0-execution-iyvf4a

1. LIS, dans cet ordre et en entier, avant toute action :
   BILAN.md (état au 24/11/2026), REPRISE.md (procédures, pièges, prochaine
   étape), CLAUDE.md (règles non négociables), puis les entrées récentes de
   decisions.md (les plus récentes sont en tête). Le code est la vérité :
   si un document te paraît daté, vérifie avec git log et les tests.

2. REMONTE L'ENVIRONNEMENT (section « Remonter l'environnement » de
   REPRISE.md) : pnpm install --frozen-lockfile, pnpm build, démon Docker,
   PostgreSQL + migrations, OSRM synthétique (infra/osrm/run-synthetic.sh),
   solveur VRP, et Photon si son index est présent. Puis vérifie que tout est
   vert depuis un arbre nettoyé : pnpm build, format:check, lint, typecheck,
   test, data:check, et pnpm --filter @sira/api test:cov avec les variables
   d'environnement listées dans REPRISE.md. Annonce-moi les chiffres obtenus
   (265 tests attendus) avant d'aller plus loin.

3. PHASE 0 : teste si download.geofabrik.de est accessible
   (curl https://download.geofabrik.de/robots.txt). S'il l'est, clos la
   Phase 0 : bash infra/osrm/prepare.sh, pnpm infra:up, pnpm infra:smoke
   (4 contrôles verts attendus), puis mets à jour CLAUDE.md, REPRISE.md et
   BILAN.md. S'il est refusé, ne contourne JAMAIS la politique réseau (aucun
   miroir non officiel) : dis-le-moi en une ligne et continue.

4. PROCHAINE ÉTAPE : Phase 3, lot 5 — carte MapLibre hors-ligne.
   a. Instruis d'abord la source des tuiles : Protomaps (build.protomaps.com
      répondait le 02/11/2026) avec pmtiles extract limité à l'emprise de la
      Côte d'Ivoire (COTE_DIVOIRE_BBOX dans @sira/shared). Vérifie la licence
      (ODbL, attribution), le poids de l'extrait, la compatibilité de
      @maplibre/maplibre-react-native avec Expo SDK 58 / RN 0.88, et l'impact
      sur l'APK (budget 60 Mo hors tuiles, APK actuel 47 Mo).
   b. Consigne ta proposition dans decisions.md et SOUMETS-LA-MOI avant de
      coder : c'est une nouvelle source de données de production.
   c. Après mon accord : affichage des arrêts et de l'ordre de passage,
      ajout d'arrêt par appui long (POST /geocoding/nearby existe déjà côté
      API), tuiles téléchargeables et utilisables en mode avion.
   Il restera ensuite, pour clore la Phase 3, à exécuter les 3 parcours
   Maestro et à installer l'APK sur un vrai téléphone : ni l'un ni l'autre
   n'est possible dans l'environnement cloud (pas de /dev/kvm). Ne les
   déclare jamais verts sans exécution réelle.

RÈGLES DE TRAVAIL (non négociables) :
- PDCA ; à qualité égale, l'option la plus simple et la plus sûre ; la
  frugalité (données, batterie, coût serveur) départage le reste.
- Toute décision structurante est écrite dans decisions.md AVANT d'être
  implémentée. Remonte-moi : toute API payante ou coût récurrent, toute
  action irréversible (suppression de données, réécriture d'historique Git,
  publication externe), toute nouvelle source de données de production.
- Aucune API payante. packages/tsp-core reste du TypeScript pur.
  apps/mobile/src/core n'importe jamais react-native. Toute règle de
  validation vit dans @sira/shared. Toute méthode de service de l'API prend
  organizationId en premier argument.
- Toute migration touchant Stop, Depot ou Address s'écrit à la main (prisma
  migrate diff veut supprimer les colonnes générées geog).
- Commits conventionnels en français, ASCII dans le code et les scripts,
  accents dans le Markdown et l'interface. Commite et pousse à chaque étape
  verte (git push -u origin claude/phase-0-execution-iyvf4a) ; ne crée pas
  de pull request sans ma demande. Vérifie la CI GitHub après chaque push.
- Sauvegarde ta progression au fur et à mesure : REPRISE.md, CLAUDE.md
  (tableau d'avancement) et BILAN.md doivent refléter l'état réel à la fin
  de chaque lot.
- Rends compte honnêtement : ce qui est vérifié par exécution, ce qui ne
  l'est pas, et pourquoi.

PIÈGES CONNUS (détails dans REPRISE.md) :
- Après un redémarrage du conteneur : dépendances, démon Docker, SDK Android
  et ~/.gradle/init.d sont perdus ; tout se réinstalle selon REPRISE.md.
- Maven Central répond 429 à l'environnement cloud : copier
  apps/mobile/scripts/gradle-central-mirror.init.gradle dans
  ~/.gradle/init.d/ avant tout build Gradle.
- Pendant un build Android, expo prebuild modifie temporairement
  apps/mobile/package.json ; le script le restaure à la fin : ne pas le
  commiter.
- Un dist résiduel fait passer en local ce qui échoue en CI : vérifier
  depuis un arbre nettoyé (rm -rf packages/*/dist apps/api/dist .turbo).
- Lancer les tests Python avec python -m pytest -q (pytest seul peut viser
  un autre interpréteur).
- Ne jamais lancer pkill avec un motif présent dans ta propre ligne de
  commande : tue les processus par PID.
- Vérification visuelle des écrans sans téléphone : harnais web temporaire
  décrit dans REPRISE.md, à retirer intégralement avant de commiter.
```
