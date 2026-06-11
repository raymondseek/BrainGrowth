export interface Snapshot {
  date: string;
  capturedAt: string;
  noteCount: number;
  bodyCount: number;
  uniqueTagCount: number;
  source?: SnapshotSource;
  cognitiveComputeTops?: number;
  computeClass?: ComputeClass;
  benchmarkVersion?: BenchmarkVersion;
  neuronMass?: number;
  signalStrength?: number;
  engramDensity?: number;
  synapseConnectivity?: number;
  connectionCount?: number;
  nonEmptyNoteCount?: number;
  matureNoteCount?: number;
  shortNoteCount?: number;
  connectedNoteCount?: number;
  orphanNoteCount?: number;
  internalLinkCount?: number;
  bidirectionalLinkCount?: number;
  linkCoverageRatio?: number;
  averageLinksPerNote?: number;
  bodyTagOccurrenceCount?: number;
  tagCoverageRatio?: number;
  singleUseTagCount?: number;
  chineseBodyCount?: number;
  englishWordCount?: number;
  numberTokenCount?: number;
  otherCharacterCount?: number;
  recentlyModifiedNoteCount?: number;
  topTags?: TagCount[];
}

export interface BrainGrowthData {
  schemaVersion: 1;
  snapshots: Snapshot[];
  lastSuccessfulScanAt: string | null;
  backgroundMode?: BackgroundMode;
  hasOpenedMiniPanel?: boolean;
  historicalGrowthInitialized?: boolean;
  historicalGrowthInitializedAt?: string;
  historicalGrowthMethod?: "creation-date-attribution";
}

export interface FileAnalysisResult {
  bodyCount: number;
  chineseBodyCount: number;
  englishWordCount: number;
  numberTokenCount: number;
  otherCharacterCount: number;
  tags: Set<string>;
  tagOccurrences: Map<string, number>;
  internalLinks: Set<string>;
  internalLinkCount: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export type SnapshotSource = "estimated" | "actual";
export type BenchmarkVersion = "second-brain-benchmark-v1";
export type ComputeClass = "Spark" | "Echo" | "Pilot" | "Architect" | "Oracle" | "Cortex";

export interface CognitiveComputeResult {
  cognitiveComputeTops: number;
  computeClass: ComputeClass;
  benchmarkVersion: BenchmarkVersion;
  neuronMass: number;
  signalStrength: number;
  engramDensity: number;
  synapseConnectivity: number;
}

export type ScanResult = Snapshot;

export type MetricKey = "noteCount" | "bodyCount" | "uniqueTagCount" | "connectionCount";
export type RangeKey = "7d" | "30d" | "90d" | "all";
export type BackgroundMode = "dark" | "light";
export type RefreshFeedback = "idle" | "updated" | "upToDate" | "failed";
export type RefreshSource =
  | "startup"
  | "dashboard-manual"
  | "mini-panel-open"
  | "markdown-open"
  | "markdown-close"
  | "vault-change";

export interface RefreshState {
  isScanning: boolean;
  feedback: RefreshFeedback;
  lastSource: RefreshSource | null;
}

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  shortLabel: string;
  colorVar: string;
}

export interface DashboardSnapshotWindow {
  snapshots: Snapshot[];
  current: Snapshot | null;
  baseline: Snapshot | null;
}

export interface BrainGrowthView {
  refresh(feedback?: RefreshFeedback): void;
}
