"""Cut a small, real slice of the raw data for CI (`dbt build --target ci`).

Six countries trading with each other in 2023-2024, in three product chapters (fruit, fuels,
vehicles), plus the matching IMF months. Re-run after a new BACI release:
    uv run python scripts/make_ci_fixtures.py
"""

from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "tests" / "fixtures" / "raw"
# Georgia, Türkiye, China, USA, Germany, Armenia (BACI codes / ISO3).
CODES = (268, 792, 156, 842, 276, 51)
ISO3 = ("GEO", "TUR", "CHN", "USA", "DEU", "ARM")
CHAPTERS = ("08", "27", "87")

con = duckdb.connect()
for year in (2023, 2024):
    target = OUT / "baci" / f"year={year}" / "flows.parquet"
    target.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        f"""
        COPY (
            SELECT * FROM '{RAW}/baci/year={year}/flows.parquet'
            WHERE i IN {CODES} AND j IN {CODES} AND left(k, 2) IN {CHAPTERS}
        ) TO '{target}' (FORMAT parquet, COMPRESSION zstd)
        """
    )
target = OUT / "imf" / "imts_monthly.parquet"
target.parent.mkdir(parents=True, exist_ok=True)
con.execute(
    f"""
    COPY (
        SELECT * FROM '{RAW}/imf/imts_monthly.parquet'
        WHERE reporter IN {ISO3} AND (counterpart IN {ISO3} OR counterpart = 'G001')
          AND period < '2025'
    ) TO '{target}' (FORMAT parquet, COMPRESSION zstd)
    """
)
for path in sorted(OUT.rglob("*.parquet")):
    rows = con.execute(f"SELECT count(*) FROM '{path}'").fetchone()[0]
    print(f"{path.relative_to(ROOT)}: {rows} rows, {path.stat().st_size / 1024:.0f} KB")
