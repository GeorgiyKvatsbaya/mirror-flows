import { Link, useParams } from "react-router-dom";
import { ChartCard } from "../components/ChartCard";
import { KpiTile } from "../components/KpiTile";
import { useI18n } from "../i18n";
import { lineChart, rankedBarChart } from "../lib/charts";
import { toRows, useCountry, usePairs, type CountryFile, type PairsFile } from "../lib/data";
import { formatMonth } from "../lib/format";
import { useNames, type Names } from "../lib/names";
import type { MonthRow, PartnerRow } from "./Country";
import { NotFound } from "./NotFound";
import { PageState, useFormats } from "./shared";

type PairRow = { partner: string; flow: "x" | "m"; hs2: string | null; value: number };

export default function Pair() {
  const { code = "", partner = "" } = useParams();
  const names = useNames();
  const country = useCountry(code);
  const pairs = usePairs(code);
  if (names && (!names.countryInfo(code) || !names.countryInfo(partner) || code === partner)) return <NotFound />;
  const error = country.error ?? pairs.error;
  if (error) return <PageState error={error} />;
  if (!names || !country.data || !pairs.data) return <PageState />;
  return <PairView key={`${code}-${partner}`} code={code} partner={partner} names={names} country={country.data} pairs={pairs.data} />;
}

function PairView({ code, partner, names, country, pairs }: { code: string; partner: string; names: Names; country: CountryFile; pairs: PairsFile }) {
  const { lang, t, path } = useI18n();
  const fmt = useFormats();
  const a = names.country(code);
  const b = names.country(partner);
  const { first_year: first, last_year: last } = names.meta.baci;
  const yearsRange = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const flows = toRows<PartnerRow>(country.partners).filter((row) => row.partner === partner);
  const byYear = new Map(flows.map((row) => [row.year, row]));
  const latest = byYear.get(last);
  const allLatest = toRows<PartnerRow>(country.partners).filter((row) => row.year === last && row.partner !== code);
  const exportRank = latest ? [...allLatest].sort((x, y) => y.exports - x.exports).findIndex((row) => row.partner === partner) + 1 : 0;
  const importRank = latest ? [...allLatest].sort((x, y) => y.imports - x.imports).findIndex((row) => row.partner === partner) + 1 : 0;
  const detail = toRows<PairRow>(pairs.pairs).filter((row) => row.partner === partner);
  const chapters = (flow: "x" | "m") =>
    detail.filter((row) => row.flow === flow).map((row) => ({ label: names.chapter(row.hs2), value: row.value, hs2: row.hs2 ?? "" }));
  const monthly = toRows<MonthRow>(country.monthly).filter((row) => row.partner === partner);

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">
          <Link to={path(`/country/${code}`)}>{a}</Link> · {t("pair.eyebrow")}
        </p>
        <h1>
          {a} ↔ {b}
        </h1>
        <p className="lede">{t("pair.lede", { a, b, year: last })}</p>
        <p className="pair-links">
          <Link to={path(`/country/${partner}/partner/${code}`)}>{t("pair.swap", { b })}</Link>
          {" · "}
          <Link to={path(`/country/${partner}`)}>{t("pair.profile", { b })}</Link>
        </p>
      </header>

      <div className="grid kpi-grid">
        <KpiTile label={t("pair.kpi.exports", { a, b })} value={fmt.money(latest?.exports ?? 0)} meta={exportRank ? t("pair.kpi.rank", { rank: exportRank, year: last }) : String(last)} />
        <KpiTile label={t("pair.kpi.imports", { a, b })} value={fmt.money(latest?.imports ?? 0)} meta={importRank ? t("pair.kpi.rank", { rank: importRank, year: last }) : String(last)} />
        <KpiTile
          label={t("pair.kpi.balance", { a })}
          value={fmt.money((latest?.exports ?? 0) - (latest?.imports ?? 0))}
          meta={String(last)}
        />
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
          rows={flows}
          columns={[
            { key: "year", label: t("col.year") },
            { key: "exports", label: t("pair.series.exports", { a, b }), numeric: true, format: fmt.money },
            { key: "imports", label: t("pair.series.imports", { a, b }), numeric: true, format: fmt.money },
          ]}
          sources={["baci"]}
          filename={`${code}-${partner}-trade`}
        />

        {(["x", "m"] as const).map((flow) => {
          const items = chapters(flow);
          const title = t(flow === "x" ? "pair.chapters.exports" : "pair.chapters.imports", { a, b, year: last });
          return (
            <ChartCard
              key={flow}
              title={title}
              subtitle={t("pair.chapters.subtitle")}
              build={items.length ? rankedBarChart({ items, format: fmt.money, color: flow === "x" ? 0 : 1 }) : undefined}
              chartHeight={Math.max(160, items.length * 34)}
              rows={items.map((item) => ({ hs2: item.hs2, chapter: item.label, value: item.value }))}
              columns={[
                { key: "hs2", label: "HS" },
                { key: "chapter", label: t("col.chapter") },
                { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
              ]}
              sources={["baci"]}
              filename={`${code}-${partner}-${flow === "x" ? "exports" : "imports"}-${last}`}
            />
          );
        })}

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
