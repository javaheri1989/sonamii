from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any


class JsonStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        if not self.path.exists():
            self._write(
                {
                    "ownerId": None,
                    "admins": {},
                    "seen": {},
                    "pending": {},
                    "userState": {},
                }
            )

    def _read(self) -> dict[str, Any]:
        with self.path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def _write(self, data: dict[str, Any]) -> None:
        tmp = self.path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        tmp.replace(self.path)

    def update(self, mutator) -> dict[str, Any]:
        with self._lock:
            data = self._read()
            mutator(data)
            self._write(data)
            return data

    def get(self) -> dict[str, Any]:
        with self._lock:
            return self._read()
