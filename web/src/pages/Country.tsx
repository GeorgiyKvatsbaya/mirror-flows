import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ChartCard } from "../components/ChartCard";
import { FilterBar, FilterChips, Segmented, SelectFilter, useParamState } from "../components/Filters";
import { KpiTile } from "../components/KpiTile";
import { MapChart } from "../components/MapChart";
import { useI18n } from "../i18n";
import { lineChart, onItemClick, rankedBarChart, sectionColor, treemapChart, type TreemapGroup } from "../lib/charts";
import { toRows, useCountry, type CountryFile } from "../lib/data";
import { formatMonth } from "../lib/format";
import { incomeName, regionName, useNames, type Names } from "../lib/names";
import { useParquet } from "../lib/parquet";
import { NotFound } from "./NotFound";
import { Delta, PageState, ProductLink, useFeatureToCountry, useFormats, useYear, yearOptions } from "./shared";

export type YearRow = {
  year: number;
  exports: number;
  imports: number;
  balance: number;
  exports_growth: number | null;
  imports_growth: number | null;
  world_export_share: number | null;
  export_partner_count: number | null;
  import_partner_count: number | null;
  export_partner_hhi: number | null;
  export_product_count: number | null;
  export_product_hhi: number | null;
  rca_product_count: number | null;
  top_export_partner: string | null;
  top_import_partner: string | null;
  top_export_hs4: string | null;
};
/** cross/{code}.parquet: partner x chapter cells (>= $1M) plus exact margins —
 *  partner totals have hs2 = null, chapter totals have partner = null. */
export type CrossRow = { year: number; partner: string | null; hs2: string | null; exports: number; imports: number };
type ProductRow = { hs4: string; exports: number; imports: number; exports_5y_ago: number | null; world_market_share: number | null; rca: number | null };
export type MonthRow = { month: string; partner: string; exports: number | null; imports: number | null; exports_yoy: number | null; imports_yoy: number | null };

const FLOWS = ["exports", "imports"] as const;
type Flow = (typeof FLOWS)[number];
const TOP = 15;

export default function Country() {
  const { code = "" } = useParams();
  const names = useNames();
  // Fetch only known codes: an unknown one would 404 before the Not Found page renders.
  const known = Boolean(names?.countryInfo(code));
  const { data, error } = useCountry(known ? code : undefined);
  const cross = useParquet<CrossRow>(known ? `cross/${code}.parquet` : null);
  if (names && !known) return <NotFound />;
  if (error || cross.error) return <PageState error={error ?? cross.error} />;
  if (!names || !data || !cross.rows) return <PageState />;
  return <CountryView key={code} code={code} names={names} data={data} cross={cross.rows} />;
}

