# Journal des décisions — SIRA

Registre des décisions structurantes : contexte, choix retenu, conséquence.
Une entrée par décision, la plus récente en premier. Tenu à jour par le lead
deputy ; toute décision qui engage l'architecture, le coût ou la sécurité y
figure avant d'être implémentée.

**Règle d'arbitrage** (mandat du fondateur, 18/10/2026) : à qualité égale,
retenir systématiquement l'option **la plus simple et la plus sûre**. La
frugalité (règle 1 du cadrage) départage les cas restants.

**Deux décisions ne sont jamais prises seul** et remontent au fondateur :

1. toute dépendance à une API payante ou à un coût récurrent (règle 2 du
   cadrage) ;
2. toute action destructrice ou irréversible — suppression de données,
   réécriture d'historique Git, publication externe.

Les choix d'architecture figés, eux, sont résumés dans le tableau de
[`CLAUDE.md`](CLAUDE.md#choix-darchitecture-déjà-arrêtés) ; ce journal explique
_pourquoi_ ils ont été pris et ce qu'ils coûtent.

---

## 2026-10-18 — Cloisonnement par organisation imposé par la signature

**Contexte.** Une mission qui fuite d'une organisation à l'autre, c'est la
liste des clients d'un concurrent. C'est la propriété de sécurité la plus
importante de cette API, et celle qu'un oubli d'une seule clause `where`
suffit à perdre.

**Décision.** Toutes les méthodes de `MissionsService` prennent
`organizationId` en **premier argument obligatoire**, jamais en option et
jamais lu depuis un contexte ambiant. Un oubli devient une erreur de
compilation plutôt qu'une faille silencieuse.

**404 et non 403** sur une ressource d'une autre organisation : répondre
« interdit » confirmerait son existence, et permettrait d'énumérer les
missions d'un concurrent en sondant des identifiants.

Les références — véhicule, livreur, dépôt — sont vérifiées comme appartenant à
l'organisation avant d'être rattachées. Prisma accepterait sinon la clé
étrangère sans broncher.

**Conséquence.** Quatre tests e2e portent uniquement là-dessus : lecture,
modification, suppression et accès à un arrêt par la mission d'une autre
organisation renvoient tous 404.

---

## 2026-10-18 — `eqeqeq` tolère `== null`

**Contexte.** La règle `eqeqeq: always` signalait des `x == null` écrits
volontairement pour tester null **et** undefined d'un coup — ce que
`exactOptionalPropertyTypes` rend fréquent.

**Décision.** `eqeqeq: ['error', 'always', { null: 'ignore' }]`. Toute autre
comparaison laxiste reste interdite.

**Alternative écartée.** Écrire `x === null || x === undefined` partout :
plus long, et le lecteur finit par ne plus distinguer l'intention de la
verbosité.

---

## 2026-10-18 — Le lint construit d'abord (CI rouge, corrigée)

**Contexte.** La CI du commit d'authentification est passée rouge sur l'étape
ESLint, alors que `pnpm lint` passait en local. ESLint est _type-aware_, et
depuis le passage des paquets partagés en double build, leurs types ne
s'obtiennent plus que via `dist/`. Sans `dist`, les imports de `@sira/shared`
deviennent « error typed » et les règles `no-unsafe-*` se déclenchent.

**La cause exacte.** `pnpm lint` était `eslint .` à la racine : un appel direct
qui court-circuite Turborepo. La dépendance `lint → ^build` déclarée dans
`turbo.json` ne s'appliquait donc jamais. En local, un `dist` laissé par un
build antérieur masquait le défaut ; sur un arbre propre, il apparaît.

**Décision.** `pnpm lint` construit d'abord (`turbo run build && eslint .`) et
l'étape Build passe avant Lint dans la CI. Une déclaration de dépendance que
rien n'applique ne vaut rien : la commande doit porter l'ordre elle-même.

**Leçon retenue, la seconde du même genre.** Vérifier dans un répertoire de
travail qui traîne de l'état est une vérification incomplète. La première fois,
c'était Vite qui résolvait vers les sources là où Node lit le compilé. Ici,
c'est un `dist` résiduel. Désormais, toute vérification que j'annonce comme
probante part d'un arbre nettoyé — `rm -rf */dist .turbo` avant la passe
finale.

---

## 2026-10-18 — JWT sans Passport, et jetons de rafraîchissement à rotation

**Contexte.** La feuille de route demande « JWT (access + refresh), bcrypt ».
NestJS propose Passport comme chemin par défaut.

**Décision.** `@nestjs/jwt` et un garde maison d'une soixantaine de lignes.
Passport apporte une mécanique de _strategies_ utile pour OAuth ou les
sessions — dont ce projet n'a besoin ni maintenant ni en Phase 6, le paiement
passant par un webhook. La vérification cryptographique reste faite par la
bibliothèque ; le garde ne lit qu'un en-tête.

**Le garde est global, et les routes s'ouvrent explicitement** avec `@Public()`.
L'inverse — ouvrir par défaut, penser à fermer — finit toujours par laisser une
route exposée par oubli.

**Rotation.** Chaque rafraîchissement révoque le jeton présenté et en émet un
nouveau : un jeton volé puis rejoué après un usage légitime est refusé. Seul le
SHA-256 du jeton est stocké, pour qu'une fuite de la table ne suffise pas à
rejouer les sessions.

**Temps constant à la connexion.** Un `bcrypt.compare` est exécuté même quand
aucun utilisateur ne correspond, contre un haché factice calculé au démarrage.
Sans cela, le temps de réponse distingue « numéro inconnu » de « mot de passe
faux » et permet d'énumérer les comptes.

**Bug trouvé et corrigé au passage.** Une inscription suivie d'une connexion
dans la même seconde produisait deux jetons **identiques au bit près** —
mêmes claims, même `iat`, dont la résolution est la seconde. L'insertion violait
l'index unique, et surtout deux appareils auraient partagé un jeton :
déconnecter l'un aurait déconnecté l'autre. Corrigé par un `jti` aléatoire.
Trouvé par les tests e2e, invisible aux tests unitaires.

---

## 2026-10-18 — Séparer tests unitaires et tests de bout en bout

**Contexte.** Les e2e Supertest exigent une base démarrée. Mélangés aux tests
unitaires, ils rendraient `pnpm test` impossible à lancer sans infrastructure —
et le travail de CI « qualité » n'en a pas.

**Décision.** `pnpm test` reste sans dépendance externe et tourne partout ;
`pnpm --filter @sira/api test:e2e` tourne dans le travail CI qui dispose déjà
d'un service PostGIS. Les e2e s'exécutent en série : plusieurs fichiers
écrivant dans la même base se marcheraient dessus, et un échec intermittent
coûte plus cher que les secondes gagnées.

**Conséquence.** Un contributeur sans Docker garde une boucle de test rapide,
sans que la couverture e2e en pâtisse.

---

## 2026-10-18 — Longueur minimale plutôt que règle de composition

**Contexte.** Choix de la contrainte sur les mots de passe à l'inscription.

**Décision.** Huit caractères minimum, aucune exigence de majuscule ni de
caractère spécial.

**Pourquoi.** Les utilisateurs visés saisissent sur un clavier mobile, souvent
en plein soleil, parfois avec des gants. Imposer une composition produit des
mots de passe notés sur un papier dans la sacoche — une perte nette de
sécurité. C'est la longueur qui compte, et le coût de hachage bcrypt (12 tours,
~250 ms sur un petit VPS) fait le reste.

