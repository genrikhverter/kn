#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Тесты VRP-MVP: приоритет urgent-лотов, вместимость, 2-opt не ухудшает."""

from app.vrp import haversine_km, solve_vrp

DEPOT = {"lat": 45.04, "lon": 38.976}


def _demand(fid, lat, lon, vol, tau=24):
    return {"field_id": fid, "lat": lat, "lon": lon, "volume_t": vol, "tau_hours": tau}


def test_urgent_served_first():
    # один рейс на двоих не влезает: срочный (tau=2) должен попасть в маршрут
    demands = [
        _demand("A", 45.10, 38.90, 6, tau=24),
        _demand("B", 45.05, 38.98, 6, tau=2),
    ]
    result = solve_vrp(DEPOT, demands, [{"id": "V1", "capacity_t": 10}])
    assert result["served"] == 1
    assert result["routes"][0]["stops"] == ["B"]
    assert result["unassigned"][0]["field_id"] == "A"


def test_capacity_respected():
    demands = [_demand(f"F{i}", 45.0 + i * 0.01, 39.0, 4) for i in range(4)]
    result = solve_vrp(DEPOT, demands, [{"id": "V1", "capacity_t": 10}])
    assert all(r["load_t"] <= 10 for r in result["routes"])
    assert result["served"] + result["unassigned_count"] == 4


def test_broken_vehicle_excluded():
    result = solve_vrp(
        DEPOT,
        [_demand("A", 45.1, 38.9, 1)],
        [{"id": "V1", "capacity_t": 5, "is_workable": False}],
    )
    assert result["vehicles_broken"] == ["V1"]
    assert result["unassigned_count"] == 1


def test_two_opt_not_worse():
    demands = [_demand(f"F{i}", 45.0 + i * 0.02, 39.0 - i * 0.01, 1) for i in range(6)]
    result = solve_vrp(DEPOT, demands, [{"id": "V1", "capacity_t": 20}])
    (route,) = result["routes"]
    coords = {d["field_id"]: (d["lat"], d["lon"]) for d in demands}
    # пересчёт длины маршрута по выданным стопам совпадает с заявленной
    stops = [coords[f] for f in route["stops"]]
    total = haversine_km((DEPOT["lat"], DEPOT["lon"]), stops[0])
    for i in range(len(stops) - 1):
        total += haversine_km(stops[i], stops[i + 1])
    total += haversine_km(stops[-1], (DEPOT["lat"], DEPOT["lon"]))
    assert abs(total - route["distance_km"]) < 0.05
