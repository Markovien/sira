"""API du microservice VRP.

Un seul endpoint utile, `POST /solve`, plus une sonde de sante. Le service ne
connait ni la base de donnees ni les identifiants metier : il recoit une
matrice et des contraintes, il renvoie des tournees. C'est l'API NestJS qui
fait la correspondance avec les arrets reels.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException
from pydantic import ValidationError

from .models import SolveRequest, SolveResponse
from .solver import solve as solve_vrp

logger = logging.getLogger("sira.vrp")

app = FastAPI(
    title="SIRA — solveur VRP",
    description=(
        "Resolution de tournees multi-vehicules par OR-Tools. "
        "Capacites, fenetres horaires et multi-depots."
    ),
    version="0.1.0",
)


@app.get("/health", tags=["sante"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve", response_model=SolveResponse, tags=["resolution"])
def solve(request: SolveRequest) -> SolveResponse:
    try:
        response = solve_vrp(request)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors()) from error
    except Exception as error:  # noqa: BLE001 - la cause exacte importe peu a l'appelant
        logger.exception("Resolution VRP en echec")
        raise HTTPException(status_code=500, detail="Resolution impossible") from error

    if response.dropped:
        logger.warning(
            "%d arret(s) non servi(s) sous les contraintes donnees", len(response.dropped)
        )

    return response
