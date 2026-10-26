import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChartCard } from "../components/ChartCard";
import { FilterBar, Segmented, SelectFilter, useParamState } from "../components/Filters";
import { KpiTile } from "../components/KpiTile";
import { MapChart } from "../components/MapChart";
import { useI18n } from "../i18n";
import { lineChart, rankedBarChart, sectionColor, treemapChart, type TreemapGroup } from "../lib/charts";
import { toRows, useWorld } from "../lib/data";
import { useNames, type Names } from "../lib/names";
import { CountryLink, Delta, PageState, ProductLink, useFormats, useYear, yearOptions } from "./shared";

type CountryYear = { year: number; code: string; exports: number; imports: number; growth: number | null; share: number | null };
type ChapterYear = { year: number; hs2: string; value: number };
type ProductRow = {
  hs4: string;
  value: number;
  growth: number | null;
  top_exporter: string;
  top_exporter_share: number;
  top_importer: string;
  top_importer_share: number;
  exporter_count: number;
};

const METRICS = ["exports", "imports", "balance", "growth"] as const;
type Metric = (typeof METRICS)[number];
const TOP = 15;

export default function World() {
  const names = useNames();
  const { data, error } = useWorld();
  if (error) return <PageState error={error} />;
  if (!names || !data) return <PageState />;
  return <WorldView names={names} countries={toRows<CountryYear>(data.countries)} chapters={toRows<ChapterYear>(data.chapters)} products={toRows<ProductRow>(data.products)} />;
}

