# World Trade Atlas

**Who trades what with whom** — goods trade between 200+ economies since 1995, by product, with
monthly updates. A dbt + DuckDB analytics project with a static EN/RU web app on top.

**Live:** https://world-trade-atlas-one.vercel.app · **dbt docs & lineage:** https://world-trade-atlas-one.vercel.app/dbt/

| | |
|---|---|
| Sources | [CEPII BACI](https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37) HS92 (1995–2024, ~5,000 products, Etalab 2.0) · [IMF IMTS](https://data.imf.org/en/datasets/IMF.STA:IMTS) monthly (2023 →) · World Bank country classifications · HS 1992 nomenclature (UN Comtrade) · Natural Earth boundaries |
| Scale | 270M rows at year × exporter × importer × HS6; full `dbt build` (22 models, 100+ tests) in ~1 minute on a laptop |
| Stack | Python 3.11 + uv · DuckDB · dbt-core + dbt-duckdb · sqlfluff · React + TypeScript + ECharts (Vite) · Vercel · GitHub Actions |

## Architecture

```
CEPII / IMF / World Bank / UN Comtrade
        │  wta ingest …           (ingest/wta: polite HTTP, resumable download, typed Parquet)
        ▼
data/raw/*.parquet  +  data/reference/*.parquet (small, committed)
        │  dbt build              (dbt/: staging → intermediate → marts, DuckDB)
        ▼
data/warehouse.duckdb
        │  wta export             (columnar JSON per page: meta, world, countries/, pairs/, products/)
        ▼
web/public/data  →  web/ (React + ECharts)  →  Vercel
```

### dbt model

- **Staging** (views): one model per source table — renames, units (BACI thousands of USD → USD),
  SDMX periods → dates.
- **Intermediate**: `int_country_entities` resolves BACI codes to stable country entities
  (historical joint reporters such as Belgium-Luxembourg, Taiwan as "Other Asia, nes" — see
  `seeds/country_overrides.csv`); HS4 and partner aggregates; RCA denominators; IMF pivot.
- **Marts**:
  - `fct_trade_hs6` — incremental by year (`delete+insert`); reload single years with `--vars '{baci_years: [2024]}'`.
  - `dim_country`, `dim_product`, `mart_country_year`, `mart_product_year`, `mart_trade_monthly` — with **enforced contracts**.
  - `mart_country_partner_year`, `mart_country_product_year` (Balassa RCA, world market share),
    `mart_pair_product_year`, `mart_source_comparison` (BACI vs IMF).
- **Macros**: `hhi()` (as Σv²/(Σv)², a plain aggregate), `rca()`, `safe_divide()`, `cagr()`.
- **Tests**: grain uniqueness on every model, relationships to the dimensions, ranges; **unit
  tests** for RCA, HHI and month-over-year logic with a missing month; reconciliation tests (fact =
  staging per year, HS4 = HS6, world exports = world imports, export-weighted RCA = 1, IMF within
  ×2 of BACI with documented exceptions in `seeds/source_gap_exceptions.csv`).
- **Exposures** for every web page, so the lineage graph runs from source to page.

## Run it

```sh
make setup        # uv sync, dbt deps, npm ci
make ingest       # BACI (2.4 GB zip → 2 GB Parquet), IMF, World Bank, HS codes
make build        # dbt build (seeds, models, tests)
make export docs  # web/public/data and web/public/dbt
cd web && npm run dev
```

The dbt profile lives in `dbt/profiles.yml` (run dbt from `dbt/`); paths can be overridden with
`WTA_RAW`, `WTA_REFERENCE`, `WTA_WAREHOUSE`, `WTA_MEMORY_LIMIT`.

## Refresh

- **IMF months** — `.github/workflows/refresh-imf.yml` runs monthly: ingests IMF, builds only
  `+tag:monthly` (no BACI needed: the small dimension tables are committed in `data/reference/`),
  rewrites the monthly series in the country files and commits; Vercel redeploys.
- **BACI** — released once a year. `.github/workflows/baci-watch.yml` opens an issue when CEPII
  publishes a new version; rebuild locally with `make refresh-baci` (full refresh of the fact table).
- **CI** — `.github/workflows/ci.yml`: ruff, pytest, `dbt build --target ci` on a 5,000-row real
  slice in `tests/fixtures/raw` (regenerate with `scripts/make_ci_fixtures.py`), sqlfluff, web
  tests and build.

## Web data

`wta export` writes ~75 MB of columnar JSON (≈20 MB gzipped): one file per country (233), per
partner set (233) and per HS4 product (1,241), so each page downloads 20–150 KB. Money is in US$
millions rounded to $10,000.

## Notes on the data

- BACI reconciles exporter and importer reports and values everything FOB, so figures differ from
  national statistics (and from the IMF, which reports imports CIF and re-exports as exports). The
  site's Methodology page shows the BACI–IMF comparison.
- Country names in Russian come from the browser's CLDR data (`Intl.DisplayNames`) via ISO2 codes.

## Data attribution

CEPII BACI under Etalab 2.0 — cite Gaulier, G. and Zignago, S. (2010), *BACI:
International Trade Database at the Product-Level. The 1994–2007 Version*, CEPII Working Paper
2010-23. IMF data © International Monetary Fund, used under the IMF terms with attribution. World
Bank data CC BY 4.0. Natural Earth: public domain.
