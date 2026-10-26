# Mirror Flows

**Who trades what with whom** — goods trade between 200+ economies since 1995, by product, with
monthly updates. A dbt + DuckDB analytics project with a static EN/RU web app on top.

**Live:** https://mirrorflows.vercel.app · **dbt docs & lineage:** https://mirrorflows.vercel.app/dbt/

| | |
|---|---|
| Sources | [CEPII BACI](https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37) HS92 (1995–2024, ~5,000 products, Etalab 2.0) · [IMF IMTS](https://data.imf.org/en/datasets/IMF.STA:IMTS) monthly (2023 →) · World Bank country classifications · HS 1992 nomenclature (UN Comtrade) · Natural Earth boundaries |
| Scale | 270M rows at year × exporter × importer × HS6; full `dbt build` (22 models, 100+ tests) in ~1 minute on a laptop |
| Stack | Python 3.11 + uv · DuckDB · dbt-core + dbt-duckdb · sqlfluff · React + TypeScript + ECharts (Vite) · Vercel · GitHub Actions |

## Architecture

```
CEPII / IMF / World Bank / UN Comtrade
        │  mflows ingest …        (ingest/mflows: polite HTTP, resumable download, typed Parquet)
        ▼
data/raw/*.parquet  +  data/reference/*.parquet (small, committed)
        │  dbt build              (dbt/: staging → intermediate → marts, DuckDB)
        ▼
data/warehouse.duckdb
        │  mflows export          (JSON per page + Parquet for cross-filters, model.json for lineage)
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
    `mart_source_comparison` (BACI vs IMF).
  - Cross-filter marts: `mart_country_partner_chapter_year` (country × partner × HS2 × year, with
    chapter-within-partner and partner-within-chapter shares), `mart_country_chapter_year`, and
    `mart_route_product_year` (exporter × importer × HS4 since 2015, incremental by year).
- **Macros**: `hhi()` (as Σv²/(Σv)², a plain aggregate), `rca()`, `safe_divide()`, `cagr()`.
- **Tests**: grain uniqueness on every model, relationships to the dimensions, ranges; **unit
  tests** for RCA, HHI and month-over-year logic with a missing month; reconciliation tests (fact =
  staging per year, HS4 = HS6, world exports = world imports, export-weighted RCA = 1, IMF within
  ×2 of BACI with documented exceptions in `seeds/source_gap_exceptions.csv`).
- **Exposures** for every web page, so the lineage graph runs from source to page.
- **Data model page** (`/model` on the site): the full DAG drawn from `manifest.json` and the last
  build's results (`mflows lineage` → `model.json`) — click a node for its description, columns,
  tests, row count and SQL.

## Run it

```sh
make setup        # uv sync, dbt deps, npm ci
make ingest       # BACI (2.4 GB zip → 2 GB Parquet), IMF, World Bank, HS codes
make build        # dbt build (seeds, models, tests)
make export docs  # web/public/data and web/public/dbt
cd web && npm run dev
```

The dbt profile lives in `dbt/profiles.yml` (run dbt from `dbt/`); paths can be overridden with
`MF_RAW`, `MF_REFERENCE`, `MF_WAREHOUSE`, `MF_MEMORY_LIMIT`.

## Refresh

- **IMF months** — `.github/workflows/refresh-imf.yml` runs monthly: ingests IMF, builds only
  `+tag:monthly` (no BACI needed: the small dimension tables are committed in `data/reference/`),
  rewrites the monthly series in the country files and commits; Vercel redeploys.
- **BACI** — released once a year (late January). CEPII's site refuses requests from GitHub's
  runners, so the check runs locally: `make baci-check` prints the latest and the ingested
  version; rebuild with `make refresh-baci` (full refresh of the fact table).
- **CI** — `.github/workflows/ci.yml`: ruff, pytest, `dbt build --target ci` on a 5,000-row real
  slice in `tests/fixtures/raw` (regenerate with `scripts/make_ci_fixtures.py`), sqlfluff, web
  tests and build.

## Web data

`mflows export` writes ~160 MB (budget 175 MB, checked on every export):

- **JSON** for page skeletons — `meta.json`, `world.json`, one file per country (233) and per HS4
  product (1,241); money in US$ millions rounded to $10,000.
- **Parquet** (Snappy) for the cross-filters, read in the browser with
  [hyparquet](https://github.com/hyparam/hyparquet): `cross/{country}` (partner × chapter cells
  ≥ $1M plus exact partner and chapter totals), `chapters/{hs2}`, `routes/product/{hs4}` and
  `routes/exporter/{country}` (HS4 routes ≥ $1M since 2015).

Each page downloads 20 KB–1.6 MB. Every annual BACI refresh adds roughly the same amount to git
history; if that grows too much, the data folder can move to object storage.

## Site features

World map and rankings (click a product group to re-scope them), country profiles with a
partner ⇄ product-group cross-filter, partner-pair pages with an HS4 drill-down, product pages
(click an exporter to see its destinations), a compare page for up to four countries, header search,
and the Data model page.

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
