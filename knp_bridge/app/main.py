#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""knp_bridge — мост «Код Урожая» (LSfusion) → контракт платформы KNP /api/v1.

Закрывает слоты KNP, реализованные в прототипе на LSfusion:
  * economics   — БДР/БДДС/цены/P&L-витрины (в KNP knp_economics — заготовка);
  * simulation  — сценарный анализ GDD (в KNP knp_ai_simulation — заготовка);
  * yield       — баланс NPK по полям;
  * ku          — бизнес-события (CloudEvents) и поля для карты (GeoJSON).

Мост не содержит бизнес-логики: каждый эндпоинт — один вызов действия
Ku.* на LSfusion-сервере через /exec. Владелец логики — LSfusion.

Запуск: см. ../README.md; переменные окружения — app/lsfusion.py.
"""

from fastapi import FastAPI

from app.routes import economics, ku, npk, recycling, simulation, vrp

app = FastAPI(
    title="knp_bridge",
    description="LSfusion «Код Урожая» за контрактом /api/v1 платформы KNP",
    version="1.2.0",
)

app.include_router(economics.router)
app.include_router(simulation.router)
app.include_router(npk.router)
app.include_router(ku.router)
app.include_router(vrp.router)
app.include_router(recycling.router)


@app.get("/health", tags=["service"])
async def health():
    return {"status": "ok", "service": "knp-lsfusion-bridge"}
