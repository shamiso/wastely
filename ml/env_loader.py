from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable


def find_project_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "package.json").exists() and (candidate / "ml").exists():
            return candidate
    return current


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def load_env_file(path: Path, override: bool = False) -> bool:
    if not path.exists():
        return False

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue

        parsed_value = _strip_quotes(value)
        if override or key not in os.environ:
            os.environ[key] = parsed_value

    return True


def load_project_env(start: Path, filenames: Iterable[str] = (".env",)) -> list[str]:
    root = find_project_root(start)
    loaded: list[str] = []
    for filename in filenames:
        path = root / filename
        if load_env_file(path):
            loaded.append(str(path))
    return loaded
