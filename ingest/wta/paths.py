"""Project paths. Raw data and the warehouse are gitignored; reference tables are committed."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"
REFERENCE = DATA / "reference"
WAREHOUSE = DATA / "warehouse.duckdb"
WEB_DATA = ROOT / "web" / "public" / "data"
