import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ChartCard } from "../components/ChartCard";
import { FilterBar, FilterChips, SelectFilter, useParamState } from "../components/Filters";
import { KpiTile } from "../components/KpiTile";
import { useI18n } from "../i18n";
import { lineChart, onItemClick, rankedBarChart } from "../lib/charts";
import { toRows, useCountry, type CountryFile } from "../lib/data";
import { formatMonth } from "../lib/format";
import { useNames, type Names } from "../lib/names";
import { useParquet } from "../lib/parquet";
import type { CrossRow, MonthRow } from "./Country";
import { NotFound } from "./NotFound";
import { PageState, ProductLink, useFormats, useYear, yearOptions } from "./shared";

/** routes/exporter/{code}.parquet: what a country sends to whom, by HS4, since 2015 (>= $1M). */
type RouteRow = { year: number; importer: string; hs4: string; value: number };
const TOP_PRODUCTS = 12;
const PRODUCT_LINES = 5;

export default function Pair() {
  const { code = "", partner = "" } = useParams();
  const names = useNames();
  const valid = Boolean(names?.countryInfo(code) && names.countryInfo(partner) && code !== partner);
  const country = useCountry(valid ? code : undefined);
  const cross = useParquet<CrossRow>(valid ? `cross/${code}.parquet` : null);
  if (names && !valid) return <NotFound />;
  const error = country.error ?? cross.error;
  if (error) return <PageState error={error} />;
  if (!names || !country.data || !cross.rows) return <PageState />;
  return <PairView key={`${code}-${partner}`} code={code} partner={partner} names={names} country={country.data} cross={cross.rows} />;
}

