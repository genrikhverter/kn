#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Слот /api/v1/yield: агрохимия — баланс NPK по полю (модуль KuYield)."""

from fastapi import APIRouter, Query

from app.routes.economics import _call

router = APIRouter(prefix="/api/v1/yield", tags=["yield"])


@router.get("/npk")
async def npk(
    field: str = Query(..., description="Код поля, напр. KH-001", examples=["KH-001"]),
):
    """Баланс NPK последней версии комплексного плана поля.

    Возвращает вынос/запас почвы/потребность кг д.в. на га по элементам
    N-P-K, носитель удобрений и стоимость внесения на га.
    """
    return _call("apiKnpNpk", [field])
