import type { App } from "obsidian";
import { withCognitiveCompute } from "./benchmark";
import { analyzeMarkdownContent } from "./contentAnalyzer";
import type { ScanResult, TagCount } from "./types";
import { toLocalDateKey, toLocalTimestamp } from "./time";

const SHORT_NOTE_THRESHOLD = 100;
const MATURE_NOTE_THRESHOLD = 300;
const RECENTLY_MODIFIED_DAYS = 7;
const TOP_TAG_LIMIT = 5;

export async function scanVault(app: App, now: Date = new Date()): Promise<ScanResult> {
  const files = app.vault.getMarkdownFiles();
  const allTags = new Set<string>();
  const tagOccurrences = new Map<string, number>();
  const outgoingLinksByNote = new Map<string, Set<string>>();
  const incomingLinksByNote = new Map<string, Set<string>>();
  const bodyCountByNote = new Map<string, number>();
  const existingNoteNames = new Set(files.map((file) => normalizeNoteName(file.path)));
  let bodyCount = 0;
  let nonEmptyNoteCount = 0;
  let matureNoteCount = 0;
  let shortNoteCount = 0;
  let internalLinkCount = 0;
  let chineseBodyCount = 0;
  let englishWordCount = 0;
  let numberTokenCount = 0;
  let otherCharacterCount = 0;
  let taggedNoteCount = 0;
  let recentlyModifiedNoteCount = 0;
  const recentCutoff = now.getTime() - RECENTLY_MODIFIED_DAYS * 24 * 60 * 60 * 1000;

  const contents = await Promise.all(
    files.map(async (file) => ({
      path: file.path,
      modifiedTime: file.stat.mtime,
      content: await app.vault.cachedRead(file)
    }))
  );

  for (const input of contents) {
    const analysis = analyzeMarkdownContent(input.content);
    const source = normalizeNoteName(input.path);
    bodyCountByNote.set(source, analysis.bodyCount);
    bodyCount += analysis.bodyCount;
    chineseBodyCount += analysis.chineseBodyCount;
    englishWordCount += analysis.englishWordCount;
    numberTokenCount += analysis.numberTokenCount;
    otherCharacterCount += analysis.otherCharacterCount;
    internalLinkCount += analysis.internalLinkCount;

    if (analysis.bodyCount > 0) nonEmptyNoteCount += 1;
    if (analysis.bodyCount > 0 && analysis.bodyCount < SHORT_NOTE_THRESHOLD) shortNoteCount += 1;
    if (analysis.bodyCount >= MATURE_NOTE_THRESHOLD) matureNoteCount += 1;
    if (analysis.tags.size > 0 && analysis.bodyCount > 0) taggedNoteCount += 1;
    if (input.modifiedTime >= recentCutoff) recentlyModifiedNoteCount += 1;

    for (const tag of analysis.tags) {
      allTags.add(tag);
    }
    for (const [tag, count] of analysis.tagOccurrences) {
      tagOccurrences.set(tag, (tagOccurrences.get(tag) ?? 0) + count);
    }

    const resolvedLinks = new Set([...analysis.internalLinks].filter((target) => existingNoteNames.has(target)));
    outgoingLinksByNote.set(source, resolvedLinks);
    for (const target of resolvedLinks) {
      const incoming = incomingLinksByNote.get(target) ?? new Set<string>();
      incoming.add(source);
      incomingLinksByNote.set(target, incoming);
    }
  }

  const connectedNoteNames = new Set<string>();
  for (const note of existingNoteNames) {
    const hasOutgoing = (outgoingLinksByNote.get(note)?.size ?? 0) > 0;
    const hasIncoming = (incomingLinksByNote.get(note)?.size ?? 0) > 0;
    if (hasOutgoing || hasIncoming) connectedNoteNames.add(note);
  }

  const connectedNonEmptyNoteCount = countConnectedNonEmptyNotes(bodyCountByNote, connectedNoteNames);
  const connectedNoteCount = connectedNonEmptyNoteCount;
  const orphanNoteCount = Math.max(0, nonEmptyNoteCount - connectedNonEmptyNoteCount);
  const bodyTagOccurrenceCount = [...tagOccurrences.values()].reduce((total, count) => total + count, 0);
  const singleUseTagCount = [...tagOccurrences.values()].filter((count) => count === 1).length;
  const bidirectionalLinkCount = countBidirectionalLinks(outgoingLinksByNote);
  return withCognitiveCompute({
    date: toLocalDateKey(now),
    capturedAt: toLocalTimestamp(now),
    source: "actual",
    noteCount: files.length,
    bodyCount,
    uniqueTagCount: allTags.size,
    connectionCount: internalLinkCount,
    nonEmptyNoteCount,
    matureNoteCount,
    shortNoteCount,
    connectedNoteCount,
    orphanNoteCount,
    internalLinkCount,
    bidirectionalLinkCount,
    linkCoverageRatio: nonEmptyNoteCount > 0 ? connectedNonEmptyNoteCount / nonEmptyNoteCount : 0,
    averageLinksPerNote: nonEmptyNoteCount > 0 ? internalLinkCount / nonEmptyNoteCount : 0,
    bodyTagOccurrenceCount,
    tagCoverageRatio: nonEmptyNoteCount > 0 ? taggedNoteCount / nonEmptyNoteCount : 0,
    singleUseTagCount,
    chineseBodyCount,
    englishWordCount,
    numberTokenCount,
    otherCharacterCount,
    recentlyModifiedNoteCount,
    topTags: getTopTags(tagOccurrences)
  });
}

function normalizeNoteName(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.md$/i, "");
}

function countBidirectionalLinks(outgoingLinksByNote: Map<string, Set<string>>): number {
  let count = 0;
  const seenPairs = new Set<string>();

  for (const [source, targets] of outgoingLinksByNote) {
    for (const target of targets) {
      const pairKey = [source, target].sort().join("\u0000");
      if (seenPairs.has(pairKey)) continue;
      if (outgoingLinksByNote.get(target)?.has(source)) {
        count += 1;
        seenPairs.add(pairKey);
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

function countConnectedNonEmptyNotes(bodyCountByNote: Map<string, number>, connectedNoteNames: Set<string>): number {
  let count = 0;
  for (const note of connectedNoteNames) {
    if ((bodyCountByNote.get(note) ?? 0) > 0) {
      count += 1;
    }
  }
  return count;
}
