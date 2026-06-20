import type { FileAnalysisResult } from "./types";

const TAG_PATTERN = /(^|[\s([{'"，。！？；：、])#([A-Za-z0-9_\-\u4e00-\u9fff]+(?:\/[A-Za-z0-9_\-\u4e00-\u9fff]+)*)/gu;
const WIKILINK_PATTERN = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?]]/g;

export function analyzeMarkdownContent(markdown: string): FileAnalysisResult {
  const bodyCandidate = prepareBodyCandidate(markdown, { preserveWikiLinks: true });
  const internalLinks = extractInternalLinks(bodyCandidate);
  const bodyWithoutLinks = removeWikiLinks(bodyCandidate);
  const frontmatterTagOccurrences = extractFrontmatterTagOccurrences(markdown);
  const tagOccurrences = mergeTagOccurrences(frontmatterTagOccurrences, extractTagOccurrences(bodyWithoutLinks));
  const tags = new Set([...extractTags(bodyWithoutLinks), ...frontmatterTagOccurrences.keys()]);
  const countable = prepareCountableText(bodyWithoutLinks);
  const bodyComposition = countBodyComposition(countable);

  return {
    bodyCount: bodyComposition.total,
    chineseBodyCount: bodyComposition.chineseBodyCount,
    englishWordCount: bodyComposition.englishWordCount,
    numberTokenCount: bodyComposition.numberTokenCount,
    otherCharacterCount: bodyComposition.otherCharacterCount,
    tags,
    tagOccurrences,
    internalLinks,
    internalLinkCount: countInternalLinks(bodyCandidate)
  };
}

export function prepareBodyCandidate(markdown: string, options: { preserveWikiLinks?: boolean } = {}): string {
  let text = markdown.replace(/\r\n?/g, "\n");
  text = removeFrontmatter(text);
  text = text.replace(/```[\s\S]*?```/g, "\n");
  text = text.replace(/~~~[\s\S]*?~~~/g, "\n");
  text = stripQuoteBlocksButKeepCallouts(text);
  text = text.replace(/!\[\[[^\]]+\]\]/g, " ");
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, " ");
  text = text.replace(/\[[^\]]+]\([^)]+\)/g, " ");
  if (!options.preserveWikiLinks) {
    text = removeWikiLinks(text);
  }
  text = text.replace(/\bhttps?:\/\/\S+/gi, " ");
  text = text.replace(/\bwww\.\S+/gi, " ");
  return text;
}

export function extractInternalLinks(text: string): Set<string> {
  const links = new Set<string>();
  for (const match of text.matchAll(WIKILINK_PATTERN)) {
    const target = normalizeInternalLinkTarget(match[1]);
    if (target) links.add(target);
  }
  return links;
}

export function countInternalLinks(text: string): number {
  return [...text.matchAll(WIKILINK_PATTERN)].length;
}

export function removeWikiLinks(text: string): string {
  return text.replace(WIKILINK_PATTERN, " ");
}

export function extractTagOccurrences(text: string): Map<string, number> {
  const occurrences = new Map<string, number>();
  for (const match of text.matchAll(TAG_PATTERN)) {
    const tag = `#${match[2]}`;
    occurrences.set(tag, (occurrences.get(tag) ?? 0) + 1);
  }
  return occurrences;
}

export function extractTags(text: string): Set<string> {
  const tags = new Set<string>();
  for (const match of text.matchAll(TAG_PATTERN)) {
    tags.add(`#${match[2]}`);
  }
  return tags;
}

export function extractFrontmatterTagOccurrences(markdown: string): Map<string, number> {
  const frontmatter = getFrontmatter(markdown.replace(/\r\n?/g, "\n"));
  const occurrences = new Map<string, number>();
  if (!frontmatter) return occurrences;

  const lines = frontmatter.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^tags:\s*(.*)$/);
    if (!match) continue;

    const inlineValue = match[1].trim();
    if (inlineValue) {
      addFrontmatterTags(occurrences, parseFrontmatterTagValues(inlineValue));
      continue;
    }

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];
      if (/^[A-Za-z0-9_-]+:\s*/.test(nextLine)) break;
      const item = nextLine.match(/^\s*-\s*(.+)$/);
      if (item) addFrontmatterTags(occurrences, parseFrontmatterTagValues(item[1]));
    }
  }

  return occurrences;
}

