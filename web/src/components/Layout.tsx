import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LANG_NAMES, LANGS, rememberLang, useI18n, type MessageKey } from "../i18n";
import { useMeta } from "../lib/data";
import { formatDate } from "../lib/format";
import { setTheme, useTheme } from "../lib/theme";
import { ErrorBoundary } from "./ErrorBoundary";
import { Search } from "./Search";
import { SOURCE_LINKS } from "./SourceNote";

const NAV: { path: string; key: MessageKey }[] = [
  { path: "", key: "nav.world" },
  { path: "countries", key: "nav.countries" },
  { path: "products", key: "nav.products" },
  { path: "compare", key: "nav.compare" },
  { path: "model", key: "nav.model" },
  { path: "about", key: "nav.about" },
];

export const REPO_URL = "https://github.com/GeorgiyKvatsbaya/mirror-flows";

function ThemeToggle() {
  const { t } = useI18n();
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="icon-button" onClick={() => setTheme(next)} aria-label={t("theme.toggle")} title={t("theme.toggle")}>
      {theme === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

function LanguageSwitch() {
  const { lang, t } = useI18n();
  const location = useLocation();
  // Keep the same page and filters when switching: replace only the language prefix.
  const rest = location.pathname.replace(/^\/(en|ru)(?=\/|$)/, "");
  return (
    <nav className="segmented" aria-label={t("lang.label")}>
      {LANGS.map((code) => (
        <Link
          key={code}
          to={`/${code}${rest}${location.search}`}
          className={code === lang ? "active" : undefined}
          aria-current={code === lang ? "true" : undefined}
          hrefLang={code}
          lang={code}
          onClick={() => rememberLang(code)}
        >
          {LANG_NAMES[code]}
        </Link>
      ))}
    </nav>
  );
}

export function Layout() {
  const { lang, t } = useI18n();
  const location = useLocation();
  const { data: meta } = useMeta();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <>
      <a className="skip-link" href="#main">
        {t("nav.skip")}
      </a>
      <header className="site-header">
        <div className="container">
          <div className="header-row">
            <Link to={`/${lang}`} className="brand">
              <img src="/favicon.svg" alt="" />
              <span>{t("site.name")}</span>
            </Link>
            <div className="header-tools">
              <Search />
              <LanguageSwitch />
              <ThemeToggle />
            </div>
          </div>
          <nav className="nav" aria-label={t("nav.label")}>
            {NAV.map(({ path, key }) => (
              <NavLink key={key} to={`/${lang}${path ? `/${path}` : ""}`} end={path === ""}>
                {t(key)}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main">
        <div className="container">
          <ErrorBoundary resetKey={location.pathname} fallback={<p className="notice">{t("common.error")}</p>}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <p>
              {t("footer.data")}{" "}
              <a href={SOURCE_LINKS.baci.url} target="_blank" rel="noreferrer">
                CEPII BACI
              </a>{" "}
              (Etalab 2.0) ·{" "}
              <a href={SOURCE_LINKS.imf.url} target="_blank" rel="noreferrer">
                IMF IMTS
              </a>
              {meta && ` · ${t("footer.built", { date: formatDate(lang, meta.built_at) })}`}
            </p>
            <p>{t("footer.unofficial")}</p>
          </div>
          <div className="footer-links">
            <a href="/dbt/" target="_blank" rel="noreferrer">
              {t("footer.dbt")}
            </a>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              {t("footer.code")}
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
