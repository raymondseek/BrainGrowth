import type { MetricDefinition, MetricKey } from "./types";

export const METRICS: MetricDefinition[] = [
  {
    key: "noteCount",
    label: "Total Note Count",
    shortLabel: "Notes",
    colorVar: "var(--bg-note)"
  },
  {
    key: "bodyCount",
    label: "Total Body Count",
    shortLabel: "Body",
    colorVar: "var(--bg-body)"
  },
  {
    key: "uniqueTagCount",
    label: "Total Tag Type Count",
    shortLabel: "Tags",
    colorVar: "var(--bg-tag)"
  },
  {
    key: "connectionCount",
    label: "Total Internal Link Count",
    shortLabel: "Links",
    colorVar: "var(--bg-connection)"
  }
];

export function getMetricDefinition(key: MetricKey): MetricDefinition {
  return METRICS.find((metric) => metric.key === key) ?? METRICS[1];
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatGrowth(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)} in range`;
}
