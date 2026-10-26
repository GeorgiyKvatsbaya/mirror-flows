import { useI18n } from "../i18n";
import { useMeta } from "../lib/data";
import { formatMonth } from "../lib/format";

export type SourceKey = "baci" | "imf";

export const SOURCE_LINKS: Record<SourceKey, { name: string; url: string }> = {
  baci: { name: "CEPII BACI", url: "https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37" },
  imf: { name: "IMF IMTS", url: "https://data.imf.org/en/datasets/IMF.STA:IMTS" },
};

/** "Source: CEPII BACI (V202601) · IMF IMTS (to Jun 2026)". */
export function SourceNote({ sources }: { sources: SourceKey[] }) {
  const { lang, t } = useI18n();
  const { data: meta } = useMeta();
  return (
    <p className="source-note">
      {t("common.source")}:{" "}
      {sources.map((key, index) => (
        <span key={key}>
          {index > 0 && " · "}
          <a href={SOURCE_LINKS[key].url} target="_blank" rel="noreferrer">
            {SOURCE_LINKS[key].name}
          </a>
          {meta && key === "baci" && ` (${meta.baci.first_year}–${meta.baci.last_year})`}
          {meta && key === "imf" && ` (${t("common.until", { date: formatMonth(lang, meta.imf.last_month) })})`}
        </span>
      ))}
    </p>
  );
}