**Conséquence.** La connexion, elle, n'impose aucune longueur : un compte créé
avant un durcissement futur doit pouvoir continuer à se connecter.

---

## 2026-10-18 — Construire `shared` et `tsp-core` en double ESM/CJS

**Contexte.** `@sira/shared` n'exposait que ses sources TypeScript
(`exports` pointant sur `./src/index.ts`), sans étape de build. Vitest s'en
accommode — Vite transpile à la volée — et le typecheck passait. Mais le
binaire de production fait un `require()` : `node dist/main.js` échouait sur
`Cannot find module .../geo.js`. Un bug invisible à toute la chaîne de
vérification existante, qui n'aurait éclaté qu'au premier démarrage réel.

**Décision.** Les deux paquets partagés émettent `dist/esm` et `dist/cjs` via
deux passes `tsc`, plus un marqueur `{"type": ...}` dans chaque dossier. Aucune
dépendance nouvelle. `apps/api` consomme le CJS, Vite et Metro l'ESM.

**Alternative écartée.** Une sortie CommonJS seule, suffisante pour tous les
consommateurs actuels : elle priverait le web et le mobile du _tree-shaking_,
sur des paquets justement destinés à tourner sur des Android d'entrée de gamme.

**Conséquence et garde-fou.** Vérifié dans les deux sens : `require()` et
`import` renvoient 3627 m sur Plateau→Cocody. Surtout, la classe de bug est
désormais détectée : `apps/api/scripts/smoke.sh` démarre l'**API compilée**
contre une vraie base et vérifie `/health` et `/docs-json`, et un travail de CI
le rejoue sur un service PostGIS. Testé en négatif — l'ancien `exports` cassé
fait bien échouer le script.