function PairView({ code, partner, names, country, cross }: { code: string; partner: string; names: Names; country: CountryFile; cross: CrossRow[] }) {
  const { lang, t, path } = useI18n();
  const fmt = useFormats();
  const a = names.country(code);
  const b = names.country(partner);
  const { first_year: first, last_year: last } = names.meta.baci;
  const [year, setYear] = useYear(last);
  // Cross-filter: a chapter clicked in either direction opens the HS4 products inside it.
  const [hs2, setHs2] = useParamState("hs2", "");
  const chapterName = hs2 ? names.chapter(hs2) : "";
  const toggleChapter = (value: string) => setHs2(value === hs2 ? "" : value);

  const yearsRange = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const totals = cross.filter((row) => row.partner === partner && row.hs2 === null);
  const byYear = new Map(totals.map((row) => [row.year, row]));
  const selected = byYear.get(year);
  const partnerTotals = cross.filter((row) => row.year === year && row.partner && row.partner !== code && row.hs2 === null);
  const exportRank = selected?.exports ? [...partnerTotals].sort((x, y) => y.exports - x.exports).findIndex((row) => row.partner === partner) + 1 : 0;
  const importRank = selected?.imports ? [...partnerTotals].sort((x, y) => y.imports - x.imports).findIndex((row) => row.partner === partner) + 1 : 0;
  const cells = cross.filter((row) => row.year === year && row.partner === partner && row.hs2 !== null) as (CrossRow & { hs2: string })[];
  const chapters = (field: "exports" | "imports") =>
    cells
      .filter((row) => row[field] > 0)
      .sort((x, y) => y[field] - x[field])
      .map((row) => ({ label: names.chapter(row.hs2), value: row[field], id: row.hs2 }));
  const monthly = toRows<MonthRow>(country.monthly).filter((row) => row.partner === partner);

  // HS4 drill-down: A -> B from A's routes, B -> A from B's routes.
  const outbound = useParquet<RouteRow>(hs2 ? `routes/exporter/${code}.parquet` : null);
  const inbound = useParquet<RouteRow>(hs2 ? `routes/exporter/${partner}.parquet` : null);
  const drill = useMemo(() => {
    const pick = (rows: RouteRow[] | null, to: string) =>
      (rows ?? []).filter((row) => row.importer === to && row.hs4.startsWith(hs2));
    return { x: pick(outbound.rows, partner), m: pick(inbound.rows, code) };
  }, [outbound.rows, inbound.rows, hs2, code, partner]);
  const routeYears = [...new Set([...drill.x, ...drill.m].map((row) => row.year))].sort((p, q) => p - q);
  const drillYear = routeYears.includes(year) ? year : routeYears.at(-1);

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">
          <Link to={path(`/country/${code}`)}>{a}</Link> · {t("pair.eyebrow")}
        </p>
        <h1>
          {a} ↔ {b}
        </h1>
        <p className="lede">{t("pair.lede", { a, b, year })}</p>
        <p className="pair-links">
          <Link to={path(`/country/${partner}/partner/${code}`)}>{t("pair.swap", { b })}</Link>
          {" · "}
          <Link to={path(`/country/${partner}`)}>{t("pair.profile", { b })}</Link>
          {" · "}
          <Link to={path(`/compare?c=${code},${partner}`)}>{t("pair.compare")}</Link>
        </p>
      </header>

      <FilterBar>
        <SelectFilter label={t("filters.year")} value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions(first, last)} />
        <FilterChips items={hs2 ? [{ label: `${t("filters.chapter")}: ${chapterName}`, onClear: () => setHs2("") }] : []} />
      </FilterBar>

      <div className="grid kpi-grid">
        <KpiTile label={t("pair.kpi.exports", { a, b })} value={fmt.money(selected?.exports ?? 0)} meta={exportRank ? t("pair.kpi.rank", { rank: exportRank, year }) : String(year)} />
        <KpiTile label={t("pair.kpi.imports", { a, b })} value={fmt.money(selected?.imports ?? 0)} meta={importRank ? t("pair.kpi.rank", { rank: importRank, year }) : String(year)} />
        <KpiTile label={t("pair.kpi.balance", { a })} value={fmt.money((selected?.exports ?? 0) - (selected?.imports ?? 0))} meta={String(year)} />
      </div>

      <div className="grid cols-2">
        <ChartCard
          wide
          title={t("pair.trend.title", { a, b })}
          subtitle={t("pair.trend.subtitle")}
          info={t("info.pair")}
          build={lineChart({
            x: yearsRange.map(String),
            series: [
              { name: t("pair.series.exports", { a, b }), values: yearsRange.map((y) => byYear.get(y)?.exports ?? null) },
              { name: t("pair.series.imports", { a, b }), values: yearsRange.map((y) => byYear.get(y)?.imports ?? null), color: 1 },
            ],
            format: fmt.money,
          })}
          rows={totals}
          columns={[
            { key: "year", label: t("col.year") },
            { key: "exports", label: t("pair.series.exports", { a, b }), numeric: true, format: fmt.money },
            { key: "imports", label: t("pair.series.imports", { a, b }), numeric: true, format: fmt.money },
          ]}
          sources={["baci"]}
          filename={`${code}-${partner}-trade`}
        />

        {(["exports", "imports"] as const).map((field) => {
          const items = chapters(field);
          const title = t(field === "exports" ? "pair.chapters.exports" : "pair.chapters.imports", { a, b, year });
          return (
            <ChartCard
              key={field}
              title={title}
              subtitle={t("pair.chapters.hint")}
              build={items.length ? rankedBarChart({ items: items.slice(0, 15), format: fmt.money, color: field === "exports" ? 0 : 1, selected: hs2 || null }) : undefined}
              onChartReady={onItemClick(toggleChapter, new Map(items.map((item) => [item.label, item.id])))}
              chartHeight={Math.max(160, Math.min(items.length, 15) * 30)}
              rows={items.map((item) => ({ hs2: item.id, chapter: item.label, value: item.value }))}
              columns={[
                { key: "hs2", label: "HS" },
                { key: "chapter", label: t("col.chapter") },
                { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
              ]}
              sources={["baci"]}
              filename={`${code}-${partner}-${field}-${year}`}
            />
          );
        })}

        {hs2 && (outbound.error || inbound.error) && <p className="notice">{t("common.error")}</p>}
        {hs2 &&
          outbound.rows &&
          inbound.rows &&
          (["x", "m"] as const).map((flow) => {
            const rows = drill[flow];
            const latest = rows.filter((row) => row.year === drillYear).sort((p, q) => q.value - p.value);
            const top = latest.slice(0, TOP_PRODUCTS);
            const lines = latest.slice(0, PRODUCT_LINES).map((row) => row.hs4);
            const from = flow === "x" ? a : b;
            const to = flow === "x" ? b : a;
            return (
              <ChartCard
                key={`drill-${flow}`}
                title={t("pair.drill.title", { from, to, chapter: chapterName, year: drillYear ?? year })}
                subtitle={drillYear !== year ? t("pair.drill.routesFrom") : undefined}
                info={t("info.routes")}
                build={
                  top.length
                    ? rankedBarChart({ items: top.map((row) => ({ label: names.productShort(row.hs4), value: row.value, id: row.hs4 })), format: fmt.money, color: flow === "x" ? 0 : 1 })
                    : undefined
                }
                chartHeight={Math.max(160, top.length * 30)}
                rows={rows
                  .filter((row) => lines.includes(row.hs4))
                  .map((row) => ({ year: row.year, hs4: row.hs4, value: row.value }))}
                columns={[
                  { key: "year", label: t("col.year") },
                  { key: "hs4", label: t("col.product"), format: (v) => <ProductLink hs4={String(v)} names={names} /> },
                  { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
                ]}
                sources={["baci"]}
                filename={`${code}-${partner}-hs${hs2}-${flow === "x" ? "exports" : "imports"}`}
              />
            );
          })}

        {hs2 && outbound.rows && inbound.rows && routeYears.length > 1 && (
          <ChartCard
            wide
            title={t("pair.drill.trend", { a, b, chapter: chapterName })}
            subtitle={t("pair.drill.trendSubtitle", { n: PRODUCT_LINES })}
            build={lineChart({
              x: routeYears.map(String),
              series: [...drill.x]
                .filter((row) => row.year === drillYear)
                .sort((p, q) => q.value - p.value)
                .slice(0, PRODUCT_LINES)
                .map((top, index) => {
                  const values = new Map(drill.x.filter((row) => row.hs4 === top.hs4).map((row) => [row.year, row.value]));
                  return { name: `${top.hs4} ${names.productShort(top.hs4)}`, values: routeYears.map((y) => values.get(y) ?? null), color: index };
                }),
              format: fmt.money,
            })}
            rows={drill.x.map((row) => ({ year: row.year, hs4: row.hs4, product: names.productShort(row.hs4), value: row.value }))}
            columns={[
              { key: "year", label: t("col.year") },
              { key: "hs4", label: "HS4" },
              { key: "product", label: t("col.product") },
              { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
            ]}
            sources={["baci"]}
            filename={`${code}-${partner}-hs${hs2}-trend`}
          />
        )}

        {monthly.length > 0 && (
          <ChartCard
            wide
            title={t("pair.monthly.title", { a, b })}
            info={t("info.imf")}
            build={lineChart({
              x: monthly.map((row) => row.month),
              xFormat: (value) => formatMonth(lang, value),
              series: [
                { name: t("pair.series.exports", { a, b }), values: monthly.map((row) => row.exports) },
                { name: t("pair.series.imports", { a, b }), values: monthly.map((row) => row.imports), color: 1 },
              ],
              format: fmt.money,
            })}
            rows={monthly}
            columns={[
              { key: "month", label: t("col.month"), format: (v) => formatMonth(lang, String(v)) },
              { key: "exports", label: t("col.exportsTo"), numeric: true, format: fmt.money },
              { key: "imports", label: t("col.importsFromCif"), numeric: true, format: fmt.money },
            ]}
            sources={["imf"]}
            filename={`${code}-${partner}-monthly`}
          />
        )}
      </div>
    </>
  );
}
