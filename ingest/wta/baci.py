"""CEPII BACI: bilateral trade flows at the HS6 product level (HS92 nomenclature, 1995 onward).

The release ships as one large zip of yearly CSVs (`t,i,j,k,v,q`): year, exporter, importer,
HS6 product, value in thousands of USD, quantity in metric tons. Each year becomes one zstd
Parquet file under `data/raw/baci/year=YYYY/`, read by dbt as a hive-partitioned source.
Licence: Etalab 2.0 (attribution). Cite Gaulier & Zignago (2010), CEPII WP 2010-23.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from .http import PoliteClient
from .paths import RAW, REFERENCE

PAGE_URL = "https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37"
DOWNLOAD_URL = "https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_{hs}_V{version}.zip"
HS = "HS92"
BACI_DIR = RAW / "baci"
MANIFEST = BACI_DIR / "_manifest.json"
YEAR_FILE = re.compile(r"BACI_HS\d\d_Y(\d{4})_V\d+\.csv$")


def latest_version(client: PoliteClient) -> str:
    """The release id (e.g. "202601") of the newest BACI on the CEPII download page."""
    html = client.get(PAGE_URL).text
    versions = re.findall(rf"BACI_{HS}_V(\d{{6}})\.zip", html)
    if not versions:
        raise RuntimeError("No BACI download link found on the CEPII page")
    return max(versions)


def read_manifest() -> dict:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def convert_year(con: duckdb.DuckDBPyConnection, csv: Path, year: int) -> int:
    """One yearly CSV -> typed Parquet. HS6 codes are left-padded (CSV may drop the zero)."""
    target = BACI_DIR / f"year={year}" / "flows.parquet"
    target.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        f"""
        COPY (
            SELECT
                t::SMALLINT AS t,
                i::SMALLINT AS i,
                j::SMALLINT AS j,
                lpad(trim(k::VARCHAR), 6, '0') AS k,
                v::DOUBLE AS v,
                TRY_CAST(nullif(trim(q::VARCHAR), 'NA') AS DOUBLE) AS q
            FROM read_csv('{csv}', header = true, all_varchar = true)
        ) TO '{target}' (FORMAT parquet, COMPRESSION zstd)
        """
    )
    return con.execute(f"SELECT count(*) FROM '{target}'").fetchone()[0]


def convert_table(con: duckdb.DuckDBPyConnection, csv: Path, target: Path, sql: str) -> int:
    target.parent.mkdir(parents=True, exist_ok=True)
    source = f"read_csv('{csv}', header = true, all_varchar = true)"
    con.execute(f"COPY ({sql.format(src=source)}) TO '{target}' (FORMAT parquet)")
    return con.execute(f"SELECT count(*) FROM '{target}'").fetchone()[0]


COUNTRIES_SQL = """
    SELECT country_code::SMALLINT AS country_code, trim(country_name) AS country_name,
           nullif(trim(country_iso2), 'N/A') AS country_iso2,
           nullif(trim(country_iso3), 'N/A') AS country_iso3
    FROM {src}
"""
PRODUCTS_SQL = "SELECT lpad(trim(code), 6, '0') AS code, trim(description) AS description FROM {src}"


def repair_mojibake(text: str | None) -> str | None:
    """BACI's country file is double-encoded UTF-8 ("TÃ¼rkiye"); undo it where it applies."""
    if text is None or not any(ch in text for ch in "ÃÂ"):
        return text
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def repair_countries(path: Path) -> None:
    con = duckdb.connect()
    con.create_function("repair", repair_mojibake, ["VARCHAR"], "VARCHAR")
    tmp = path.with_suffix(".tmp.parquet")
    con.execute(
        f"COPY (SELECT * REPLACE (repair(country_name) AS country_name) FROM '{path}') "
        f"TO '{tmp}' (FORMAT parquet)"
    )
    tmp.replace(path)


def convert(zip_path: Path, version: str) -> dict:
    """Unpack the release one member at a time (the full set is ~15 GB of CSV) into Parquet."""
    con = duckdb.connect()
    con.execute("SET preserve_insertion_order = false")
    years: dict[str, int] = {}
    with zipfile.ZipFile(zip_path) as archive, tempfile.TemporaryDirectory() as tmp:
        for member in sorted(archive.namelist()):
            name = Path(member).name
            out = Path(tmp) / name
            match = YEAR_FILE.search(name)
            if not (match or name.startswith(("country_codes", "product_codes"))):
                continue
            with archive.open(member) as src, out.open("wb") as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
            if match:
                year = int(match.group(1))
                years[str(year)] = convert_year(con, out, year)
                print(f"  {year}: {years[str(year)]:,} rows")
            elif name.startswith("country_codes"):
                n = convert_table(con, out, BACI_DIR / "countries.parquet", COUNTRIES_SQL)
                repair_countries(BACI_DIR / "countries.parquet")
                print(f"  countries: {n}")
            else:
                n = convert_table(con, out, BACI_DIR / "products.parquet", PRODUCTS_SQL)
                print(f"  products: {n}")
            out.unlink()
    # Small dimension tables are committed so CI and the monthly job can build without BACI.
    REFERENCE.mkdir(parents=True, exist_ok=True)
    for table in ("countries", "products"):
        shutil.copy(BACI_DIR / f"{table}.parquet", REFERENCE / f"baci_{table}.parquet")
    return years


def ingest(force: bool = False, keep_zip: bool = False) -> None:
    client = PoliteClient()
    version = latest_version(client)
    manifest = read_manifest()
    if manifest.get("version") == version and not force:
        print(f"BACI {HS} V{version} already ingested ({manifest['rows']:,} rows); skipping.")
        return
    zip_path = BACI_DIR / "_download" / f"BACI_{HS}_V{version}.zip"
    print(f"Downloading BACI {HS} V{version} → {zip_path} (resumable)")
    client.download(DOWNLOAD_URL.format(hs=HS, version=version), zip_path)
    checksum = sha256(zip_path)
    print("Converting yearly CSVs to Parquet")
    years = convert(zip_path, version)
    text = (
        json.dumps(
            {
                "source": "CEPII BACI",
                "nomenclature": HS,
                "version": version,
                "sha256": checksum,
                "years": years,
                "rows": sum(years.values()),
                "ingested_at": datetime.now(UTC).isoformat(timespec="seconds"),
            },
            indent=2,
        )
        + "\n"
    )
    MANIFEST.write_text(text)
    # Committed copy: the monthly watch workflow compares it with the CEPII page.
    (REFERENCE / "baci_manifest.json").write_text(text)
    if not keep_zip:
        zip_path.unlink()
    print(f"Done: {len(years)} years, {sum(years.values()):,} rows")
