#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Контрактный тест моста против LSfusion-логики.

Паттерн перенят у KNP (tests_e2e/test_seed_lots.py читает машину
состояний из LotState.java): подписи действий парсятся прямо из
исходников .lsf, поэтому мост не может молча разойтись с логикой —
падает здесь, а не на стенде.
"""

import os
import re
from pathlib import Path

Lsf_DIR = Path(
    os.getenv(
        "KU_LSF_DIR",
        Path(__file__).resolve().parents[3]
        / "mite_dev/sources/mite_public/src/main/lsfusion/ku",
    )
)

# действие -> число параметров, с которыми его вызывает мост
ACTIONS_USED = {
    "apiKnpBdr": 1,
    "apiKnpBdrItems": 1,
    "apiKnpBdds": 1,
    "apiKnpPrices": 0,
    "apiKnpPriceItems": 1,
    "apiKnpCropPnl": 0,
    "apiKnpFieldSeason": 1,
    "apiKnpNpk": 1,
    "apiKnpEvents": 0,
    "apiKnpMapFields": 0,
    # из KuSimulation (существовали до моста)
    "apiSimRun": 2,
    "apiSimStatus": 1,
}

_ACTION_RE = re.compile(
    r"^\s*((?:apiKnp|apiSim)\w+)\s+'[^']*'\s*\(([^)]*)\)", re.MULTILINE
)


def _parse_signatures() -> dict[str, int]:
    signatures: dict[str, int] = {}
    for name in ("KuKnpApi.lsf", "KuKnpApiEtl.lsf", "KuSimulation.lsf"):
        text = (Lsf_DIR / name).read_text(encoding="utf-8")
        for action, params in _ACTION_RE.findall(text):
            params = params.strip()
            signatures[action] = 0 if not params else len(params.split(","))
    return signatures


def test_lsf_sources_exist():
    for name in ("KuKnpApi.lsf", "KuSimulation.lsf"):
        assert (Lsf_DIR / name).is_file(), f"нет исходника {name}"


def test_bridge_actions_exist_with_matching_arity():
    signatures = _parse_signatures()
    missing = [a for a in ACTIONS_USED if a not in signatures]
    assert not missing, f"в .lsf нет действий, которые вызывает мост: {missing}"
    for action, used in ACTIONS_USED.items():
        assert signatures[action] == used, (
            f"{action}: мост вызывает с {used} параметрами, в .lsf {signatures[action]}"
        )


def test_no_unparsed_api_actions():
    """Все api-действия из .lsf либо используются мостом, либо заведомо легаси."""
    signatures = _parse_signatures()
    legacy = {
        "apiRotationGet", "apiRotationSave", "apiRotationVersions", "apiRotationCopy",
        "apiRotationViolations", "apiTechCardCreate", "apiTechCardApprove",
        "apiReportRun", "apiCadastralFetch",
        # ручки аудита/версий участка (hash-chain, слот ku) — для шлюза KNP,
        # напрямую мостом не вызываются
        "apiKnpAudit", "apiKnpPlotVersions",
        # переработка: ручку дёргает LSfusion (форма RecyclingCalc), мост
        # наоборот принимает её EXTERNAL-вызов как конвертер к knp_recycling
        "apiKnpRecycling",
    }
    unknown = set(signatures) - set(ACTIONS_USED) - legacy
    assert not unknown, f"новые api-действия без покрытия моста/легаси-списка: {unknown}"
