# services/vrp-solver

Microservice de résolution VRP : FastAPI + Google OR-Tools.

Il reçoit une matrice de durées et des contraintes, il renvoie des tournées.
Il ne connaît ni la base de données ni les identifiants métier — c'est l'API
NestJS qui fait la correspondance avec les arrêts réels. Cette ignorance est
délibérée : elle rend le service testable seul et remplaçable sans toucher au
reste.

## Démarrer

```bash
pnpm infra:up                               # le service monte avec la stack
curl http://localhost:8000/health
```

En local, hors Docker :

```bash
pip install -e ".[dev]"
uvicorn app.main:app --reload
pytest -q
```

Documentation interactive sur `/docs` (FastAPI la génère).

## `POST /solve`

| Champ                | Rôle                                                           |
| -------------------- | -------------------------------------------------------------- |
| `durations`          | matrice N×N en secondes                                        |
| `demands_kg`         | charge par arrêt, optionnel                                    |
| `time_windows`       | fenêtre par arrêt, en secondes depuis le début de journée      |
| `service_seconds`    | temps passé sur place par arrêt                                |
| `vehicles`           | capacité, dépôt de départ et d'arrivée — multi-dépôts possible |
| `time_limit_seconds` | budget de calcul, 10 s par défaut                              |
| `allow_dropping`     | autorise à laisser un arrêt non servi                          |

Réponse : les tournées (arrêts, durée, charge, heures d'arrivée estimées), les
arrêts non servis, et le statut rendu par OR-Tools.

### Décisions qui se voient à l'usage

**Un arrêt peut être laissé de côté.** Sans cela, une seule fenêtre horaire
infaisable rend tout le problème infaisable et le dispatcheur se retrouve sans
rien à 18 h. La pénalité est assez forte pour qu'abandonner reste un dernier
recours, et les arrêts écartés sont listés explicitement.

**Une capacité à zéro vaut « non contraint »**, pas « ne peut rien porter ».
Beaucoup de livreurs ignorent la charge utile de leur tricycle.

**Le temps de service est imputé au départ du nœud**, convention d'OR-Tools
qui garde la dimension temps cohérente.

## Stratégie

`PATH_CHEAPEST_ARC` pour la solution initiale, puis `GUIDED_LOCAL_SEARCH`
jusqu'à épuisement du budget. C'est la combinaison de référence : la recherche
guidée pénalise les arêtes qu'elle réutilise trop, ce qui la fait sortir des
optima locaux où une descente simple s'enliserait.

## Validation

| Mesure                          | Critère Phase 2 | Obtenu     |
| ------------------------------- | --------------- | ---------- |
| Écart sur Solomon C101          | ≤ 15 %          | **0,01 %** |
| 3 véhicules × 45 arrêts Abidjan | < 15 s          | **10,0 s** |

C101 est une instance groupée à 100 clients avec fenêtres horaires serrées. Le
coût de référence est **recalculé depuis la solution publiée** (`C101.sol`),
jamais écrit en dur — un fichier corrompu se verrait immédiatement. Le test
vérifie au passage que ce calcul tombe à moins de 1 % de la meilleure valeur
connue pour C101 (827,3), ce qui valide le lecteur d'instance.

R101 n'était pas récupérable depuis une source accessible ; voir
[`decisions.md`](../../decisions.md).

Les instances Abidjan utilisent la matrice de repli hors-ligne (vol d'oiseau ×
détour urbain ÷ vitesse moyenne), pas OSRM : ce sont des ordres de grandeur,
pas des durées de référence.
