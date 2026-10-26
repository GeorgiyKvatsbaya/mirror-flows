import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { Layout } from "./components/Layout";
import { detectLang, I18nProvider, isLang, useI18n } from "./i18n";
import { NotFound } from "./pages/NotFound";

// Each page is its own chunk; the map module loads only on pages with maps.
const World = lazy(() => import("./pages/World"));
const Countries = lazy(() => import("./pages/Countries"));
const Country = lazy(() => import("./pages/Country"));
const Pair = lazy(() => import("./pages/Pair"));
const Products = lazy(() => import("./pages/Products"));
const Product = lazy(() => import("./pages/Product"));
const About = lazy(() => import("./pages/About"));
const Compare = lazy(() => import("./pages/Compare"));
const DataModel = lazy(() => import("./pages/DataModel"));

function LanguageRoot() {
  const { lang } = useParams();
  if (!isLang(lang)) return <Navigate to={`/${detectLang()}`} replace />;
  return (
    <I18nProvider lang={lang}>
      <DocumentTitle />
      <Outlet />
    </I18nProvider>
  );
}

function DocumentTitle() {
  const { t } = useI18n();
  useEffect(() => {
    document.title = t("site.name");
  }, [t]);
  return null;
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingFallback />}>{children}</Suspense>;
}

function LoadingFallback() {
  const { t } = useI18n();
  return <p className="loading">{t("common.loading")}</p>;
}

const page = (element: ReactNode) => <Lazy>{element}</Lazy>;

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/${detectLang()}`} replace />} />
      <Route path="/:lang" element={<LanguageRoot />}>
        <Route element={<Layout />}>
          <Route index element={page(<World />)} />
          <Route path="countries" element={page(<Countries />)} />
          <Route path="country/:code" element={page(<Country />)} />
          <Route path="country/:code/partner/:partner" element={page(<Pair />)} />
          <Route path="products" element={page(<Products />)} />
          <Route path="product/:hs4" element={page(<Product />)} />
          <Route path="compare" element={page(<Compare />)} />
          <Route path="model" element={page(<DataModel />)} />
          <Route path="about" element={page(<About />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
