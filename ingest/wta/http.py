"""A polite HTTP client: sequential, throttled, retried; plus resumable file downloads."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

USER_AGENT = "world-trade-atlas (+https://github.com/GeorgiyKvatsbaya/world-trade-atlas)"


class PoliteClient:
    def __init__(self, base_url: str = "", delay: float = 0.3, timeout: int = 120) -> None:
        self.base_url = base_url.rstrip("/")
        self.delay = delay
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        retry = Retry(
            total=4,
            backoff_factor=2.0,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET",),
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self._last_call = 0.0

    def url(self, path: str) -> str:
        if path.startswith("http"):
            return path
        return f"{self.base_url}/{path.lstrip('/')}"

    def get(self, path: str, params: dict[str, Any] | None = None, **kwargs) -> requests.Response:
        wait = self.delay - (time.monotonic() - self._last_call)
        if wait > 0:
            time.sleep(wait)
        try:
            response = self.session.get(
                self.url(path), params=params, timeout=self.timeout, **kwargs
            )
            response.raise_for_status()
            return response
        finally:
            self._last_call = time.monotonic()

    def get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return self.get(path, params).json()

    def download(self, url: str, target: Path, chunk: int = 1 << 20) -> Path:
        """Stream `url` to `target`, resuming a partial file (HTTP Range) when one exists."""
        target.parent.mkdir(parents=True, exist_ok=True)
        done = target.stat().st_size if target.exists() else 0
        headers = {"Range": f"bytes={done}-"} if done else {}
        with self.session.get(url, headers=headers, stream=True, timeout=self.timeout) as r:
            if r.status_code == 416:  # already complete
                return target
            r.raise_for_status()
            mode = "ab" if done and r.status_code == 206 else "wb"
            with target.open(mode) as fh:
                for block in r.iter_content(chunk):
                    fh.write(block)
        return target
