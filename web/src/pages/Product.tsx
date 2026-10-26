import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { ChartCard } from "../components/ChartCard";
import { FilterBar, FilterChips, Segmented, useParamState } from "../components/Filters";
import { KpiTile } from "../components/KpiTile";
import { MapChart } from "../components/MapChart";
import { useI18n } from "../i18n";
import { lineChart, onItemClick, rankedBarChart } from "../lib/charts";
import { toRows, useProduct, type ProductFile } from "../lib/data";
import { useNames, type Names } from "../lib/names";
import { useParquet } from "../lib/parquet";
import { NotFound } from "./NotFound";
import { CountryLink, PageState, useFeatureToCountry, useFormats } from "./shared";

type YearRow = { year: number; value: number; growth: number | null; exporter_count: number; exporter_hhi: number | null };
type ExporterRow = { year: number; code: string; value: number; share: number };
type LatestRow = { code: string; exports: number; imports: number; share: number | null; rca: number | null };
/** routes/product/{hs4}.parquet: exporter -> importer flows of this product since 2015 (>= $1M). */
type RouteRow = { year: number; exporter: string; importer: string; value: number };
const ROUTE_LINES = 5;

const FLOWS = ["exports", "imports"] as const;
type Flow = (typeof FLOWS)[number];
const TOP = 15;
const LEADERS = 6;

export default function Product() {
  const { hs4 = "" } = useParams();
  const names = useNames();
  const { data, error } = useProduct(names?.products.some((p) => p.code === hs4) ? hs4 : undefined);
  if (names && !names.products.some((p) => p.code === hs4)) return <NotFound />;
  if (error) return <PageState error={error} />;
  if (!names || !data) return <PageState />;
  return <ProductView key={hs4} hs4={hs4} names={names} data={data} />;
}

