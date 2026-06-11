import type { App, TFile } from "obsidian";
import { withCognitiveCompute } from "./benchmark";
import { analyzeMarkdownContent } from "./contentAnalyzer";
import type { BrainGrowthData, Snapshot, TagCount } from "./types";
import { toLocalDateKey, toLocalTimestamp } from "./time";

const SHORT_NOTE_THRESHOLD = 100;
const MATURE_NOTE_THRESHOLD = 300;
const TOP_TAG_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

interface FileContribution {
  path: string;
  noteName: string;
  createdDate: string;
  bodyCount: number;
  chineseBodyCount: number;
  englishWordCount: number;
  numberTokenCount: number;
  otherCharacterCount: number;
  tagOccurrences: Map<string, number>;
  outgoingLinks: Set<string>;
  internalLinkCount: number;
}

export async function initializeHistoricalGrowth(
  app: App,
  data: BrainGrowthData,
  now: Date = new Date()
): Promise<BrainGrowthData> {
  const currentActual = getCurrentActualSnapshot(data);
  if (!currentActual || data.historicalGrowthInitialized) return data;

  const files = app.vault.getMarkdownFiles();
  if (files.length === 0) return data;

  const contributions = await readFileContributions(app, files);
  if (contributions.length === 0) return data;

  const startDate = contributions.reduce((earliest, item) =>
    item.createdDate < earliest ? item.createdDate : earliest,
    contributions[0].createdDate
  );
  const endDate = currentActual.date;
  const estimatedSnapshots = buildEstimatedSnapshots(contributions, startDate, endDate);
  const snapshots = [...estimatedSnapshots.filter((snapshot) => snapshot.date !== currentActual.date), {
    ...withCognitiveCompute(currentActual),
    source: "actual" as const
  }];

  return {
    ...data,
    snapshots: snapshots.sort((left, right) => left.date.localeCompare(right.date)),
    historicalGrowthInitialized: true,
    historicalGrowthInitializedAt: toLocalTimestamp(now),
    historicalGrowthMethod: "creation-date-attribution"
  };
}

export function canInitializeHistoricalGrowth(data: BrainGrowthData): boolean {
  if (data.historicalGrowthInitialized) return false;
  const actualSnapshots = data.snapshots.filter((snapshot) => (snapshot.source ?? "actual") === "actual");
  return actualSnapshots.length === 1;
}

async function readFileContributions(app: App, files: TFile[]): Promise<FileContribution[]> {
  const existingNoteNames = new Set(files.map((file) => normalizeNoteName(file.path)));
  const rows = await Promise.all(
    files.map(async (file) => {
      const analysis = analyzeMarkdownContent(await app.vault.cachedRead(file));
      const createdAt = getFileCreatedAt(file);
      return {
        path: file.path,
        noteName: normalizeNoteName(file.path),
        createdDate: toLocalDateKey(createdAt),
        bodyCount: analysis.bodyCount,
        chineseBodyCount: analysis.chineseBodyCount,
        englishWordCount: analysis.englishWordCount,
        numberTokenCount: analysis.numberTokenCount,
        otherCharacterCount: analysis.otherCharacterCount,
        tagOccurrences: analysis.tagOccurrences,
        outgoingLinks: new Set([...analysis.internalLinks].filter((target) => existingNoteNames.has(target))),
        internalLinkCount: analysis.internalLinkCount
      };
    })
  );

  return rows.sort((left, right) => left.createdDate.localeCompare(right.createdDate) || left.path.localeCompare(right.path));
}

function buildEstimatedSnapshots(contributions: FileContribution[], startDate: string, endDate: string): Snapshot[] {
  const snapshots: Snapshot[] = [];
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
    const date = toLocalDateKey(new Date(time));
    snapshots.push(buildSnapshotForDate(date, contributions.filter((item) => item.createdDate <= date)));
  }
  return snapshots;
}

