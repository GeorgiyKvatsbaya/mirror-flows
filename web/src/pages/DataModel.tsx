import { GraphChart } from "echarts/charts";
import { GraphicComponent } from "echarts/components";
import { useCallback, useMemo } from "react";
import { echarts, type ChartTheme } from "../components/Chart";
import { ChartCard } from "../components/ChartCard";
import { FilterBar, FilterChips, useParamState } from "../components/Filters";
import { KpiTile } from "../components/KpiTile";
import { useI18n, type MessageKey } from "../i18n";
import { escapeHtml } from "../lib/charts";
import { useJson } from "../lib/data";
import { formatDate } from "../lib/format";
import { COLUMN_GAP, layout, lineageOf, type ModelFile, type Placed } from "../lib/lineage";
import { useFormats } from "./shared";
import { Chart } from "../components/Chart";

// Registered here so only this page downloads the graph module.
echarts.use([GraphChart, GraphicComponent]);

const LAYER_COLOR: Record<string, number> = { source: 3, seed: 5, staging: 1, intermediate: 6, marts: 0, exposure: 2 };
const COLUMN_TITLES: MessageKey[] = ["model.layer.sources", "model.layer.staging", "model.layer.intermediate", "model.layer.marts", "model.layer.pages"];

export default function DataModel() {
  const { data, error } = useJson<ModelFile>("model.json");
  const { t } = useI18n();
  if (error) return <p className="notice">{t("common.error")}</p>;
  if (!data) return <p className="loading">{t("common.loading")}</p>;
  return <DataModelView model={data} />;
}

function DataModelView({ model }: { model: ModelFile }) {
  const { lang, t } = useI18n();
  const fmt = useFormats();
  const [selectedId, setSelectedId] = useParamState("node", "");
  const placed = useMemo(() => layout(model.nodes), [model.nodes]);
  const selected = placed.find((node) => node.id === selectedId) ?? null;
  const lit = useMemo(() => (selected ? lineageOf(model.nodes, selected.id) : null), [model.nodes, selected]);
  const height = Math.max(...placed.map((node) => node.y)) + 120;
  const counts = {
    models: model.nodes.filter((node) => node.type === "model").length,
    sources: model.nodes.filter((node) => node.type === "source").length,
    exposures: model.nodes.filter((node) => node.type === "exposure").length,
    contracts: model.nodes.filter((node) => node.contract).length,
  };

  const build = useCallback(
    (theme: ChartTheme) => {
      const byId = new Map(placed.map((node) => [node.id, node]));
      const faded = (id: string) => lit !== null && !lit.has(id);
      return {
        textStyle: { fontFamily: theme.font, color: theme.ink2 },
        aria: { enabled: true },
        tooltip: {
          backgroundColor: theme.surface,
          borderColor: theme.grid,
          textStyle: { color: theme.ink, fontSize: 12 },
          confine: true,
          formatter: (params: { dataType: string; data: { node?: Placed } }) => {
            const node = params.data.node;
            if (params.dataType !== "node" || !node) return "";
            const meta = [node.materialized ?? node.type, node.rows !== null ? `${fmt.number(node.rows)} ${t("model.rows")}` : null]
              .filter(Boolean)
              .join(" · ");
            return `<strong>${escapeHtml(node.name)}</strong><br/>${escapeHtml(meta)}`;
          },
        },
        graphic: COLUMN_TITLES.map((key, column) => ({
          type: "text",
          left: `${(column / (COLUMN_TITLES.length - 1)) * 82 + 3}%`,
          top: 4,
          style: { text: t(key).toUpperCase(), fill: theme.muted, font: `600 11px ${theme.font}` },
        })),
        series: [
          {
            type: "graph",
            layout: "none",
            roam: true,
            top: 40,
            bottom: 16,
            left: 20,
            right: 190, // room for the labels of the last column
            symbol: "roundRect",
            symbolSize: [14, 14],
            edgeSymbol: ["none", "arrow"],
            edgeSymbolSize: 6,
            label: {
              show: true,
              position: "right",
              color: theme.ink,
              fontSize: 11,
              formatter: (params: { data: { node: Placed } }) => params.data.node.name,
            },
            lineStyle: { color: theme.axis, width: 1, curveness: 0.15, opacity: 0.9 },
            emphasis: { focus: "adjacency", lineStyle: { width: 2 } },
            data: placed.map((node) => ({
              id: node.id,
              name: node.id,
              x: node.x,
              y: node.y,
              node,
              symbolSize: node.type === "model" && node.layer === "marts" ? [16, 16] : [12, 12],
              itemStyle: {
                color: theme.series[LAYER_COLOR[node.layer] ?? 0],
                borderColor: node.id === selected?.id ? theme.ink : theme.surface,
                borderWidth: node.id === selected?.id ? 3 : 1,
                opacity: faded(node.id) ? 0.2 : 1,
              },
              label: { opacity: faded(node.id) ? 0.3 : 1, fontWeight: node.id === selected?.id ? 700 : 400 },
            })),
            links: placed.flatMap((node) =>
              node.parents
                .filter((parent) => byId.has(parent))
                .map((parent) => ({
                  source: parent,
                  target: node.id,
                  lineStyle: lit ? { opacity: lit.has(parent) && lit.has(node.id) ? 1 : 0.08, color: lit.has(parent) && lit.has(node.id) ? theme.accent : theme.axis } : undefined,
                })),
            ),
          },
        ],
      };
    },
    [placed, lit, selected, fmt, t],
  );

  const onReady = useCallback(
    (chart: echarts.ECharts) => {
      chart.off("click");
      chart.on("click", (params) => {
        const data = (params as { dataType?: string; data?: { id?: string } }).data;
        if ((params as { dataType?: string }).dataType === "node" && data?.id) setSelectedId(data.id === selectedId ? "" : data.id);
      });
    },
    [selectedId, setSelectedId],
  );

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">dbt {model.dbt_version} · DuckDB</p>
        <h1>{t("model.title")}</h1>
        <p className="lede">{t("model.lede")}</p>
      </header>

      <div className="grid kpi-grid">
        <KpiTile label={t("model.kpi.models")} value={fmt.number(counts.models)} meta={t("model.kpi.sources", { sources: counts.sources, pages: counts.exposures })} />
        <KpiTile label={t("model.kpi.tests")} value={`${fmt.number(model.tests_passed)} / ${fmt.number(model.tests_total)}`} meta={t("model.kpi.testsMeta")} />
        <KpiTile label={t("model.kpi.contracts")} value={fmt.number(counts.contracts)} meta={t("model.kpi.contractsMeta")} />
        <KpiTile label={t("model.kpi.built")} value={formatDate(lang, model.generated_at)} meta={t("model.kpi.builtMeta")} />
      </div>

      <FilterBar>
        <FilterChips items={selected ? [{ label: `${t("model.selected")}: ${selected.name}`, onClear: () => setSelectedId("") }] : []} />
        <a className="button ghost" href="/dbt/" target="_blank" rel="noreferrer">
          {t("model.fullDocs")} ↗
        </a>
      </FilterBar>

      <section className="card chart-card lineage-card">
        <h3>{t("model.graph.title")}</h3>
        <p className="subtitle">{t("model.graph.subtitle")}</p>
        <div className="lineage-scroll" tabIndex={0} role="region" aria-label={t("model.graph.title")}>
          <div style={{ minWidth: COLUMN_GAP * 4 + 200 }}>
            <Chart build={build} label={t("model.graph.title")} height={height} onReady={onReady} />
          </div>
        </div>
        <ul className="legend-list" aria-label={t("model.legend")}>
          {Object.entries(LAYER_COLOR).map(([layer, color]) => (
            <li key={layer}>
              <span className="swatch" style={{ background: `var(--series-${color + 1})` }} />
              {t(`model.type.${layer}` as MessageKey)}
            </li>
          ))}
        </ul>
      </section>

      {selected ? <NodeDetails node={selected} /> : <p className="notice">{t("model.pick")}</p>}

      <ChartCard
        tableFirst
        title={t("model.table.title")}
        rows={placed.map((node) => ({
          id: node.id,
          name: node.name,
          layer: t(`model.type.${node.layer}` as MessageKey),
          materialized: node.materialized ?? node.type,
          rows: node.rows,
          tests: node.tests.tests,
          contract: node.contract ? "✓" : "",
        }))}
        columns={[
          {
            key: "name",
            label: t("model.col.name"),
            format: (value, row) => (
              <button type="button" className="link-button" onClick={() => setSelectedId(String(row.id))}>
                {String(value)}
              </button>
            ),
          },
          { key: "layer", label: t("model.col.layer") },
          { key: "materialized", label: t("model.col.materialized") },
          { key: "rows", label: t("model.col.rows"), numeric: true, format: (v) => (v === null || v === undefined ? "—" : fmt.number(v)) },
          { key: "tests", label: t("model.col.tests"), numeric: true },
          { key: "contract", label: t("model.col.contract") },
        ]}
        sources={[]}
        filename="dbt-models"
      />
    </>
  );
}