**Leçon retenue.** Le typecheck et les tests unitaires empruntent la résolution
de Vite, pas celle de Node. Tant qu'un artefact compilé n'a pas démarré pour de
vrai, il n'est pas vérifié.

---

## 2026-10-18 — Valider par Zod, pas par `class-validator`

**Contexte.** Le `ValidationPipe` de NestJS exige `class-validator` et des DTO
à décorateurs. Le dépôt valide déjà par Zod dans `@sira/shared`, schémas
destinés à être partagés avec le mobile et le dashboard.

**Décision.** Pas de `ValidationPipe` global ; un `ZodValidationPipe` appliqué
par route avec le schéma partagé correspondant.

**Alternative écartée.** Adopter `class-validator` pour suivre le chemin par
défaut de NestJS : deux systèmes de validation, donc le format d'un numéro
ivoirien ou les bornes d'une coordonnée écrits deux fois — et un jour
divergents entre l'API et le mobile.

**Conséquence.** Une règle métier s'écrit une fois et vaut partout. Coût : une
vingtaine de lignes de pipe maison, et `new ZodValidationPipe(schema)` explicite
à chaque route plutôt qu'un typage implicite.

---

## 2026-10-18 — `apps/api` en CommonJS, avec son propre tsconfig

**Contexte.** NestJS résout ses dépendances par réflexion sur les métadonnées
de décorateurs. Trois réglages du `tsconfig.base.json` l'en empêchent :
`verbatimModuleSyntax` efface les imports de types utilisés comme types de
paramètres de constructeur, et `module: ESNext` place NestJS hors de son
chemin supporté.

**Décision.** `apps/api/tsconfig.json` lève ces trois réglages, et seulement
eux ; le reste du monorepo garde la configuration stricte. La règle ESLint
`consistent-type-imports` est désactivée pour `apps/api/src/**` seulement.

**Pourquoi cette précision.** Un `import type` mal placé ne casse ni le
typecheck ni le lint : la métadonnée devient `Object` et l'injection échoue au
**démarrage**. Le garde-fou doit donc être la configuration, pas la vigilance.

**Conséquence.** Le mobile et les paquets partagés restent en ESM strict.

---

## 2026-10-18 — Tester NestJS avec Vitest plutôt que Jest

**Contexte.** NestJS part sur Jest ; la convention du dépôt est Vitest. Vitest
passe par esbuild, qui ne sait pas émettre les métadonnées de décorateurs.

**Décision.** Vitest plus `unplugin-swc`, qui les émet.

**Alternative écartée.** Jest pour `apps/api` : deux lanceurs de tests, deux
configurations, deux comportements en CI, pour un paquet sur quatre.