export function prepareCountableText(text: string): string {
  let countable = text;
  countable = countable.replace(TAG_PATTERN, " ");
  countable = countable.replace(/<[^>]+>/g, " ");
  countable = countable.replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, " ");
  countable = countable.replace(/[|]/g, " ");
  countable = countable.replace(/\[\^[^\]]+]/g, " ");
  countable = countable.replace(/^\s*>\s?\[![^\]]+]\s*/gm, " ");
  countable = countable.replace(/[*_~`>#()[\]{}:;'"“”‘’.,!?，。！？；：、]/g, " ");
  return countable;
}

export function countMixedBodyUnits(text: string): number {
  return countBodyComposition(text).total;
}

export function countBodyComposition(text: string): {
  total: number;
  chineseBodyCount: number;
  englishWordCount: number;
  numberTokenCount: number;
  otherCharacterCount: number;
} {
  const chineseBodyCount = text.match(/[\u4e00-\u9fff]/gu)?.length ?? 0;
  const withoutChinese = text.replace(/[\u4e00-\u9fff]/gu, " ");
  const englishWordCount = withoutChinese.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g)?.length ?? 0;
  const numberTokenCount = withoutChinese.match(/\d+(?:[.,]\d+)*/g)?.length ?? 0;
  return {
    total: chineseBodyCount + englishWordCount + numberTokenCount,
    chineseBodyCount,
    englishWordCount,
    numberTokenCount,
    otherCharacterCount: 0
  };
}

function getFrontmatter(text: string): string | null {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  return text.slice(4, end);
}

function removeFrontmatter(text: string): string {
  const frontmatter = getFrontmatter(text);
  if (frontmatter === null) return text;
  const end = frontmatter.length + 4;
  const afterEnd = text.indexOf("\n", end + 4);
  return afterEnd === -1 ? "" : text.slice(afterEnd + 1);
}

function parseFrontmatterTagValues(value: string): string[] {
  const trimmed = stripInlineYamlComment(value.trim());
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [trimmed];
}

function addFrontmatterTags(occurrences: Map<string, number>, values: string[]): void {
  for (const value of values) {
    const tag = normalizeFrontmatterTag(value);
    if (!tag) continue;
    occurrences.set(tag, (occurrences.get(tag) ?? 0) + 1);
  }
}

function normalizeFrontmatterTag(value: string): string {
  const unquoted = value.trim().replace(/^['"]|['"]$/g, "").trim();
  const withoutHash = unquoted.startsWith("#") ? unquoted.slice(1) : unquoted;
  if (!/^[A-Za-z0-9_\-\u4e00-\u9fff]+(?:\/[A-Za-z0-9_\-\u4e00-\u9fff]+)*$/u.test(withoutHash)) return "";
  return `#${withoutHash}`;
}

function mergeTagOccurrences(...maps: Array<Map<string, number>>): Map<string, number> {
  const merged = new Map<string, number>();
  for (const map of maps) {
    for (const [tag, count] of map) {
      merged.set(tag, (merged.get(tag) ?? 0) + count);
    }
  }
  return merged;
}

function stripInlineYamlComment(value: string): string {
  if (value.startsWith("'") || value.startsWith('"')) return value;
  return value.replace(/\s+#.*$/, "").trim();
}

function stripQuoteBlocksButKeepCallouts(text: string): string {
  const output: string[] = [];
  let inCallout = false;

  for (const line of text.split("\n")) {
    if (/^\s*>\s?\[![^\]]+]/.test(line)) {
      inCallout = true;
      output.push(line.replace(/^\s*>\s?\[![^\]]+]\s*/, ""));
      continue;
    }

    if (/^\s*>/.test(line)) {
      if (inCallout) {
        output.push(line.replace(/^\s*>\s?/, ""));
      }
      continue;
    }

    inCallout = false;
    output.push(line);
  }

  return output.join("\n");
}

function normalizeInternalLinkTarget(rawTarget: string): string {
  const trimmed = rawTarget.trim();
  if (!trimmed) return "";
  const withoutExtension = trimmed.replace(/\.md$/i, "");
  const parts = withoutExtension.split("/");
  return parts[parts.length - 1].trim();
}
