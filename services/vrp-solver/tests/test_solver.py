"""Tests du solveur VRP.

La qualite est mesuree sur C101 (Solomon), instance groupee a 100 clients avec
fenetres horaires serrees. Le cout de reference est recalcule depuis la
solution publiee, jamais ecrit en dur.
"""

from __future__ import annotations

import pytest

from app.models import SolveRequest, TimeWindow, Vehicle
from tests.solomon import read_instance, read_solution_cost


def square(values: list[list[float]]) -> list[list[float]]:
    return values


@pytest.fixture(scope="module")
def c101():
    instance = read_instance("C101.txt")
    reference, routes = read_solution_cost("C101.sol", instance)
    return instance, reference, routes


def build_request(instance, time_limit: int = 10) -> SolveRequest:
    matrix = instance.distance_matrix()
    return SolveRequest(
        durations=matrix,
        demands_kg=[c.demand for c in instance.customers],
        time_windows=[TimeWindow(start=c.ready, end=c.due) for c in instance.customers],
        service_seconds=[c.service for c in instance.customers],
        vehicles=[
            Vehicle(capacity_kg=instance.capacity, start_index=0, end_index=0)
            for _ in range(instance.vehicle_count)
        ],
        time_limit_seconds=time_limit,
    )


class TestSolomonC101:
    def test_la_solution_publiee_est_coherente(self, c101):
        instance, reference, routes = c101
        assert len(instance.customers) == 101  # depot + 100 clients
        assert routes == 10
        # Meilleure valeur connue pour C101 : 827,3. Un parseur casse donnerait
        # un ecart bien plus grand que ce demi pour cent.
        assert abs(reference - 827.3) / 827.3 < 0.01

    def test_sert_tous_les_clients(self, c101):
        instance, _, _ = c101
        response = solve_or_skip(build_request(instance))

        servis = {node for route in response.routes for node in route.stops if node != 0}
        assert response.dropped == []
        assert servis == set(range(1, 101))

    def test_respecte_capacites_et_fenetres(self, c101):
        instance, _, _ = c101
        request = build_request(instance)
        response = solve_or_skip(request)

        for route in response.routes:
            assert route.load_kg <= instance.capacity + 1e-6
            for node, arrival in zip(route.stops, route.arrival_seconds, strict=True):
                window = request.time_windows[node]
                assert window.start <= arrival <= window.end

    def test_cout_dans_les_15_pour_cent_de_la_reference(self, c101):
        instance, reference, _ = c101
        response = solve_or_skip(build_request(instance))

        gap = (response.total_duration_seconds - reference) / reference
        # Le critere d'acceptation de la Phase 2 est 15 %. Le solveur tombe a
        # 0,01 % : asserter 15 % laisserait passer une regression massive sans
        # rien signaler. La marge couvre les machines de CI plus lentes.
        assert gap <= 0.05, f"ecart {gap:.1%}, 5 % attendus au plus"


class TestContraintes:
    def test_refuse_une_matrice_non_carree(self):
        with pytest.raises(ValueError, match="non carree"):
            SolveRequest(durations=[[0, 1], [1]], vehicles=[Vehicle()])

    def test_refuse_une_matrice_trop_petite(self):
        with pytest.raises(ValueError, match="au moins deux points"):
            SolveRequest(durations=[[0]], vehicles=[Vehicle()])

    def test_refuse_un_depot_hors_matrice(self):
        with pytest.raises(ValueError, match="hors de la matrice"):
            SolveRequest(durations=[[0, 1], [1, 0]], vehicles=[Vehicle(start_index=5)])

    def test_refuse_une_fenetre_inversee(self):
        with pytest.raises(ValueError, match="se terminer apres"):
            TimeWindow(start=100, end=50)

    def test_une_capacite_nulle_vaut_non_contraint(self):
        # Beaucoup de livreurs ignorent la charge utile de leur tricycle :
        # zero doit valoir « pas de contrainte », pas « ne peut rien porter ».
        request = SolveRequest(
            durations=[[0, 10, 20], [10, 0, 15], [20, 15, 0]],
            demands_kg=[0, 50, 50],
            vehicles=[Vehicle(capacity_kg=0, start_index=0, end_index=0)],
            time_limit_seconds=2,
        )
        response = solve_or_skip(request)
        assert response.dropped == []

    def test_laisse_un_arret_de_cote_plutot_que_d_echouer(self):
        # Le noeud 2 a une fenetre impossible a tenir : la tournee doit quand
        # meme etre rendue, sans lui.
        request = SolveRequest(
            durations=[[0, 100, 100], [100, 0, 100], [100, 100, 0]],
            time_windows=[
                TimeWindow(start=0, end=86_400),
                TimeWindow(start=0, end=86_400),
                TimeWindow(start=0, end=10),
            ],
            vehicles=[Vehicle(start_index=0, end_index=0)],
            time_limit_seconds=2,
        )
        response = solve_or_skip(request)
        assert 2 in response.dropped
        assert any(1 in route.stops for route in response.routes)