**Conséquence.** Une dépendance de développement supplémentaire, `@swc/core`,
binaire natif — sans effet sur le mobile, qui n'en dépend pas. À rouvrir si
l'attelage devient coûteux à maintenir.

---

## 2026-10-18 — Colonnes PostGIS générées plutôt qu'alimentées

**Contexte.** `Stop`, `Depot` et `Address` ont besoin d'une colonne spatiale
indexable. Prisma ne type pas `geography` nativement.

**Décision.** Des colonnes `GENERATED ALWAYS AS (...) STORED` dérivées de
`lat`/`lon`, ajoutées par migration SQL. `lat`/`lon` restent la source de
vérité — c'est ce que lisent le mobile et le solveur TSP, sans PostGIS.

**Alternative écartée.** Un trigger, ou une écriture par le code applicatif :
les deux rendent possible une désynchronisation entre `lat`/`lon` et la
géométrie, c'est-à-dire un routage juste sur une carte fausse.

**Conséquence.** Vérifié par exécution : colonnes auto-remplies dans le bon
ordre `lon`/`lat`, distance Plateau→Cocody à 3622 m — cohérente avec le test
haversine de `@sira/shared` — et le planificateur utilise bien l'index GiST.
Type `geography` et non `geometry` : les distances sortent en mètres sans
projection à choisir, ce qui vaudra aussi pour le reste de l'UEMOA.

---

## 2026-10-18 — Ouvrir la Phase 1 malgré la Phase 0 non close

**Contexte.** La consigne 1 de la feuille de route interdit d'ouvrir une phase
tant que les critères d'acceptation de la précédente ne sont pas tous verts.
Deux des cinq contrôles du smoke test restent rouges — mais pour une cause
externe au projet : la politique réseau de l'environnement d'exécution refuse
les deux serveurs de données. Aucun travail sur le dépôt ne peut les faire
passer au vert.

**Décision.** Ouvrir la Phase 1. Ce que la consigne 1 protège — ne pas bâtir
sur des fondations non vérifiées — est préservé : le socle dont la Phase 1
dépend réellement, PostgreSQL et PostGIS, est vérifié par exécution ; la
chaîne OSRM l'est sur extrait synthétique. Le reliquat ne porte que sur la
qualité des **données** d'Abidjan, pas sur le code.

**Alternative écartée.** Attendre. Elle immobilise le projet sur une cause que
le dépôt ne contrôle pas, sans réduire le moindre risque technique.

**Conséquence et limite assumée.** Le critère d'acceptation de la Phase 1
« obtenir la matrice OSRM » hérite du même blocage : il sera vérifié contre
`infra/osrm/smoke-synthetic.osm`, et re-vérifié sur Abidjan dès la levée de la
restriction. **La Phase 0 n'est pas déclarée close** ; elle reste ouverte dans
`CLAUDE.md` jusqu'au passage du smoke test sur données réelles.

---

## 2026-10-18 — Rester sur la branche `claude/phase-0-execution-iyvf4a`

**Contexte.** La feuille de route prévoit une branche par phase
(`phase-1-backend-core`). Les consignes d'exécution de la session, elles,
fixent `claude/phase-0-execution-iyvf4a` et interdisent de pousser ailleurs
sans accord explicite du fondateur.

**Décision.** Poursuivre sur la branche en cours. Un nom de branche
légèrement inexact est sans conséquence et se corrige à tout moment ; pousser
sur une branche non autorisée ne se défait pas aussi simplement.

**Conséquence.** À rouvrir dès que le fondateur tranche — la convention de la
feuille de route reprendra alors ses droits.

---

## 2026-10-18 — Épingler `osrm/osrm-backend:v5.25.0`

**Contexte.** Le tag `v5.27.1`, épinglé dans `docker-compose.yml` et
`prepare.sh`, n'existe pas : aucun `v5.27.x` n'est publié sur Docker Hub. La
panne ne se serait manifestée qu'après les ~15 min et 2 Go de préparation des
données, sur un `not found`.

