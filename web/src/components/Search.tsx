import { useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { useNames, type Names } from "../lib/names";

export interface SearchResult {
  kind: "country" | "product";
  code: string;
  label: string;
}

const LIMIT = 8;

/** Countries first, then products; prefix matches rank above substring matches. */
export function searchIndex(names: Names, query: string): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2 && !/^\d+$/.test(needle)) return [];
  const score = (text: string, code: string) => {
    const lower = text.toLowerCase();
    if (code.toLowerCase() === needle) return 0;
    if (lower.startsWith(needle) || code.toLowerCase().startsWith(needle)) return 1;
    if (lower.split(/[\s,(-]+/).some((word) => word.startsWith(needle))) return 2;
    if (lower.includes(needle)) return 3;
    return -1;
  };
  const countries = names.countries
    .map((country) => ({ kind: "country" as const, code: country.code, label: names.country(country.code) }))
    .map((item) => ({ item, score: score(item.label, item.code) }));
  const products = names.products
    .map((product) => ({ kind: "product" as const, code: product.code, label: names.productShort(product.code) }))
    .map((item) => ({ item, score: score(item.label, item.code) }));
  return [...countries, ...products]
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || (a.item.kind === b.item.kind ? 0 : a.item.kind === "country" ? -1 : 1))
    .slice(0, LIMIT)
    .map((entry) => entry.item);
}

/** Header search: a combobox over countries and HS4 products. */
export function Search() {
  const { t, path } = useI18n();
  const names = useNames();
  const navigate = useNavigate();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const results = useMemo(() => (names ? searchIndex(names, query) : []), [names, query]);

  const go = (result: SearchResult | undefined) => {
    if (!result) return;
    navigate(path(result.kind === "country" ? `/country/${result.code}` : `/product/${result.code}`));
    setQuery("");
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="search">
      <input
        ref={input}
        className="input"
        type="search"
        role="combobox"
        aria-label={t("search.label")}
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        placeholder={t("search.placeholder")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            go(results[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="search-results">
          {results.map((result, index) => (
            <li
              key={`${result.kind}-${result.code}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? "active" : undefined}
              onMouseDown={(event) => {
                event.preventDefault();
                go(result);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="search-kind">{t(result.kind === "country" ? "search.country" : "search.product")}</span>
              {result.kind === "product" && <span className="code">{result.code}</span>} {result.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
