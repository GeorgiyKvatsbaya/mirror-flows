import { LOCALES, type Lang } from "../i18n";

interface NumberOptions {
  digits?: number;
  signed?: boolean;
  compact?: boolean;
}

export function formatNumber(lang: Lang, value: unknown, options: NumberOptions = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const { digits = 1, signed = false, compact = false } = options;
  return new Intl.NumberFormat(LOCALES[lang], {
    maximumFractionDigits: digits,
    minimumFractionDigits: compact ? 0 : digits,
    notation: compact ? "compact" : "standard",
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(number);
}

/** US$ from a value in millions: "$3.6T", "$845B", "$12M" (ru: "3,6 трлн $"). */
export function formatMoney(lang: Lang, millions: unknown, digits = 1): string {
  if (millions === null || millions === undefined || millions === "") return "—";
  const value = Number(millions) * 1e6;
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(LOCALES[lang], {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: Math.abs(value) >= 1e6 ? digits : 0,
  }).format(value);
}

/** Share 0..1 as a percentage; small shares get more decimals (0.03%, not 0.0%). */
export function formatShare(lang: Lang, share: unknown, digits = 1, signed = false): string {
  if (share === null || share === undefined || share === "") return "—";
  const percent = Number(share) * 100;
  const precision = percent !== 0 && Math.abs(percent) < 1 ? Math.max(digits, 2) : digits;
  const text = formatNumber(lang, percent, { digits: precision, signed });
  return text === "—" ? text : `${text}%`;
}

/** "2026-06" -> "Jun 2026" / "июнь 2026 г." (short form). */
export function formatMonth(lang: Lang, month: string | null | undefined): string {
  if (!month) return "—";
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALES[lang], { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, (monthNumber || 1) - 1, 1)),
  );
}

export function formatDate(lang: Lang, iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: "medium" }).format(new Date(iso));
}
