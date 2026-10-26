import { useMemo } from "react";
import { ChartCard } from "../components/ChartCard";
import { FilterBar, FilterChips, Segmented, SelectFilter, useParamState } from "../components/Filters";
import { useI18n } from "../i18n";
import { lineChart, sectionColor, stackedShareChart } from "../lib/charts";
import { toRows, useCountries, type CountryFile } from "../lib/data";
import { useNames, type Names } from "../lib/names";
import type { YearRow } from "./Country";
import { CountryLink, PageState, ProductLink, useFormats } from "./shared";

const MAX = 4;
const METRICS = ["exports", "imports", "balance", "world_export_share", "export_product_hhi"] as const;
type Metric = (typeof METRICS)[number];
const DEFAULT = "GEO,ARM,AZE";

/** Up to four countries side by side: totals over time, product mix, key indicators. */
export default function Compare() {
  const names = useNames();
  const [raw, setRaw] = useParamState("c", DEFAULT);
  const codes = useMemo(
    () => [...new Set(raw.split(",").filter((code) => names?.countryInfo(code)))].slice(0, MAX),
    [raw, names],
  );
  const { data, error } = useCountries(names ? codes : []);
  if (error) return <PageState error={error} />;
  if (!names) return <PageState />;
  return <CompareView names={names} codes={codes} files={data} setCodes={(next) => setRaw(next.join(","))} />;
}

function CompareView({
  names,
  codes,
  files,
  setCodes,
}: {
  names: Names;
  codes: string[];
  files: Record<string, CountryFile> | null;
  setCodes: (codes: string[]) => void;
}) {
  const { t } = useI18n();
  const fmt = useFormats();
  const [metric, setMetric] = useParamState<Metric>("metric", "exports");
  const { first_year: first, last_year: last } = names.meta.baci;
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const options = useMemo(
    () =>
      names.countries
        .filter((country) => !country.historical && !codes.includes(country.code))
        .map((country) => ({ value: country.code, label: names.country(country.code) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [names, codes],
  );

  const metricLabels: Record<Metric, string> = {
    exports: t("metric.exports"),
    imports: t("metric.imports"),
    balance: t("metric.balance"),
    world_export_share: t("country.kpi.share"),
    export_product_hhi: t("compare.metric.productHhi"),
  };
  const metricFormat = metric === "world_export_share" ? fmt.share : metric === "export_product_hhi" ? fmt.decimal : fmt.money;

  const rows = useMemo(() => {
    if (!files) return {} as Record<string, YearRow[]>;
    return Object.fromEntries(codes.map((code) => [code, toRows<YearRow>(files[code]?.years)]));
  }, [files, codes]);

  // Export mix by HS section in the latest year, from each country's HS4 exports.
  const mix = useMemo(() => {
    if (!files) return null;
    const sections = names.sections.map((section) => section.id);
    const shares = codes.map((code) => {
      const products = toRows<{ hs4: string; exports: number }>(files[code]?.products);
      const total = products.reduce((sum, row) => sum + (row.exports ?? 0), 0);
      const bySection = new Map<number, number>();
      for (const row of products) {
        const section = names.chapterSection(row.hs4.slice(0, 2)) ?? 22;
        bySection.set(section, (bySection.get(section) ?? 0) + (row.exports ?? 0));
      }
      return sections.map((id) => (total ? (bySection.get(id) ?? 0) / total : 0));
    });
    return sections
      .map((id, index) => ({ name: names.section(id), color: sectionColor(id), values: shares.map((values) => values[index]) }))
      .filter((series) => series.values.some((value) => value >= 0.005));
  }, [files, codes, names]);

  const summary = codes.map((code) => {
    const latest = rows[code]?.find((row) => row.year === last);
    return { code, ...latest };
  });

  return (
    <>
      <header className="page-head">
        <h1>{t("compare.title")}</h1>
        <p className="lede">{t("compare.lede", { n: MAX })}</p>
      </header>

      <FilterBar>
        {codes.length < MAX && (
          <SelectFilter
            label={t("compare.add")}
            value=""
            onChange={(code) => code && setCodes([...codes, code])}
            options={[{ value: "", label: t("compare.choose") }, ...options]}
          />
        )}
        <FilterChips items={codes.map((code) => ({ label: names.country(code), onClear: () => setCodes(codes.filter((c) => c !== code)) }))} />
      </FilterBar>

      {codes.length === 0 && <p className="notice">{t("compare.empty")}</p>}
      {codes.length > 0 && !files && <PageState />}
      {codes.length > 0 && files && (
        <div className="grid cols-2">
          <ChartCard
            wide
            title={t("compare.trend.title", { metric: metricLabels[metric] })}
            info={t("info.compare")}
            controls={
              <Segmented label={t("filters.metric")} value={metric} onChange={setMetric} options={METRICS.map((value) => ({ value, label: metricLabels[value] }))} />
            }
            build={lineChart({
              x: years.map(String),
              series: codes.map((code, index) => {
                const byYear = new Map((rows[code] ?? []).map((row) => [row.year, row[metric] as number | null]));
                return { name: names.country(code), values: years.map((y) => byYear.get(y) ?? null), color: index };
              }),
              format: metricFormat,
              baseline: metric === "balance" ? 0 : undefined,
            })}
            rows={codes.flatMap((code) => (rows[code] ?? []).map((row) => ({ country: names.country(code), year: row.year, value: row[metric] })))}
            columns={[
              { key: "country", label: t("col.country") },
              { key: "year", label: t("col.year") },
              { key: "value", label: metricLabels[metric], numeric: true, format: metricFormat },
            ]}
            sources={["baci"]}
            filename={`compare-${metric}`}
          />

          {mix && (
            <ChartCard
              wide
              title={t("compare.mix.title", { year: last })}
              subtitle={t("compare.mix.subtitle")}
              build={stackedShareChart({ categories: codes.map((code) => names.country(code)), series: mix, format: fmt.share })}
              chartHeight={Math.max(200, codes.length * 64 + 80)}
              rows={codes.flatMap((code, index) => mix.map((series) => ({ country: names.country(code), section: series.name, share: series.values[index] })))}
              columns={[
                { key: "country", label: t("col.country") },
                { key: "section", label: t("col.section") },
                { key: "share", label: t("col.share"), numeric: true, format: fmt.share },
              ]}
              sources={["baci"]}
              filename={`compare-mix-${last}`}
            />
          )}

          <ChartCard
            wide
            tableFirst
            title={t("compare.table.title", { year: last })}
            rows={summary as unknown as Record<string, unknown>[]}
            columns={[
              { key: "code", label: t("col.country"), format: (v) => <CountryLink code={String(v)} names={names} /> },
              { key: "exports", label: t("col.exports"), numeric: true, format: fmt.money },
              { key: "imports", label: t("col.imports"), numeric: true, format: fmt.money },
              { key: "exports_growth", label: t("col.growth"), numeric: true, format: fmt.change },
              { key: "world_export_share", label: t("col.worldShare"), numeric: true, format: fmt.share },
              { key: "export_partner_hhi", label: t("country.concentration.partners"), numeric: true, format: fmt.decimal },
              { key: "rca_product_count", label: t("col.rcaCount"), numeric: true, format: fmt.number },
              { key: "top_export_partner", label: t("col.topPartner"), format: (v) => (v ? <CountryLink code={String(v)} names={names} /> : "—") },
              { key: "top_export_hs4", label: t("col.topProduct"), format: (v) => (v ? <ProductLink hs4={String(v)} names={names} /> : "—") },
            ]}
            sources={["baci"]}
            filename={`compare-${last}`}
          />
        </div>
      )}
    </>
  );
}
