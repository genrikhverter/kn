#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Слот /api/v1/logistics: оркестрация вывоза (VRP, ФТ4.4).

Demand-M1 из постановки KNP: требования на вывоз лотов с полей. Пока
решатель живёт в мосте (чистая функция, без БД); при появлении контура
лотов в LSfusion — переехать туда без изменения контракта.
"""

from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from app.vrp import solve_vrp

router = APIRouter(prefix="/api/v1/logistics", tags=["logistics"])


class Depot(BaseModel):
    lat: float
    lon: float


class Demand(BaseModel):
    """Требование на вывоз (Demand-M1): лот/партия с поля."""

    field_id: str = Field(..., examples=["KH-001"])
    lat: float
    lon: float
    volume_t: float = Field(..., gt=0, description="Объём к вывозу, т")
    tau_hours: float = Field(24.0, gt=0, description="Предельное время до порчи, ч")


class Vehicle(BaseModel):
    id: str = Field(..., examples=["KAMAZ-X542"])
    capacity_t: float = Field(..., gt=0)
    speed_kmh: float = Field(40.0, gt=0)
    is_workable: bool = True


class VrpRequest(BaseModel):
    depot: Depot
    demands: list[Demand]
    vehicles: list[Vehicle]


@router.post("/vrp/solve")
async def vrp_solve(req: VrpRequest):
    """Рассчитать маршруты вывоза: назначения по Urgency Score, NN + 2-opt."""
    return solve_vrp(
        req.depot.model_dump(),
        [d.model_dump() for d in req.demands],
        [v.model_dump() for v in req.vehicles],
    )


class VrpFlatResponse(Response):
    media_type = "text/plain"


def _flat_vrp(result: dict) -> str:
    """Плоская выдача для LSfusion (карта «Код Урожая», секция ROUTES):
    vehicle^stops_csv^load_t^capacity_t^distance_km^eta_hours, строки через ||"""
    rows = []
    for r in result.get("routes", []):
        rows.append(
            "{}^{}^{}^{}^{}^{}".format(
                r["vehicle_id"],
                ",".join(r["stops"]),
                r.get("load_t", 0),
                r.get("capacity_t", 0),
                r.get("distance_km", 0),
                r.get("eta_hours", 0),
            )
        )
    return "~".join(rows)


@router.get("/vrp/solve-get", response_class=VrpFlatResponse)
async def vrp_solve_get(depot: str, demands: str, vehicles: str):
    """GET-вариант для EXTERNAL HTTP из LSfusion: параметры компактными строками.

    depot="lat,lon"; demands="field:lat:lon:volume_t:tau_hours,...";
    vehicles="id:capacity_t:speed_kmh:is_workable,...". Ответ — плоский текст."""
    d_lat, d_lon = (float(x) for x in depot.split(","))
    dems = []
    for part in demands.split(","):
        if not part:
            continue
        fid, lat, lon, vol, tau = part.split(":")
        dems.append(
            Demand(
                field_id=fid,
                lat=float(lat),
                lon=float(lon),
                volume_t=float(vol),
                tau_hours=float(tau),
            )
        )
    vehs = []
    for part in vehicles.split(","):
        if not part:
            continue
        vid, cap, spd, work = part.split(":")
        vehs.append(
            Vehicle(
                id=vid,
                capacity_t=float(cap),
                speed_kmh=float(spd),
                is_workable=work.lower() == "true",
            )
        )
    result = solve_vrp({"lat": d_lat, "lon": d_lon},
                       [d.model_dump() for d in dems],
                       [v.model_dump() for v in vehs])
    return _flat_vrp(result)
