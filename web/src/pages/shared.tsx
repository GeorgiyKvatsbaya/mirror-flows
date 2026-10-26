import { useCallback, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useParamState } from "../components/Filters";
import { useI18n } from "../i18n";
import type { Format } from "../lib/charts";
import { formatMoney, formatNumber, formatShare } from "../lib/format";
import type { Names } from "../lib/names";

/** Formatters bound to the current language. */
export function useFormats() {
  const { lang } = useI18n();
  const money: Format = useCallback((value) => formatMoney(lang, value), [lang]);
  const share: Format = useCallback((value) => formatShare(lang, value), [lang]);
  const change: Format = useCallback((value) => formatShare(lang, value, 1, true), [lang]);
  const number: Format = useCallback((value) => formatNumber(lang, value, { digits: 0 }), [lang]);
  const decimal: Format = useCallback((value) => formatNumber(lang, value, { digits: 2 }), [lang]);
  return { money, share, change, number, decimal };
}

/** Selected year in the URL (?year=2020), defaulting to the latest year. */
export function useYear(latest: number) {
  const [raw, setRaw] = useParamState("year", String(latest));
  const year = Number(raw) || latest;
  return [year, (value: number) => setRaw(String(value))] as const;
}

export function yearOptions(first: number, last: number) {
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const year = String(last - index);
    return { value: year, label: year };
  });
}

/** Names + a loading/error state for pages that need data. */
export function PageState({ error, children }: { error?: Error | null; children?: ReactNode }) {
  const { t } = useI18n();
  if (error) return <p className="notice">{t("common.error")}</p>;
  return children ?? <p className="loading">{t("common.loading")}</p>;
}

export function CountryLink({ code, names }: { code: string; names: Names }) {
  const { path } = useI18n();
  return <Link to={path(`/country/${code}`)}>{names.country(code)}</Link>;
}

export function ProductLink({ hs4, names }: { hs4: string; names: Names }) {
  const { path } = useI18n();
  return (
    <Link to={path(`/product/${hs4}`)} title={names.product(hs4)}>
      <span className="code">{hs4}</span> {names.productShort(hs4)}
    </Link>
  );
}

export function Delta({ value, format }: { value: unknown; format: Format }) {
  if (value === null || value === undefined) return <>—</>;
  const number = Number(value);
  return <span className={number > 0 ? "delta-up" : number < 0 ? "delta-down" : undefined}>{format(number)}</span>;
}
