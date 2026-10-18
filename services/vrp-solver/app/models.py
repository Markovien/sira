"""Schemas d'entree et de sortie du solveur VRP.

Validation par Pydantic, qui joue ici le role que tient Zod cote TypeScript :
une requete mal formee doit etre refusee a la frontiere, pas provoquer une
erreur obscure au fond d'OR-Tools.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

# Au-dela, le temps de resolution devient incompatible avec un dispatcheur qui
# attend devant son ecran. Les tres grosses flottes relevent d'un traitement
# par lots, pas de cet endpoint.
MAX_NODES = 300
MAX_VEHICLES = 50


class TimeWindow(BaseModel):
    """Fenetre en secondes depuis le debut de la journee de service."""

    start: int = Field(ge=0)
    end: int = Field(ge=0)

    @model_validator(mode="after")
    def check_order(self) -> TimeWindow:
        if self.end < self.start:
            raise ValueError("La fenetre horaire doit se terminer apres son debut")
        return self


class Vehicle(BaseModel):
    """Un vehicule de la flotte.

    `start_index` et `end_index` permettent le multi-depots : une moto peut
    partir d'un hub et rendre son vehicule a un autre.
    """

    capacity_kg: float = Field(default=0, ge=0)
    start_index: int = Field(default=0, ge=0)
    end_index: int | None = Field(default=None, ge=0)


class SolveRequest(BaseModel):
    """Requete de resolution.

    Les durees sont en secondes et les charges en kilogrammes. Les index
    designent des positions dans `durations`, l'appelant restant maitre de la
    correspondance avec ses propres identifiants d'arret.
    """

    durations: list[list[float]]
    demands_kg: list[float] | None = None
    time_windows: list[TimeWindow] | None = None
    service_seconds: list[int] | None = None
    vehicles: list[Vehicle] = Field(min_length=1, max_length=MAX_VEHICLES)
    time_limit_seconds: int = Field(default=10, ge=1, le=300)
    # Laisser des arrets non servis plutot que de ne rien rendre : un
    # dispatcheur prefere une tournee partielle, qu'il complete a la main, a un
    # echec sec en fin de journee.
    allow_dropping: bool = True
    drop_penalty: float = Field(default=1_000_000, gt=0)

    @model_validator(mode="after")
    def check_shapes(self) -> SolveRequest:
        size = len(self.durations)
        if size < 2:
            raise ValueError("La matrice doit contenir au moins deux points")
        if size > MAX_NODES:
            raise ValueError(f"Matrice limitee a {MAX_NODES} points ({size} fournis)")
        for row_index, row in enumerate(self.durations):
            if len(row) != size:
                raise ValueError(
                    f"Matrice non carree : ligne {row_index} de taille {len(row)}, {size} attendu"
                )

        for name, values in (
            ("demands_kg", self.demands_kg),
            ("time_windows", self.time_windows),
            ("service_seconds", self.service_seconds),
        ):
            if values is not None and len(values) != size:
                raise ValueError(f"{name} doit compter {size} entrees, {len(values)} fournies")

        for position, vehicle in enumerate(self.vehicles):
            for label, index in (
                ("start_index", vehicle.start_index),
                ("end_index", vehicle.end_index),
            ):
                if index is not None and index >= size:
                    raise ValueError(
                        f"Vehicule {position} : {label} {index} hors de la matrice (taille {size})"
                    )

        return self


class Route(BaseModel):
    """Tournee affectee a un vehicule."""

    vehicle: int
    # Index dans la matrice, depot de depart et d'arrivee compris.
    stops: list[int]
    duration_seconds: float
    load_kg: float
    # Heure d'arrivee estimee a chaque arret, dans l'ordre de `stops`.
    arrival_seconds: list[int]


class SolveResponse(BaseModel):
    routes: list[Route]
    # Arrets qu'aucun vehicule n'a pu servir sous les contraintes donnees.
    dropped: list[int]
    total_duration_seconds: float
    solve_time_ms: int
    # Statut rendu par OR-Tools, utile au diagnostic cote appelant.
    status: str
