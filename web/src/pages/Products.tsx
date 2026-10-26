import { useMemo, useState } from "react";
import { ChartCard } from "../components/ChartCard";
import { SelectFilter, useParamState } from "../components/Filters";
import { useI18n } from "../i18n";
import { toRows, useWorld } from "../lib/data";
import { useNames } from "../lib/names";
import { CountryLink, Delta, PageState, ProductLink, useFormats } from "./shared";

type ProductRow = { hs4: string; value: number; growth: number | null; top_exporter: string; top_exporter_share: number; top_importer: string };

const PAGE = 100;
const SORTS = ["value", "growth", "decline"] as const;
type Sort = (typeof SORTS)[number];

/** All ~1,240 HS4 headings: search by name or code, filter by chapter, sort by size or change. */
export default function Products() {
  const { t } = useI18n();
  const names = useNames();
  const { data, error } = useWorld();
  const fmt = useFormats();
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useParamState("chapter", "all");
  const [sort, setSort] = useParamState<Sort>("sort", "value");

  const rows = useMemo(() => {
    if (!names || !data) return [];
    const needle = query.trim().toLowerCase();
    const filtered = toRows<ProductRow>(data.products).filter(
      (row) =>
        (chapter === "all" || row.hs4.startsWith(chapter)) &&
        (!needle || row.hs4.startsWith(needle) || names.product(row.hs4).toLowerCase().includes(needle)),
    );
    // Growth rankings ignore tiny products, where percentages swing wildly.
    const meaningful = sort === "value" ? filtered : filtered.filter((row) => row.value >= 1000 && row.growth !== null);
    return meaningful.sort((a, b) =>
      sort === "value" ? b.value - a.value : sort === "growth" ? (b.growth ?? 0) - (a.growth ?? 0) : (a.growth ?? 0) - (b.growth ?? 0),
    );
  }, [names, data, query, chapter, sort]);

  if (error) return <PageState error={error} />;
  if (!names || !data) return <PageState />;
  const year = names.meta.baci.last_year;
  const chapters = [...new Set(names.products.map((p) => p.code.slice(0, 2)))].sort();

  return (
    <>
      <header className="page-head">
        <h1>{t("products.title")}</h1>
        <p className="lede">{t("products.lede", { n: names.products.length, year })}</p>
      </header>
      <div className="filter-row">
        <label className="filter search">
          <span className="filter-label">{t("filters.search")}</span>
          <input className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("products.placeholder")} />
        </label>
        <SelectFilter
          label={t("filters.chapter")}
          value={chapter}
          onChange={setChapter}
          options={[{ value: "all", label: t("filters.allChapters") }, ...chapters.map((code) => ({ value: code, label: `${code} ${names.chapter(code)}` }))]}
        />
        <SelectFilter
          label={t("filters.sort")}
          value={sort}
          onChange={(value) => setSort(value as Sort)}
          options={SORTS.map((value) => ({ value, label: t(`products.sort.${value}`) }))}
        />
      </div>
      <ChartCard
        tableFirst
        title={t("products.table", { year })}
        subtitle={rows.length > PAGE ? t("products.showing", { n: PAGE, total: rows.length }) : undefined}
        rows={rows.slice(0, PAGE) as unknown as Record<string, unknown>[]}
        columns={[
          { key: "hs4", label: t("col.product"), format: (v) => <ProductLink hs4={String(v)} names={names} /> },
          { key: "value", label: t("col.value"), numeric: true, format: fmt.money },
          { key: "growth", label: t("col.growthYear"), numeric: true, format: (v) => <Delta value={v} format={fmt.change} /> },
          { key: "top_exporter", label: t("col.topExporter"), format: (v) => <CountryLink code={String(v)} names={names} /> },
          { key: "top_exporter_share", label: t("col.share"), numeric: true, format: fmt.share },
        ]}
        sources={["baci"]}
        filename={`products-${year}`}
      />
    </>
  );
}
