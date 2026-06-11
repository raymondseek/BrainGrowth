import type { DashboardSnapshotWindow, MetricKey, RangeKey, Snapshot } from "./types";

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All"
};

export function selectSnapshotWindow(snapshots: Snapshot[], range: RangeKey): DashboardSnapshotWindow {
  const sorted = [...snapshots].sort((left, right) => left.date.localeCompare(right.date));
  const current = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  if (!current) {
    return { snapshots: [], current: null, baseline: null };
  }

  if (range === "all") {
    return {
      snapshots: sorted,
      current,
      baseline: sorted[0] ?? null
    };
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const currentTime = new Date(`${current.date}T00:00:00`).getTime();
  const startTime = currentTime - (days - 1) * 24 * 60 * 60 * 1000;
  const ranged = sorted.filter((snapshot) => {
    const snapshotTime = new Date(`${snapshot.date}T00:00:00`).getTime();
    return snapshotTime >= startTime && snapshotTime <= currentTime;
  });

  return {
    snapshots: ranged,
    current,
    baseline: ranged[0] ?? current
  };
}

export function getGrowth(window: DashboardSnapshotWindow, metric: MetricKey): number {
  if (!window.current || !window.baseline) return 0;
  return (window.current[metric] ?? 0) - (window.baseline[metric] ?? 0);
}
