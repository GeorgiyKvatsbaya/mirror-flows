import { describe, expect, it } from "vitest";
import { toRows } from "./data";
import { formatMoney, formatShare } from "./format";
import { shorten } from "./names";

describe("format", () => {
  it("formats millions of dollars compactly", () => {
    expect(formatMoney("en", 22830000)).toBe("$22.8tn");
    expect(formatMoney("en", 6546)).toBe("$6.5bn");
    expect(formatMoney("ru", 6546)).toMatch(/^6,5\smлрд\s\$$|^6,5\sмлрд\s\$$/);
  });

  it("gives small shares more decimals", () => {
    expect(formatShare("en", 0.157)).toBe("15.7%");
    expect(formatShare("en", 0.00028)).toBe("0.03%");
    expect(formatShare("en", 0.05, 1, true)).toBe("+5.0%");
  });
});

describe("data", () => {
  it("turns columnar tables into rows", () => {
    expect(toRows({ columns: ["a", "b"], rows: [[1, "x"]] })).toEqual([{ a: 1, b: "x" }]);
  });
});

describe("names", () => {
  it("shortens long HS titles at the first parenthesis or semicolon", () => {
    expect(shorten("Coffee, whether or not roasted or decaffeinated; coffee husks and skins")).toBe(
      "Coffee, whether or not roasted or decaffeinated",
    );
    expect(shorten("Motor cars and other motor vehicles principally designed for the transport of persons (other than buses)")).toBe(
      "Motor cars and other motor vehicles principally designed for…",
    );
  });
});
