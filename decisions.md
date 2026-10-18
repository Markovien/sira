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
