from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from math import sqrt
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence


FEATURE_NAMES = [
    "openReports",
    "inReviewReports",
    "recentReports7d",
    "roadIssues7d",
    "severeRoadIssues7d",
    "congestionScore",
    "historicalAverageVolumeKg",
    "historicalSamples",
    "missedPickupsScore",
    "summaryIssueScore",
]


@dataclass
class WasteVolumeModel:
    feature_names: List[str]
    means: List[float]
    scales: List[float]
    weights: List[float]
    intercept: float
    rmse: float
    trained_rows: int
    trained_at: str
    model_source: str = "python-ml"
    model_version: str = "python-linear-v1"


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _feature_block(row: Dict[str, Any]) -> Dict[str, Any]:
    nested = row.get("features")
    if isinstance(nested, dict):
        return nested
    return row


def _vector_from_row(row: Dict[str, Any]) -> List[float]:
    features = _feature_block(row)
    return [float(features.get(name, 0.0) or 0.0) for name in FEATURE_NAMES]


def _mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _std(values: Sequence[float], mean: float) -> float:
    if not values:
        return 1.0
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return sqrt(variance) or 1.0


def _transpose(matrix: Sequence[Sequence[float]]) -> List[List[float]]:
    return [list(column) for column in zip(*matrix)]


def _solve_linear_system(matrix: List[List[float]], vector: List[float]) -> List[float]:
    size = len(vector)
    augmented = [row[:] + [vector[index]] for index, row in enumerate(matrix)]

    for pivot in range(size):
        max_row = max(range(pivot, size), key=lambda row: abs(augmented[row][pivot]))
        augmented[pivot], augmented[max_row] = augmented[max_row], augmented[pivot]

        divisor = augmented[pivot][pivot]
        if abs(divisor) < 1e-9:
            divisor = 1e-9

        for column in range(pivot, size + 1):
            augmented[pivot][column] /= divisor

        for row in range(size):
            if row == pivot:
                continue
            factor = augmented[row][pivot]
            if factor == 0:
                continue
            for column in range(pivot, size + 1):
                augmented[row][column] -= factor * augmented[pivot][column]

    return [augmented[index][-1] for index in range(size)]


def train_model(rows: Sequence[Dict[str, Any]], ridge: float = 0.35) -> WasteVolumeModel:
    if len(rows) < 2:
        raise ValueError("At least two training rows are required")

    feature_vectors = [_vector_from_row(row) for row in rows]
    targets = [float(row["actualVolumeKg"]) for row in rows]

    columns = _transpose(feature_vectors)
    means = [_mean(column) for column in columns]
    scales = [_std(column, mean) for column, mean in zip(columns, means)]

    normalized = [
        [(value - means[index]) / scales[index] for index, value in enumerate(vector)]
        for vector in feature_vectors
    ]

    design = [[1.0] + vector for vector in normalized]
    dimensions = len(FEATURE_NAMES) + 1
    xtx = [[0.0 for _ in range(dimensions)] for _ in range(dimensions)]
    xty = [0.0 for _ in range(dimensions)]

    for row_vector, target in zip(design, targets):
        for i in range(dimensions):
            xty[i] += row_vector[i] * target
            for j in range(dimensions):
                xtx[i][j] += row_vector[i] * row_vector[j]

    for index in range(1, dimensions):
        xtx[index][index] += ridge

    coefficients = _solve_linear_system(xtx, xty)
    intercept = coefficients[0]
    weights = coefficients[1:]

    predictions = [
        intercept + sum(weight * value for weight, value in zip(weights, vector))
        for vector in normalized
    ]
    rmse = sqrt(sum((prediction - target) ** 2 for prediction, target in zip(predictions, targets)) / len(targets))

    return WasteVolumeModel(
        feature_names=list(FEATURE_NAMES),
        means=means,
        scales=scales,
        weights=weights,
        intercept=intercept,
        rmse=rmse,
        trained_rows=len(rows),
        trained_at=datetime.now(timezone.utc).isoformat(),
    )


def predict_rows(model: WasteVolumeModel, rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    predictions: List[Dict[str, Any]] = []

    for row in rows:
        features = _feature_block(row)
        vector = _vector_from_row(row)
        normalized = [
            (value - model.means[index]) / (model.scales[index] or 1.0)
            for index, value in enumerate(vector)
        ]
        predicted = model.intercept + sum(
            weight * value for weight, value in zip(model.weights, normalized)
        )
        predicted = max(40.0, round(predicted, 1))

        demand_signal = float(features.get("openReports", 0) or 0) + float(features.get("inReviewReports", 0) or 0)
        sample_signal = float(features.get("historicalSamples", 0) or 0)
        uncertainty = model.rmse / max(predicted, 1.0)
        confidence = 0.9 - uncertainty + min(sample_signal, 10) * 0.018 + min(demand_signal, 8) * 0.012
        confidence = round(_clamp(confidence, 0.35, 0.97), 3)

        predictions.append(
            {
                "zoneId": int(row.get("zoneId", features.get("zoneId", 0)) or 0),
                "zoneName": row.get("zoneName", features.get("zoneName")),
                "predictedVolumeKg": predicted,
                "confidence": confidence,
                "modelSource": model.model_source,
                "modelVersion": model.model_version,
            }
        )

    return predictions


def save_model(model: WasteVolumeModel, path: Path | str) -> None:
    model_path = Path(path)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_text(json.dumps(asdict(model), indent=2), encoding="utf-8")


def load_model(path: Path | str) -> WasteVolumeModel:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return WasteVolumeModel(**payload)


def train_and_save(rows: Sequence[Dict[str, Any]], path: Path | str) -> WasteVolumeModel:
    model = train_model(rows)
    save_model(model, path)
    return model


def parse_training_payload(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows = payload.get("rows")
    if not isinstance(rows, list):
        raise ValueError("Payload must contain a 'rows' list")
    return [row for row in rows if isinstance(row, dict) and "actualVolumeKg" in row]
