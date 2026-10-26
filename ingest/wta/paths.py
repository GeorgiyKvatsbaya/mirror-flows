"""Project paths. Raw data and the warehouse are gitignored; reference tables are committed."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"
REFERENCE = DATA / "reference"
# Same override as dbt/profiles.yml (relative paths are relative to dbt/).
WAREHOUSE = (ROOT / "dbt" / os.environ.get("WTA_WAREHOUSE", "../data/warehouse.duckdb")).resolve()
WEB_DATA = ROOT / "web" / "public" / "data"
