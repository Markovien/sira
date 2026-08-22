# data/ — Jeux de données

## `abidjan-stops.json`

60 points de livraison réalistes répartis sur cinq communes d'Abidjan, plus
deux dépôts. C'est le jeu de référence utilisé par les tests, les benchmarks
d'optimisation (Phase 2) et les démonstrations.

| Commune     | Arrêts |
| ----------- | ------ |
| Cocody      | 15     |
| Marcory     | 12     |
| Yopougon    | 12     |
| Treichville | 11     |
| Plateau     | 10     |
| **Total**   | **60** |

Caractéristiques du jeu : 20 arrêts portent une fenêtre horaire, 6 sont
prioritaires, et la charge totale est de 467 kg. L'emprise va de 5,276 à
5,399 N et de 4,103 à 3,953 O, soit 16,8 km entre les deux arrêts les plus
éloignés — représentatif d'une journée de tournée abidjanaise.

Chaque arrêt porte un champ `informalDescription` : c'est le cœur du sujet.
En Côte d'Ivoire, l'adresse utile n'est pas un numéro de rue mais un repère
(« en face de la station-service, portail bleu à côté du maquis »). Les tests
vérifient que ce champ est renseigné partout — sans lui, le jeu de données ne
teste pas le vrai problème.

### Régénérer

```bash
python data/generate-abidjan-stops.py
```

Le générateur est déterministe (`SEED = 42`) : les coordonnées et les libellés
sont saisis à la main dans le script à partir de repères réels ; les attributs
logistiques (poids, volume, durée de service, fenêtres horaires, téléphones
fictifs) en sont dérivés de façon reproductible.

**Ne jamais modifier le JSON à la main** — la CI regénère le fichier et refuse
tout écart. Pour ajouter ou corriger un point, éditer la liste `STOPS` dans
`generate-abidjan-stops.py`.

### Valider

```bash
pnpm data:validate                                                    # schéma Zod + cohérences métier
check-jsonschema --schemafile data/abidjan-stops.schema.json data/abidjan-stops.json
```

`abidjan-stops.schema.json` (JSON Schema 2020-12) sert à la validation en CI et
à l'autocomplétion dans l'éditeur. Il doit rester aligné sur `stopsDatasetSchema`
dans [`packages/shared/src/schemas.ts`](../packages/shared/src/schemas.ts), qui
fait autorité côté application.

### Limites connues

- Les coordonnées sont approximatives (saisies depuis des repères, non relevées
  sur le terrain) : suffisantes pour tester le routage et l'optimisation, pas
  pour valider un géocodage au mètre près.
- Les numéros de téléphone sont fictifs et générés ; ne jamais les appeler ni
  les utiliser pour tester un envoi SMS réel.
- Aucune donnée personnelle réelle n'est présente dans ce dépôt, et il ne doit
  jamais y en avoir (loi ivoirienne n°2013-450, ARTCI).

## Répertoires ignorés par Git

`data/osm/` et `data/photon/` sont réservés aux extraits OSM et index de
géocodage volumineux, régénérables via `infra/osrm/prepare.sh` et
`infra/photon/prepare.sh`. Ils ne sont jamais commités.
