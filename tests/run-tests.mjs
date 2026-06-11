import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import esbuild from "esbuild";

const outdir = path.join(process.cwd(), ".test-build");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await esbuild.build({
  entryPoints: ["tests/testEntry.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  outfile: path.join(outdir, "testEntry.mjs")
});

const modules = await import(pathToFileURL(path.join(outdir, "testEntry.mjs")).href);
const {
  analyzeMarkdownContent,
  calculateCognitiveCompute,
  canInitializeHistoricalGrowth,
  countMixedBodyUnits,
  formatTops,
  initializeHistoricalGrowth,
  normalizeData,
  RefreshCoordinator,
  scanVault,
  selectSnapshotWindow,
  upsertSnapshot
} = modules;

test("counts mixed Chinese English and number units", () => {
  assert.equal(countMixedBodyUnits("今天整理 Obsidian plugin API 文档 3 篇"), 11);
});

test("excludes frontmatter, code blocks, quotes, links, wikilinks, embeds, and tags", () => {
  const markdown = `---
tags:
  - frontmatter
---
#正文Tag
真实内容 Alpha 12 #body/tag

\`\`\`
#code hidden 123
\`\`\`

> quoted #quote hidden

[link text #link](https://example.com)
[[Wiki Display #wiki]]
![[embedded-note]]
`;

  const result = analyzeMarkdownContent(markdown);
  assert.deepEqual([...result.tags], ["#正文Tag", "#body/tag"]);
  assert.equal(result.bodyCount, 6);
});

test("keeps table, html inner text, footnote body, and callout content", () => {
  const markdown = `| Name | Value |
| --- | --- |
| 知识 | Growth 99 |

<span>HTML 内容</span>

[^1]: footnote 正文

> [!note] 标题
> callout 正文`;

  const result = analyzeMarkdownContent(markdown);
  assert.equal(result.bodyCount, 17);
});

test("returns body composition, tag occurrences, and internal link counts", () => {
  const result = analyzeMarkdownContent("中文 Alpha 42 #tag #tag [[Target]] [[Target|Alias]]");

  assert.equal(result.chineseBodyCount, 2);
  assert.equal(result.englishWordCount, 1);
  assert.equal(result.numberTokenCount, 1);
  assert.equal(result.bodyCount, 4);
  assert.equal(result.tagOccurrences.get("#tag"), 2);
  assert.deepEqual([...result.internalLinks], ["Target"]);
  assert.equal(result.internalLinkCount, 2);
});

test("scan vault aggregates phase 3 demo metrics", async () => {
  const now = new Date("2026-06-03T12:00:00+08:00");
  const app = createMockApp([
    {
      path: "A.md",
      mtime: now.getTime(),
      content: "中文 Alpha 42 #brain #brain [[B]] [[Missing]]"
    },
    {
      path: "B.md",
      mtime: now.getTime() - 2 * 24 * 60 * 60 * 1000,
      content: "Beta content #brain [[A]]"
    },
    {
      path: "C.md",
      mtime: now.getTime(),
      content: ""
    }
  ]);

  const result = await scanVault(app, now);

  assert.equal(result.noteCount, 3);
  assert.equal(result.nonEmptyNoteCount, 2);
  assert.equal(result.shortNoteCount, 2);
  assert.equal(result.matureNoteCount, 0);
  assert.equal(result.internalLinkCount, 3);
  assert.equal(result.connectionCount, 3);
  assert.equal(result.bidirectionalLinkCount, 1);
  assert.equal(result.connectedNoteCount, 2);
  assert.equal(result.orphanNoteCount, 0);
  assert.equal(result.linkCoverageRatio, 1);
  assert.equal(result.bodyTagOccurrenceCount, 3);
  assert.equal(result.singleUseTagCount, 0);
  assert.equal(result.tagCoverageRatio, 1);
  assert.deepEqual(result.topTags, [{ tag: "#brain", count: 3 }]);
  assert.equal(result.source, "actual");
  assert.equal(result.benchmarkVersion, "second-brain-benchmark-v1");
  assert.equal(typeof result.cognitiveComputeTops, "number");
});

test("calculates conservative cognitive compute and prevents single-field explosion", () => {
  const normal = calculateCognitiveCompute({
    date: "2026-06-04",
    capturedAt: "2026-06-04T10:00:00+08:00",
    noteCount: 46,
    bodyCount: 15072,
    uniqueTagCount: 41,
    connectionCount: 15,
    nonEmptyNoteCount: 42,
    matureNoteCount: 17,
    shortNoteCount: 13,
    recentlyModifiedNoteCount: 5,
    chineseBodyCount: 10960,
    englishWordCount: 3110,
    numberTokenCount: 1002,
    otherCharacterCount: 0,
    bodyTagOccurrenceCount: 41,
    tagCoverageRatio: 0.19,
    singleUseTagCount: 41,
    internalLinkCount: 15,
    bidirectionalLinkCount: 0,
    linkCoverageRatio: 0.05,
    averageLinksPerNote: 0.36
  });
  const explodedBody = calculateCognitiveCompute({
    date: "2026-06-04",
    capturedAt: "2026-06-04T10:00:00+08:00",
    noteCount: 47,
    bodyCount: 215072,
    uniqueTagCount: 41,
    connectionCount: 15,
    nonEmptyNoteCount: 43,
    matureNoteCount: 18,
    shortNoteCount: 13,
    recentlyModifiedNoteCount: 6,
    chineseBodyCount: 210960,
    englishWordCount: 3110,
    numberTokenCount: 1002,
    otherCharacterCount: 0,
    bodyTagOccurrenceCount: 41,
    tagCoverageRatio: 0.19,
    singleUseTagCount: 41,
    internalLinkCount: 15,
    bidirectionalLinkCount: 0,
    linkCoverageRatio: 0.05,
    averageLinksPerNote: 0.36
  });

  assert.ok(normal.cognitiveComputeTops > 0);
  assert.ok(normal.cognitiveComputeTops < 0.08);
  assert.match(formatTops(normal.cognitiveComputeTops), /TOPS$/);
  assert.ok(explodedBody.cognitiveComputeTops < normal.cognitiveComputeTops + 0.08);
});

test("initializes historical growth with estimated snapshots and actual latest snapshot", async () => {
  const current = {
    date: "2026-06-04",
    capturedAt: "2026-06-04T10:00:00+08:00",
    source: "actual",
    noteCount: 2,
    bodyCount: 20,
    uniqueTagCount: 1,
    connectionCount: 1
  };
  const data = normalizeData({
    schemaVersion: 1,
    snapshots: [current],
    lastSuccessfulScanAt: current.capturedAt
  });
  const app = createMockApp([
    {
      path: "A.md",
      ctime: new Date("2026-06-01T09:00:00+08:00").getTime(),
      mtime: new Date("2026-06-01T09:00:00+08:00").getTime(),
      content: "Alpha #tag [[B]]"
    },
    {
      path: "B.md",
      ctime: new Date("2026-06-03T09:00:00+08:00").getTime(),
      mtime: new Date("2026-06-03T09:00:00+08:00").getTime(),
      content: "中文 Beta"
    }
  ]);

  assert.equal(canInitializeHistoricalGrowth(data), true);
  const initialized = await initializeHistoricalGrowth(app, data, new Date("2026-06-04T11:00:00+08:00"));

  assert.equal(initialized.historicalGrowthInitialized, true);
  assert.equal(initialized.historicalGrowthMethod, "creation-date-attribution");
  assert.deepEqual(initialized.snapshots.map((snapshot) => snapshot.date), [
    "2026-06-01",
    "2026-06-02",
    "2026-06-03",
    "2026-06-04"
  ]);
  assert.equal(initialized.snapshots[0].source, "estimated");
  assert.equal(initialized.snapshots.at(-1).source, "actual");
  assert.equal(initialized.snapshots.at(-1).noteCount, 2);
});

test("normalizes malformed stored data", () => {
  const data = normalizeData({
    schemaVersion: 99,
    snapshots: [
      { date: "2026-06-03", capturedAt: "x", noteCount: 2, bodyCount: 4, uniqueTagCount: 1 },
      { date: "bad", capturedAt: "x", noteCount: -1, bodyCount: 4, uniqueTagCount: 1 }
    ],
    lastSuccessfulScanAt: 123
  });

  assert.equal(data.schemaVersion, 1);
  assert.equal(data.snapshots.length, 1);
  assert.equal(data.lastSuccessfulScanAt, null);
});

test("replaces same-day snapshot and sorts snapshots", () => {
  const first = upsertSnapshot(normalizeData(null), {
    date: "2026-06-03",
    capturedAt: "2026-06-03T10:00:00+08:00",
    noteCount: 1,
    bodyCount: 10,
    uniqueTagCount: 1
  });
  const second = upsertSnapshot(first, {
    date: "2026-06-02",
    capturedAt: "2026-06-02T10:00:00+08:00",
    noteCount: 2,
    bodyCount: 20,
    uniqueTagCount: 2
  });
  const third = upsertSnapshot(second, {
    date: "2026-06-03",
    capturedAt: "2026-06-03T12:00:00+08:00",
    noteCount: 3,
    bodyCount: 30,
    uniqueTagCount: 3
  });

  assert.deepEqual(third.snapshots.map((snapshot) => snapshot.date), ["2026-06-02", "2026-06-03"]);
  assert.equal(third.snapshots[1].noteCount, 3);
  assert.equal(third.lastSuccessfulScanAt, "2026-06-03T12:00:00+08:00");
});

test("selects range window and growth baseline", () => {
  const snapshots = [
    { date: "2026-05-01", capturedAt: "a", noteCount: 1, bodyCount: 10, uniqueTagCount: 1 },
    { date: "2026-05-20", capturedAt: "b", noteCount: 2, bodyCount: 20, uniqueTagCount: 2 },
    { date: "2026-06-01", capturedAt: "c", noteCount: 3, bodyCount: 30, uniqueTagCount: 3 }
  ];
  const window = selectSnapshotWindow(snapshots, "30d");
  assert.equal(window.snapshots.length, 2);
  assert.equal(window.baseline.bodyCount, 20);
  assert.equal(window.current.bodyCount, 30);
});

test("refresh coordinator debounces repeated schedules", async () => {
  const harness = createCoordinatorHarness();
  harness.coordinator.schedule("vault-change");
  harness.coordinator.schedule("vault-change");
  harness.coordinator.schedule("vault-change");

  await delay(20);

  assert.equal(harness.scanCount(), 1);
  assert.equal(harness.data().snapshots.length, 1);
});

test("refresh coordinator runs one pending refresh after active scan", async () => {
  const harness = createCoordinatorHarness({ scanDelayMs: 10 });
  const firstRefresh = harness.coordinator.refresh("vault-change");
  await delay(1);
  const secondRefresh = harness.coordinator.refresh("vault-change");
  await Promise.all([firstRefresh, secondRefresh]);

  assert.equal(harness.scanCount(), 2);
});

await writeFile(path.join(outdir, "ok"), "ok");

function createCoordinatorHarness(options = {}) {
  let data = normalizeData(null);
  let count = 0;
  const coordinator = new RefreshCoordinator(
    {
      app: {},
      loadBrainGrowthData: () => data,
      saveBrainGrowthData: async (nextData) => {
        data = nextData;
      },
      notifyBrainGrowthViews: () => {}
    },
    {},
    {
      debounceMs: 5,
      scan: async () => {
        count += 1;
        if (options.scanDelayMs) await delay(options.scanDelayMs);
        return {
          date: "2026-06-03",
          capturedAt: `2026-06-03T10:00:0${count}+08:00`,
          noteCount: count,
          bodyCount: count * 10,
          uniqueTagCount: count
        };
      }
    }
  );
  return {
    coordinator,
    data: () => data,
    scanCount: () => count
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockApp(files) {
  const markdownFiles = files.map((file) => ({
    path: file.path,
    stat: {
      ctime: file.ctime ?? file.mtime,
      mtime: file.mtime
    }
  }));

  return {
    vault: {
      getMarkdownFiles: () => markdownFiles,
      cachedRead: async (file) => files.find((candidate) => candidate.path === file.path)?.content ?? ""
    }
  };
}
