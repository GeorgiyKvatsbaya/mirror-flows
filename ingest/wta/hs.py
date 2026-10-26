"""HS 1992 nomenclature (chapter -> heading -> subheading) from the UN Comtrade reference files.

BACI only ships HS6 descriptions; chapter (HS2) and heading (HS4) titles come from here.
"""

from __future__ import annotations

import re

import duckdb
import pyarrow as pa

from .http import PoliteClient
from .paths import REFERENCE

URL = "https://comtradeapi.un.org/files/v1/app/reference/H0.json"
OUTPUT = REFERENCE / "hs92_codes.parquet"
PREFIX = re.compile(r"^\s*\w+\s+-\s+")


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", PREFIX.sub("", text)).strip()


def ingest() -> None:
    rows = PoliteClient().get_json(URL)["results"]
    records = [
        {
            "code": row["id"],
            "level": int(row["aggrlevel"]),
            "parent_code": row["parent"],
            "description": clean(row["text"]),
        }
        for row in rows
        if int(row["aggrlevel"]) in (2, 4, 6)
    ]
    hs_codes = pa.Table.from_pylist(records)  # noqa: F841 — read by DuckDB below
    REFERENCE.mkdir(parents=True, exist_ok=True)
    duckdb.sql(f"COPY (SELECT * FROM hs_codes ORDER BY code) TO '{OUTPUT}' (FORMAT parquet)")
    print(f"Done: {len(records)} codes")
