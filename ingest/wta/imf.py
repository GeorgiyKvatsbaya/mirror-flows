"""IMF International Trade in Goods (IMTS, formerly DOTS): monthly totals by partner country.

Exports are valued FOB, imports CIF, both in US dollars (OBS_VALUE is in units, not millions).
Fills BACI's ~18-month lag with country x partner totals (no product detail). The pull starts in
2023 so the overlap with BACI (2023-2024) can be reconciled in dbt.
Source: International Monetary Fund, https://data.imf.org/en/datasets/IMF.STA:IMTS.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime

import duckdb
import pyarrow.csv as pacsv

from .http import PoliteClient
from .paths import RAW, REFERENCE

BASE_URL = "https://api.imf.org/external/sdmx/2.1/data/IMF.STA,IMTS"
INDICATORS = ("XG_FOB_USD", "MG_CIF_USD")
START = "2023-M01"
BATCH = 10
OUTPUT = RAW / "imf" / "imts_monthly.parquet"
CSV_HEADERS = {"Accept": "application/vnd.sdmx.data+csv;version=1.0.0"}
COLUMNS = ["COUNTRY", "INDICATOR", "COUNTERPART_COUNTRY", "TIME_PERIOD", "OBS_VALUE"]


def reporters() -> list[str]:
    """ISO3 codes to request (IMF uses ISO3): World Bank economies plus BACI countries.
    Codes the IMF does not know are ignored by the API."""
    sources = [
        f"SELECT iso3 FROM '{REFERENCE / 'wb_countries.parquet'}' WHERE NOT is_aggregate",
        f"SELECT country_iso3 FROM '{REFERENCE / 'baci_countries.parquet'}'",
    ]
    present = [
        sql
        for sql, name in zip(sources, ("wb", "baci"), strict=True)
        if (REFERENCE / f"{name}_countries.parquet").exists()
    ]
    if not present:
        raise SystemExit("Run `wta ingest worldbank` (or baci) first")
    rows = duckdb.sql(
        f"SELECT DISTINCT * FROM ({' UNION '.join(present)}) t(code) "
        "WHERE code IS NOT NULL ORDER BY 1"
    ).fetchall()
    return [code for (code,) in rows]


def fetch_batch(client: PoliteClient, codes: list[str], start: str):
    key = f"{'+'.join(codes)}.{'+'.join(INDICATORS)}.*.M"
    response = client.get(
        f"{BASE_URL}/{key}",
        {"startPeriod": start, "detail": "dataonly"},
        headers=CSV_HEADERS,
    )
    if not response.content.strip():
        return None
    convert = pacsv.ConvertOptions(
        include_columns=COLUMNS,
        column_types={c: "string" for c in COLUMNS[:-1]} | {"OBS_VALUE": "float64"},
    )
    return pacsv.read_csv(io.BytesIO(response.content), convert_options=convert)


def ingest(start: str = START) -> None:
    client = PoliteClient(delay=0.5, timeout=180)
    codes = reporters()
    tables = []
    for offset in range(0, len(codes), BATCH):
        batch = codes[offset : offset + BATCH]
        table = fetch_batch(client, batch, start)
        print(f"  {batch[0]}…{batch[-1]}: {0 if table is None else table.num_rows:,} rows")
        if table is not None and table.num_rows:
            tables.append(table)
    if not tables:
        raise RuntimeError("IMF returned no data")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    loaded_at = datetime.now(UTC).isoformat(timespec="seconds")
    con = duckdb.connect()
    for n, table in enumerate(tables):
        con.register(f"t{n}", table)
    union = " UNION ALL ".join(f"SELECT * FROM t{n}" for n in range(len(tables)))
    con.execute(
        f"""
        COPY (
            SELECT COUNTRY AS reporter, INDICATOR AS indicator,
                   COUNTERPART_COUNTRY AS counterpart, TIME_PERIOD AS period,
                   OBS_VALUE AS value_usd, '{loaded_at}'::TIMESTAMP AS loaded_at
            FROM ({union})
            WHERE OBS_VALUE IS NOT NULL
        ) TO '{OUTPUT}' (FORMAT parquet, COMPRESSION zstd)
        """
    )
    rows = con.execute(f"SELECT count(*), max(period) FROM '{OUTPUT}'").fetchone()
    print(f"Done: {rows[0]:,} rows, latest period {rows[1]}")
