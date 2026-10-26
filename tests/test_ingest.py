"""Ingest parsers on recorded samples — no network."""

from pathlib import Path

import duckdb
import pytest

from mflows import baci, export, imf

SAMPLES = Path(__file__).parent / "fixtures" / "samples"


class FakeResponse:
    def __init__(self, text: str):
        self.text = text
        self.content = text.encode()


class FakeClient:
    def __init__(self, text: str):
        self.text = text
        self.calls: list[tuple[str, dict]] = []

    def get(self, path, params=None, **kwargs):
        self.calls.append((path, params or {}))
        return FakeResponse(self.text)


def test_latest_version_picks_newest_hs92_release():
    client = FakeClient((SAMPLES / "cepii_page.html").read_text())
    assert baci.latest_version(client) == "202601"


@pytest.mark.parametrize(
    ("raw", "fixed"),
    [
        ("TÃ¼rkiye", "Türkiye"),
        ("CuraÃ§ao", "Curaçao"),
        ("Côte d'Ivoire", "Côte d'Ivoire"),
        (None, None),
    ],
)
def test_repair_mojibake(raw, fixed):
    assert baci.repair_mojibake(raw) == fixed


def test_convert_year_types_and_pads_codes(tmp_path, monkeypatch):
    monkeypatch.setattr(baci, "BACI_DIR", tmp_path)
    rows = baci.convert_year(duckdb.connect(), SAMPLES / "baci_2024.csv", 2024)
    assert rows == 3
    out = duckdb.sql(
        f"SELECT k, v, q FROM '{tmp_path}/year=2024/flows.parquet' ORDER BY k"
    ).fetchall()
    # HS6 keeps its leading zero; "NA" and blank quantities become NULL.
    assert out == [("010121", 1234.5, None), ("080810", 0.176, 0.1), ("870323", 99.9, None)]


def test_imf_batch_request_and_parse():
    client = FakeClient((SAMPLES / "imf_dataonly.csv").read_text())
    table = imf.fetch_batch(client, ["GEO", "ARM"], "2023-M01")
    path, params = client.calls[0]
    assert path.endswith("/GEO+ARM.XG_FOB_USD+MG_CIF_USD.*.M")
    assert params == {"startPeriod": "2023-M01", "detail": "dataonly"}
    assert table.column_names == imf.COLUMNS
    assert table.num_rows == 5


def test_imf_empty_response_is_no_data():
    assert imf.fetch_batch(FakeClient("  \n"), ["XXX"], "2023-M01") is None


def test_export_table_is_columnar_and_months_are_short():
    con = duckdb.connect()
    result = export.table(
        con, "SELECT DATE '2026-06-01' AS month, 1.5 AS v UNION ALL SELECT DATE '2026-07-01', NULL"
    )
    assert result == {"columns": ["month", "v"], "rows": [["2026-06", 1.5], ["2026-07", None]]}


def test_money_and_share_sql():
    assert export.money("exports_usd") == "round(exports_usd / 1000000.0, 2) AS exports"
    assert (
        export.share("t.world_market_share")
        == "round(t.world_market_share, 4) AS world_market_share"
    )
