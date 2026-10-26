import { useMemo } from "react";
import { useI18n, type Lang } from "../i18n";
import { toRows, useMeta, type Meta } from "./data";

export interface Country {
  code: string;
  iso2: string | null;
  map: string | null;
  name_en: string;
  name_ru: string | null;
  region: string;
  income: string | null;
  first: number;
  last: number;
  historical: boolean;
}

export interface Chapter {
  code: string;
  section: number;
  name_en: string;
  name_ru: string | null;
}

export interface Section {
  id: number;
  roman: string;
  name_en: string;
  name_ru: string;
}

export interface Names {
  meta: Meta;
  countries: Country[];
  country: (code: string | null | undefined) => string;
  countryInfo: (code: string | null | undefined) => Country | undefined;
  chapter: (hs2: string | null | undefined) => string;
  chapterSection: (hs2: string) => number | undefined;
  section: (id: number) => string;
  sections: Section[];
  /** Official HS4 title. */
  product: (hs4: string | null | undefined) => string;
  /** Title cut at the first parenthesis or semicolon, for tiles, legends and tables. */
  productShort: (hs4: string | null | undefined) => string;
  products: { code: string; name: string }[];
}

const REGION_RU: Record<string, string> = {
  "East Asia & Pacific": "Восточная Азия и Тихий океан",
  "Europe & Central Asia": "Европа и Центральная Азия",
  "Latin America & Caribbean": "Латинская Америка и Карибы",
  "Middle East, North Africa, Afghanistan & Pakistan": "Ближний Восток, Северная Африка, Афганистан и Пакистан",
  "Middle East & North Africa": "Ближний Восток и Северная Африка",
  "North America": "Северная Америка",
  "South Asia": "Южная Азия",
  "Sub-Saharan Africa": "Африка южнее Сахары",
  "Other territories": "Прочие территории",
};

const INCOME_RU: Record<string, string> = {
  "High income": "Высокий доход",
  "Upper middle income": "Доход выше среднего",
  "Lower middle income": "Доход ниже среднего",
  "Low income": "Низкий доход",
};

export function incomeName(lang: Lang, income: string): string {
  return lang === "ru" ? (INCOME_RU[income] ?? income) : income;
}

const SHORT_LIMIT = 60;

export function shorten(name: string): string {
  const cut = name.split(/\s*[(;]/)[0].replace(/[,.:\s]+$/, "");
  if (cut.length <= SHORT_LIMIT) return cut;
  // One extra character tells whether the cut fell inside a word (drop it) or on a space.
  const words = cut.slice(0, SHORT_LIMIT + 1).split(" ");
  return `${words.slice(0, -1).join(" ")}…`;
}

export function regionName(lang: Lang, region: string): string {
  return lang === "ru" ? (REGION_RU[region] ?? region) : region;
}

function displayNames(lang: Lang): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([lang], { type: "region", fallback: "none" });
  } catch {
    return null;
  }
}

/** Country, chapter and product names in the current language. Country names come from the
 *  browser's CLDR data via ISO2 (so Russian needs no translation file); entities without ISO2
 *  use the names from the data. */
export function useNames(): Names | null {
  const { lang } = useI18n();
  const { data: meta } = useMeta();
  return useMemo(() => {
    if (!meta) return null;
    const regions = displayNames(lang);
    const countries = toRows<Country & Record<string, unknown>>(meta.countries);
    const byCode = new Map(countries.map((country) => [country.code, country]));
    const chapters = new Map(toRows<Chapter & Record<string, unknown>>(meta.chapters).map((c) => [c.code, c]));
    const sections = toRows<Section & Record<string, unknown>>(meta.sections);
    const products = toRows<{ code: string; name: string }>(meta.products);
    const productNames = new Map(products.map((p) => [p.code, p.name.replace(/[.\s]+$/, "")]));
    const productName = (hs4: string | null | undefined) => (hs4 ? (productNames.get(hs4) ?? hs4) : "—");
    const countryName = (code: string | null | undefined) => {
      if (!code) return "—";
      if (code === "WLD") return lang === "ru" ? "Весь мир" : "World";
      const info = byCode.get(code);
      if (!info) return code;
      if (lang === "ru" && info.name_ru) return info.name_ru;
      if (info.iso2 && !info.name_ru) {
        const name = regions?.of(info.iso2);
        if (name && name !== info.iso2) return name;
      }
      return info.name_en;
    };
    return {
      meta,
      countries,
      country: countryName,
      countryInfo: (code) => (code ? byCode.get(code) : undefined),
      chapter: (hs2) => {
        if (!hs2) return lang === "ru" ? "Прочее" : "Other";
        const chapter = chapters.get(hs2);
        return chapter ? (lang === "ru" && chapter.name_ru ? chapter.name_ru : chapter.name_en) : hs2;
      },
      chapterSection: (hs2) => chapters.get(hs2)?.section,
      section: (id) => {
        const section = sections.find((s) => s.id === id);
        return section ? (lang === "ru" ? section.name_ru : section.name_en) : String(id);
      },
      sections,
      product: productName,
      productShort: (hs4) => shorten(productName(hs4)),
      products,
    } satisfies Names;
  }, [meta, lang]);
}