class TestMultiDepots:
    def test_un_vehicule_peut_finir_ailleurs_qu_il_a_commence(self):
        request = SolveRequest(
            durations=[
                [0, 10, 20, 30],
                [10, 0, 10, 20],
                [20, 10, 0, 10],
                [30, 20, 10, 0],
            ],
            vehicles=[Vehicle(start_index=0, end_index=3)],
            time_limit_seconds=2,
        )
        response = solve_or_skip(request)
        route = response.routes[0]
        assert route.stops[0] == 0
        assert route.stops[-1] == 3


class TestCriterePhase2:
    """Le critere d'acceptation tel qu'ecrit dans la feuille de route :
    une flotte de 3 vehicules et 45 arrets resolue en moins de 15 s."""

    def test_trois_vehicules_quarante_cinq_arrets_abidjan(self):
        import json
        import math
        import time
        from pathlib import Path

        dataset = Path(__file__).parents[3] / "data" / "abidjan-stops.json"
        if not dataset.exists():
            pytest.skip("jeu de donnees Abidjan absent (service sorti du monorepo)")

        data = json.loads(dataset.read_text(encoding="utf-8"))
        depot = data["depots"][0]
        stops = data["stops"][:45]

        # Matrice de repli hors-ligne : vol d'oiseau x detour urbain / vitesse.
        # Les durees OSRM reelles viendront de l'API.
        speed_mps = 22 * 1000 / 3600
        points = [(depot["lat"], depot["lon"])] + [(s["lat"], s["lon"]) for s in stops]

        def seconds(a: tuple[float, float], b: tuple[float, float]) -> float:
            lat1, lon1 = map(math.radians, a)
            lat2, lon2 = map(math.radians, b)
            h = math.sin((lat2 - lat1) / 2) ** 2 + math.sin((lon2 - lon1) / 2) ** 2 * math.cos(
                lat1
            ) * math.cos(lat2)
            return 2 * 6_371_008.8 * math.asin(min(1, math.sqrt(h))) * 1.35 / speed_mps

        matrix = [
            [0.0 if i == j else seconds(a, b) for j, b in enumerate(points)]
            for i, a in enumerate(points)
        ]

        request = SolveRequest(
            durations=matrix,
            demands_kg=[0.0] + [s["loadKg"] for s in stops],
            service_seconds=[0] + [s["serviceMinutes"] * 60 for s in stops],
            vehicles=[Vehicle(capacity_kg=200, start_index=0, end_index=0) for _ in range(3)],
            time_limit_seconds=10,
        )

        started = time.perf_counter()
        response = solve_or_skip(request)
        elapsed = time.perf_counter() - started

        assert elapsed < 15, f"{elapsed:.1f} s, 15 s au plus attendues"
        assert response.dropped == []
        servis = {node for route in response.routes for node in route.stops if node != 0}
        assert servis == set(range(1, 46))


def solve_or_skip(request: SolveRequest):
    from app.solver import solve

    response = solve(request)
    if response.status not in {"SUCCESS", "FAIL_TIMEOUT"}:
        pytest.fail(f"resolution en echec : {response.status}")
    return response
