import { useEffect, useState } from "react";

/** Columnar table as written by `wta export`. */
export interface Table {
  columns: string[];
  rows: unknown[][];
}

export type Row = Record<string, unknown>;

export interface Meta {
  built_at: string;
  baci: { version: string; first_year: number; last_year: number };
  imf: { first_month: string; last_month: string };
  countries: Table;
  sections: Table;
  chapters: Table;
  products: Table;
}

export interface WorldFile {
  countries: Table;
  chapters: Table;
  products: Table;
  sources: Table;
}

/** countries/{code}.json. Partners and chapters live in cross/{code}.parquet. */
export interface CountryFile {
  years: Table;
  products: Table;
  monthly: Table;
}

export interface ProductFile {
  years: Table;
  exporters: Table;
  latest: Table;
}

export const DATA_BASE = "/data";

const cache = new Map<string, Promise<unknown>>();

export function fetchJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const request = fetch(`${DATA_BASE}/${path}`).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${path}`);
      return response.json();
    });
    // Drop failed requests so a later render can retry.
    request.catch(() => cache.delete(path));
    cache.set(path, request);
  }
  return cache.get(path) as Promise<T>;
}

/** Columnar table -> row objects. */
export function toRows<T extends Row = Row>(table: Table | undefined): T[] {
  if (!table) return [];
  return table.rows.map(
    (values) => Object.fromEntries(table.columns.map((column, index) => [column, values[index]])) as T,
  );
}

interface Loadable<T> {
  data: T | null;
  error: Error | null;
}

export function useJson<T>(path: string | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T> & { path: string | null }>({ data: null, error: null, path: null });
  useEffect(() => {
    if (!path) return;
    let active = true;
    fetchJson<T>(path).then(
      (data) => active && setState({ data, error: null, path }),
      (error: Error) => active && setState({ data: null, error, path }),
    );
    return () => {
      active = false;
    };
  }, [path]);
  // Never hand out the previous path's data while the next one loads.
  return state.path === path ? state : { data: null, error: null };
}

export const useMeta = () => useJson<Meta>("meta.json");
export const useWorld = () => useJson<WorldFile>("world.json");
export const useCountry = (code: string | undefined) => useJson<CountryFile>(code ? `countries/${code}.json` : null);
export const useProduct = (hs4: string | undefined) => useJson<ProductFile>(hs4 ? `products/${hs4}.json` : null);

/** Several country files at once (Compare page); `null` until all have loaded. */
export function useCountries(codes: string[]): Loadable<Record<string, CountryFile>> {
  const key = codes.join(",");
  const [state, setState] = useState<Loadable<Record<string, CountryFile>> & { key: string }>({ data: null, error: null, key: "" });
  useEffect(() => {
    let active = true;
    const list = key ? key.split(",") : [];
    Promise.all(list.map((code) => fetchJson<CountryFile>(`countries/${code}.json`))).then(
      (files) => active && setState({ data: Object.fromEntries(list.map((code, i) => [code, files[i]])), error: null, key }),
      (error: Error) => active && setState({ data: null, error, key }),
    );
    return () => {
      active = false;
    };
  }, [key]);
  return state.key === key ? state : { data: null, error: null };
}

/** Values in the data files are US$ millions. */
export const MILLION = 1e6;
