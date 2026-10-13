#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Конвертер LSfusion → knp_recycling: GET с массой → POST полного расчёта.

LSfusion умеет исходящий `EXTERNAL HTTP GET` (паттерн Mite.lsf), а
калькулятор переработки KNP принимает вложенный JSON POST'ом. Мост
достраивает профиль сырья/тарифов/технологии по умолчанию (допущения
зафиксированы ниже) и возвращает плоский JSON, удобный для
`IMPORT JSON` в LSfusion, плюс сырой ответ калькулятора.
"""

import os

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/v1/ku/recycling", tags=["recycling"])

RECYCLING_URL = os.getenv("RECYCLING_SERVICE_URL", "http://127.0.0.1:8095").rstrip("/")

# Профиль соломы зерновых и тарифы хозяйства (⚠ допущения MVP — уточнить у экономиста)
STRAW_PROFILE = {"moisture_percent": 20.0, "ash_percent": 8.0, "cn_ratio": 60.0, "ph_level": 6.5}
TARIFFS = {
    "waste_price_per_kg": 0.5,
    "electricity_rub_kwh": 6.0,
    "heat_rub_kwh": 4.0,
    "fuel_rub_liter": 62.0,
}
PHYSICS = {"volume_m3": 500.0, "k_heat_transfer": 1.5, "methane_percent": 60.0}

TECH = {
    "biogas": {"equipment_name": "biogas-station-500", "biogas_price_per_m3": 12.0, "digestate_price_per_kg": 2.0},
    "bsf": {"equipment_name": "bsf-reactor", "larvae_price_per_kg": 150.0, "humus_price_per_kg": 15.0},
    "pellets": {"equipment_name": "pellet-press", "pellet_price_per_kg": 9.0},
    "microwave": {"equipment_name": "grain-dryer-mw", "saved_grain_price_per_kg": 12.0, "target_moisture": 14.0},
    "hemp": {"equipment_name": "hemp-line", "board_price_per_kg": 45.0, "fixed_costs_year": 2_500_000.0},
}


def _payload(kind: str, mass_t: float, distance_km: float) -> dict:
    return {
        "waste": {"mass_kg": mass_t * 1000.0, **STRAW_PROFILE},
        "tariffs": dict(TARIFFS),
        "env": {"ambient_temp_c": 15.0},
        "logistics": {"distance_km": distance_km, "transport_type": "самосвал"},
        "physics": dict(PHYSICS),
        "tech": dict(TECH[kind]),
    }


@router.get("/{kind}")
async def calc(
    kind: str,
    mass_t: float = Query(..., gt=0, description="Масса сырья, т (солома/отходы)"),
    distance_km: float = Query(25.0, ge=0, description="Дальность вывоза, км"),
):
    """Расчёт экономики переработки: kind = biogas|bsf|pellets|microwave|hemp."""
    kind = kind.strip().lower()
    if kind not in TECH:
        raise HTTPException(status_code=400, detail=f"Неизвестный способ: {kind}. Допустимы: {', '.join(TECH)}")
    try:
        resp = await httpx.AsyncClient().post(
            f"{RECYCLING_URL}/{kind}",
            json=_payload(kind, mass_t, distance_km),
            timeout=30.0,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Калькулятор переработки недоступен: {e}") from e
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=f"Калькулятор: {resp.text[:300]}")
    raw = resp.json()
    flat = {
        "kind": kind,
        "mass_t": mass_t,
        "revenue": raw["financial"]["revenue"],
        "opex": raw["financial"]["opex"],
        "net_profit": raw["financial"]["net_profit"],
        "roi_percent": raw["financial"]["roi_percent"],
        "co2_prevented_kg": raw["eco"]["co2_prevented_kg"],
        "nitrogen_returned_kg": raw["eco"]["nitrogen_returned_kg"],
        "product_1_kg": raw["material"]["product_1_kg"],
        "product_2_kg": raw["material"]["product_2_kg"],
        "energy_generated_kwh": raw["energy"]["energy_generated_kwh"],
        "trips_count": raw["logistics"]["trips_count"],
    }
    return flat