function ProductView({ hs4, names, data }: { hs4: string; names: Names; data: ProductFile }) {
  const { t } = useI18n();
  const fmt = useFormats();
  const [flow, setFlow] = useParamState<Flow>("flow", "exports");
  const years = toRows<YearRow>(data.years);
  const exporters = toRows<ExporterRow>(data.exporters);
  const latest = toRows<LatestRow>(data.latest);
  const last = years.at(-1);
  const lastYear = last?.year ?? names.meta.baci.last_year;
  const title = names.productShort(hs4);
  const officialTitle = names.product(hs4);
  const chapter = names.chapter(hs4.slice(0, 2));
  const flowLabel = (value: Flow) => t(value === "exports" ? "metric.exports" : "metric.imports");
  // Cross-filter: a trader clicked in the ranking or on the map shows its destinations (exports)
  // or its suppliers (imports) for this product.
  const [trader, setTrader] = useParamState("trader", "");
  const routes = useParquet<RouteRow>(trader ? `routes/product/${hs4}.parquet` : null);
  const traderName = trader ? names.country(trader) : "";
  const toggleTrader = (code: string) => setTrader(code === trader ? "" : code);
  const total = latest.reduce((sum, row) => sum + row[flow], 0);
  const top = [...latest].sort((a, b) => b[flow] - a[flow]).slice(0, TOP);

  const mapValues = useMemo(() => {
    const values = new Map<string, number>();
    for (const row of latest) {
      const feature = names.countryInfo(row.code)?.map;
      if (feature && row[flow] > 0) values.set(feature, (values.get(feature) ?? 0) + row[flow]);
    }
    return values;
  }, [latest, flow, names]);
  const featureToCountry = useFeatureToCountry(names);

  // The selected trader's counterparts: who it sells to (exports) or buys from (imports).
  const counterparts = useMemo(() => {
    if (!trader || !routes.rows) return [];
    return routes.rows
      .filter((row) => (flow === "exports" ? row.exporter === trader : row.importer === trader))
      .map((row) => ({ year: row.year, code: flow === "exports" ? row.importer : row.exporter, value: row.value }));
  }, [routes.rows, trader, flow]);
  const routeYears = [...new Set(counterparts.map((row) => row.year))].sort((a, b) => a - b);
  const routeLast = routeYears.at(-1);
  const counterpartsLatest = counterparts.filter((row) => row.year === routeLast).sort((a, b) => b.value - a.value);
  const counterpartTotal = counterpartsLatest.reduce((sum, row) => sum + row.value, 0);
  const counterpartMap = useMemo(() => {
    const values = new Map<string, number>();
    for (const row of counterpartsLatest) {
      const feature = names.countryInfo(row.code)?.map;
      if (feature) values.set(feature, (values.get(feature) ?? 0) + row.value);
    }
    return values;
  }, [counterpartsLatest, names]);
  const topCounterparts = counterpartsLatest.slice(0, ROUTE_LINES).map((row) => row.code);

  // Market share of today's leaders over time (colour follows the country, fixed by rank today).
  const leaders = exporters.filter((row) => row.year === lastYear).slice(0, LEADERS).map((row) => row.code);
  const shareYears = years.map((row) => row.year);

  const flowControl = (
    <Segmented label={t("filters.flow")} value={flow} onChange={setFlow} options={FLOWS.map((value) => ({ value, label: flowLabel(value) }))} />
  );

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">
          HS {hs4} · {chapter}
        </p>
        <h1>{title}</h1>
        {officialTitle !== title && <p className="official-title">{officialTitle}</p>}
        {last && (
          <p className="lede">
            {t("product.lede", {
              year: lastYear,
              value: fmt.money(last.value),
              leader: names.country(leaders[0]),
              share: fmt.share(exporters.find((row) => row.year === lastYear)?.share),
            })}
          </p>
        )}
      </header>

      {last && (
        <div className="grid kpi-grid">
          <KpiTile
            label={t("product.kpi.world")}
            value={fmt.money(last.value)}
            meta={String(lastYear)}
            delta={last.growth !== null ? { text: fmt.change(last.growth), direction: last.growth >= 0 ? "up" : "down" } : undefined}
            trend={years.map((row) => row.value)}
          />
          <KpiTile label={t("product.kpi.exporters")} value={fmt.number(last.exporter_count)} meta={String(lastYear)} />
          <KpiTile label={t("product.kpi.hhi")} value={fmt.decimal(last.exporter_hhi)} meta={t(hhiBand(last.exporter_hhi))} />
        </div>
      )}

      <FilterBar>
        {flowControl}
        <FilterChips items={trader ? [{ label: `${t(flow === "exports" ? "filters.exporter" : "filters.importer")}: ${traderName}`, onClear: () => setTrader("") }] : []} />
      </FilterBar>

      <div className="grid cols-2">
        <ChartCard
          wide
          title={t(flow === "exports" ? "product.map.exports" : "product.map.imports", { year: lastYear })}
          rows={[...latest].sort((a, b) => b[flow] - a[flow]).map((row) => ({ ...row, country: names.country(row.code), flowShare: total ? row[flow] / total : null }))}
          columns={[
            { key: "country", label: t("col.country") },
            { key: "exports", label: t("col.exports"), numeric: true, format: fmt.money },
            { key: "imports", label: t("col.imports"), numeric: true, format: fmt.money },
            { key: "share", label: t("col.worldShare"), numeric: true, format: fmt.share },
            { key: "rca", label: "RCA", numeric: true, format: fmt.decimal },
          ]}
          sources={["baci"]}
          filename={`${hs4}-${flow}-${lastYear}`}
        >
          <MapChart
            values={mapValues}
            nameOf={(id) => names.country(featureToCountry.get(id) ?? id)}
            label={t(flow === "exports" ? "product.map.exports" : "product.map.imports", { year: lastYear })}
            format={fmt.money}
            onSelect={(id) => {
              const code = featureToCountry.get(id);
              if (code) toggleTrader(code);
            }}
          />
        </ChartCard>

        <ChartCard
          title={t(flow === "exports" ? "product.top.exports" : "product.top.imports", { n: TOP, year: lastYear })}
          subtitle={t(flow === "exports" ? "product.crossHint.exports" : "product.crossHint.imports")}
          info={t("info.productCross")}
          build={rankedBarChart({
            items: top.map((row) => ({ label: names.country(row.code), value: row[flow], id: row.code })),
            format: fmt.money,
            color: flow === "exports" ? 0 : 1,
            selected: trader || null,
          })}
          onChartReady={onItemClick(toggleTrader, new Map(top.map((row) => [names.country(row.code), row.code])))}
          chartHeight={420}
          rows={top.map((row) => ({ ...row, country: names.country(row.code), flowShare: total ? row[flow] / total : null }))}
          columns={[
            { key: "code", label: t("col.country"), format: (v) => <CountryLink code={String(v)} names={names} /> },
            { key: flow, label: flowLabel(flow), numeric: true, format: fmt.money },
            { key: "flowShare", label: t("col.share"), numeric: true, format: fmt.share },
          ]}
          sources={["baci"]}
          filename={`${hs4}-top-${flow}-${lastYear}`}
        />

        {trader && routes.error && <p className="notice">{t("common.error")}</p>}
        {trader && routes.rows && (
          <>
            <ChartCard
              wide
              title={t(flow === "exports" ? "product.route.exportsTitle" : "product.route.importsTitle", { trader: traderName, year: routeLast ?? lastYear })}
              subtitle={t("product.route.subtitle")}
              rows={counterpartsLatest.map((row) => ({ ...row, country: names.country(row.code), share: counterpartTotal ? row.value / counterpartTotal : null }))}
              columns={[
                { key: "code", label: t("col.country"), format: (v) => <CountryLink code={String(v)} names={names} /> },
                { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
                { key: "share", label: t("col.share"), numeric: true, format: fmt.share },
              ]}
              sources={["baci"]}
              filename={`${hs4}-${trader}-${flow === "exports" ? "destinations" : "origins"}`}
            >
              {counterpartsLatest.length ? (
                <MapChart
                  values={counterpartMap}
                  nameOf={(id) => names.country(featureToCountry.get(id) ?? id)}
                  label={t(flow === "exports" ? "product.route.exportsTitle" : "product.route.importsTitle", { trader: traderName, year: routeLast ?? lastYear })}
                  format={fmt.money}
                  highlight={names.countryInfo(trader)?.map}
                />
              ) : (
                <p className="notice">{t("product.route.none", { trader: traderName })}</p>
              )}
            </ChartCard>
            {topCounterparts.length > 0 && (
              <ChartCard
                wide
                title={t(flow === "exports" ? "product.route.exportsTrend" : "product.route.importsTrend", { trader: traderName, n: topCounterparts.length })}
                info={t("info.routes")}
                build={lineChart({
                  x: routeYears.map(String),
                  series: topCounterparts.map((code, index) => {
                    const byYear = new Map(counterparts.filter((row) => row.code === code).map((row) => [row.year, row.value]));
                    return { name: names.country(code), values: routeYears.map((y) => byYear.get(y) ?? null), color: index };
                  }),
                  format: fmt.money,
                })}
                rows={counterparts.filter((row) => topCounterparts.includes(row.code)).map((row) => ({ ...row, country: names.country(row.code) }))}
                columns={[
                  { key: "year", label: t("col.year") },
                  { key: "country", label: t("col.country") },
                  { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
                ]}
                sources={["baci"]}
                filename={`${hs4}-${trader}-trend`}
              />
            )}
          </>
        )}

        <ChartCard
          title={t("product.trend.title")}
          info={t("info.productTrend")}
          build={lineChart({ x: years.map((row) => String(row.year)), series: [{ name: title, values: years.map((row) => row.value) }], format: fmt.money, area: true })}
          rows={years}
          columns={[
            { key: "year", label: t("col.year") },
            { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
            { key: "growth", label: t("col.growthYear"), numeric: true, format: fmt.change },
            { key: "exporter_count", label: t("col.exporters"), numeric: true, format: fmt.number },
          ]}
          sources={["baci"]}
          filename={`${hs4}-world`}
        />

        <ChartCard
          wide
          title={t("product.shares.title")}
          subtitle={t("product.shares.subtitle", { n: leaders.length, year: lastYear })}
          info={t("info.marketShare")}
          build={lineChart({
            x: shareYears.map(String),
            series: leaders.map((code, index) => {
              const byYear = new Map(exporters.filter((row) => row.code === code).map((row) => [row.year, row.share]));
              return { name: names.country(code), values: shareYears.map((y) => byYear.get(y) ?? null), color: index };
            }),
            format: fmt.share,
          })}
          rows={exporters.filter((row) => leaders.includes(row.code)).map((row) => ({ ...row, country: names.country(row.code) }))}
          columns={[
            { key: "year", label: t("col.year") },
            { key: "country", label: t("col.country") },
            { key: "value", label: t("col.exports"), numeric: true, format: fmt.money },
            { key: "share", label: t("col.worldShare"), numeric: true, format: fmt.share },
          ]}
          sources={["baci"]}
          filename={`${hs4}-market-shares`}
        />
      </div>
    </>
  );
}

function hhiBand(value: number | null) {
  if (value === null) return "hhi.unknown" as const;
  if (value >= 0.25) return "hhi.high" as const;
  if (value >= 0.15) return "hhi.moderate" as const;
  return "hhi.low" as const;
}
