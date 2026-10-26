import { describe, expect, it } from "vitest";
import { searchIndex } from "../components/Search";
import { COLUMN_GAP, layout, lineageOf, type ModelNode } from "./lineage";
import type { Names } from "./names";

const node = (id: string, column: number, parents: string[] = []): ModelNode => ({
  id,
  name: id,
  type: column === 0 ? "source" : "model",
  layer: "marts",
  column,
  materialized: null,
  incremental_strategy: null,
  contract: false,
  tags: [],
  description: "",
  columns: [],
  parents,
  tests: { tests: 0, passed: 0, failed: 0 },
  rows: null,
  sql: null,
  path: null,
  url: null,
  docs: "",
});

describe("lineage", () => {
  const nodes = [node("a", 0), node("b", 0), node("stg_b", 1, ["b"]), node("stg_a", 1, ["a"]), node("mart", 2, ["stg_a", "stg_b"]), node("other", 2, ["stg_b"])];

  it("places nodes in columns and orders children by their parents", () => {
    const placed = layout(nodes);
    const at = (id: string) => placed.find((n) => n.id === id)!;
    expect(at("mart").x).toBe(2 * COLUMN_GAP);
    // stg_a follows a (row 0), stg_b follows b (row 1).
    expect(at("stg_a").y).toBeLessThan(at("stg_b").y);
  });

  it("traces upstream and downstream", () => {
    expect([...lineageOf(nodes, "stg_b")].sort()).toEqual(["b", "mart", "other", "stg_b"]);
    expect([...lineageOf(nodes, "a")].sort()).toEqual(["a", "mart", "stg_a"]);
  });
});

describe("search", () => {
  const names = {
    countries: [{ code: "GEO" }, { code: "DEU" }, { code: "GHA" }],
    country: (code: string) => ({ GEO: "Georgia", DEU: "Germany", GHA: "Ghana" })[code] ?? code,
    products: [{ code: "0901", name: "Coffee" }, { code: "8703", name: "Motor cars" }],
    productShort: (code: string) => ({ "0901": "Coffee", "8703": "Motor cars" })[code] ?? code,
  } as unknown as Names;

  it("ranks prefix matches first and countries before products", () => {
    expect(searchIndex(names, "ge").map((r) => r.code)).toEqual(["GEO", "DEU"]);
    expect(searchIndex(names, "cars").map((r) => r.code)).toEqual(["8703"]);
    expect(searchIndex(names, "0901").map((r) => r.code)).toEqual(["0901"]);
    expect(searchIndex(names, "g")).toEqual([]);
  });
});
