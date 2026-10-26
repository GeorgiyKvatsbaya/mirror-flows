import { describe, expect, it } from "vitest";
import en from "./en.json";
import ru from "./ru.json";
import { translate } from "./index";

describe("dictionaries", () => {
  it("have the same keys in English and Russian", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it("use the same placeholders in both languages", () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("fills placeholders", () => {
    expect(translate("en", "world.topExporters", { n: 15, year: 2024 })).toBe("Top 15 exporters, 2024");
  });
});
