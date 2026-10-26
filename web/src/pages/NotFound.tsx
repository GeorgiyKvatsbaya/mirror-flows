import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function NotFound() {
  const { t, path } = useI18n();
  return (
    <div className="page-head">
      <h1>{t("notFound.title")}</h1>
      <p className="lede">{t("notFound.text")}</p>
      <p>
        <Link to={path("/")}>{t("notFound.home")}</Link>
      </p>
    </div>
  );
}
