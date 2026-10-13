#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Слот /api/v1/ku: общий доступ к прототипу «Код Урожая».

События отдаются в конверте CloudEvents 1.0 (контракт шины KNP,
«Постановки задач» §2.3), поля — GeoJSON FeatureCollection для их
фронтенд-карты.
"""

import hashlib
import json
import re

from fastapi import APIRouter, HTTPException, Query

from app.lsfusion import LsfusionError, call_action

router = APIRouter(prefix="/api/v1/ku", tags=["ku"])

# «План севооборота утверждён» -> ru.knp.plan_утверждён -> оставляем a-z0-9_
_SLUG_RE = re.compile(r"[^0-9a-zA-Z]+")


def _type_slug(kind: str) -> str:
    slug = _SLUG_RE.sub("_", kind).strip("_").lower()
    # кириллица выкинулась regexp'ом — оставляем транслит-нейтральный якорь
    return f"ru.knp.{slug}" if slug else "ru.knp.event"


def _to_cloudevents(rows: list[dict], limit: int) -> list[dict]:
    """Переупаковать события шины KuEvent в конверт CloudEvents 1.0.

    Идентификатор — детерминированный хеш (тип+время+объект): у KuEvent нет
    собственного ULID; при появлении — подставить сюда.
    """
    events = []
    for row in rows[:limit]:
        key = f"{row.get('kind')}|{row.get('at')}|{row.get('objectId')}".encode("utf-8")
        events.append(
            {
                "specversion": "1.0",
                "id": "ku-" + hashlib.sha1(key).hexdigest()[:16],
                "source": "/knp/lsfusion",
                "type": _type_slug(row.get("kind") or ""),
                "time": row.get("at"),
                "data": {
                    "objectkind": row.get("objectKind"),
                    "objectid": row.get("objectId"),
                    "user": row.get("user"),
                    "payload": row.get("payload"),
                },
            }
        )
    return events


@router.get("/events")
async def events(limit: int = Query(50, ge=1, le=500)):
    """Последние бизнес-события прототипа в конверте CloudEvents."""
    try:
        raw = call_action("apiKnpEvents")
    except LsfusionError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    try:
        rows = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="LSfusion вернул не-JSON")
    rows = sorted(rows, key=lambda r: r.get("at") or "", reverse=True)
    return _to_cloudevents(rows, limit)


@router.get("/map/fields")
async def map_fields():
    """Поля прототипа как GeoJSON FeatureCollection (для карты KNP)."""
    try:
        raw = call_action("apiKnpMapFields")
    except LsfusionError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e)) from e
    rows = json.loads(raw)
    features = []
    for row in rows:
        geometry = None
        boundary = row.get("boundary")
        # LSfusion EXPORT JSON встраивает TEXT с валидным JSON как объект, а не строку
        if isinstance(boundary, dict):
            geometry = boundary
        elif isinstance(boundary, str):
            try:
                geometry = json.loads(boundary)
            except (json.JSONDecodeError, TypeError):
                geometry = None
        if geometry is None and row.get("lat") is not None and row.get("lon") is not None:
            geometry = {"type": "Point", "coordinates": [row["lon"], row["lat"]]}
        if geometry is None:
            # поля без контура (напр., KH-201..205 демо-данных) не отдаём:
            # geometry:null ломает клиента карты (maptalks возвращает null)
            continue
        features.append(
            {
                "type": "Feature",
                "id": row.get("code"),
                "geometry": geometry,
                "properties": {
                    "code": row.get("code"),
                    "name": row.get("name"),
                    "areaHa": row.get("areaHa"),
                    "crop": row.get("crop"),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}