function NodeDetails({ node }: { node: Placed }) {
  const { t } = useI18n();
  const fmt = useFormats();
  const facts = [
    [t("model.col.layer"), t(`model.type.${node.layer}` as MessageKey)],
    [t("model.col.materialized"), [node.materialized, node.incremental_strategy].filter(Boolean).join(" · ") || node.type],
    [t("model.col.rows"), node.rows === null ? "—" : fmt.number(node.rows)],
    [t("model.col.tests"), node.tests.tests ? t("model.testsPassed", { passed: node.tests.passed, total: node.tests.tests }) : "—"],
    [t("model.col.contract"), node.contract ? t("model.enforced") : "—"],
    ...(node.tags.length ? [[t("model.tags"), node.tags.join(", ")]] : []),
  ];
  return (
    <section className="card node-details" aria-live="polite">
      <h2>{node.name}</h2>
      <p className="muted small">{node.path ?? node.id}</p>
      {node.description && <InlineMarkdown text={node.description} />}
      <dl className="facts">
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="pair-links">
        <a href={node.docs} target="_blank" rel="noreferrer">
          {t("model.openDocs")} ↗
        </a>
        {node.url && (
          <>
            {" · "}
            <a href={node.url}>{t("model.openPage")}</a>
          </>
        )}
      </p>
      {node.columns.length > 0 && (
        <div className="data-table-wrap" tabIndex={0} role="region" aria-label={t("model.columns")}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("model.col.column")}</th>
                <th scope="col">{t("model.col.type")}</th>
                <th scope="col">{t("model.col.description")}</th>
              </tr>
            </thead>
            <tbody>
              {node.columns.map((column) => (
                <tr key={column.name}>
                  <td className="code">{column.name}</td>
                  <td className="code">{column.type ?? ""}</td>
                  <td>
                    <InlineMarkdown text={column.description} inline />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {node.sql && (
        <details className="sql">
          <summary>{t("model.sql")}</summary>
          <pre>
            <code>{node.sql}</code>
          </pre>
        </details>
      )}
    </section>
  );
}

/** dbt descriptions use a little markdown: paragraphs, **bold** and `code`. */
function InlineMarkdown({ text, inline = false }: { text: string; inline?: boolean }) {
  const render = (paragraph: string) =>
    paragraph.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
      return part;
    });
  if (inline) return <>{render(text)}</>;
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <p key={index}>{render(paragraph)}</p>
        ))}
    </>
  );
}
