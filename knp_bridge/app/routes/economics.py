#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Слот /api/v1/economics: БДР, БДДС, сценарии цен, P&L-витрины.

В микросервисной платформе KNP контуру экономики соответствует заготовка
knp_economics (без API); здесь он закрывается модулями KuBudget/KuEtl
прототипа «Код Урожая» на LSfusion.
"""

import json

from fastapi import APIRouter, HTTPException, Query

from app.lsfusion import LsfusionError, call_action

router = APIRouter(prefix="/api/v1/economics", tags=["economics"])


def _call(action: str, params: list[str] | None = None):
    """Вызвать действие LSfusion и вернуть разобранный JSON."""
    try:
        raw = call_action(action, params)
    except LsfusionError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


@router.get("/bdr")
async def bdr(year: int = Query(..., description="Планируемый год (план ГП-ГГГГ-*)")):
    """Сводка БДР за год: план, сценарий, статус, доходы/расходы/маржа."""
    return _call("apiKnpBdr", [str(year)])


@router.get("/bdr/{plan}/items")
async def bdr_items(plan: str):
    """Строки БДР плана: месяц, тип, статья, культура, сумма."""
    return _call("apiKnpBdrItems", [plan])


@router.get("/bdds")
async def bdds(year: int = Query(...)):
    """Строки БДДС за год: месяц, движение, сумма, источник, условие оплаты."""
    return _call("apiKnpBdds", [str(year)])


@router.get("/prices")
async def prices():
    """Сценарии цен: наименование, статус, версия, период действия."""
    return _call("apiKnpPrices")


@router.get("/prices/{scenario}/items")
async def price_items(scenario: str):
    """Цены номенклатуры в сценарии."""
    return _call("apiKnpPriceItems", [scenario])


@router.get("/crop-pnl")
async def crop_pnl():
    """Витрина DWH: P&L по культурам (доход/расход/маржа/рентабельность)."""
    return _call("apiKnpCropPnl")


@router.get("/field-season")
async def field_season(season: int = Query(...)):
    """Витрина DWH: поле × сезон (площадь, урожай, прогноз)."""
    return _call("apiKnpFieldSeason", [str(season)])
