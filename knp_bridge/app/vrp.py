#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VRP-MVP: оркестрация вывоза урожая (ФТ4.4, отложенный фронт прототипа).

Реализация по постановке «Иерархический алгоритм динамической оркестрации
парка сельхозтехники» (M1/M2/M3,Demand-M1, Urgency Score) из архива KNP —
упрощённый, но честный контур:

* Demand-M1 — вход: требования на вывоз [{field_id, lat, lon, volume_t,
  tau_hours}] (tau — предельное время до самосогревания лота);
* Urgency Score — приоритет требования: u = volume / max(tau, 1)
  (⚠ допущение MVP: в постановке M1 формула богаче, учитывает влажность
  и температурный интеграл лота — уточнить при подключении телеметрии);
* назначение — жадное по убыванию urgency: ближайшая машина со свободной
  остаточной вместимостью (замена M2-оптимизации);
* маршрут машины — nearest-neighbour от депо + улучшение 2-opt
  (замена M3-рендеринга маршрута);
* is_workable — флаг машины в входе; неработоспособные не назначаются.

Полноценный солвер (метаэристика/точный) — следующий шаг; контракт
входа/выхода менять не планируется.
"""

import math

EARTH_RADIUS_KM = 6371.0


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def urgency(demand: dict) -> float:
    tau = max(float(demand.get("tau_hours") or 24.0), 1.0)
    volume = float(demand.get("volume_t") or 0.0)
    return volume / tau


def _route_distance(depot: tuple[float, float], stops: list[tuple[float, float]]) -> float:
    if not stops:
        return 0.0
    total = haversine_km(depot, stops[0])
    for i in range(len(stops) - 1):
        total += haversine_km(stops[i], stops[i + 1])
    return total + haversine_km(stops[-1], depot)


def _two_opt(depot: tuple[float, float], stops: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Классический 2-opt: разворот сегментов, пока улучшается."""
    improved = True
    while improved:
        improved = False
        for i in range(len(stops) - 1):
            for j in range(i + 1, len(stops)):
                candidate = stops[: i + 1] + list(reversed(stops[i + 1 : j + 1])) + stops[j + 1 :]
                if _route_distance(depot, candidate) + 1e-9 < _route_distance(depot, stops):
                    stops = candidate
                    improved = True
    return stops


def _two_opt_order(depot: tuple[float, float], coords: list[tuple[float, float]]) -> list[int]:
    """2-opt, возвращающий перестановку ИНДЕКСОВ.

    Восстановление требований по координатам (dict по xy) схлопывало лоты
    одного поля с одинаковыми координатами — терялись требования и объёмы.
    """
    idx = list(range(len(coords)))
    improved = True
    while improved:
        improved = False
        for i in range(len(idx) - 1):
            for j in range(i + 1, len(idx)):
                cand = idx[: i + 1] + list(reversed(idx[i + 1 : j + 1])) + idx[j + 1 :]
                if (
                    _route_distance(depot, [coords[k] for k in cand]) + 1e-9
                    < _route_distance(depot, [coords[k] for k in idx])
                ):
                    idx = cand
                    improved = True
    return idx


def solve_vrp(depot: dict, demands: list[dict], vehicles: list[dict]) -> dict:
    depot_xy = (float(depot["lat"]), float(depot["lon"]))
    workable = [v for v in vehicles if v.get("is_workable", True)]
    broken = [v.get("id") for v in vehicles if not v.get("is_workable", True)]

    # M1: сортировка требований по Urgency Score (допущение — volume/tau)
    ranked = sorted(demands, key=urgency, reverse=True)

    loads = {v["id"]: 0.0 for v in workable}
    capacity = {v["id"]: float(v.get("capacity_t", 0)) for v in workable}
    assignments: dict[str, list[dict]] = {v["id"]: [] for v in workable}
    unassigned: list[dict] = []

    for d in ranked:
        xy = (float(d["lat"]), float(d["lon"]))
        volume = float(d.get("volume_t") or 0.0)
        # M2-MVP: ближайшая машина со свободной остаточной вместимостью
        candidates = [
            (haversine_km(xy, depot_xy), v["id"])
            for v in workable
            if loads[v["id"]] + volume <= capacity[v["id"]] + 1e-9
        ]
        if not candidates:
            unassigned.append({**d, "urgency": round(urgency(d), 3)})
            continue
        _, vid = min(candidates)
        assignments[vid].append(d)
        loads[vid] += volume

    routes = []
    for v in workable:
        stops = assignments[v["id"]]
        if not stops:
            continue
        coords = [(float(d["lat"]), float(d["lon"])) for d in stops]
        order = _two_opt_order(depot_xy, coords)
        ordered_demands = [stops[k] for k in order]
        ordered = [coords[k] for k in order]
        routes.append(
            {
                "vehicle_id": v["id"],
                "stops": [d["field_id"] for d in ordered_demands],
                "load_t": round(loads[v["id"]], 2),
                "capacity_t": capacity[v["id"]],
                "distance_km": round(_route_distance(depot_xy, ordered), 2),
                "eta_hours": round(
                    _route_distance(depot_xy, ordered)
                    / max(float(v.get("speed_kmh") or 40.0), 1.0),
                    2,
                ),
            }
        )

    return {
        "algorithm": "greedy-urgency + nearest-neighbour + 2-opt (MVP ФТ4.4)",
        "assumptions": [
            "Urgency Score = volume_t / max(tau_hours, 1) — упрощение формулы M1",
            "расстояния — гаверсинус по прямой, дорожная сеть не учитывается",
            "каждая машина делает один рейс от депо и обратно",
        ],
        "served": sum(len(r["stops"]) for r in routes),
        "unassigned_count": len(unassigned),
        "unassigned": unassigned,
        "vehicles_broken": broken,
        "routes": routes,
    }