function CountryView({ code, names, data, cross }: { code: string; names: Names; data: CountryFile; cross: CrossRow[] }) {
  const { lang, t, path } = useI18n();
  const fmt = useFormats();
  const info = names.countryInfo(code)!;
  const years = toRows<YearRow>(data.years);
  const products = toRows<ProductRow>(data.products);
  const monthly = toRows<MonthRow>(data.monthly);
  const first = years[0]?.year ?? names.meta.baci.first_year;
  const last = years.at(-1)?.year ?? names.meta.baci.last_year;
  const [year, setYear] = useYear(last);
  const [flow, setFlow] = useParamState<Flow>("flow", "exports");
  // Cross-filter selection (shareable in the URL): a partner and/or an HS2 chapter.
  const [partner, setPartner] = useParamState("partner", "");
  const [hs2, setHs2] = useParamState("hs2", "");
  const current = years.find((row) => row.year === year);
  const name = names.country(code);
  const partnerName = partner ? names.country(partner) : "";
  const chapterName = hs2 ? names.chapter(hs2) : "";
  const flowLabel = (value: Flow) => t(value === "exports" ? "metric.exports" : "metric.imports");
  const featureToCountry = useFeatureToCountry(names);

  const yearRows = useMemo(() => cross.filter((row) => row.year === year), [cross, year]);
  // Partners: totals, or — with a chapter selected — that chapter's cells.
  const partnerRows = useMemo(
    () =>
      yearRows.filter((row) => row.partner && row.partner !== code && (hs2 ? row.hs2 === hs2 : row.hs2 === null)),
    [yearRows, hs2, code],
  ) as (CrossRow & { partner: string })[];
  // Chapters: totals, or — with a partner selected — the cells with that partner.
  const chapterRows = useMemo(
    () => yearRows.filter((row) => row.hs2 && (partner ? row.partner === partner : row.partner === null)),
    [yearRows, partner],
  ) as (CrossRow & { hs2: string })[];
  const partnerTotal = partnerRows.reduce((sum, row) => sum + row[flow], 0);
  const chapterTotal = chapterRows.reduce((sum, row) => sum + row[flow], 0);
  const topPartners = [...partnerRows].sort((a, b) => b[flow] - a[flow]).slice(0, TOP);

  const mapValues = useMemo(() => {
    const values = new Map<string, number>();
    for (const row of partnerRows) {
      const feature = names.countryInfo(row.partner)?.map;
      if (feature && row[flow] > 0) values.set(feature, (values.get(feature) ?? 0) + row[flow]);
    }
    return values;
  }, [partnerRows, flow, names]);

  const treemap = useMemo(() => {
    const groups = new Map<number, TreemapGroup>();
    for (const row of chapterRows.filter((r) => r[flow] > 0)) {
      const section = names.chapterSection(row.hs2) ?? 22;
      if (!groups.has(section)) groups.set(section, { name: names.section(section), color: sectionColor(section), children: [] });
      groups.get(section)!.children.push({ name: names.chapter(row.hs2), value: row[flow], id: row.hs2 });
    }
    return [...groups.values()];
  }, [chapterRows, flow, names]);

  // The selection over time: partner x chapter cell, or one of the margins.
  const selection = useMemo(() => {
    if (!partner && !hs2) return [];
    const byYear = new Map<number, CrossRow>();
    for (const row of cross) {
      const matchesPartner = partner ? row.partner === partner : row.partner === null;
      const matchesChapter = hs2 ? row.hs2 === hs2 : row.hs2 === null;
      if (matchesPartner && matchesChapter) byYear.set(row.year, row);
    }
    return years.map((y) => ({ year: y.year, exports: byYear.get(y.year)?.exports ?? null, imports: byYear.get(y.year)?.imports ?? null }));
  }, [cross, partner, hs2, years]);

  const togglePartner = (value: string) => setPartner(value === partner ? "" : value);
  const toggleChapter = (value: string) => setHs2(value === hs2 ? "" : value);
  const partnerLabels = new Map(topPartners.map((row) => [names.country(row.partner), row.partner]));

  const strongest = products
    .filter((row) => (row.rca ?? 0) >= 1 && row.exports > 0)
    .slice(0, 25)
    .map((row) => ({ ...row, change: row.exports_5y_ago ? row.exports / row.exports_5y_ago - 1 : null }));

  const world = monthly.filter((row) => row.partner === "WLD");
  const lastMonth = world.at(-1);
  const recentPartners = useMemo(() => {
    const cutoff = world.length > 12 ? world[world.length - 12].month : "";
    const sums = new Map<string, { partner: string; exports: number; imports: number }>();
    for (const row of monthly) {
      if (row.partner === "WLD" || row.month < cutoff) continue;
      const entry = sums.get(row.partner) ?? { partner: row.partner, exports: 0, imports: 0 };
      entry.exports += row.exports ?? 0;
      entry.imports += row.imports ?? 0;
      sums.set(row.partner, entry);
    }
    return [...sums.values()].sort((a, b) => b.exports + b.imports - (a.exports + a.imports));
  }, [monthly, world]);

  const flowControl = (
    <Segmented label={t("filters.flow")} value={flow} onChange={setFlow} options={FLOWS.map((value) => ({ value, label: flowLabel(value) }))} />
  );
  const chips = (
    <FilterChips
      items={[
        ...(partner ? [{ label: `${t("filters.partner")}: ${partnerName}`, onClear: () => setPartner("") }] : []),
        ...(hs2 ? [{ label: `${t("filters.chapter")}: ${chapterName}`, onClear: () => setHs2("") }] : []),
      ]}
    />
  );

  const partnersTitle = hs2
    ? t(flow === "exports" ? "country.partners.exportsChapter" : "country.partners.importsChapter", { n: TOP, chapter: chapterName, year })
    : t(flow === "exports" ? "country.partners.exports" : "country.partners.imports", { n: TOP, year });
  const mixTitle = partner
    ? t(flow === "exports" ? "country.mix.exportsTo" : "country.mix.importsFrom", { partner: partnerName, year })
    : t(flow === "exports" ? "country.mix.exports" : "country.mix.imports", { year });
  const mapTitle = hs2
    ? t(flow === "exports" ? "country.map.exportsChapter" : "country.map.importsChapter", { name, chapter: chapterName, year })
    : t(flow === "exports" ? "country.map.exports" : "country.map.imports", { name, year });

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">
          {regionName(lang, info.region)}
          {info.income && ` · ${incomeName(lang, info.income)}`}
        </p>
        <h1>{name}</h1>
        {info.historical && <p className="notice">{t("country.historical", { first: info.first, last: info.last })}</p>}
        {current && (
          <p className="lede">
            {t("country.lede", {
              name,
              year,
              exports: fmt.money(current.exports),
              imports: fmt.money(current.imports),
              partner: names.country(current.top_export_partner),
              product: names.productShort(current.top_export_hs4),
              // A shortened name already ends in "…"; don't follow it with the sentence's full stop.
            }).replace(/…\.$/, "…")}
          </p>
        )}
      </header>

      <FilterBar>
        <SelectFilter label={t("filters.year")} value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions(first, last)} />
        {flowControl}
        {chips}
      </FilterBar>

      {current && (
        <div className="grid kpi-grid">
          <KpiTile
            label={t("metric.exports")}
            value={fmt.money(current.exports)}
            meta={String(year)}
            delta={current.exports_growth !== null ? { text: fmt.change(current.exports_growth), direction: current.exports_growth >= 0 ? "up" : "down" } : undefined}
            trend={years.map((row) => row.exports)}
          />
          <KpiTile
            label={t("metric.imports")}
            value={fmt.money(current.imports)}
            meta={String(year)}
            delta={current.imports_growth !== null ? { text: fmt.change(current.imports_growth), direction: current.imports_growth >= 0 ? "up" : "down" } : undefined}
            trend={years.map((row) => row.imports)}
          />
          <KpiTile label={t("metric.balance")} value={fmt.money(current.balance)} meta={current.balance >= 0 ? t("country.surplus") : t("country.deficit")} />
          <KpiTile
            label={t("country.kpi.share")}
            value={fmt.share(current.world_export_share)}
            meta={t("country.kpi.rca", { n: current.rca_product_count ?? 0 })}
          />
        </div>
      )}

      <div className="grid cols-2">
        <ChartCard
          wide
          title={t("country.trend.title", { name })}
          subtitle={t("country.trend.subtitle")}
          info={t("info.fob")}
          build={lineChart({
            x: years.map((row) => String(row.year)),
            series: [
              { name: t("metric.exports"), values: years.map((row) => row.exports) },
              { name: t("metric.imports"), values: years.map((row) => row.imports), color: 1 },
            ],
            format: fmt.money,
          })}
          rows={years}
          columns={[
            { key: "year", label: t("col.year") },
            { key: "exports", label: t("col.exports"), numeric: true, format: fmt.money },
            { key: "imports", label: t("col.imports"), numeric: true, format: fmt.money },
            { key: "balance", label: t("col.balance"), numeric: true, format: fmt.money },
            { key: "world_export_share", label: t("col.worldShare"), numeric: true, format: fmt.share },
          ]}
          sources={["baci"]}
          filename={`${code}-trade`}
        />

        <ChartCard
          wide
          title={mapTitle}
          subtitle={t("country.map.subtitle")}
          rows={[...partnerRows].sort((a, b) => b[flow] - a[flow]).map((row) => ({
            ...row,
            country: names.country(row.partner),
            share: partnerTotal ? row[flow] / partnerTotal : null,
          }))}
          columns={[
            { key: "country", label: t("col.partner") },
            { key: "exports", label: t("col.exportsTo"), numeric: true, format: fmt.money },
            { key: "imports", label: t("col.importsFrom"), numeric: true, format: fmt.money },
            { key: "share", label: t("col.share"), numeric: true, format: fmt.share },
          ]}
          sources={["baci"]}
          filename={`${code}-partners-${year}${hs2 ? `-hs${hs2}` : ""}`}
        >
          <MapChart
            values={mapValues}
            nameOf={(id) => names.country(featureToCountry.get(id) ?? id)}
            label={mapTitle}
            format={fmt.money}
            highlight={info.map}
            onSelect={(id) => {
              const selected = featureToCountry.get(id);
              if (selected && selected !== code) togglePartner(selected);
            }}
          />
        </ChartCard>

        <ChartCard
          title={partnersTitle}
          subtitle={t("country.crossHint.partners")}
          info={t("info.crossFilter")}
          build={rankedBarChart({
            items: topPartners.map((row) => ({ label: names.country(row.partner), value: row[flow], id: row.partner })),
            format: fmt.money,
            color: flow === "exports" ? 0 : 1,
            selected: partner || null,
          })}
          onChartReady={onItemClick(togglePartner, partnerLabels)}
          chartHeight={420}
          rows={topPartners.map((row) => ({ ...row, country: names.country(row.partner), share: partnerTotal ? row[flow] / partnerTotal : null }))}
          columns={[
            {
              key: "country",
              label: t("col.partner"),
              format: (value, row) => <Link to={path(`/country/${code}/partner/${row.partner}`)}>{String(value)}</Link>,
            },
            { key: flow, label: flowLabel(flow), numeric: true, format: fmt.money },
            { key: "share", label: t("col.share"), numeric: true, format: fmt.share },
          ]}
          sources={["baci"]}
          filename={`${code}-top-partners-${flow}-${year}`}
        />

        <ChartCard
          title={mixTitle}
          subtitle={t("country.crossHint.chapters")}
          info={t("info.treemap")}
          build={treemapChart(treemap, fmt.money, chapterTotal, hs2 || null)}
          onChartReady={onItemClick(toggleChapter)}
          chartHeight={420}
          rows={[...chapterRows]
            .filter((row) => row[flow] > 0)
            .sort((a, b) => b[flow] - a[flow])
            .map((row) => ({ hs2: row.hs2, chapter: names.chapter(row.hs2), value: row[flow], share: chapterTotal ? row[flow] / chapterTotal : null }))}
          columns={[
            { key: "hs2", label: "HS" },
            { key: "chapter", label: t("col.chapter") },
            { key: "value", label: flowLabel(flow), numeric: true, format: fmt.money },
            { key: "share", label: t("col.share"), numeric: true, format: fmt.share },
          ]}
          sources={["baci"]}
          filename={`${code}-products-${flow}-${year}${partner ? `-${partner}` : ""}`}
        />

        {selection.length > 0 && (
          <ChartCard
            wide
            title={t("country.selection.title", {
              selection: [partner && `${name} ↔ ${partnerName}`, hs2 && chapterName].filter(Boolean).join(" · "),
            })}
            subtitle={t("country.selection.subtitle")}
            note={
              partner ? (
                <p className="pair-links">
                  <Link to={path(`/country/${code}/partner/${partner}`)}>{t("country.selection.pair", { a: name, b: partnerName })} →</Link>
                </p>
              ) : undefined
            }
            build={lineChart({
              x: selection.map((row) => String(row.year)),
              series: [
                { name: partner ? t("pair.series.exports", { a: name, b: partnerName }) : t("metric.exports"), values: selection.map((row) => row.exports) },
                { name: partner ? t("pair.series.imports", { a: name, b: partnerName }) : t("metric.imports"), values: selection.map((row) => row.imports), color: 1 },
              ],
              format: fmt.money,
            })}
            rows={selection}
            columns={[
              { key: "year", label: t("col.year") },
              { key: "exports", label: t("col.exports"), numeric: true, format: fmt.money },
              { key: "imports", label: t("col.imports"), numeric: true, format: fmt.money },
            ]}
            sources={["baci"]}
            filename={`${code}-selection${partner ? `-${partner}` : ""}${hs2 ? `-hs${hs2}` : ""}`}
          />
        )}

        <ChartCard
          wide
          tableFirst
          title={t("country.strongest.title", { year: last })}
          subtitle={t("country.strongest.subtitle")}
          info={t("info.rca")}
          rows={strongest}
          columns={[
            { key: "hs4", label: t("col.product"), format: (v) => <ProductLink hs4={String(v)} names={names} /> },
            { key: "exports", label: t("col.exports"), numeric: true, format: fmt.money },
            { key: "change", label: t("col.change5y"), numeric: true, format: (v) => <Delta value={v} format={fmt.change} /> },
            { key: "world_market_share", label: t("col.worldShare"), numeric: true, format: fmt.share },
            { key: "rca", label: "RCA", numeric: true, format: fmt.decimal },
          ]}
          sources={["baci"]}
          filename={`${code}-strongest-products-${last}`}
        />

        <ChartCard
          title={t("country.concentration.title")}
          subtitle={t("country.concentration.subtitle")}
          info={t("info.hhi")}
          build={lineChart({
            x: years.map((row) => String(row.year)),
            series: [
              { name: t("country.concentration.partners"), values: years.map((row) => row.export_partner_hhi) },
              { name: t("country.concentration.products"), values: years.map((row) => row.export_product_hhi), color: 2 },
            ],
            format: fmt.decimal,
          })}
          rows={years}
          columns={[
            { key: "year", label: t("col.year") },
            { key: "export_partner_hhi", label: t("country.concentration.partners"), numeric: true, format: fmt.decimal },
            { key: "export_product_hhi", label: t("country.concentration.products"), numeric: true, format: fmt.decimal },
            { key: "rca_product_count", label: t("col.rcaCount"), numeric: true, format: fmt.number },
          ]}
          sources={["baci"]}
          filename={`${code}-concentration`}
        />

        {world.length > 0 && (
          <ChartCard
            title={t("country.monthly.title")}
            subtitle={lastMonth ? t("country.monthly.subtitle", { month: formatMonth(lang, lastMonth.month) }) : undefined}
            info={t("info.imf")}
            build={lineChart({
              x: world.map((row) => row.month),
              xFormat: (value) => formatMonth(lang, value),
              series: [
                { name: t("metric.exports"), values: world.map((row) => row.exports) },
                { name: t("metric.importsCif"), values: world.map((row) => row.imports), color: 1 },
              ],
              format: fmt.money,
            })}
            rows={world}
            columns={[
              { key: "month", label: t("col.month"), format: (v) => formatMonth(lang, String(v)) },
              { key: "exports", label: t("col.exports"), numeric: true, format: fmt.money },
              { key: "imports", label: t("col.importsCif"), numeric: true, format: fmt.money },
              { key: "exports_yoy", label: t("col.exportsYoy"), numeric: true, format: (v) => <Delta value={v} format={fmt.change} /> },
            ]}
            sources={["imf"]}
            filename={`${code}-monthly`}
          />
        )}

        {recentPartners.length > 0 && (
          <ChartCard
            tableFirst
            title={t("country.monthlyPartners.title")}
            subtitle={t("country.monthlyPartners.subtitle")}
            rows={recentPartners.map((row) => ({ ...row, country: names.country(row.partner) }))}
            columns={[
              {
                key: "country",
                label: t("col.partner"),
                format: (value, row) => <Link to={path(`/country/${code}/partner/${row.partner}`)}>{String(value)}</Link>,
              },
              { key: "exports", label: t("col.exportsTo"), numeric: true, format: fmt.money },
              { key: "imports", label: t("col.importsFromCif"), numeric: true, format: fmt.money },
            ]}
            sources={["imf"]}
            filename={`${code}-monthly-partners`}
          />
        )}
      </div>
    </>
  );
}