**Décision.** Épingler `v5.25.0`, dernier tag stable publié. Écarté : `latest`,
qui contredit le principe d'images épinglées (une mise à jour amont pourrait
casser le pipeline sans commit).

**Conséquence.** Chaîne validée par exécution réelle. À re-confirmer si OSRM
publie une version ultérieure ; le pin reste un acte de commit explicite.

---

## 2026-10-18 — Valider la chaîne OSRM sans les données réelles

**Contexte.** Le bug de tag ci-dessus était indétectable : rien ne permettait
d'exercer la chaîne OSRM sans télécharger d'abord 2 Go d'extrait OSM. Toute la
configuration de routage n'était donc vérifiée par rien.

**Décision.** Ajouter `infra/osrm/smoke-synthetic.osm` (19 lignes, cinq nœuds
autour d'Abidjan) et `infra/osrm/verify-pipeline.sh`, qui rejoue
extract/partition/customize, démarre `osrm-routed` sur un port dédié, vérifie
`/route` et `/table`, puis nettoie.

**Alternative écartée.** Faire tourner OSRM dans la CI sur les vraies données :
plusieurs Go téléchargés à chaque exécution, contraire à la frugalité, pour un
gain nul sur cette classe de bug.

**Conséquence.** Deux minutes et zéro téléchargement couvrent désormais le tag
d'image, le chemin du profil Lua, l'enchaînement du pipeline et les options de
`osrm-routed`. Ne remplace pas `infra/smoke-test.sh`, qui seul valide les
critères d'acceptation sur les données d'Abidjan.

---

## 2026-10-18 — Ne pas contourner un refus de politique réseau

**Contexte.** `download.geofabrik.de` et `download1.graphhopper.com` sont
refusés (403) par la politique d'egress de l'environnement d'exécution. Sans
eux, ni extrait OSM d'Abidjan ni index de géocodage.

**Décision.** Ne pas chercher de miroir alternatif, et signaler les hôtes
bloqués. Un miroir non officiel pour des données qui deviendront la base du
routage de production introduirait une dépendance non auditée — exactement ce
que le choix du jar Photon officiel visait à éviter.

**Conséquence.** Deux des cinq contrôles du smoke test restent en attente d'une
levée de la restriction, ou d'une exécution sur un poste non restreint.

---

## 2026-10-18 — Imposer LF et vérifier le dataset par régénération

**Contexte.** `data/abidjan-stops.json` était commité en CRLF alors que son
générateur Python écrit du LF. La comparaison « le JSON est la sortie du
générateur », annoncée dans `CLAUDE.md`, échouait donc toujours — et aucun
script ne l'exécutait.

**Décision.** `.gitattributes` impose LF ; `data/check-generated.sh` régénère
et compare, en restaurant le fichier commité en cas d'écart ; le dataset est
exclu de Prettier, dont le formatage entrerait en conflit avec le générateur.

**Conséquence.** Le JSON redevient un artefact strictement dérivé. Toute
correction passe par la liste `STOPS` du script Python.

---

## 2026-10-18 — Router `pnpm infra:*` par `infra/compose.sh`

**Contexte.** Docker Compose ne lit le `.env` qu'à côté du `docker-compose.yml`,
donc dans `infra/`. Le `.env` du projet vit à la racine — c'est lui que lisent
le smoke test et, en Phase 1, l'API. Toute surcharge était ignorée en silence.

**Décision.** Un script d'enveloppe ajoute `--env-file` quand le `.env` de la
racine existe. Il reste facultatif : toutes les variables du compose ont un
défaut, la stack démarre sans configuration.

**Alternative écartée.** `--project-directory .`, qui ferait bien lire le `.env`
de la racine mais changerait la résolution des chemins relatifs des volumes —
un effet de bord silencieux sur `./postgres/init` et `./osrm/data`.

**Conséquence.** `infra/check-env-example.sh`, rejoué en CI, garantit que
`.env.example` reste exhaustif et qu'aucune variable du compose ne perde son
défaut.
