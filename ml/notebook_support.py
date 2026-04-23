from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from env_loader import find_project_root as find_env_project_root, load_project_env
from waste_model import parse_training_payload

load_project_env(Path(__file__))

def find_project_root(start: Path) -> Path:
    return find_env_project_root(start)


def synthetic_training_rows() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for zone_id in range(1, 9):
        for offset in range(1, 7):
            features = {
                "zoneId": zone_id,
                "zoneName": f"Zone {zone_id}",
                "openReports": zone_id + offset,
                "inReviewReports": offset // 2,
                "recentReports7d": zone_id + 3,
                "roadIssues7d": offset % 4,
                "severeRoadIssues7d": 1 if offset % 3 == 0 else 0,
                "congestionScore": 10 + zone_id * 3 + offset,
                "historicalAverageVolumeKg": 115 + zone_id * 24,
                "historicalSamples": 4 + offset,
                "missedPickupsScore": round(offset * 0.4, 2),
                "summaryIssueScore": 9 + zone_id * 4 + offset,
            }
            actual_volume = (
                60
                + features["openReports"] * 18
                + features["inReviewReports"] * 7
                + features["roadIssues7d"] * 10
                + features["congestionScore"] * 1.75
                + features["historicalAverageVolumeKg"] * 0.63
                + features["summaryIssueScore"] * 0.46
                + features["missedPickupsScore"] * 11
            )
            rows.append(
                {
                    "zoneId": zone_id,
                    "zoneName": f"Zone {zone_id}",
                    "date": f"2026-04-{offset + 8:02d}",
                    "features": features,
                    "actualVolumeKg": round(actual_volume, 1),
                }
            )
    return rows


def _load_rows_from_file(data_file: Path) -> List[Dict[str, Any]]:
    payload = json.loads(data_file.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict) and "actualVolumeKg" in row]
    return parse_training_payload(payload)


def _load_rows_from_api(app_url: str, days: int, token: str, timeout: float) -> List[Dict[str, Any]]:
    params = {"days": days}
    if token:
        params["token"] = token
    url = f"{app_url.rstrip('/')}/api/ml/training-data?{urlencode(params)}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, headers=headers)
    with urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return parse_training_payload(payload)


def load_training_rows(
    app_url: str | None = None,
    days: int = 45,
    token: str | None = None,
    data_file: Path | None = None,
    timeout: float = 5,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    resolved_url = app_url or os.getenv("WASTELY_APP_URL", "http://127.0.0.1:5173")
    resolved_token = token if token is not None else os.getenv("ML_SHARED_TOKEN", "")
    resolved_file = data_file or (
        Path(os.environ["WASTELY_TRAINING_DATA_FILE"]).expanduser()
        if os.getenv("WASTELY_TRAINING_DATA_FILE")
        else None
    )

    if resolved_file and resolved_file.exists():
        rows = _load_rows_from_file(resolved_file)
        return rows, {
            "source": "file",
            "path": str(resolved_file),
            "message": f"Loaded {len(rows)} training rows from {resolved_file}.",
        }

    try:
        rows = _load_rows_from_api(resolved_url, days, resolved_token, timeout)
        return rows, {
            "source": "api",
            "url": f"{resolved_url.rstrip('/')}/api/ml/training-data",
            "message": f"Loaded {len(rows)} training rows from the live app API.",
        }
    except (HTTPError, URLError) as exc:
        rows = synthetic_training_rows()
        return rows, {
            "source": "synthetic",
            "url": f"{resolved_url.rstrip('/')}/api/ml/training-data",
            "message": (
                f"Live training-data API was unavailable ({exc}). "
                "Using built-in synthetic training rows instead. "
                "Start `pnpm dev` to train against live app data."
            ),
        }
