import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { downloadCsv } from "../lib/csv";
import type { Row } from "../lib/data";
import { Chart, type echarts, type OptionBuilder } from "./Chart";
import { SourceNote, type SourceKey } from "./SourceNote";

export interface TableColumn {
  key: string;
  label: string;
  /** Display format; the CSV keeps raw values. */
  format?: (value: unknown, row: Row) => ReactNode;
  numeric?: boolean;
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  build?: OptionBuilder;
  /** Rows behind the chart: shown in the table view and downloaded as CSV. */
  rows: Row[];
  columns: TableColumn[];
  sources: SourceKey[];
  filename: string;
  wide?: boolean;
  chartHeight?: number;
  /** Plain-language explanation shown under "How to read this". */
  info?: string;
  /** Custom visual (e.g. a map) instead of `build`. */
  children?: ReactNode;
  controls?: ReactNode;
  /** Start in table view (for cards that are tables first). */
  tableFirst?: boolean;
  /** Receives the ECharts instance, e.g. `onItemClick(...)` for cross-filtering. */
  onChartReady?: (chart: echarts.ECharts) => void;
  /** Shown under the subtitle, e.g. the active filter chips. */
  note?: ReactNode;
}

export function ChartCard(props: ChartCardProps) {
  const { title, subtitle, build, rows, columns, sources, filename, wide, chartHeight, info, children, controls, tableFirst = false, onChartReady, note } = props;
  const { t } = useI18n();
  const [showTable, setShowTable] = useState(tableFirst);
  const hasVisual = Boolean(children || build);

  return (
    <section className="card chart-card" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <h3>{title}</h3>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      {note}
      {info && (
        <details className="chart-info">
          <summary>{t("common.howToRead")}</summary>
          <p>{info}</p>
        </details>
      )}
      {controls && <div className="chart-controls">{controls}</div>}
      {showTable || !hasVisual ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className={column.numeric ? "num" : undefined}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.numeric ? "num" : undefined}>
                      {column.format ? column.format(row[column.key], row) : String(row[column.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children ?? (build && <Chart build={build} label={title} height={chartHeight} onReady={onChartReady} />)
      )}
      <div className="chart-foot">
        <SourceNote sources={sources} />
        <div className="actions">
          {hasVisual && (
            <button type="button" className="button ghost" onClick={() => setShowTable(!showTable)}>
              {showTable ? t("common.showChart") : t("common.showTable")}
            </button>
          )}
          <button
            type="button"
            className="button ghost"
            onClick={() => downloadCsv(filename, rows, columns.map((column) => column.key))}
          >
            {t("common.downloadCsv")}
          </button>
        </div>
      </div>
    </section>
  );
}
