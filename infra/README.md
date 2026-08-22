# infra/ — Environnement local

Trois services, tous auto-hébergés et gratuits : PostgreSQL/PostGIS pour les
données, OSRM pour le routage, Photon pour le géocodage. Aucune clé d'API,
aucun compte à créer.

## Mise en route

```bash
cp .env.example .env            # puis ajuster les mots de passe
bash infra/osrm/prepare.sh      # ~15 min, ~2 Go — une seule fois
bash infra/photon/prepare.sh    # ~5 min, ~1 Go — une seule fois
pnpm infra:up
pnpm infra:smoke                # vérifie les critères d'acceptation Phase 0
```

Les deux scripts de préparation sont idempotents : relancés, ils détectent les
fichiers déjà présents et ne retéléchargent rien (utiliser `--force` pour
repartir de zéro).

### Prérequis réseau

La préparation télécharge des données depuis quatre domaines. Derrière un
proxy d'entreprise ou un environnement d'exécution restreint, ils doivent être
autorisés — sinon les scripts échouent en `403` sans que rien ne soit
récupérable ailleurs :

| Domaine                     | Contenu                       | Taille  |
| --------------------------- | ----------------------------- | ------- |
| `download.geofabrik.de`     | Extrait OSM Côte d'Ivoire     | ~80 Mo  |
| `download1.graphhopper.com` | Index de géocodage Photon CI  | ~700 Mo |
| `github.com`                | Jar officiel Photon           | ~70 Mo  |
| `registry-1.docker.io`      | Images PostGIS, OSRM, Temurin | ~1,5 Go |

## Services

| Service         | Port | Rôle                                                                |
| --------------- | ---- | ------------------------------------------------------------------- |
| `sira-postgres` | 5432 | PostgreSQL 16 + PostGIS, `pg_trgm` et `unaccent` créés au démarrage |
| `sira-osrm`     | 5000 | Routage et matrices de durées sur l'extrait OSM Côte d'Ivoire       |
| `sira-photon`   | 2322 | Géocodage sur l'index Côte d'Ivoire                                 |

### Pourquoi le pipeline MLD pour OSRM

OSRM propose deux pipelines : CH (Contraction Hierarchies), plus rapide à la
requête, et MLD (Multi-Level Dijkstra). SIRA utilise **MLD** parce que la
Phase 5 réinjecte périodiquement les vitesses apprises sur les traces des
livreurs : avec MLD, un `osrm-customize --segment-speed-file` de quelques
minutes suffit, là où CH imposerait de retraiter tout l'extrait. Ce choix est
donc structurant dès la Phase 0, avant même que le trafic soit implémenté.

### Pourquoi Photon plutôt que Nominatim

Photon se contente d'un index pré-construit téléchargeable par pays
(~1 Go pour la Côte d'Ivoire), là où Nominatim exige un import PostgreSQL de
plusieurs heures et des dizaines de gigaoctets. Le jar officiel est lancé sur
une image `eclipse-temurin` standard plutôt que via une image communautaire, ce
qui garde la chaîne d'approvisionnement lisible.

Photon ne connaît que ce qu'OSM contient. Le reste — l'adressage informel
abidjanais — sera couvert par la table `Address` propriétaire (Phase 1),
enrichie à chaque livraison confirmée. C'est elle, et non Photon, qui
constitue l'actif stratégique décrit au §10.1 du cadrage.

## Vérification

`infra/smoke-test.sh` contrôle les quatre critères d'acceptation de la Phase 0 :
PostGIS répond, OSRM renvoie une route Plateau → Cocody puis une matrice de
durées, Photon géocode « Pharmacie Saint Jean Cocody ». Il vérifie aussi que la
distance retournée est plausible — un aller-retour Abidjan/Ghana signalerait
des coordonnées inversées, l'erreur la plus fréquente avec OSRM, qui attend
`lon,lat`.

## Dépannage

| Symptôme                             | Cause probable                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `osrm` redémarre en boucle           | `infra/osrm/prepare.sh` n'a pas été exécuté, ou le nom de l'extrait diffère de `OSM_EXTRACT_NAME` |
| Photon répond mais ne trouve rien    | `photon_data/` absent ou index d'un autre pays                                                    |
| Photon tué par l'OOM killer          | Augmenter `-Xmx` dans `docker-compose.yml` (2 Go par défaut)                                      |
| `TableService` en erreur             | Matrice plus grande que `--max-table-size` (200)                                                  |
| Somme MD5 invalide au téléchargement | Miroir Geofabrik incomplet — relancer avec `--force`                                              |
| `403` au téléchargement              | Domaine bloqué par un proxy sortant — voir « Prérequis réseau »                                   |
| Smoke test : « démon Docker »        | Docker installé mais non démarré                                                                  |

## Production

Le pilote Abidjan tourne sur un seul VPS 8 Go avec ce même `docker-compose`
(roadmap Phase 7). Avant toute mise en production : mots de passe régénérés,
ports 5432 et 2322 non exposés publiquement, sauvegardes PostgreSQL
quotidiennes testées, TLS sur le domaine.
