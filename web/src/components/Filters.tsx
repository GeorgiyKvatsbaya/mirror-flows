import { useCallback, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useI18n } from "../i18n";

/**
 * Filter state kept in the URL (?year=2020&flow=imports), so a filtered view can be shared
 * and survives a language switch.
 */
export function useParamState<T extends string = string>(key: string, fallback: NoInfer<T>): [T, (value: T) => void] {
  const [params, setParams] = useSearchParams();
  const value = (params.get(key) as T | null) ?? fallback;
  const setValue = useCallback(
    (next: T) =>
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (next === fallback) updated.delete(key);
          else updated.set(key, next);
          return updated;
        },
        { replace: true },
      ),
    [key, fallback, setParams],
  );
  return [value, setValue];
}

export function FilterBar({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="filter-row" role="group" aria-label={t("filters.label")}>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="filter">
      <span className="filter-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? "active" : undefined}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="filter">
      <span className="filter-label">{label}</span>
      <select className="select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Active cross-filter selections as removable chips. */
export function FilterChips({ items }: { items: { label: string; onClear: () => void }[] }) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <div className="filter chips" aria-label={t("filters.selection")}>
      {items.map((item) => (
        <button key={item.label} type="button" className="chip" onClick={item.onClear} aria-label={t("filters.clear", { item: item.label })}>
          {item.label} <span aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  );
}
