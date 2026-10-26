import { ChartCard } from "../components/ChartCard";
import { REPO_URL } from "../components/Layout";
import { SOURCE_LINKS } from "../components/SourceNote";
import { useI18n } from "../i18n";
import { toRows, useWorld } from "../lib/data";
import { formatDate, formatMonth } from "../lib/format";
import { useNames } from "../lib/names";
import { CountryLink, Delta, PageState, useFormats } from "./shared";

type SourceRow = { year: number; code: string; baci: number; imf: number; difference: number };

export default function About() {
  const { lang, t } = useI18n();
  const names = useNames();
  const { data } = useWorld();
  const fmt = useFormats();
  if (!names) return <PageState />;
  const { meta } = names;
  const comparison = toRows<SourceRow>(data?.sources);
  const compareYear = Math.max(0, ...comparison.map((row) => row.year));
  const rows = comparison.filter((row) => row.year === compareYear).slice(0, 25);

  return (
    <>
      <header className="page-head">
        <h1>{t("about.title")}</h1>
        <p className="lede">{t("about.lede")}</p>
      </header>

      <div className="prose">
        <h2>{t("about.sources")}</h2>
        <ul>
          <li>
            <a href={SOURCE_LINKS.baci.url} target="_blank" rel="noreferrer">
              CEPII BACI
            </a>{" "}
            — {t("about.baci", { version: meta.baci.version, first: meta.baci.first_year, last: meta.baci.last_year })}
          </li>
          <li>
            <a href={SOURCE_LINKS.imf.url} target="_blank" rel="noreferrer">
              IMF International Trade in Goods (IMTS)
            </a>{" "}
            — {t("about.imf", { last: formatMonth(lang, meta.imf.last_month) })}
          </li>
          <li>{t("about.other")}</li>
        </ul>
        <p className="small muted">{t("about.citation")}</p>

        <h2>{t("about.glossary")}</h2>
        <dl className="glossary">
          <dt>{t("about.mirror.term")}</dt>
          <dd>{t("about.mirror.text")}</dd>
          <dt>{t("about.fob.term")}</dt>
          <dd>{t("about.fob.text")}</dd>
          <dt>{t("about.rca.term")}</dt>
          <dd>{t("about.rca.text")}</dd>
          <dt>{t("about.hhi.term")}</dt>
          <dd>{t("about.hhi.text")}</dd>
          <dt>{t("about.hs.term")}</dt>
          <dd>{t("about.hs.text")}</dd>
          <dt>{t("about.entities.term")}</dt>
          <dd>{t("about.entities.text")}</dd>
        </dl>
      </div>

      {rows.length > 0 && (
        <div className="grid">
          <ChartCard
            tableFirst
            title={t("about.compare.title", { year: compareYear })}
            subtitle={t("about.compare.subtitle")}
            info={t("about.compare.info")}
            rows={rows as unknown as Record<string, unknown>[]}
            columns={[
              { key: "code", label: t("col.country"), format: (v) => <CountryLink code={String(v)} names={names} /> },
              { key: "baci", label: "BACI", numeric: true, format: fmt.money },
              { key: "imf", label: "IMF", numeric: true, format: fmt.money },
              { key: "difference", label: t("col.difference"), numeric: true, format: (v) => <Delta value={v} format={fmt.change} /> },
            ]}
            sources={["baci", "imf"]}
            filename={`baci-vs-imf-${compareYear}`}
          />
        </div>
      )}

      <div className="prose">
        <h2>{t("about.how")}</h2>
        <p>{t("about.pipeline")}</p>
        <p>
          <a href="/dbt/" target="_blank" rel="noreferrer">
            {t("about.dbtLink")}
          </a>{" "}
          ·{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {t("footer.code")}
          </a>
        </p>
        <p className="small muted">{t("about.built", { date: formatDate(lang, meta.built_at) })}</p>
        <p className="small muted">{t("footer.unofficial")}</p>
      </div>
    </>
  );
}
