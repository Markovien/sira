"""Resolution VRP par OR-Tools.

Strategie retenue (roadmap Phase 2.2) : PATH_CHEAPEST_ARC pour la solution
initiale, puis GUIDED_LOCAL_SEARCH pour l'ameliorer jusqu'a epuisement du
budget de temps. C'est la combinaison de reference du domaine : la recherche
guidee penalise les aretes qu'elle utilise trop souvent, ce qui la fait sortir
des optima locaux ou une descente simple s'enliserait.
"""

from __future__ import annotations

import time

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from .models import Route, SolveRequest, SolveResponse

# OR-Tools raisonne en entiers. Les durees arrivent en secondes, parfois
# fractionnaires : on arrondit a la seconde, precision tres au-dela de ce que
# vaut une estimation de trafic urbain.
_SCALE = 1

# Horizon d'une journee de service, borne superieure de la dimension temps.
_HORIZON_SECONDS = 24 * 3600


def solve(request: SolveRequest) -> SolveResponse:
    started = time.perf_counter()

    size = len(request.durations)
    vehicle_count = len(request.vehicles)

    starts = [v.start_index for v in request.vehicles]
    ends = [v.end_index if v.end_index is not None else v.start_index for v in request.vehicles]

    manager = pywrapcp.RoutingIndexManager(size, vehicle_count, starts, ends)
    routing = pywrapcp.RoutingModel(manager)

    durations = [[int(round(value * _SCALE)) for value in row] for row in request.durations]
    service = request.service_seconds or [0] * size

    def transit(from_index: int, to_index: int) -> int:
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        # Le temps de service est impute au depart du noeud : c'est la
        # convention d'OR-Tools pour que la dimension temps reste coherente.
        return durations[from_node][to_node] + service[from_node]

    transit_callback = routing.RegisterTransitCallback(transit)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback)

    _add_capacity(routing, manager, request, size)
    time_dimension = _add_time(routing, manager, request, transit_callback, size)
    _allow_dropping(routing, manager, request, size, starts, ends)

    parameters = pywrapcp.DefaultRoutingSearchParameters()
    parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    parameters.time_limit.FromSeconds(request.time_limit_seconds)

    solution = routing.SolveWithParameters(parameters)
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    if solution is None:
        return SolveResponse(
            routes=[],
            dropped=list(range(size)),
            total_duration_seconds=0,
            solve_time_ms=elapsed_ms,
            status=_status_name(routing.status()),
        )

    routes, total = _extract_routes(routing, manager, solution, request, time_dimension, durations)
    served = {node for route in routes for node in route.stops}
    dropped = [node for node in range(size) if node not in served and node not in starts + ends]

    return SolveResponse(
        routes=routes,
        dropped=dropped,
        total_duration_seconds=total,
        solve_time_ms=elapsed_ms,
        status=_status_name(routing.status()),
    )


def _add_capacity(routing, manager, request: SolveRequest, size: int) -> None:
    """Contrainte de charge, si des demandes sont fournies."""
    if request.demands_kg is None:
        return

    demands = [int(round(value)) for value in request.demands_kg]
    capacities = [int(round(v.capacity_kg)) for v in request.vehicles]

    # Une capacite a zero signifie « non contraint » et non « ne peut rien
    # porter » : beaucoup de livreurs independants ne connaissent pas la charge
    # utile de leur tricycle.
    if all(capacity == 0 for capacity in capacities):
        return
    capacities = [capacity if capacity > 0 else sum(demands) for capacity in capacities]

    def demand(index: int) -> int:
        return demands[manager.IndexToNode(index)]

    callback = routing.RegisterUnaryTransitCallback(demand)
    routing.AddDimensionWithVehicleCapacity(
        callback,
        0,  # pas de marge
        capacities,
        True,  # la charge part de zero
        "Capacite",
    )
    _ = size


def _add_time(routing, manager, request: SolveRequest, transit_callback: int, size: int):
    """Dimension temps, et fenetres horaires si elles sont fournies."""
    routing.AddDimension(
        transit_callback,
        # Attente autorisee : un livreur peut arriver en avance et patienter
        # jusqu'a l'ouverture de la fenetre.
        _HORIZON_SECONDS,
        _HORIZON_SECONDS,
        False,  # la journee ne commence pas forcement a zero
        "Temps",
    )
    dimension = routing.GetDimensionOrDie("Temps")

    if request.time_windows is not None:
        for node in range(size):
            window = request.time_windows[node]
            index = manager.NodeToIndex(node)
            if index < 0:
                continue
            dimension.CumulVar(index).SetRange(window.start, window.end)

        # Les depots de depart ne passent pas par NodeToIndex : leurs bornes se
        # posent sur l'index de depart du vehicule.
        for vehicle in range(len(request.vehicles)):
            start = routing.Start(vehicle)
            node = manager.IndexToNode(start)
            window = request.time_windows[node]
            dimension.CumulVar(start).SetRange(window.start, window.end)
            routing.AddVariableMinimizedByFinalizer(dimension.CumulVar(start))
            routing.AddVariableMinimizedByFinalizer(dimension.CumulVar(routing.End(vehicle)))

    return dimension


def _allow_dropping(routing, manager, request: SolveRequest, size: int, starts, ends) -> None:
    """Autorise a laisser un arret non servi, moyennant une forte penalite.

    Sans cela, une seule fenetre horaire infaisable rend tout le probleme
    infaisable et le dispatcheur se retrouve sans rien a 18 h.
    """
    if not request.allow_dropping:
        return

    penalty = int(round(request.drop_penalty))
    depots = set(starts) | set(ends)
    for node in range(size):
        if node in depots:
            continue
        routing.AddDisjunction([manager.NodeToIndex(node)], penalty)


def _extract_routes(routing, manager, solution, request, time_dimension, durations):
    routes: list[Route] = []
    total = 0.0
    demands = request.demands_kg or [0.0] * len(request.durations)

    for vehicle in range(len(request.vehicles)):
        index = routing.Start(vehicle)
        stops: list[int] = []
        arrivals: list[int] = []
        load = 0.0
        duration = 0.0

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            stops.append(node)
            arrivals.append(solution.Value(time_dimension.CumulVar(index)))
            load += demands[node]

            previous = index
            index = solution.Value(routing.NextVar(index))
            duration += durations[manager.IndexToNode(previous)][manager.IndexToNode(index)]

        node = manager.IndexToNode(index)
        stops.append(node)
        arrivals.append(solution.Value(time_dimension.CumulVar(index)))

        # Un vehicule qui va du depot au depot n'a rien servi : l'inclure
        # ferait croire a une tournee vide alors qu'il n'est pas sorti.
        if len(stops) <= 2 and stops[0] == stops[-1]:
            continue

        routes.append(
            Route(
                vehicle=vehicle,
                stops=stops,
                duration_seconds=duration,
                load_kg=load,
                arrival_seconds=arrivals,
            )
        )
        total += duration

    return routes, total


def _status_name(status: int) -> str:
    names = {
        0: "NOT_SOLVED",
        1: "SUCCESS",
        2: "FAIL",
        3: "FAIL_TIMEOUT",
        4: "INVALID",
    }
    return names.get(status, f"UNKNOWN_{status}")
