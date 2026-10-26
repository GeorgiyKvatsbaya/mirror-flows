import { MapChart as EchartsMap } from "echarts/charts";
import { VisualMapContinuousComponent } from "echarts/components";
import { useCallback, useEffect, useState } from "react";
import { escapeHtml, type Format } from "../lib/charts";
import { fetchJson } from "../lib/data";
import { cssVar } from "../lib/theme";
import { Chart, echarts, type ChartTheme } from "./Chart";

// Registered here so only pages with maps download the map modules.
echarts.use([EchartsMap, VisualMapContinuousComponent]);

interface GeoFeature {
  properties: { id: string; name: string };
}

let registered: Promise<GeoFeature[]> | null = null;

/** Natural Earth countries, keyed by ADM0_A3 (see `wta boundaries`). */
function loadWorld(): Promise<GeoFeature[]> {
  registered ??= fetchJson<{ features: GeoFeature[] }>("geo/world.json").then((geojson) => {
    echarts.registerMap("world", geojson as never);
    return geojson.features;
  });
  return registered;
}

function useWorldMap() {
  const [features, setFeatures] = useState<GeoFeature[] | null>(null);
  useEffect(() => {
    let active = true;
    loadWorld().then((loaded) => active && setFeatures(loaded));
    return () => {
      active = false;
    };
  }, []);
  return features;
}

interface MapChartProps {
  /** Values keyed by map feature id (ADM0_A3). */
  values: Map<string, number>;
  /** Display name for a feature id. */
  nameOf: (id: string) => string;
  label: string;
  format: Format;
  /** Two-pole scale around zero (e.g. trade balance, growth). */
  diverging?: boolean;
  /** Feature to outline (e.g. the country whose partners are shown). */
  highlight?: string | null;
  onSelect?: (id: string) => void;
}

/** Choropleth: single-hue ramp for magnitude, blue/red around a neutral midpoint for signed
 *  values; countries without data stay neutral. Magnitudes use a square-root scale so a few
 *  giants do not wash out everyone else. */
export function MapChart({ values, nameOf, label, format, diverging = false, highlight, onSelect }: MapChartProps) {
  const features = useWorldMap();

  const build = useCallback(
    (theme: ChartTheme) => {
      const numbers = [...values.values()].filter(Number.isFinite);
      const max = numbers.length ? Math.max(...numbers.map(Math.abs)) : 1;
      // Clip the scale at the 95th percentile so outliers do not flatten the map.
      const sorted = numbers.map(Math.abs).sort((a, b) => a - b);
      const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] || max : max;
      const transform = (v: number) => (diverging ? Math.sign(v) * Math.sqrt(Math.abs(v)) : Math.sqrt(Math.max(v, 0)));
      const limit = transform(p95);
      const negative = cssVar("--diverging-neg");
      const mid = cssVar("--diverging-mid");
      return {
        textStyle: { fontFamily: theme.font, color: theme.ink2 },
        aria: { enabled: true },
        tooltip: {
          trigger: "item",
          backgroundColor: theme.surface,
          borderColor: theme.grid,
          textStyle: { color: theme.ink, fontSize: 12 },
          formatter: (params: { name: string; data?: { raw: number } }) => {
            const value = params.data ? format(params.data.raw) : "—";
            return `<strong>${escapeHtml(value)}</strong><br/>${escapeHtml(nameOf(params.name))}`;
          },
        },
        visualMap: {
          type: "continuous",
          min: diverging ? -limit : 0,
          max: limit,
          text: [`≥ ${format(p95)}`, diverging ? `≤ ${format(-p95)}` : format(0)],
          textGap: 6,
          inRange: { color: diverging ? [negative, mid, theme.seqHigh] : [theme.seqLow, theme.seqHigh] },
          calculable: false,
          orient: "horizontal",
          left: 0,
          bottom: 0,
          itemWidth: 10,
          itemHeight: 140,
          textStyle: { color: theme.muted, fontSize: 11 },
        },
        series: [
          {
            type: "map",
            map: "world",
            nameProperty: "id",
            roam: false,
            selectedMode: false,
            // Fit the box (keeps the aspect ratio); leave room for the legend at the bottom.
            top: 4,
            bottom: 28,
            left: 0,
            right: 0,
            itemStyle: { areaColor: theme.surface2, borderColor: theme.surface, borderWidth: 0.6 },
            emphasis: {
              label: { show: false },
              itemStyle: { areaColor: theme.accent, borderColor: theme.surface },
            },
            label: { show: false },
            data: [
              ...[...values].map(([name, value]) => ({ name, value: transform(value), raw: value })),
              ...(highlight
                ? [{ name: highlight, itemStyle: { areaColor: theme.ink, borderColor: theme.surface }, raw: null }]
                : []),
            ],
          },
        ],
      };
    },
    [values, nameOf, format, diverging, highlight],
  );

  const onEvents = useCallback(
    (chart: echarts.ECharts) => {
      if (!onSelect) return;
      chart.off("click");
      chart.on("click", (params) => onSelect(String((params as { name: string }).name)));
    },
    [onSelect],
  );

  if (!features) return <div className="map" aria-busy="true" />;
  return <Chart build={build} label={label} className="map" onReady={onEvents} />;
}
