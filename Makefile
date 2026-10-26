# Mirror Flows — pipeline entry points. dbt always runs from dbt/ with the in-repo profile.
DBT = cd dbt && uv run dbt

.PHONY: setup ingest build test export docs baci-check refresh-baci refresh-imf web

setup:            ## Python deps, dbt packages, web deps
	uv sync --extra dev
	$(DBT) deps
	cd web && npm ci

ingest:           ## All sources (BACI skips when the release is already ingested)
	uv run mflows ingest baci
	uv run mflows ingest imf
	uv run mflows ingest worldbank
	uv run mflows ingest hs

build:            ## Seeds, models and tests (results kept for the Data model page)
	$(DBT) build
	cp dbt/target/run_results.json dbt/target/build_results.json

test:             ## Python tests, dbt unit tests, sqlfluff
	uv run pytest
	$(DBT) test --select "test_type:unit"
	cd dbt && uv run sqlfluff lint models tests

export:           ## Marts -> web/public/data
	uv run mflows export

docs:             ## Static dbt docs -> web/public/dbt and model.json (local paths stripped)
	$(DBT) docs generate --static
	uv run mflows lineage
	mkdir -p web/public/dbt
	uv run python -c "import pathlib,sys; root=str(pathlib.Path('dbt').resolve()); \
	  s=pathlib.Path('dbt/target/static_index.html').read_text(); \
	  pathlib.Path('web/public/dbt/index.html').write_text(s.replace(root, 'dbt'))"

baci-check:       ## Is a newer BACI release out? (CEPII blocks GitHub runners, so run locally)
	uv run mflows baci-version

refresh-baci:     ## Annual: new BACI release -> full rebuild of the fact table
	uv run mflows ingest baci
	$(DBT) build --full-refresh
	$(MAKE) export docs

refresh-imf:      ## Monthly: IMF months only (what the scheduled workflow runs)
	uv run mflows ingest imf
	$(DBT) build --select +tag:monthly
	uv run mflows export --monthly-only

web:              ## Build the site
	cd web && npm run build
