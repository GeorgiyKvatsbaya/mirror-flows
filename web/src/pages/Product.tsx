import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChartCard } from "../components/ChartCard";
import { FilterBar, Segmented, useParamState } from "../components/Filters";
import { KpiTile } from "../components/KpiTile";
import { MapChart } from "../components/MapChart";
import { useI18n } from "../i18n";
import { lineChart, rankedBarChart } from "../lib/charts";
import { toRows, useProduct, type ProductFile } from "../lib/data";
import { useNames, type Names } from "../lib/names";
import { NotFound } from "./NotFound";
import { CountryLink, PageState, useFormats } from "./shared";

type YearRow = { year: number; value: number; growth: number | null; exporter_count: number; exporter_hhi: number | null };
type ExporterRow = { year: number; code: string; value: number; share: number };
type LatestRow = { code: string; exports: number; imports: number; share: number | null; rca: number | null };

const FLOWS = ["exports", "imports"] as const;
type Flow = (typeof FLOWS)[number];
const TOP = 15;
const LEADERS = 6;

export default function Product() {
  const { hs4 = "" } = useParams();
  const names = useNames();
  const { data, error } = useProduct(hs4);
  if (names && !names.products.some((p) => p.code === hs4)) return <NotFound />;
  if (error) return <PageState error={error} />;
  if (!names || !data) return <PageState />;
  return <ProductView key={hs4} hs4={hs4} names={names} data={data} />;
}

function ProductView({ hs4, names, data }: { hs4: string; names: Names; data: ProductFile }) {
  const { t, path } = useI18n();
  const navigate = useNavigate();
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
  const featureToCountry = useMemo(() => {
    const map = new Map<string, string>();
    for (const country of names.countries) if (country.map && !country.historical) map.set(country.map, country.code);
    return map;
  }, [names]);

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

      <FilterBar>{flowControl}</FilterBar>

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
              if (code) navigate(path(`/country/${code}`));
            }}
          />
        </ChartCard>

        <ChartCard
          title={t(flow === "exports" ? "product.top.exports" : "product.top.imports", { n: TOP, year: lastYear })}
          build={rankedBarChart({ items: top.map((row) => ({ label: names.country(row.code), value: row[flow] })), format: fmt.money, color: flow === "exports" ? 0 : 1 })}
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