function WorldView({ names, countries, chapters, products }: { names: Names; countries: CountryYear[]; chapters: ChapterYear[]; products: ProductRow[] }) {
  const { t, path } = useI18n();
  const navigate = useNavigate();
  const fmt = useFormats();
  const { first_year: firstYear, last_year: lastYear } = names.meta.baci;
  const [year, setYear] = useYear(lastYear);
  const [metric, setMetric] = useParamState<Metric>("metric", "exports");

  const totals = useMemo(() => {
    const byYear = new Map<number, number>();
    for (const row of countries) byYear.set(row.year, (byYear.get(row.year) ?? 0) + row.exports);
    return [...byYear].sort(([a], [b]) => a - b);
  }, [countries]);
  const total = (y: number) => totals.find(([value]) => value === y)?.[1] ?? null;
  const yearRows = countries.filter((row) => row.year === year);
  const worldTotal = total(year);
  const previous = total(year - 1);
  const topExporter = [...yearRows].sort((a, b) => b.exports - a.exports)[0];
  const topImporter = [...yearRows].sort((a, b) => b.imports - a.imports)[0];

  const metricFormat = metric === "growth" ? fmt.change : fmt.money;
  const mapValues = useMemo(() => {
    const values = new Map<string, number>();
    for (const row of countries) {
      if (row.year !== year) continue;
      const feature = names.countryInfo(row.code)?.map;
      const value = metricValue(row, metric);
      if (feature && value !== null && Number.isFinite(value)) values.set(feature, (values.get(feature) ?? 0) + value);
    }
    return values;
  }, [countries, year, metric, names]);
  const featureToCountry = useMemo(() => {
    const map = new Map<string, string>();
    for (const country of names.countries) if (country.map && !country.historical) map.set(country.map, country.code);
    return map;
  }, [names]);

  const treemap = useMemo(() => {
    const groups = new Map<number, TreemapGroup>();
    for (const row of chapters.filter((r) => r.year === year)) {
      const section = names.chapterSection(row.hs2) ?? 22;
      if (!groups.has(section)) groups.set(section, { name: names.section(section), color: sectionColor(section), children: [] });
      groups.get(section)!.children.push({ name: names.chapter(row.hs2), value: row.value, id: row.hs2 });
    }
    return [...groups.values()];
  }, [chapters, year, names]);

  const metricLabels: Record<Metric, string> = {
    exports: t("metric.exports"),
    imports: t("metric.imports"),
    balance: t("metric.balance"),
    growth: t("metric.growth"),
  };

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">{t("world.eyebrow", { first: firstYear, last: lastYear })}</p>
        <h1>{t("world.title")}</h1>
        <p className="lede">{t("world.lede")}</p>
      </header>

      <FilterBar>
        <SelectFilter label={t("filters.year")} value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions(firstYear, lastYear)} />
      </FilterBar>

      <div className="grid kpi-grid">
        <KpiTile
          label={t("world.kpi.total")}
          value={fmt.money(worldTotal)}
          meta={String(year)}
          delta={
            worldTotal && previous
              ? { text: fmt.change(worldTotal / previous - 1), direction: worldTotal >= previous ? "up" : "down" }
              : undefined
          }
          trend={totals.map(([, value]) => value)}
        />
        {topExporter && (
          <KpiTile
            label={t("world.kpi.topExporter")}
            text
            value={names.country(topExporter.code)}
            meta={`${fmt.money(topExporter.exports)} · ${t("world.kpi.ofWorld", { share: fmt.share(topExporter.share) })}`}
            to={path(`/country/${topExporter.code}`)}
          />
        )}
        {topImporter && (
          <KpiTile
            label={t("world.kpi.topImporter")}
            text
            value={names.country(topImporter.code)}
            meta={fmt.money(topImporter.imports)}
            to={path(`/country/${topImporter.code}`)}
          />
        )}
        {products[0] && (
          <KpiTile
            label={t("world.kpi.topProduct", { year: lastYear })}
            text
            value={names.productShort(products[0].hs4)}
            meta={`HS ${products[0].hs4} · ${fmt.money(products[0].value)}`}
            to={path(`/product/${products[0].hs4}`)}
          />
        )}
      </div>

      <div className="grid cols-2">
        <ChartCard
          wide
          title={t("world.map.title", { metric: metricLabels[metric].toLowerCase(), year })}
          subtitle={t("world.map.subtitle")}
          info={t(`info.map.${metric}`)}
          controls={
            <Segmented
              label={t("filters.metric")}
              value={metric}
              onChange={setMetric}
              options={METRICS.map((value) => ({ value, label: metricLabels[value] }))}
            />
          }
          rows={yearRows.map((row) => ({ ...row, country: names.country(row.code), balance: row.exports - row.imports }))}
          columns={[
            { key: "country", label: t("col.country") },
            { key: "exports", label: t("col.exports"), numeric: true, format: fmt.money },
            { key: "imports", label: t("col.imports"), numeric: true, format: fmt.money },
            { key: "balance", label: t("col.balance"), numeric: true, format: fmt.money },
            { key: "growth", label: t("col.growth"), numeric: true, format: fmt.change },
          ]}
          sources={["baci"]}
          filename={`world-${metric}-${year}`}
        >
          <MapChart
            values={mapValues}
            nameOf={(id) => names.country(featureToCountry.get(id) ?? id)}
            label={t("world.map.title", { metric: metricLabels[metric], year })}
            format={metricFormat}
            diverging={metric === "balance" || metric === "growth"}
            onSelect={(id) => {
              const code = featureToCountry.get(id);
              if (code) navigate(path(`/country/${code}`));
            }}
          />
        </ChartCard>

        <ChartCard
          title={t("world.trend.title")}
          subtitle={t("world.trend.subtitle")}
          info={t("info.worldTrend")}
          build={lineChart({
            x: totals.map(([y]) => String(y)),
            series: [{ name: t("world.trend.series"), values: totals.map(([, value]) => value) }],
            format: fmt.money,
            area: true,
          })}
          rows={totals.map(([y, value]) => ({ year: y, value }))}
          columns={[
            { key: "year", label: t("col.year") },
            { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
          ]}
          sources={["baci"]}
          filename="world-trade-total"
        />

        <ChartCard
          title={t("world.mix.title", { year })}
          subtitle={t("world.mix.subtitle")}
          info={t("info.treemap")}
          build={treemapChart(treemap, fmt.money, worldTotal ?? 0)}
          rows={chapters
            .filter((row) => row.year === year)
            .sort((a, b) => b.value - a.value)
            .map((row) => ({ hs2: row.hs2, chapter: names.chapter(row.hs2), value: row.value, share: worldTotal ? row.value / worldTotal : null }))}
          columns={[
            { key: "hs2", label: "HS" },
            { key: "chapter", label: t("col.chapter") },
            { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
            { key: "share", label: t("col.share"), numeric: true, format: fmt.share },
          ]}
          sources={["baci"]}
          filename={`world-products-${year}`}
        />

        <RankingCard names={names} rows={yearRows} field="exports" year={year} />
        <RankingCard names={names} rows={yearRows} field="imports" year={year} />

        <ChartCard
          wide
          tableFirst
          title={t("world.products.title", { year: lastYear })}
          subtitle={t("world.products.subtitle")}
          rows={products.slice(0, 20) as unknown as Record<string, unknown>[]}
          columns={[
            { key: "hs4", label: t("col.product"), format: (v) => <ProductLink hs4={String(v)} names={names} /> },
            { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
            { key: "growth", label: t("col.growthYear"), numeric: true, format: (v) => <Delta value={v} format={fmt.change} /> },
            { key: "top_exporter", label: t("col.topExporter"), format: (v) => <CountryLink code={String(v)} names={names} /> },
            { key: "top_exporter_share", label: t("col.share"), numeric: true, format: fmt.share },
          ]}
          sources={["baci"]}
          filename={`world-top-products-${lastYear}`}
        />
      </div>
      <p className="more-link">
        <Link to={path("/products")}>{t("world.products.all")} →</Link>
      </p>
    </>
  );
}

function metricValue(row: CountryYear, metric: Metric): number | null {
  if (metric === "exports") return row.exports;
  if (metric === "imports") return row.imports;
  if (metric === "balance") return row.exports - row.imports;
  return row.growth;
}

function RankingCard({ names, rows, field, year }: { names: Names; rows: CountryYear[]; field: "exports" | "imports"; year: number }) {
  const { t } = useI18n();
  const fmt = useFormats();
  const top = [...rows].sort((a, b) => b[field] - a[field]).slice(0, TOP);
  return (
    <ChartCard
      title={t(field === "exports" ? "world.topExporters" : "world.topImporters", { n: TOP, year })}
      build={rankedBarChart({ items: top.map((row) => ({ label: names.country(row.code), value: row[field] })), format: fmt.money, color: field === "exports" ? 0 : 1 })}
      chartHeight={420}
      rows={top.map((row) => ({ country: names.country(row.code), value: row[field], share: row.share }))}
      columns={[
        { key: "country", label: t("col.country") },
        { key: "value", label: t(field === "exports" ? "col.exports" : "col.imports"), numeric: true, format: fmt.money },
      ]}
      sources={["baci"]}
      filename={`world-top-${field}-${year}`}
    />
  );
}