function buildSnapshotForDate(date: string, activeFiles: FileContribution[]): Snapshot {
  const tagOccurrences = new Map<string, number>();
  const outgoingLinksByNote = new Map<string, Set<string>>();
  const incomingLinksByNote = new Map<string, Set<string>>();
  const bodyCountByNote = new Map<string, number>();
  const activeNoteNames = new Set(activeFiles.map((file) => file.noteName));
  let bodyCount = 0;
  let chineseBodyCount = 0;
  let englishWordCount = 0;
  let numberTokenCount = 0;
  let otherCharacterCount = 0;
  let internalLinkCount = 0;
  let nonEmptyNoteCount = 0;
  let matureNoteCount = 0;
  let shortNoteCount = 0;
  let taggedNoteCount = 0;
  let recentlyModifiedNoteCount = 0;

  for (const file of activeFiles) {
    bodyCountByNote.set(file.noteName, file.bodyCount);
    bodyCount += file.bodyCount;
    chineseBodyCount += file.chineseBodyCount;
    englishWordCount += file.englishWordCount;
    numberTokenCount += file.numberTokenCount;
    otherCharacterCount += file.otherCharacterCount;
    internalLinkCount += file.internalLinkCount;

    if (file.bodyCount > 0) nonEmptyNoteCount += 1;
    if (file.bodyCount > 0 && file.bodyCount < SHORT_NOTE_THRESHOLD) shortNoteCount += 1;
    if (file.bodyCount >= MATURE_NOTE_THRESHOLD) matureNoteCount += 1;
    if (file.tagOccurrences.size > 0 && file.bodyCount > 0) taggedNoteCount += 1;
    if (isCreatedWithinRecentWindow(file.createdDate, date)) recentlyModifiedNoteCount += 1;

    for (const [tag, count] of file.tagOccurrences) {
      tagOccurrences.set(tag, (tagOccurrences.get(tag) ?? 0) + count);
    }

    const outgoingLinks = new Set([...file.outgoingLinks].filter((target) => activeNoteNames.has(target)));
    outgoingLinksByNote.set(file.noteName, outgoingLinks);
    for (const target of outgoingLinks) {
      const incoming = incomingLinksByNote.get(target) ?? new Set<string>();
      incoming.add(file.noteName);
      incomingLinksByNote.set(target, incoming);
    }
  }

  const connectedNoteNames = new Set<string>();
  for (const note of activeNoteNames) {
    if ((outgoingLinksByNote.get(note)?.size ?? 0) > 0 || (incomingLinksByNote.get(note)?.size ?? 0) > 0) {
      connectedNoteNames.add(note);
    }
  }

  const connectedNoteCount = countConnectedNonEmptyNotes(bodyCountByNote, connectedNoteNames);
  const bodyTagOccurrenceCount = [...tagOccurrences.values()].reduce((total, count) => total + count, 0);
  const uniqueTagCount = tagOccurrences.size;
  const snapshot: Snapshot = {
    date,
    capturedAt: `${date}T09:00:00+08:00`,
    source: "estimated",
    noteCount: activeFiles.length,
    bodyCount,
    uniqueTagCount,
    connectionCount: internalLinkCount,
    nonEmptyNoteCount,
    matureNoteCount,
    shortNoteCount,
    connectedNoteCount,
    orphanNoteCount: Math.max(0, nonEmptyNoteCount - connectedNoteCount),
    internalLinkCount,
    bidirectionalLinkCount: countBidirectionalLinks(outgoingLinksByNote),
    linkCoverageRatio: nonEmptyNoteCount > 0 ? connectedNoteCount / nonEmptyNoteCount : 0,
    averageLinksPerNote: nonEmptyNoteCount > 0 ? internalLinkCount / nonEmptyNoteCount : 0,
    bodyTagOccurrenceCount,
    tagCoverageRatio: nonEmptyNoteCount > 0 ? taggedNoteCount / nonEmptyNoteCount : 0,
    singleUseTagCount: [...tagOccurrences.values()].filter((count) => count === 1).length,
    chineseBodyCount,
    englishWordCount,
    numberTokenCount,
    otherCharacterCount,
    recentlyModifiedNoteCount,
    topTags: getTopTags(tagOccurrences)
  };
  return withCognitiveCompute(snapshot);
}

function getCurrentActualSnapshot(data: BrainGrowthData): Snapshot | null {
  const actualSnapshots = data.snapshots.filter((snapshot) => (snapshot.source ?? "actual") === "actual");
  return actualSnapshots[actualSnapshots.length - 1] ?? null;
}

function getFileCreatedAt(file: TFile): Date {
  const stat = file.stat;
  const created = stat.ctime || stat.mtime || Date.now();
  return new Date(created);
}

function normalizeNoteName(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/i, "");
}

function parseDateKey(date: string): Date {
  return new Date(`${date}T00:00:00+08:00`);
}

function isCreatedWithinRecentWindow(createdDate: string, currentDate: string): boolean {
  const created = parseDateKey(createdDate).getTime();
  const current = parseDateKey(currentDate).getTime();
  return current >= created && current - created < 7 * DAY_MS;
}

function countConnectedNonEmptyNotes(bodyCountByNote: Map<string, number>, connectedNoteNames: Set<string>): number {
  let count = 0;
  for (const note of connectedNoteNames) {
    if ((bodyCountByNote.get(note) ?? 0) > 0) count += 1;
  }
  return count;
}

function countBidirectionalLinks(outgoingLinksByNote: Map<string, Set<string>>): number {
  let count = 0;
  const seenPairs = new Set<string>();
  for (const [source, targets] of outgoingLinksByNote) {
    for (const target of targets) {
      const pair = [source, target].sort().join("\u0000");
      if (seenPairs.has(pair)) continue;
      if (outgoingLinksByNote.get(target)?.has(source)) {
        count += 1;
        seenPairs.add(pair);
      }
    }
  }
  return count;
}

function getTopTags(tagOccurrences: Map<string, number>): TagCount[] {
  return [...tagOccurrences.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, TOP_TAG_LIMIT);
}
