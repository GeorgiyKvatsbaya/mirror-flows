import {
  barSeries,
  baseOption,
  categoryAxis,
  lineSeries,
  valueAxis,
  type ChartTheme,
  type OptionBuilder,
} from "../components/Chart";

export type Format = (value: unknown) => string;

export interface LineSeriesInput {
  name: string;
  values: (number | null)[];
  /** Fixed palette slot, so colours follow the entity, not the rank. */
  color?: number;
}

interface LineChartOptions {
  x: string[];
  series: LineSeriesInput[];
  format: Format;
  /** Axis tick format (compact); defaults to `format`. */
  axisFormat?: Format;
  xFormat?: (value: string) => string;
  area?: boolean;
  baseline?: number;
}

/** Lines over a category x-axis (years or months). Crosshair tooltip, values first. */
export function lineChart(options: LineChartOptions): OptionBuilder {
  const { x, series, format, axisFormat = format, xFormat = (v) => v, area = false, baseline } = options;
  return (theme: ChartTheme) => {
    const base = baseOption(theme, series.length);
    return {
      ...base,
      tooltip: { ...(base.tooltip as object), formatter: tooltip(format, xFormat) },
      xAxis: {
        ...categoryAxis(theme, x),
        boundaryGap: false,
        axisLabel: { color: theme.muted, hideOverlap: true, formatter: xFormat },
      },
      yAxis: valueAxis(theme, (value: number) => axisFormat(value), true),
      series: series.map((item, index) => {
        const color = theme.series[(item.color ?? index) % theme.series.length];
        const withData = { ...lineSeries(item.name, [], color, area && series.length === 1), data: item.values };
        if (index === 0 && baseline !== undefined) {
          return {
            ...withData,
            markLine: {
              silent: true,
              symbol: "none",
              label: { show: false },
              lineStyle: { color: theme.axis, width: 1, type: "solid" },
              data: [{ yAxis: baseline }],
            },
          };
        }
        return withData;
      }),
    };
  };
}

function tooltip(format: Format, xFormat: (value: string) => string) {
  return (params: unknown) => {
    const items = (Array.isArray(params) ? params : [params]) as {
      name: string;
      value: number | null;
      seriesName: string;
      color: string;
    }[];
    if (!items.length) return "";
    const rows = items
      .filter((item) => item.value !== null && item.value !== undefined)
      .sort((a, b) => Number(b.value) - Number(a.value))
      .map(
        (item) =>
          `<div style="display:flex;align-items:center;gap:8px;margin-top:2px">` +
          `<span style="display:inline-block;width:12px;height:2px;background:${item.color}"></span>` +
          `<strong>${escapeHtml(format(item.value))}</strong>` +
          `<span style="opacity:.75">${escapeHtml(item.seriesName)}</span></div>`,
      )
      .join("");
    return `<div style="font-weight:600;margin-bottom:2px">${escapeHtml(xFormat(items[0].name))}</div>${rows}`;
  };
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

interface BarOptions {
  items: { label: string; value: number | null }[];
  format: Format;
  /** Colour negative bars with the diverging pole. */
  diverging?: boolean;
  /** Palette slot for the bars. */
  color?: number;
}

/** Ranked horizontal bars: one colour, value labels, longest first. */
export function rankedBarChart({ items, format, diverging = false, color = 0 }: BarOptions): OptionBuilder {
  const sorted = [...items].filter((item) => item.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (theme: ChartTheme) => {
    const negative = cssColor("--diverging-neg") || theme.series[7];
    const fill = theme.series[color % theme.series.length];
    const base = baseOption(theme, 1);
    return {
      ...base,
      grid: { left: 8, right: 64, top: 4, bottom: 4, containLabel: true },
      tooltip: { ...(base.tooltip as object), trigger: "item", valueFormatter: format },
      xAxis: { ...valueAxis(theme), splitLine: { show: false }, axisLabel: { show: false } },
      yAxis: { ...categoryAxis(theme, sorted.map((item) => item.label), true), axisLabel: { color: theme.ink2, width: 150, overflow: "truncate" } },
      series: [
        {
          ...barSeries(
            "",
            sorted.map((item) => {
              const value = item.value ?? 0;
              return {
                value,
                itemStyle: {
                  color: diverging && value < 0 ? negative : fill,
                  borderRadius: value < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0],
                },
              };
            }),
            fill,
            true,
          ),
          label: {
            show: true,
            position: "right",
            color: theme.ink2,
            fontSize: 11,
            formatter: (params: { value: number }) => format(params.value),
          },
        },
      ],
    };
  };
}

export interface TreemapGroup {
  name: string;
  /** Palette slot for the group (fixed per HS section). */
  color: number;
  children: { name: string; value: number; id: string }[];
}

/** Two-level treemap (section -> chapter); a surface-coloured gap separates the tiles. */
export function treemapChart(groups: TreemapGroup[], format: Format, total: number): OptionBuilder {
  return (theme: ChartTheme) => ({
    textStyle: { fontFamily: theme.font, color: theme.ink2 },
    aria: { enabled: true },
    tooltip: {
      backgroundColor: theme.surface,
      borderColor: theme.grid,
      textStyle: { color: theme.ink, fontSize: 12 },
      confine: true,
      formatter: (params: { name: string; value: number; treePathInfo: { name: string }[] }) => {
        const path = params.treePathInfo.slice(1).map((node) => node.name);
        const share = total ? ` · ${((params.value / total) * 100).toFixed(1)}%` : "";
        return `<strong>${escapeHtml(format(params.value))}</strong>${share}<br/>${path.map(escapeHtml).join(" › ")}`;
      },
    },
    series: [
      {
        type: "treemap",
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: "100%",
        height: "100%",
        top: 0,
        left: 0,
        visibleMin: 300,
        // White text with a soft dark halo stays legible on every palette hue.
        label: {
          show: true,
          color: "#fff",
          fontSize: 11,
          overflow: "truncate",
          formatter: "{b}",
          textBorderColor: "rgba(0,0,0,0.45)",
          textBorderWidth: 2,
        },
        upperLabel: { show: false },
        itemStyle: { borderColor: theme.surface, borderWidth: 1, gapWidth: 1 },
        levels: [
          { itemStyle: { borderColor: theme.surface, borderWidth: 2, gapWidth: 2 } },
          { itemStyle: { gapWidth: 1, borderColor: theme.surface, borderWidth: 1 } },
        ],
        data: groups.map((group) => ({
          name: group.name,
          itemStyle: { color: theme.series[group.color % theme.series.length] },
          children: group.children,
        })),
      },
    ],
  });
}

function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Twelve HS-section groups mapped onto the eight palette slots, stable across pages:
 *  related sections share a hue so the treemap reads by broad sector. */
export function sectionColor(section: number | undefined): number {
  const map: Record<number, number> = {
    1: 2, 2: 2, 3: 2, 4: 2, // food & agriculture: green
    5: 3, // minerals & fuels: amber
    6: 6, 7: 6, // chemicals & plastics: violet
    8: 1, 9: 1, 10: 1, 11: 1, 12: 1, // light manufactures: orange
    13: 4, 14: 4, // stone, glass, precious: pink
    15: 7, // metals: red
    16: 0, 17: 0, 18: 0, 19: 0, // machinery, vehicles, instruments: blue
    20: 5, 21: 5, 22: 5, // miscellaneous: dark green
  };
  return map[section ?? 22] ?? 5;
}
