from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from waste_model import (
    WasteVolumeModel,
    load_model,
    parse_training_payload,
    predict_rows,
    save_model,
    train_model,
)


MODEL_PATH = Path(os.getenv("WASTELY_MODEL_PATH", Path(__file__).with_name("model.json")))
DATA_API_URL = os.getenv("WASTELY_DATA_API", "http://127.0.0.1:5173/api/ml/training-data")
DATA_API_TOKEN = os.getenv("WASTELY_DATA_TOKEN") or os.getenv("ML_SHARED_TOKEN", "")
SERVICE_TOKEN = os.getenv("WASTELY_MODEL_TOKEN") or os.getenv("ML_SERVICE_TOKEN", "")
PORT = int(os.getenv("PORT", "8123"))


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: Dict[str, Any]) -> None:
    encoded = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(encoded)))
    handler.end_headers()
    handler.wfile.write(encoded)


def _read_json_body(handler: BaseHTTPRequestHandler) -> Dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length > 0 else b"{}"
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def _authorized(handler: BaseHTTPRequestHandler) -> bool:
    if not SERVICE_TOKEN:
        return True
    auth_header = handler.headers.get("Authorization", "").replace("Bearer ", "")
    return auth_header == SERVICE_TOKEN


def _fetch_training_rows(days: int = 30) -> List[Dict[str, Any]]:
    url = f"{DATA_API_URL}?days={days}"
    headers = {"Accept": "application/json"}
    if DATA_API_TOKEN:
        headers["Authorization"] = f"Bearer {DATA_API_TOKEN}"
    request = Request(url, headers=headers)
    with urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return parse_training_payload(payload)


def _ensure_model(training_rows: Optional[List[Dict[str, Any]]] = None) -> WasteVolumeModel:
    if MODEL_PATH.exists():
        return load_model(MODEL_PATH)

    rows = training_rows or _fetch_training_rows()
    model = train_model(rows)
    save_model(model, MODEL_PATH)
    return model


class WastelyModelHandler(BaseHTTPRequestHandler):
    server_version = "WastelyModel/1.0"

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/health"):
            model_exists = MODEL_PATH.exists()
            _json_response(
                self,
                200,
                {
                    "ok": True,
                    "modelPath": str(MODEL_PATH),
                    "modelLoaded": model_exists,
                },
            )
            return

        _json_response(self, 404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not _authorized(self):
            _json_response(self, 401, {"ok": False, "error": "Unauthorized"})
            return

        try:
            body = _read_json_body(self)
        except json.JSONDecodeError:
            _json_response(self, 400, {"ok": False, "error": "Invalid JSON"})
            return

        if self.path == "/train":
            self._handle_train(body)
            return

        if self.path == "/predict":
            self._handle_predict(body)
            return

        _json_response(self, 404, {"ok": False, "error": "Not found"})

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def _handle_train(self, body: Dict[str, Any]) -> None:
        days = int(body.get("days", 30) or 30)
        rows = body.get("rows")

        try:
            training_rows = parse_training_payload({"rows": rows}) if isinstance(rows, list) else _fetch_training_rows(days)
            model = train_model(training_rows)
            save_model(model, MODEL_PATH)
        except (ValueError, HTTPError, URLError) as exc:
            _json_response(self, 400, {"ok": False, "error": str(exc)})
            return

        _json_response(
            self,
            200,
            {
                "ok": True,
                "trainedRows": model.trained_rows,
                "rmse": round(model.rmse, 3),
                "modelVersion": model.model_version,
            },
        )

    def _handle_predict(self, body: Dict[str, Any]) -> None:
        rows = body.get("features") or body.get("rows")
        if not isinstance(rows, list) or not rows:
            _json_response(self, 400, {"ok": False, "error": "Body must include a non-empty 'features' list"})
            return

        try:
            model = _ensure_model()
            predictions = predict_rows(model, rows)
        except (ValueError, HTTPError, URLError) as exc:
            _json_response(self, 400, {"ok": False, "error": str(exc)})
            return

        _json_response(
            self,
            200,
            {
                "ok": True,
                "predictions": predictions,
                "modelVersion": model.model_version,
                "modelSource": model.model_source,
            },
        )


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), WastelyModelHandler)
    print(f"Wastely ML service listening on http://127.0.0.1:{PORT}")  # noqa: T201
    server.serve_forever()


if __name__ == "__main__":
    main()
