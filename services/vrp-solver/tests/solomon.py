"""Lecture des instances Solomon, limitee a ce dont les tests ont besoin."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"


@dataclass
class Customer:
    index: int
    x: float
    y: float
    demand: float
    ready: int
    due: int
    service: int


@dataclass
class SolomonInstance:
    name: str
    vehicle_count: int
    capacity: float
    customers: list[Customer]

    def distance_matrix(self) -> list[list[float]]:
        """Distances euclidiennes, qui servent aussi de durees.

        C'est la convention des instances Solomon : une unite de distance vaut
        une unite de temps.
        """
        points = [(c.x, c.y) for c in self.customers]
        return [[math.dist(a, b) for b in points] for a in points]


def read_instance(file: str) -> SolomonInstance:
    lines = (FIXTURES / file).read_text(encoding="utf-8").splitlines()
    name = lines[0].strip()

    vehicle_count, capacity = 0, 0.0
    customers: list[Customer] = []
    in_customers = False

    for position, raw in enumerate(lines):
        line = raw.strip()
        if line.startswith("NUMBER"):
            parts = lines[position + 1].split()
            vehicle_count, capacity = int(parts[0]), float(parts[1])
        if line.startswith("CUST NO."):
            in_customers = True
            continue
        if not in_customers or not line:
            continue
        parts = line.split()
        if len(parts) < 7 or not re.fullmatch(r"\d+", parts[0]):
            continue
        customers.append(
            Customer(
                index=int(parts[0]),
                x=float(parts[1]),
                y=float(parts[2]),
                demand=float(parts[3]),
                ready=int(parts[4]),
                due=int(parts[5]),
                service=int(parts[6]),
            )
        )

    return SolomonInstance(name, vehicle_count, capacity, customers)


def read_solution_cost(file: str, instance: SolomonInstance) -> tuple[float, int]:
    """Cout de la solution publiee, recalcule depuis les tournees.

    Jamais ecrit en dur : si l'un des deux fichiers etait corrompu, l'ecart se
    verrait immediatement.
    """
    matrix = instance.distance_matrix()
    total = 0.0
    routes = 0

    for raw in (FIXTURES / file).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line.lower().startswith("route"):
            continue
        nodes = [int(token) for token in line.split(":")[1].split()]
        routes += 1
        previous = 0  # le depot
        for node in nodes:
            total += matrix[previous][node]
            previous = node
        total += matrix[previous][0]

    return total, routes
