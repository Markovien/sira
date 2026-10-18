"""Tests de l'API HTTP."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_sonde_de_sante():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_resout_un_probleme_minimal():
    response = client.post(
        "/solve",
        json={
            "durations": [[0, 10, 20], [10, 0, 15], [20, 15, 0]],
            "vehicles": [{"start_index": 0, "end_index": 0}],
            "time_limit_seconds": 2,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["dropped"] == []
    assert body["routes"][0]["stops"][0] == 0
    assert body["total_duration_seconds"] > 0


def test_refuse_une_requete_mal_formee_a_la_frontiere():
    response = client.post(
        "/solve",
        json={"durations": [[0, 1], [1]], "vehicles": [{"start_index": 0}]},
    )
    # Refusee par Pydantic avant d'atteindre OR-Tools.
    assert response.status_code == 422


def test_refuse_une_flotte_vide():
    response = client.post(
        "/solve",
        json={"durations": [[0, 1], [1, 0]], "vehicles": []},
    )
    assert response.status_code == 422
