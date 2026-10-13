#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Клиент к LSfusion /exec — единственная точка доступа к логике «Код Урожая»."""

import os

import httpx

# действия с параметрами вызываются как /exec?action=Ku.<action>&p=<p1>&p=<p2>
EXEC_URL = "{base}/exec"


class LsfusionError(RuntimeError):
    """LSfusion вернул ошибку или недоступен."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code


def _settings() -> tuple[str, str, str]:
    base = os.getenv("LSFUSION_URL", "http://127.0.0.1:8080").rstrip("/")
    user = os.getenv("LSFUSION_USER", "admin")
    password = os.getenv("LSFUSION_PASSWORD", "fusion")
    return base, user, password


def call_action(action: str, params: list[str] | None = None, timeout: float = 60.0) -> str:
    """Вызвать серверное действие Ku.<action> и вернуть тело ответа (JSON-строка).

    Ошибки LSfusion (в т.ч. «Api is disabled» для не-админов) поднимаются как
    LsfusionError c исходным кодом; сетевые сбои — как 502.
    """
    base, user, password = _settings()
    url = EXEC_URL.format(base=base)
    query = {"action": f"Ku.{action}"}
    for p in params or []:
        query.setdefault("p", [])
        # httpx собирает повторяющиеся ключи p в список
        if isinstance(query["p"], list):
            query["p"].append(p)
    try:
        resp = httpx.get(
            url,
            params=query,
            auth=(user, password),
            timeout=timeout,
        )
    except httpx.HTTPError as e:
        raise LsfusionError(502, f"LSfusion недоступен: {e}") from e
    # строгая проверка 2xx: 3xx (редирект, напр. на /login) прежде молча
    # возвращался как «успешный» ответ с HTML вместо JSON
    if not (200 <= resp.status_code < 300):
        raise LsfusionError(
            resp.status_code if resp.status_code != 401 else 502,
            f"LSfusion {action}: HTTP {resp.status_code}: {resp.text[:300]}",
        )
    return resp.text
