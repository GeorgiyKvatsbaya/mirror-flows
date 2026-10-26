// Smoke test: every route in every language renders without browser errors.
// Usage: npm run build && npx vite preview --port 4173 & npm run smoke
import { chromium } from "@playwright/test";

const BASE = process.env.SMOKE_URL ?? "http://localhost:4173";
const LANGS = ["en", "ru"];
const ROUTES = [
  { path: "", expect: ".map canvas" },
  { path: "/countries", expect: ".index-list a" },
  { path: "/country/GEO", expect: ".map canvas" },
  { path: "/country/CHN", expect: ".chart canvas" },
  { path: "/country/BLX", expect: ".chart canvas" },
  { path: "/country/GEO/partner/TUR", expect: ".chart canvas" },
  { path: "/products", expect: ".data-table tbody tr" },
  { path: "/product/0901", expect: ".map canvas" },
  { path: "/product/8542", expect: ".chart canvas" },
  { path: "/about", expect: ".glossary" },
  { path: "/country/XXX", expect: ".page-head h1" },
];

const browser = await chromium.launch();
const failures = [];
for (const lang of LANGS) {
  for (const route of ROUTES) {
    const url = `${BASE}/${lang}${route.path}`;
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector(route.expect, { timeout: 15000 });
      if ((await page.getAttribute("html", "lang")) !== lang) errors.push(`html lang is not ${lang}`);
      if (await page.locator(".notice:has-text('Could not'), .notice:has-text('Не удалось')").count()) errors.push("error notice shown");
    } catch (error) {
      errors.push(String(error.message ?? error).split("\n")[0]);
    }
    if (errors.length) failures.push(`${url}: ${errors.join(" | ")}`);
    await page.close();
  }
}
await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`OK: ${LANGS.length * ROUTES.length} pages rendered without errors`);
