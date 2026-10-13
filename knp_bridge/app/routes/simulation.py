#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Слот /api/v1/simulation: сценарный анализ GDD (модель KuGDD).

В KNP за моделирование отвечает заготовка knp_ai_simulation; здесь он
закрывается контуром KuSimulation прототипа. Паттерн Long-Running
Operation: запуск возвращает runId, статус — опросом (как у KNP).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.lsfusion import LsfusionError, call_action
from app.routes.economics import _call

router = APIRouter(prefix="/api/v1/simulation", tags=["simulation"])


class SimulationRunRequest(BaseModel):
    """Запуск сценария «засуха» по полю."""

    field: str = Field(..., description="Код поля, напр. KH-001", examples=["KH-001"])
    days: int = Field(14, ge=1, le=120, description="Длительность засухи, дней")


@router.post("/run", status_code=202)
async def run(req: SimulationRunRequest):
    """Запустить сценарий; ответ содержит runId для опроса статуса."""
    return _call("apiSimRun", [req.field, str(req.days)])


@router.get("/status")
async def status(run_id: str):
    """Статус сценарного прогона: состояние, прогноз урожайности."""
    try:
        raw = call_action("apiSimStatus", [run_id])
    except LsfusionError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    import json

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}
    if not data:
        raise HTTPException(status_code=404, detail=f"Сценарий {run_id} не найден")
    return data
