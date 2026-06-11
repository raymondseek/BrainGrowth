import type { CognitiveComputeResult, ComputeClass, Snapshot } from "./types";

export const BENCHMARK_VERSION = "second-brain-benchmark-v1" as const;

const FACTOR_SCALE = 0.001;

export function calculateCognitiveCompute(snapshot: Snapshot | null | undefined): CognitiveComputeResult {
  const neuronMass = roundFactor(calculateNeuronMass(snapshot));
  const signalStrength = roundFactor(calculateSignalStrength(snapshot));
  const engramDensity = roundFactor(calculateEngramDensity(snapshot));
  const synapseConnectivity = roundFactor(calculateSynapseConnectivity(snapshot));
  const synergy = calculateSynergy(neuronMass, signalStrength, engramDensity, synapseConnectivity);
  const cognitiveComputeTops = roundTops(neuronMass + signalStrength + engramDensity + synapseConnectivity + synergy);

  return {
    cognitiveComputeTops,
    computeClass: getComputeClass(cognitiveComputeTops, {
      neuronMass,
      signalStrength,
      engramDensity,
      synapseConnectivity
    }),
    benchmarkVersion: BENCHMARK_VERSION,
    neuronMass,
    signalStrength,
    engramDensity,
    synapseConnectivity
  };
}

export function withCognitiveCompute<T extends Snapshot>(snapshot: T): T {
  const result = calculateCognitiveCompute(snapshot);
  return {
    ...snapshot,
    ...result
  };
}

export function formatTops(value: number | undefined): string {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (safeValue > 0 && safeValue < 0.001) return "0.001 TOPS";
  if (safeValue < 1) return `${safeValue.toFixed(3)} TOPS`;
  return `${safeValue.toFixed(2)} TOPS`;
}

export function formatFactor(value: number | undefined): string {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (safeValue > 0 && safeValue < 0.001) return "0.001";
  return safeValue.toFixed(3);
}

function calculateNeuronMass(snapshot: Snapshot | null | undefined): number {
  const noteCount = getNumber(snapshot?.noteCount);
  const nonEmpty = getNumber(snapshot?.nonEmptyNoteCount);
  const mature = getNumber(snapshot?.matureNoteCount);
  const short = getNumber(snapshot?.shortNoteCount);
  const recent = getNumber(snapshot?.recentlyModifiedNoteCount);
  const nonEmptyRatio = ratio(nonEmpty, noteCount);
  const matureRatio = ratio(mature, Math.max(1, nonEmpty));
  const emptyDrag = ratio(Math.max(0, noteCount - nonEmpty), Math.max(1, noteCount));

  return (
    log2p(noteCount) * 0.95 +
    log2p(nonEmpty) * 0.85 +
    log2p(mature) * 1.1 +
    log2p(recent) * 0.24 +
    nonEmptyRatio * 1.4 +
    matureRatio * 1.0 -
    Math.sqrt(short) * 0.05 -
    emptyDrag * 0.4
  ) * FACTOR_SCALE;
}

function calculateSignalStrength(snapshot: Snapshot | null | undefined): number {
  const bodyCount = getNumber(snapshot?.bodyCount);
  const chinese = getNumber(snapshot?.chineseBodyCount);
  const english = getNumber(snapshot?.englishWordCount);
  const numbers = getNumber(snapshot?.numberTokenCount);
  const other = getNumber(snapshot?.otherCharacterCount);
  const effectiveBody = softCap(bodyCount, 18000, 70);
  const composition = softCap(chinese + english + numbers + other, 18000, 60);

  return (
    log2p(effectiveBody) * 1.25 +
    log2p(composition) * 0.46 +
    log2p(chinese) * 0.18 +
    log2p(english) * 0.16 +
    log2p(numbers) * 0.1
  ) * FACTOR_SCALE;
}

function calculateEngramDensity(snapshot: Snapshot | null | undefined): number {
  const tagTypes = getNumber(snapshot?.uniqueTagCount);
  const tagOccurrences = getNumber(snapshot?.bodyTagOccurrenceCount);
  const coverage = getNumber(snapshot?.tagCoverageRatio);
  const singleUse = getNumber(snapshot?.singleUseTagCount);
  const fragmentation = ratio(singleUse, Math.max(1, tagTypes));

  return Math.max(
    0,
    (
      log2p(tagTypes) * 0.58 +
      log2p(tagOccurrences) * 0.34 +
      coverage * 2.2 -
      fragmentation * 0.45
    ) * FACTOR_SCALE
  );
}

function calculateSynapseConnectivity(snapshot: Snapshot | null | undefined): number {
  const links = getNumber(snapshot?.internalLinkCount ?? snapshot?.connectionCount);
  const bidirectional = getNumber(snapshot?.bidirectionalLinkCount);
  const coverage = getNumber(snapshot?.linkCoverageRatio);
  const averageLinks = getNumber(snapshot?.averageLinksPerNote);

  return (
    log2p(links) * 0.68 +
    log2p(bidirectional) * 0.52 +
    coverage * 3.0 +
    softCap(averageLinks, 4, 0.8) * 0.26
  ) * FACTOR_SCALE;
}

function calculateSynergy(
  neuronMass: number,
  signalStrength: number,
  engramDensity: number,
  synapseConnectivity: number
): number {
  const conceptSignal = Math.sqrt(signalStrength * engramDensity) * 0.08;
  const memoryLink = Math.sqrt(neuronMass * synapseConnectivity) * 0.1;
  const weakest = Math.min(neuronMass, signalStrength, engramDensity, synapseConnectivity);
  const strongest = Math.max(neuronMass, signalStrength, engramDensity, synapseConnectivity);
  const balance = strongest > 0 ? weakest / strongest : 0;
  return (conceptSignal + memoryLink) * (0.6 + balance * 0.4);
}

function getComputeClass(
  tops: number,
  factors: Pick<CognitiveComputeResult, "neuronMass" | "signalStrength" | "engramDensity" | "synapseConnectivity">
): ComputeClass {
  const { neuronMass, signalStrength, engramDensity, synapseConnectivity } = factors;
  if (tops >= 20 && neuronMass >= 3 && signalStrength >= 3 && engramDensity >= 2 && synapseConnectivity >= 2) {
    return "Cortex";
  }
  if (tops >= 5 && engramDensity >= 0.75 && synapseConnectivity >= 0.7) return "Oracle";
  if (tops >= 1 && engramDensity >= 0.25 && synapseConnectivity >= 0.2) return "Architect";
  if (tops >= 0.2 && synapseConnectivity >= 0.02) return "Pilot";
  if (tops >= 0.05) return "Echo";
  return "Spark";
}

function softCap(value: number, cap: number, tailScale: number): number {
  if (value <= cap) return value;
  return cap + Math.sqrt(value - cap) * tailScale;
}

function log2p(value: number): number {
  return Math.log2(1 + Math.max(0, value));
}

function ratio(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, value / total));
}

function getNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function roundFactor(value: number): number {
  return Number(Math.max(0, value).toFixed(6));
}

function roundTops(value: number): number {
  return Number(Math.max(0, value).toFixed(6));
}
