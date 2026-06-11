import type { BrainGrowthData, Snapshot } from "./types";

export const EMPTY_DATA: BrainGrowthData = {
  schemaVersion: 1,
  snapshots: [],
  lastSuccessfulScanAt: null,
  backgroundMode: "dark",
  hasOpenedMiniPanel: false,
  historicalGrowthInitialized: false
};

export function normalizeData(raw: unknown): BrainGrowthData {
  if (!raw || typeof raw !== "object") return { ...EMPTY_DATA, snapshots: [] };
  const candidate = raw as Partial<BrainGrowthData>;
  const snapshots = Array.isArray(candidate.snapshots)
    ? candidate.snapshots.filter(isValidSnapshot)
    : [];

  return {
    schemaVersion: 1,
    snapshots: sortSnapshots(snapshots.map(normalizeSnapshot)),
    lastSuccessfulScanAt:
      typeof candidate.lastSuccessfulScanAt === "string"
        ? candidate.lastSuccessfulScanAt
        : null,
    backgroundMode: candidate.backgroundMode === "light" ? "light" : "dark",
    hasOpenedMiniPanel: typeof candidate.hasOpenedMiniPanel === "boolean" ? candidate.hasOpenedMiniPanel : false,
    historicalGrowthInitialized:
      typeof candidate.historicalGrowthInitialized === "boolean" ? candidate.historicalGrowthInitialized : false,
    historicalGrowthInitializedAt:
      typeof candidate.historicalGrowthInitializedAt === "string" ? candidate.historicalGrowthInitializedAt : undefined,
    historicalGrowthMethod:
      candidate.historicalGrowthMethod === "creation-date-attribution" ? "creation-date-attribution" : undefined
  };
}

export function upsertSnapshot(data: BrainGrowthData, snapshot: Snapshot): BrainGrowthData {
  const normalizedSnapshot = normalizeSnapshot({ ...snapshot, source: snapshot.source ?? "actual" });
  const withoutSameDate = data.snapshots.filter((item) => item.date !== normalizedSnapshot.date);
  return {
    schemaVersion: 1,
    snapshots: sortSnapshots([...withoutSameDate, normalizedSnapshot]),
    lastSuccessfulScanAt: normalizedSnapshot.capturedAt,
    backgroundMode: data.backgroundMode === "light" ? "light" : "dark",
    hasOpenedMiniPanel: data.hasOpenedMiniPanel ?? false,
    historicalGrowthInitialized: data.historicalGrowthInitialized ?? false,
    historicalGrowthInitializedAt: data.historicalGrowthInitializedAt,
    historicalGrowthMethod: data.historicalGrowthMethod
  };
}

function sortSnapshots(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort((left, right) => left.date.localeCompare(right.date));
}

function isValidSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Snapshot;
  return (
    typeof snapshot.date === "string" &&
    typeof snapshot.capturedAt === "string" &&
    isFiniteNumber(snapshot.noteCount) &&
    isFiniteNumber(snapshot.bodyCount) &&
    isFiniteNumber(snapshot.uniqueTagCount)
  );
}

function normalizeSnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    source: snapshot.source === "estimated" ? "estimated" : "actual"
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
