import { parquetReadObjects } from "hyparquet";
import { useEffect, useState } from "react";
import { DATA_BASE } from "./data";

/** Parquet files exported by `wta export` (cross-filters): small per country / chapter / product,
 *  so each is fetched whole and decoded in the browser with hyparquet. */
const cache = new Map<string, Promise<Record<string, unknown>[]>>();

export function fetchParquet<T>(path: string): Promise<T[]> {
  if (!cache.has(path)) {
    const request = fetch(`${DATA_BASE}/${path}`)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${path}`);
        return response.arrayBuffer();
      })
      .then((file) => parquetReadObjects({ file }));
    request.catch(() => cache.delete(path));
    cache.set(path, request);
  }
  return cache.get(path) as Promise<T[]>;
}

interface Loadable<T> {
  rows: T[] | null;
  error: Error | null;
}

/** Rows of a Parquet file; `null` path = nothing to load (yet). A missing file (404) is an error. */
export function useParquet<T>(path: string | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T> & { path: string | null }>({ rows: null, error: null, path: null });
  useEffect(() => {
    if (!path) return;
    let active = true;
    fetchParquet<T>(path).then(
      (rows) => active && setState({ rows, error: null, path }),
      (error: Error) => active && setState({ rows: null, error, path }),
    );
    return () => {
      active = false;
    };
  }, [path]);
  return state.path === path ? state : { rows: null, error: null };
}
