import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { toRows, useWorld } from "../lib/data";
import { regionName, useNames } from "../lib/names";
import { PageState, useFormats } from "./shared";

type CountryYear = { year: number; code: string; exports: number; imports: number };

/** Searchable country index grouped by region, with latest exports. */
export default function Countries() {
  const { lang, t, path } = useI18n();
  const names = useNames();
  const { data, error } = useWorld();
  const fmt = useFormats();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    if (!names || !data) return [];
    const last = names.meta.baci.last_year;
    const latest = new Map(toRows<CountryYear>(data.countries).filter((row) => row.year === last).map((row) => [row.code, row]));
    const needle = query.trim().toLowerCase();
    const rows = names.countries
      .map((country) => ({ ...country, name: names.country(country.code), exports: latest.get(country.code)?.exports ?? 0 }))
      .filter((country) => !needle || country.name.toLowerCase().includes(needle) || country.code.toLowerCase().includes(needle))
      .sort((a, b) => b.exports - a.exports);
    const byRegion = new Map<string, typeof rows>();
    for (const row of rows) {
      const region = regionName(lang, row.region);
      if (!byRegion.has(region)) byRegion.set(region, []);
      byRegion.get(region)!.push(row);
    }
    return [...byRegion].sort(([, a], [, b]) => b.reduce((s, r) => s + r.exports, 0) - a.reduce((s, r) => s + r.exports, 0));
  }, [names, data, query, lang]);

  if (error) return <PageState error={error} />;
  if (!names || !data) return <PageState />;

  return (
    <>
      <header className="page-head">
        <h1>{t("countries.title")}</h1>
        <p className="lede">{t("countries.lede", { n: names.countries.length, year: names.meta.baci.last_year })}</p>
      </header>
      <div className="filter-row">
        <label className="filter search">
          <span className="filter-label">{t("filters.search")}</span>
          <input className="input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("countries.placeholder")} />
        </label>
      </div>
      {groups.length === 0 && <p className="notice">{t("common.noResults")}</p>}
      {groups.map(([region, rows]) => (
        <section key={region} className="section">
          <h2>{region}</h2>
          <ul className="index-list">
            {rows.map((row) => (
              <li key={row.code}>
                <Link to={path(`/country/${row.code}`)}>
                  <span>{row.name}</span>
                  <span className="muted num">{row.exports ? fmt.money(row.exports) : row.historical ? t("countries.historical") : "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
