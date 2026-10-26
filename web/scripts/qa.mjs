// QA pass: accessibility (axe), layout overflow on desktop and phone, light and dark, and the
// main interactions. Usage: SMOKE_URL=https://world-trade-atlas-one.vercel.app node scripts/qa.mjs
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const BASE = process.env.SMOKE_URL ?? "http://localhost:4173";
const PAGES = ["", "/countries", "/country/DEU", "/country/GEO?partner=TUR", "/country/GEO/partner/TUR?hs2=87", "/products", "/product/2709?trader=SAU", "/compare", "/model?node=model.world_trade_atlas.mart_country_year", "/about"];
const findings = [];
const note = (area, text) => findings.push(`[${area}] ${text}`);

const browser = await chromium.launch();

// 1. Accessibility + horizontal overflow.
for (const [label, viewport, scheme] of [["desktop", { width: 1280, height: 900 }, "light"], ["phone", { width: 390, height: 844 }, "dark"]]) {
  for (const path of PAGES) {
    const context = await browser.newContext({ viewport, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto(`${BASE}/en${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) note("layout", `${label} ${path || "/"}: page scrolls horizontally by ${overflow}px`);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    for (const violation of results.violations) {
      const targets = violation.nodes.slice(0, 2).map((n) => n.target.join(" ")).join("; ");
      note("a11y", `${label} ${path || "/"}: ${violation.id} (${violation.impact}, ${violation.nodes.length}x) ${targets}`);
    }
    await context.close();
  }
}

// 2. Interactions.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message} ${(e.stack ?? "").split("\n").slice(1, 4).join(" ")}`));
const until = async (check, what, timeout = 6000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await page.waitForTimeout(100);
  }
  note("interaction", what);
  return false;
};

// Language switch keeps the page and query string.
await page.goto(`${BASE}/en/country/GEO?year=2015`, { waitUntil: "networkidle" });
await page.getByRole("link", { name: "РУ" }).click();
await until(async () => page.url().endsWith("/ru/country/GEO?year=2015"), "language switch lost the page or filters");
await until(async () => (await page.locator("h1").innerText()) === "Грузия", "country name not localized in Russian");

// Year filter changes the KPI.
await page.goto(`${BASE}/en/country/DEU`, { waitUntil: "networkidle" });
const kpi = async () => page.locator(".kpi-value").first().innerText();
const latest = await kpi();
await page.getByRole("combobox", { name: "Year", exact: true }).selectOption("2000");
await until(async () => (await kpi()) !== latest, "year filter did not change the exports KPI");

// Flow toggle, table view and CSV.
await page.getByRole("button", { name: "Imports", exact: true }).first().click();
await until(async () => page.url().includes("flow=imports"), "flow toggle not stored in the URL");
await page.getByRole("button", { name: "Show table" }).first().click();
const tableRows = await page.locator(".data-table tbody tr").count();
if (tableRows < 10) note("table", `table view shows only ${tableRows} rows`);
const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).first().click()]);
const csv = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
if (!csv.startsWith("﻿year,exports")) note("csv", `unexpected CSV header: ${csv.slice(0, 40)}`);

// Product search.
await page.goto(`${BASE}/en/products`, { waitUntil: "networkidle" });
await page.getByRole("searchbox").fill("coffee");
await until(async () => (await page.locator(".data-table tbody tr").count()) >= 1 && (await page.locator(".data-table tbody tr").count()) < 10, "product search did not filter");

// Map click opens a country.
await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
await page.waitForSelector(".map canvas");
const box = await page.locator(".map").boundingBox();
// The United States on the world map.
await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.35);
await until(async () => page.url().includes("/en/country/"), "clicking the map did not open a country", 4000);

// Cross-filters: click the first bar / the biggest tile and expect the URL and titles to follow.
const chartOf = (title) => page.locator(".chart-card", { has: page.getByRole("heading", { name: title }) }).locator(".chart");
const clickAt = async (locator, fx, fy) => {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
};
await page.goto(`${BASE}/en/country/GEO`, { waitUntil: "networkidle" });
await page.waitForSelector(".chart canvas");
await clickAt(chartOf(/^Top 15 export markets/), 0.45, 0.03);
await until(async () => /partner=[A-Z]{3}/.test(page.url()), "clicking a market did not set ?partner=");
await until(async () => (await page.getByRole("heading", { name: /^What it exports to / }).count()) === 1, "treemap did not switch to the selected partner");
await page.getByRole("button", { name: /^Clear Partner/ }).click();
await until(async () => !page.url().includes("partner="), "clearing the partner chip did not reset the filter");
await clickAt(chartOf(/^What it exports, /), 0.2, 0.3);
await until(async () => /hs2=\d\d/.test(page.url()), "clicking a treemap tile did not set ?hs2=");
await until(async () => (await page.getByRole("heading", { name: /^Top 15 markets for / }).count()) === 1, "market ranking did not switch to the chapter");
await until(async () => (await page.getByRole("heading", { name: /^Over time: / }).count()) === 1, "selection card missing");

await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
await page.waitForSelector(".chart canvas");
await clickAt(chartOf(/^What the world trades/), 0.3, 0.3);
await until(async () => /hs2=\d\d/.test(page.url()), "world treemap click did not set ?hs2=");
await until(async () => (await page.getByRole("heading", { name: /^Top 15 exporters of / }).count()) === 1, "world rankings did not follow the chapter");

await page.goto(`${BASE}/en/product/8703`, { waitUntil: "networkidle" });
await page.waitForSelector(".chart canvas");
await clickAt(chartOf(/^Top 15 exporters/), 0.45, 0.03);
await until(async () => /trader=[A-Z]{3}/.test(page.url()), "clicking an exporter did not set ?trader=");
await until(async () => (await page.getByRole("heading", { name: /sends it, / }).count()) === 1, "destinations card missing", 10000);

await page.goto(`${BASE}/en/country/GEO/partner/TUR`, { waitUntil: "networkidle" });
await page.waitForSelector(".chart canvas");
await clickAt(chartOf(/^Georgia → Türkiye, \d{4}$/), 0.45, 0.06);
await until(async () => /hs2=\d\d/.test(page.url()), "pair chapter click did not set ?hs2=");
await until(async () => (await page.getByRole("heading", { name: /^Georgia → Türkiye: / }).count()) >= 1, "pair HS4 drill-down missing", 10000);

// Search.
await page.getByRole("combobox", { name: "Search countries and products" }).fill("georg");
await page.keyboard.press("Enter");
await until(async () => page.url().endsWith("/en/country/GEO"), "search did not open Georgia");

// Data model: pick a node from the table.
await page.goto(`${BASE}/en/model`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "fct_trade_hs6", exact: true }).click();
await until(async () => page.url().includes("node=model.world_trade_atlas.fct_trade_hs6"), "data model node selection not in URL");
await until(async () => (await page.getByRole("heading", { name: "fct_trade_hs6", level: 2 }).count()) === 1, "node details missing");

// Theme toggle.
const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.getByRole("button", { name: /theme/i }).click();
await until(async () => (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== before, "theme toggle did not change the background");

if (errors.length) note("errors", errors.join(" | "));
await browser.close();
if (findings.length) {
  console.log(findings.join("\n"));
  process.exit(1);
}
console.log("No findings");
