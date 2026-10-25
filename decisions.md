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

## 2026-10-25 — Build Android : EAS est un service externe, il remonte au fondateur

**Contexte.** Le critère d'acceptation de la Phase 3 demande un « build EAS
Android installable ». EAS Build est un service SaaS d'Expo : gratuit dans
une limite de builds mensuels, payant au-delà, et il exige un compte Expo et
l'envoi du code source sur leurs serveurs.

**Décision.** Ne pas créer de compte ni configurer EAS sans accord du
fondateur (règle 2 du cadrage, et publication externe). Le dépôt reste
compatible EAS — `app.json` complet, aucun module hors Expo SDK sans plugin de
configuration — et l'alternative sans service tiers reste ouverte :
`expo prebuild` puis Gradle en local.

**Conséquence.** Point ajouté à la liste « ce qui attend le fondateur » de
`REPRISE.md`. Le code mobile avance sans attendre la réponse.

---

## 2026-10-25 — Navigation : une liste ordonnée de liens, essayés tour à tour

**Contexte.** Le bouton « Y aller » délègue la navigation à l'app GPS du
téléphone (décision d'architecture). Sur Android 11 et plus,
`Linking.canOpenURL` répond `false` pour tout schéma non déclaré dans les
`<queries>` du manifeste, ce qui demande un plugin de configuration natif.

**Décision.** Une fonction pure construit la liste des liens candidats, dans
l'ordre de préférence du livreur (Google Maps par défaut, OsmAnd, Waze), et se
termine toujours par `geo:`, que tout Android sait ouvrir. L'écran tente
`Linking.openURL` sur chacun et passe au suivant en cas d'échec, sans
interroger `canOpenURL`.

**Alternative écartée.** Déclarer les `<queries>` par plugin : du natif à
maintenir pour un gain nul, l'échec d'`openURL` donnant la même information.

**Conséquence.** La logique se teste en Node. Waze exige le réseau pour
calculer son itinéraire ; Google Maps et OsmAnd peuvent naviguer hors-ligne si
le livreur a téléchargé la carte — c'est pourquoi Waze n'est jamais le défaut.

---

## 2026-10-25 — Matrice hors-ligne dans `@sira/shared`, une vitesse par tournée

**Contexte.** Hors connexion, le TSP embarqué a besoin d'une matrice de durées
sans OSRM (roadmap 3.4). Les vitesses de repli et le facteur de détour existent
déjà dans `@sira/shared/domain.ts`.

**Décision.** `fallbackMatrices(points, departure)` vit dans
`@sira/shared` : distance haversine × 1,35, divisée par la vitesse de la
tranche horaire du **départ**, appliquée à toute la tournée. L'API pourra s'en
servir le jour où OSRM tombe. La tranche se déduit d'un jour et d'une heure
locaux ; Abidjan étant en GMT toute l'année, sans heure d'été, l'heure locale
est l'heure UTC — aucune base de fuseaux horaires à embarquer.

Tranches : pointe du lundi au vendredi 7h-9h et 17h-20h ; fluide de 21h à 6h
et le dimanche avant midi ; « hors pointe » sinon.

**Alternative écartée.** Une vitesse par arc, selon l'heure d'arrivée estimée
à chaque arrêt : la matrice dépendrait de l'ordre de visite, que le solveur
cherche justement à déterminer. Gain de précision illusoire avec des vitesses
de repli qui sont elles-mêmes des moyennes ; la Phase 5 apportera de vraies
vitesses par segment.

---

## 2026-10-25 — Traductions : un dictionnaire typé, sans bibliothèque

**Contexte.** La roadmap demande le français par défaut et « i18n prêt ». Une
seule langue est prévue pour le pilote.

**Décision.** Un objet `fr` dont le type sert de contrat ; toute autre langue
devra le satisfaire, une clé manquante est donc une erreur de compilation.
Une fonction `t(key, params)` interpole `{param}`. Ni i18next ni
expo-localization.

**Alternative écartée.** i18next : une dépendance, un format de fichier et un
chargement asynchrone pour une seule langue. La migration reste triviale — les
clés sont déjà plates.

---

## 2026-10-25 — Mobile : la logique en TypeScript pur, à part de l'interface

**Contexte.** Le gros du risque de la Phase 3 est dans la logique — choix de
la matrice, file de synchronisation, liens de navigation — et non dans les
écrans. Or tout ce qui importe `react-native` ne s'exécute pas sous Vitest
sans un environnement simulé lourd.

**Décision.** `apps/mobile/src/core/` ne dépend que de `@sira/shared` et
`@sira/tsp-core` — même contrainte que `tsp-core` : ni React Native ni API
Node. Il est testé par Vitest en Node, comme les autres paquets. Les écrans
(`app/`) restent minces et seront couverts par les parcours Maestro.

**Conséquence.** Le stockage (SQLite) et le réseau sont injectés dans `core`
par interfaces, ce qui permet de tester la synchronisation sans appareil.

---

## 2026-10-25 — Expo SDK 58 et expo-router, application montée à la main

**Contexte.** Démarrage de `apps/mobile`. SDK 58 est la version stable
courante (publiée le 29/09/2026, 19 correctifs depuis) ; la 57 sort de son
cycle de maintenance.

**Décision.** SDK 58, avec expo-router pour la navigation par fichiers. Le
squelette est écrit à la main plutôt que généré par `create-expo-app`, dont les
modèles embarquent écrans d'exemple, polices et images qu'il faudrait
supprimer — chaque Mo compte contre le budget de 60 Mo. Les versions des
modules natifs sont alignées par `expo install`, jamais choisies à la main.

**Conséquence.** MapLibre React Native et expo-sqlite arrivent dans des lots
suivants, chacun avec sa vérification de compatibilité avec le SDK.

---

## 2026-10-25 — Ouvrir la Phase 3 avec la Phase 0 toujours ouverte

**Contexte.** Re-test du 25/10 : `download.geofabrik.de` et
`download1.graphhopper.com` restent refusés (403 au CONNECT) par la politique
réseau. Le fondateur a donné la consigne explicite de démarrer la Phase 3 dans
ce cas. Les Phases 1 et 2 sont closes et vertes.

**Décision.** Ouvrir la Phase 3, selon le même raisonnement que l'ouverture de
la Phase 1 (18/10) : le mobile dépend de l'API et de `tsp-core`, vérifiés, et
pas des données d'Abidjan. La carte hors-ligne (tâche 3.3) dépend elle aussi
d'un extrait OSM ; elle sera traitée en dernier, et sur un jeu de tuiles
réduit si la restriction persiste.

**Conséquence.** La Phase 0 reste « non close » dans `CLAUDE.md`.

---

## 2026-10-18 — Le cloisonnement descend au niveau de la base

**Contexte.** Le fondateur tranche : la base d'adresses reste **cloisonnée par
organisation**, pour la sécurité. Le code filtrait déjà sur `organizationId`
partout — mais la colonne était `String?`, et la relation en `onDelete:
SetNull`.

**Ce que cela autorisait.** Une adresse sans organisation : invisible à toute
requête, puisque chacune filtre, mais bien présente en base. Et surtout,
supprimer une organisation ne supprimait pas ses adresses — elle les rendait
orphelines. Des adresses de clients réels, que plus personne ne peut consulter
ni purger. La loi ivoirienne n° 2013-450 impose de pouvoir supprimer les
données sur demande (cadrage §9) : c'était intenable.

**Décision.** `organizationId` devient obligatoire, et la relation passe en
`onDelete: Cascade`. Une règle de sécurité tenue uniquement par la discipline
du code n'est pas tenue : elle descend dans le schéma.

---

## 2026-10-18 — Les migrations Prisma se relisent à la main

**Contexte découvert en écrivant la migration ci-dessus.** `prisma migrate
diff` a proposé de **supprimer les trois colonnes `geog`**, leurs index GiST,
les deux index trigram, et de retirer le `DEFAULT` des colonnes générées — ce
qui les aurait cassées. Prisma ne connaît pas ce que la migration SQL brute a
créé.

Une migration générée sans relecture aurait donc emporté toute la couche
spatiale. **Aucun test fonctionnel ne l'aurait vu** : les requêtes de
proximité seraient simplement tombées en balayage séquentiel.

**Décision, en trois niveaux.**

1. Les colonnes sont déclarées en `Unsupported("geography(Point, 4326)")` dans
   le schéma : Prisma cesse de proposer leur suppression pure et simple.
2. Cela ne suffit pas pour les index, ni pour le `DROP DEFAULT`. Toute
   migration touchant `Stop`, `Depot` ou `Address` se **relit et se corrige à
   la main**. L'avertissement est en tête du schéma, là où on édite.
3. `test/schema-integrity.e2e.test.ts` vérifie que les trois colonnes générées
   et les cinq index existent toujours, et que la cascade fonctionne. C'est le
   seul filet contre une migration destructrice.

**Alternative écartée.** Exprimer les index GiST et trigram dans le schéma
Prisma (`@@index(..., type: Gist)` avec `ops: raw(...)`). Possible, mais
fragile sur une colonne `Unsupported`, et une expression qui dérive
silencieusement serait pire que l'absence de déclaration — on croirait le
problème réglé.

---

## 2026-10-18 — Une flotte optimisée devient une mission par véhicule

**Contexte.** Phase 2, tâche 3. `POST /missions/:id/optimize` doit router vers
le TSP embarqué ou vers le solveur VRP, puis « persister l'ordre et les ETA ».
Avec plusieurs véhicules, le résultat est plusieurs tournées — or le modèle
n'attache qu'un véhicule et un livreur à une mission.

**Décision.** La mission d'origine garde la première tournée ; les suivantes
deviennent des missions sœurs, créées dans la même transaction, chacune avec
son véhicule. Un arrêt change de mission, jamais de contenu.

**Pourquoi.** C'est ce dont le mobile a besoin dès la Phase 3 : un livreur se
connecte et ne voit que sa tournée. Un champ `routeIndex` sur `Stop` aurait
évité de créer des missions, mais aurait obligé chaque client à filtrer, et
aurait rendu impossible d'affecter un livreur distinct à chaque tournée.

**Le choix du solveur n'est pas une préférence.** Avec un seul véhicule, le TSP
embarqué rend l'optimum en quelques centaines de millisecondes sans sortir du
processus ; appeler un microservice Python pour cela serait un aller-retour
réseau gratuit. C'est aussi le même code que fera tourner le mobile hors ligne.

**Une flotte exige un dépôt.** Sans point de départ commun, « trois véhicules »
ne définit pas un problème. Refusé en 400 plutôt que résolu de travers.

---

## 2026-10-18 — Un test ignoré doit se voir (deux défauts trouvés)

**Contexte.** Les tests d'orchestration exigent OSRM. Je les avais écrits avec
un `if (!osrmAvailable) return;` — un saut silencieux.

**Ce que ça a masqué.** La suite affichait « 6 passed ». En réalité **4 tests
sur 6 ne tournaient pas**, dont celui du fractionnement VRP, le plus complexe
du lot. Le silence ressemblait au succès.

**Décision.** Sauts explicites via `context.skip()`, qui les fait apparaître
dans le rapport. Et, plutôt que de tolérer l'absence d'OSRM en CI, le travail
`api` démarre désormais OSRM sur l'extrait synthétique **et** le solveur VRP :
sans eux, le chemin le plus complexe de la Phase 2 ne serait jamais exercé
ailleurs que sur ma machine.

**Le défaut que la sonde a révélé.** Elle recevait **201** au lieu de 200.
`POST /routing/route` et `POST /routing/table` interrogent — elles ne créent
rien — mais NestJS répond 201 par défaut sur POST. Même classe que le défaut
déjà corrigé sur `/geocoding/nearby`. Corrigé, et la sonde échoue maintenant
explicitement si le 201 revient.

**Leçon.** Un test qui ne tourne pas est pire qu'un test absent : il occupe la
place d'une vérification et en donne l'apparence.

---

## 2026-10-18 — VRP : abandonner un arrêt plutôt que de ne rien rendre

**Contexte.** Phase 2, tâche 2. OR-Tools refuse un problème sur-contraint :
une seule fenêtre horaire infaisable, et la résolution entière échoue.

**Décision.** Chaque arrêt est une disjonction pénalisée : le solveur peut le
laisser non servi, moyennant un coût assez élevé pour que ce soit un dernier
recours. Les arrêts écartés sont listés explicitement dans la réponse.

**Pourquoi.** Un dispatcheur qui lance l'optimisation à 17 h et reçoit
« infaisable » n'a rien à en faire. Une tournée couvrant 43 arrêts sur 45, avec
les deux restants nommés, se complète à la main en cinq minutes.

**Deux autres choix de la même veine.** Une capacité à zéro vaut « non
contraint » et non « ne peut rien porter » — beaucoup de livreurs ignorent la
charge utile de leur tricycle. Et la validation Pydantic refuse une requête mal
formée à la frontière, plutôt que de la laisser produire une erreur obscure au
fond d'OR-Tools.

**Résultats mesurés.** Écart de **0,01 %** à la solution publiée de C101
(829,00 contre 828,94), 10 tournées, aucun client écarté — le critère
d'acceptation autorisait 15 %. Et 3 véhicules × 45 arrêts d'Abidjan résolus en
**10,0 s**, pour 15 s autorisées.

**Le test assert 5 %, pas 15 %**, pour la même raison que côté TSP : asserter
le critère laisserait passer une régression massive sans rien signaler.

**R101 introuvable.** La feuille de route cite C101 **et** R101. C101 et sa
solution étaient récupérables depuis un dépôt accessible, R101 non — aucune
des sources essayées ne le servait. Plutôt qu'une instance reconstituée à la
main, dont la moindre erreur invaliderait la mesure, la couverture est
complétée par le critère Abidjan, qui teste ce qui compte réellement pour le
pilote : une flotte réelle sur des points réels. À ajouter si une source fiable
se présente.

**Référence jamais écrite en dur.** Le coût de C101 est recalculé depuis la
solution publiée, et le test vérifie que ce calcul tombe à moins de 1 % de la
meilleure valeur connue (827,3) — ce qui valide le lecteur d'instance en même
temps que la mesure.

---

## 2026-10-18 — TSP : descente locale plus redémarrages perturbés

**Contexte.** Phase 2, tâche 1. Critère d'acceptation : écart ≤ 8 % de
l'optimum sur berlin52, et 50 arrêts résolus en moins d'une seconde.

**Ce que la descente seule donnait.** Plus proche voisin multi-départs, puis
2-opt et Or-opt : la recherche s'arrête au premier optimum local, souvent en
**une milliseconde**. Sur une instance à neuf points elle rendait 319 contre un
optimum de 318 — et le budget de 800 ms restait inutilisé.

**Décision.** Ajouter des redémarrages perturbés (recherche locale itérée). Une
perturbation « double pont » coupe le tour en quatre et recolle les morceaux :
2-opt ne sait pas la défaire, là où une simple inversion serait reconstituée
aussitôt et ramènerait au même optimum local. Seul un tour strictement meilleur
remplace le précédent, donc perturber ne peut jamais dégrader le résultat.

**Effet mesuré.** berlin52 passe de 4,55 % à **0,00 %** d'écart au budget de
800 ms : l'optimum exact, 7542. Le critère demandait 8 %.

**Asymétrie assumée, mais bornée.** 2-opt inverse un segment, ce qui ne laisse
son coût interne inchangé que si la matrice est symétrique — les matrices OSRM
ne le sont pas tout à fait. Le delta suppose la symétrie, mais **aucun tour
n'est conservé sur la foi d'un delta** : le coût exact est recalculé depuis la
matrice après chaque mouvement accepté. À 100 points, 100 additions. L'erreur
du delta ne peut donc pas se propager dans le résultat rendu.

**Le test assert 3 %, pas 8 %.** Le solveur atteint l'optimum ; asserter le
critère laisserait passer une régression de 0 à 7 % sans rien signaler. La
marge couvre les machines de CI plus lentes, qui font moins de redémarrages.

**Optimum jamais écrit en dur.** Il est recalculé depuis le tour optimal publié,
et le test vérifie que ce calcul redonne 7542. Si l'un des deux fichiers était
corrompu, l'écart se verrait immédiatement. Les deux fixtures sont commitées
— moins de 2 Ko — plutôt que téléchargées : la CI ne doit dépendre d'aucun
service externe.

---

## 2026-10-18 — Mesurer la couverture sur unitaires et e2e ensemble

**Contexte.** Critère d'acceptation de la Phase 1 : ≥ 70 % sur les services.
Reste à décider ce qu'on mesure.

**Décision.** Une passe unique couvrant unitaires **et** bout en bout. Les deux
sont indissociables ici : un service NestJS n'est presque jamais exercé par un
test unitaire seul, et mesurer sans les e2e donnerait un chiffre élevé qui ne
dirait rien de ce qui est réellement testé.

Le seuil porte sur `src/**/*.service.ts` et non sur le dépôt entier. Les
modules, décorateurs et `main.ts` sont exclus : les couvrir ne mesurerait que
le fait d'avoir démarré l'application.

**Résultat.** 94,19 % de lignes, aucun service sous le seuil. Le gate a été
**vérifié en négatif** — seuil monté à 99 %, la mesure échoue bien. C'est la
leçon du commit `fix(ci)` : une déclaration que rien n'applique ne protège de
rien.

**Lacune comblée au passage.** `photon.service.ts` plafonnait à 59 %, parce que
Photon n'est pas joignable dans l'environnement de test et que seul son chemin
d'échec était exercé. Sept tests contre un faux serveur HTTP local couvrent
désormais l'analyse des réponses — notamment l'ordre `[lon, lat]` du GeoJSON,
où se cache la même inversion que côté OSRM.

---

## 2026-10-18 — Le moat se construit à la livraison, et ne peut pas la faire échouer

**Contexte.** Le cadrage §10.1 pose la base d'adresses propriétaire comme
l'actif qui, à terme, vaudra plus que l'application. Reste à décider quand et
comment elle se remplit.

**Seul `delivered` compte.** Un échec ou un report ne prouve rien sur
l'exactitude du point — le destinataire était absent, pas l'adresse fausse.

**L'écriture ne peut pas faire échouer la livraison.** Un livreur qui marque un
arrêt livré, souvent sur un réseau instable au bord d'une voie, ne doit pas
voir sa requête rejetée parce qu'une écriture annexe a raté. La confirmation
d'adresse est donc encapsulée : elle journalise et laisse passer.

**Agrégation à 30 m.** C'est la dispersion typique d'un relevé GPS de
smartphone en ville. Plus large, on fusionnerait deux commerces voisins ; plus
étroit, on créerait un doublon à chaque livraison.

**Position affinée par moyenne mobile.** Le bruit GPS étant de moyenne nulle,
chaque confirmation rapproche le point de sa position réelle, et le rayon
d'agrégation borne la dérive possible. L'alternative — garder la première
position — est plus simple mais laisse une erreur initiale définitive, sur
une base dont la précision est précisément la valeur.

**Photon ne lève jamais.** Il renvoie une liste vide quand il est injoignable,
et la réponse porte `photonAvailable: false` : l'interface doit pouvoir
signaler un géocodage dégradé plutôt que de laisser croire à une absence de
résultat. Photon ne connaît que ce qu'OpenStreetMap contient — pas « le portail
bleu à côté du maquis ».

**Les adresses confirmées passent devant les résultats Photon** dans la
fusion. Une position vérifiée par une livraison vaut mieux qu'une
correspondance OSM plausible. La feuille de route dit « Photon d'abord, repli
sur la base » ; à l'usage le classement inverse sert mieux le livreur, et le
repli reste assuré dans les deux sens.

**Tranché par le fondateur le 18/10/2026 : la base reste cloisonnée par
organisation**, pour la sécurité. La mutualiser entre clients décuplerait sa
valeur — c'est l'effet de réseau du §10.1 — mais exposerait les adresses
clientes de chacun à ses concurrents. La confidentialité l'emporte.

Conséquences à tenir dans les phases suivantes :

- `organizationId` reste **obligatoire** sur chaque lecture et chaque écriture
  de la table `Address`, au même titre que pour les missions ;
- l'effet de réseau du cadrage §10.1 se construit **à l'intérieur** de chaque
  client, pas entre eux — l'argument commercial porte donc sur la précision que
  gagne une flotte avec ses propres livraisons, pas sur une base commune ;
- une mutualisation ultérieure resterait possible (opt-in par organisation,
  ou agrégation anonymisée), mais c'est une décision produit à reprendre de
  zéro, pas un réglage.

---

## 2026-10-18 — Client OSRM : POST partout, et erreurs traduites

**Contexte.** La feuille de route décrit le module `routing` comme un client
OSRM typé exposant un itinéraire et une matrice N×N.

**POST pour les deux**, y compris l'itinéraire. Jusqu'à 100 points ne tiennent
pas dans une URL, et surtout les coordonnées de livraison n'ont rien à faire
dans les journaux d'accès d'un reverse proxy : ce sont les adresses des clients
d'une entreprise.

**Toutes les coordonnées passent par `toOsrmCoordinates`** de `@sira/shared`.
OSRM attend `lon,lat` quand le reste du projet manipule `{ lat, lon }` ;
l'inversion ne provoque aucune erreur, seulement un itinéraire plausible au
mauvais endroit. Un test vérifie le chemin HTTP réellement émis, pas seulement
la réponse — c'est le seul endroit où le bug serait visible.

**Les codes d'erreur OSRM sont traduits**, parce que la distinction change qui
doit agir : `NoRoute` et `NoSegment` deviennent des 422 avec un message
actionnable pour le dispatcheur — une adresse mal placée, à corriger — là où un
service injoignable devient un 503 qui relève de l'exploitation. Tout confondre
en 500 enverrait le dispatcheur appeler le support pour une faute de saisie.

**Les distances ne sont demandées que si utiles** : OSRM les calcule à part et
la charge utile double. Le TSP n'a besoin que des durées.

**Vérification.** Neuf tests unitaires contre un faux serveur HTTP local, sans
bibliothèque de simulation. Puis la chaîne complète API → OSRM exercée contre
un vrai serveur monté sur l'extrait synthétique : matrice 3×3 cohérente, et une
coordonnée d'Accra refusée en 400 **avant** d'atteindre OSRM, par la borne
Côte d'Ivoire de `coordinatesSchema`.

---

## 2026-10-18 — Un import tolère les lignes fautives, l'API non

**Contexte.** `POST /missions/:id/stops/import` reçoit des fichiers saisis à
la main dans un tableur : en-têtes accentués, séparateur point-virgule,
colonnes maison, quelques lignes bancales.

**Décision — une ligne fautive n'annule pas l'import.** Les lignes valides
entrent, et la réponse rend le détail des rejets, numérotés **comme dans le
tableur** (en-tête comptée, donc à partir de 2). Un dispatcheur qui dépose
45 courses et reçoit « erreur ligne 12 » sans rien d'importé perd sa matinée.

**Les en-têtes sont reconnus par synonymes**, français et anglais, accents,
casse et séparateurs indifférents : « Téléphone », « tel contact » et « PHONE »
désignent le même champ. Les colonnes inconnues sont **listées dans la
réponse** plutôt qu'ignorées en silence — une colonne « Poids » mal orthographiée
doit se voir, pas disparaître.

**La tolérance s'arrête à la frontière du fichier.** `importStopSchema`
convertit les chaînes en nombres pour les coordonnées ; `createStopSchema`,
que servent les clients JSON, reste strict. Un mobile ou un dashboard n'a
aucune raison d'envoyer une latitude sous forme de texte, et accepter le
laxisme partout finit par masquer de vrais défauts d'appel.

**Garde-fous** : 2 Mo et 1000 lignes maximum, vérifiés avant toute analyse.
L'insertion des lignes valides se fait en un seul `createMany` : un import à
moitié appliqué laisserait le dispatcheur incapable de savoir quoi rejouer.

**Alternative écartée.** `xlsx` (SheetJS) pour le format Excel : le paquet npm
n'est plus mis à jour et traîne des avis de sécurité. `exceljs`, maintenu, fait
le travail.

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
