import { activeDocument, activeWindow, ItemView, sanitizeHTMLToDom, setIcon, type WorkspaceLeaf } from "obsidian";
import { calculateCognitiveCompute, formatFactor, formatTops } from "./benchmark";
import { formatNumber, formatGrowth, getMetricDefinition, METRICS } from "./metrics";
import { getGrowth, RANGE_LABELS, selectSnapshotWindow } from "./ranges";
import { animateNumber } from "./numberAnimation";
import { formatLocalMinute } from "./time";
import type BrainGrowthPlugin from "./main";
import type { MetricKey, RangeKey, RefreshFeedback, Snapshot } from "./types";

export const BRAIN_GROWTH_VIEW_TYPE = "brain-growth-dashboard";

type SnapshotNumberKey =
  | "uniqueTagCount"
  | "connectionCount"
  | "noteCount"
  | "bodyCount"
  | "nonEmptyNoteCount"
  | "matureNoteCount"
  | "shortNoteCount"
  | "recentlyModifiedNoteCount"
  | "chineseBodyCount"
  | "englishWordCount"
  | "numberTokenCount"
  | "otherCharacterCount"
  | "singleUseTagCount"
  | "bidirectionalLinkCount";

type SnapshotRatioKey = "tagCoverageRatio" | "linkCoverageRatio";

interface TrendSeries {
  key: SnapshotNumberKey;
  label: string;
  color: string;
}

const DEFAULT_INSIGHT_TITLE = "BrainGrowth Observation Model";
const DEFAULT_INSIGHT_TEXT =
  "BrainGrowth models an Obsidian vault as an evolving second brain, translating knowledge scale, writing signal, conceptual encoding, and internal connectivity into observable growth patterns.";

const METRIC_INSIGHTS: Record<string, string> = {
  "Cognitive Compute":
    "Shows the benchmarked cognitive compute capacity of this second brain, derived from the combined growth of neurons, signals, engrams, and synapses.",
  "Compute Class":
    "Spark: early cognitive spark. Echo: reusable memory echoes. Pilot: supports navigation and action. Architect: structured knowledge system. Oracle: strong judgment support. Cortex: mature cognitive system.",
  "Neuron Mass":
    "Shows the structural scale and maturity of knowledge nodes, indicating how much memory substrate the second brain can work with.",
  "Signal Strength":
    "Shows the accumulated body content and writing signal, indicating how much thinking volume flows through the second brain.",
  "Engram Density":
    "Shows the density of conceptual labels and coverage, indicating how strongly knowledge is encoded into reusable concepts.",
  "Synapse Connectivity":
    "Shows the strength of internal links and coverage, indicating how richly knowledge nodes connect into a network.",
  "Total Note Count":
    "Shows the total number of notes in the vault, representing the overall scale of knowledge nodes.",
  "Non-empty Note Count":
    "Shows how many notes contain meaningful body content, indicating active knowledge nodes rather than empty placeholders.",
  "Mature Note Count": "Shows how many notes have reached a larger body size, indicating more developed knowledge nodes.",
  "Short Note Count":
    "Shows how many notes are still brief, indicating lightweight, early-stage, or underdeveloped knowledge nodes.",
  "Maturity Ratio": "Shows the percentage of all notes that have reached mature note size.",
  "Short-form Ratio": "Shows the percentage of all notes that are still short-form notes.",
  "Recently Modified Note Count":
    "Shows how many notes were updated recently, indicating current knowledge activity and maintenance.",
  "Total Body Count":
    "Shows the total amount of note body content, representing the accumulated writing and thinking volume.",
  "Chinese Body Count":
    "Shows the amount of Chinese body content, indicating the Chinese-language thinking and writing volume.",
  "English Word Count":
    "Shows the amount of English body words, indicating the English-language thinking and writing volume.",
  "Number Token Count":
    "Shows the amount of numeric tokens in note bodies, indicating quantitative or structured information density.",
  "Other Character Count":
    "Shows body characters not classified as Chinese, English words, or numbers, indicating remaining symbol or mixed-language content.",
  "Total Tag Type Count": "Shows the total number of unique tag types, representing the diversity of conceptual labels.",
  "Body Tag Occurrence Count":
    "Shows the total number of tag occurrences in note bodies, indicating how frequently concepts are explicitly marked.",
  "Single-use Tag Count":
    "Shows how many tag types appear only once, indicating rare, isolated, or newly emerging conceptual labels.",
  "Tag Coverage Ratio":
    "Shows the percentage of notes that contain at least one tag, indicating how broadly the vault is conceptually classified.",
  "Top 5 Tag Types": "Shows the five most frequently used tag types, indicating the dominant conceptual clusters in the vault.",
  "Total Internal Link Count":
    "Shows the total number of internal links between notes, representing the overall volume of knowledge connections.",
  "Bidirectional Link Count":
    "Shows how many internal links are reciprocated by a reverse link, indicating stronger two-way knowledge relationships.",
  "Link Coverage Ratio":
    "Shows the percentage of notes that contain at least one internal link, indicating how broadly notes participate in the knowledge network.",
  "Average Links Per Note":
    "Shows the average number of internal links per note, indicating the typical connection density of each knowledge node."
};

const NEURON_TREND_SERIES: TrendSeries[] = [
  { key: "noteCount", label: "Total Note Count", color: "var(--bg-note)" },
  { key: "nonEmptyNoteCount", label: "Non-empty Note Count", color: "#5f84a8" },
  { key: "matureNoteCount", label: "Mature Note Count", color: "#9b6aa8" },
  { key: "shortNoteCount", label: "Short Note Count", color: "#a88f56" },
  { key: "recentlyModifiedNoteCount", label: "Recently Modified Note Count", color: "#4f9890" }
];

const SIGNAL_TREND_SERIES: TrendSeries[] = [
  { key: "bodyCount", label: "Total Body Count", color: "#5f84a8" },
  { key: "chineseBodyCount", label: "Chinese Body Count", color: "#9b6aa8" },
  { key: "englishWordCount", label: "English Word Count", color: "#a88f56" },
  { key: "numberTokenCount", label: "Number Token Count", color: "#4f9890" },
  { key: "otherCharacterCount", label: "Other Character Count", color: "#517892" }
];

const SIGNAL_COMPOSITION_SERIES: TrendSeries[] = SIGNAL_TREND_SERIES.slice(1);

const ENGRAM_COUNT_TREND_SERIES: TrendSeries[] = [
  { key: "uniqueTagCount", label: "Total Tag Type Count", color: "#5f84a8" },
  { key: "singleUseTagCount", label: "Single-use Tag Count", color: "#a88f56" }
];

const ENGRAM_RATIO_SERIES = {
  key: "tagCoverageRatio" as SnapshotRatioKey,
  label: "Tag Coverage Ratio",
  color: "#9b6aa8"
};

const SYNAPSE_COUNT_TREND_SERIES: TrendSeries[] = [
  { key: "connectionCount", label: "Total Internal Link Count", color: "#5f84a8" },
  { key: "bidirectionalLinkCount", label: "Bidirectional Link Count", color: "#4f9890" }
];

const SYNAPSE_RATIO_SERIES = {
  key: "linkCoverageRatio" as SnapshotRatioKey,
  label: "Link Coverage Ratio",
  color: "#9b6aa8"
};

const METRIC_ICONS: Record<MetricKey, string> = {
  noteCount: "brain",
  bodyCount: "activity",
  uniqueTagCount: "badge",
  connectionCount: "waypoints"
};

export class BrainGrowthDashboardView extends ItemView {
  private activeMetric: MetricKey = "noteCount";
  private activeRange: RangeKey = "all";
  private feedback: RefreshFeedback = "idle";
  private lastMetricValues: Partial<Record<MetricKey, number>> = {};
  private lastComputeValues: Partial<
    Record<"cognitiveComputeTops" | "neuronMass" | "signalStrength" | "engramDensity" | "synapseConnectivity", number>
  > = {};
  private hasRenderedMetrics = false;
  private hasRenderedCompute = false;
  private lastChartAnimationKey: string | null = null;
  private shouldAnimateNextChart = false;
  private insightTitleEl: HTMLElement | null = null;
  private insightTextEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: BrainGrowthPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return BRAIN_GROWTH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Brain Growth";
  }

  getIcon(): string {
    return "brain-circuit";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  refresh(feedback: RefreshFeedback = this.feedback): void {
    this.feedback = feedback;
    this.render();
  }

  private render(options: { preserveScroll?: boolean } = {}): void {
    const container = this.containerEl.children[1];
    const previousScrollPositions =
      options.preserveScroll && container instanceof activeWindow.HTMLElement ? this.captureScrollPositions(container) : [];
    container.empty();
    container.addClass("brain-growth-view");
    const backgroundMode = this.plugin.getBackgroundMode();
    container.toggleClass("is-background-light", backgroundMode === "light");
    container.toggleClass("is-background-dark", backgroundMode === "dark");
    this.containerEl.toggleClass("is-brain-growth-light", backgroundMode === "light");
    this.containerEl.toggleClass("is-brain-growth-dark", backgroundMode === "dark");

    const data = this.plugin.getData();
    const snapshots = data.snapshots;
    const snapshotWindow = selectSnapshotWindow(snapshots, this.activeRange);
    const compute = calculateCognitiveCompute(snapshotWindow.current);
    container.addClass(`is-compute-${compute.computeClass.toLowerCase()}`);

    this.renderHeader(container, data.lastSuccessfulScanAt);
    this.renderCognitiveCompute(container, snapshotWindow.current, compute);
    this.renderMetrics(container, snapshotWindow.current);
    this.renderChart(container, snapshotWindow.snapshots);
    this.renderSummary(container, snapshotWindow);
    this.renderMetricInsight(container);
    this.bindRenderedHighlightTargets(container);

    if (previousScrollPositions.length > 0) {
      this.restoreScrollPositions(previousScrollPositions);
    }
  }

  private captureScrollPositions(container: HTMLElement): Array<{ element: HTMLElement; top: number; left: number }> {
    const candidates: HTMLElement[] = [container, this.containerEl];
    const viewContent = this.containerEl.closest(".workspace-leaf-content")?.querySelector(".view-content");
    if (viewContent instanceof activeWindow.HTMLElement) {
      candidates.push(viewContent);
    }

    let current: HTMLElement | null = container.parentElement;
    while (current && current !== activeDocument.body) {
      candidates.push(current);
      current = current.parentElement;
    }

    return Array.from(new Set(candidates))
      .filter((element) => element.scrollTop > 0 || element.scrollLeft > 0 || element.scrollHeight > element.clientHeight)
      .map((element) => ({ element, top: element.scrollTop, left: element.scrollLeft }));
  }

  private restoreScrollPositions(positions: Array<{ element: HTMLElement; top: number; left: number }>): void {
    const restore = () => {
      for (const position of positions) {
        position.element.scrollTop = position.top;
        position.element.scrollLeft = position.left;
      }
    };

    activeWindow.requestAnimationFrame(restore);
    activeWindow.setTimeout(restore, 0);
    activeWindow.setTimeout(restore, 60);
  }

  private renderHeader(container: Element, lastSuccessfulScanAt: string | null): void {
    const header = container.createDiv({ cls: "brain-growth-header" });
    const titleWrap = header.createDiv({ cls: "brain-growth-title-wrap" });
    const title = titleWrap.createEl("h1", { cls: "brain-growth-title" });
    const titleIcon = title.createSpan({ cls: "brain-growth-title-icon" });
    setIcon(titleIcon, "brain-circuit");
    const titleCluster = title.createSpan({ cls: "brain-growth-title-cluster" });
    titleCluster.createSpan({ text: "Brain Growth", cls: "brain-growth-title-main" });
    const vaultSubtitle = titleCluster.createSpan({ cls: "brain-growth-title-vault" });
    vaultSubtitle.createSpan({ text: this.plugin.getVaultName(), cls: "brain-growth-title-vault-name" });
    titleWrap.createDiv({
      text: this.plugin.isScanning()
        ? `${formatLocalMinute(lastSuccessfulScanAt)} - Updating...`
        : formatLocalMinute(lastSuccessfulScanAt),
      cls: "brain-growth-last-updated"
    });
    titleWrap.createDiv({ text: this.getFeedbackText(), cls: "brain-growth-feedback" });

    const actions = header.createDiv({ cls: "brain-growth-actions" });
    const isMiniPanelOpen = this.plugin.isMiniPanelOpen();
    const miniPanel = actions.createEl("button", {
      cls: "brain-growth-mini-panel-action",
      attr: {
        "aria-label": isMiniPanelOpen ? "Close Mini Panel" : "Open Mini Panel",
        title: isMiniPanelOpen ? "Close Mini Panel" : "Open Mini Panel"
      }
    });
    miniPanel.toggleClass("is-active", isMiniPanelOpen);
    setIcon(miniPanel, isMiniPanelOpen ? "panel-right-close" : "panel-right-open");
    miniPanel.createSpan({ text: "Mini Panel" });
    miniPanel.addEventListener("click", async () => {
      await this.plugin.toggleMiniPanel();
    });

    const backgroundMode = this.plugin.getBackgroundMode();
    const backgroundToggle = actions.createEl("button", {
      cls: "brain-growth-background-toggle",
      attr: {
        "aria-label": backgroundMode === "light" ? "Switch to dark background" : "Switch to light background",
        title: backgroundMode === "light" ? "Switch to dark background" : "Switch to light background"
      }
    });
    backgroundToggle.toggleClass("is-light", backgroundMode === "light");
    backgroundToggle.toggleClass("is-dark", backgroundMode === "dark");
    const darkSegment = backgroundToggle.createSpan({ cls: "brain-growth-background-segment is-dark" });
    const darkIcon = darkSegment.createSpan({ cls: "brain-growth-background-segment-icon" });
    setIcon(darkIcon, "moon");
    darkSegment.toggleClass("is-active", backgroundMode === "dark");
    const lightSegment = backgroundToggle.createSpan({ cls: "brain-growth-background-segment is-light" });
    const lightIcon = lightSegment.createSpan({ cls: "brain-growth-background-segment-icon" });
    setIcon(lightIcon, "sun");
    lightSegment.toggleClass("is-active", backgroundMode === "light");
    backgroundToggle.addEventListener("click", async () => {
      await this.plugin.toggleBackgroundMode();
    });

    const refresh = actions.createEl("button", {
      cls: "brain-growth-refresh",
      attr: { "aria-label": "Refresh stats", title: "Refresh stats" }
    });
    setIcon(refresh, "refresh-cw");
    refresh.toggleClass("is-loading", this.plugin.isScanning());
    refresh.disabled = this.plugin.isScanning();
    refresh.addEventListener("click", async () => {
      await this.plugin.refreshStats("dashboard-manual");
    });
  }

  private renderCognitiveCompute(container: Element, current: Snapshot | null, compute = calculateCognitiveCompute(current)): void {
    const panel = container.createDiv({ cls: "brain-growth-compute-panel" });
    panel.addClass(`is-${compute.computeClass.toLowerCase()}`);

    const left = panel.createDiv({ cls: "brain-growth-compute-primary" });
    this.bindMetricInsight(left, "Cognitive Compute");
    left.createDiv({ cls: "brain-growth-compute-texture" });
    left.createDiv({ text: "Cognitive Compute", cls: "brain-growth-compute-label" });
    const computeValue = left.createDiv({ cls: "brain-growth-compute-value" });
    this.renderAnimatedComputeNumber(computeValue, "cognitiveComputeTops", compute.cognitiveComputeTops, formatTops);
    left.createDiv({ text: "The Second Brain Benchmark", cls: "brain-growth-compute-subtitle" });

    const classRow = left.createDiv({ cls: "brain-growth-compute-class-row" });
    classRow.createSpan({ text: "Compute Class", cls: "brain-growth-compute-class-label" });
    classRow.createSpan({ text: compute.computeClass, cls: "brain-growth-compute-class-value" });
    const help = classRow.createEl("button", {
      cls: "brain-growth-compute-help",
      attr: { "aria-label": "Show compute classes", title: "Show compute classes" }
    });
    setIcon(help, "circle-help");
    this.bindMetricInsight(help, "Compute Class");

    const factors = panel.createDiv({ cls: "brain-growth-compute-factors" });
    for (const factor of [
      ["Neuron Mass", compute.neuronMass, "var(--bg-note)", "brain"],
      ["Signal Strength", compute.signalStrength, "var(--bg-body)", "activity"],
      ["Engram Density", compute.engramDensity, "var(--bg-tag)", "badge"],
      ["Synapse Connectivity", compute.synapseConnectivity, "var(--bg-connection)", "waypoints"]
    ] as const) {
      const item = factors.createDiv({ cls: "brain-growth-compute-factor" });
      item.setAttr("style", `--factor-color: ${factor[2]}`);
      this.bindMetricInsight(item, factor[0]);
      const icon = item.createSpan({ cls: "brain-growth-compute-factor-icon" });
      setIcon(icon, factor[3]);
      const text = item.createDiv({ cls: "brain-growth-compute-factor-text" });
      text.createDiv({ text: factor[0], cls: "brain-growth-compute-factor-label" });
      const value = text.createDiv({ cls: "brain-growth-compute-factor-value" });
      this.renderAnimatedComputeNumber(value, this.getComputeFactorKey(factor[0]), factor[1], formatFactor);
    }

    this.hasRenderedCompute = true;
  }

  private renderAnimatedComputeNumber(
    element: HTMLElement,
    key: keyof BrainGrowthDashboardView["lastComputeValues"],
    value: number,
    format: (value: number) => string
  ): void {
    const previous = this.lastComputeValues[key];
    if (this.hasRenderedCompute && typeof previous === "number" && previous !== value) {
      element.textContent = format(previous);
      animateNumber({ element, from: previous, to: value, format, round: false, durationMs: 760 });
    } else {
      element.textContent = format(value);
    }
    this.lastComputeValues[key] = value;
  }

  private getComputeFactorKey(
    label: "Neuron Mass" | "Signal Strength" | "Engram Density" | "Synapse Connectivity"
  ): keyof BrainGrowthDashboardView["lastComputeValues"] {
    if (label === "Neuron Mass") return "neuronMass";
    if (label === "Signal Strength") return "signalStrength";
    if (label === "Engram Density") return "engramDensity";
    return "synapseConnectivity";
  }

  private renderMetrics(container: Element, current: Snapshot | null): void {
    const metrics = container.createDiv({ cls: "brain-growth-metrics" });

    for (const metric of METRICS) {
      const card = metrics.createEl("button", { cls: "brain-growth-card" });
      card.setAttr("style", `--metric-color: ${metric.colorVar}`);
      card.toggleClass("is-active", this.activeMetric === metric.key);
      this.bindMetricInsight(card, metric.label);
      card.addEventListener("click", () => {
        this.activeMetric = metric.key;
        this.feedback = "idle";
        this.shouldAnimateNextChart = true;
        this.render({ preserveScroll: true });
      });

      const cardHead = card.createDiv({ cls: "brain-growth-card-head" });
      const cardIcon = cardHead.createSpan({ cls: "brain-growth-card-icon" });
      setIcon(cardIcon, METRIC_ICONS[metric.key]);
      cardHead.createDiv({ text: this.getMetricFamilyName(metric.key), cls: "brain-growth-card-family" });
      card.createDiv({ text: metric.label, cls: "brain-growth-card-label" });
      const value = current ? current[metric.key] ?? 0 : 0;
      const valueEl = card.createDiv({ cls: "brain-growth-card-value" });
      const previous = this.lastMetricValues[metric.key];

      if (this.hasRenderedMetrics && typeof previous === "number" && previous !== value) {
        valueEl.textContent = formatNumber(previous);
        animateNumber({ element: valueEl, from: previous, to: value, format: formatNumber });
      } else {
        valueEl.textContent = formatNumber(value);
      }

      this.lastMetricValues[metric.key] = value;
    }

    this.hasRenderedMetrics = true;
  }

  private renderChart(container: Element, snapshots: Snapshot[]): void {
    const panel = container.createDiv({ cls: "brain-growth-panel" });

    const head = panel.createDiv({ cls: "brain-growth-chart-head" });
    const metric = getMetricDefinition(this.activeMetric);
    const headMain = head.createDiv({ cls: "brain-growth-chart-head-main" });
    headMain.createDiv({
      text: this.activeMetric === "noteCount" ? "Neurons Growth Trend" : `${metric.label} Growth Trend`,
      cls: "brain-growth-chart-title"
    });
    this.renderChartLegend(headMain);
    this.renderRangeSelector(head);

    const chart = panel.createDiv({ cls: "brain-growth-chart" });
    if (this.plugin.getData().snapshots.length === 0) {
      this.renderEmpty(chart, "No snapshots yet", "Run your first scan to start tracking your Obsidian growth.");
      return;
    }
    if (snapshots.length < 2) {
      this.renderEmpty(chart, "First snapshot captured", "Your growth trend will appear after more daily snapshots.");
      return;
    }

    const chartAnimationKey = this.getChartAnimationKey(snapshots);
    const shouldAnimateChart = this.lastChartAnimationKey === null || this.shouldAnimateNextChart;
    if (!shouldAnimateChart) {
      panel.addClass("is-chart-static");
    }
    this.lastChartAnimationKey = chartAnimationKey;
    this.shouldAnimateNextChart = false;

    if (this.activeMetric === "noteCount") {
      const latest = snapshots[snapshots.length - 1];
      panel.addClass("is-neuron-trend-panel");
      const comboChart = chart.createDiv({ cls: "brain-growth-combo-chart" });
      const comboLine = comboChart.createDiv({ cls: "brain-growth-combo-line" });
      this.appendMarkup(comboLine, this.buildMultiLineSvgChart(snapshots, NEURON_TREND_SERIES, this.activeRange));
      const comboSide = comboChart.createDiv({ cls: "brain-growth-combo-side" });
      if (latest) this.appendMarkup(comboSide, this.buildNoteCompositionPanel(latest));
    } else if (this.activeMetric === "bodyCount") {
      this.appendMarkup(chart, this.buildSignalsChart(snapshots, this.activeRange));
    } else if (this.activeMetric === "uniqueTagCount") {
      this.appendMarkup(chart, this.buildEngramChart(snapshots, this.activeRange));
    } else if (this.activeMetric === "connectionCount") {
      this.appendMarkup(chart, this.buildSynapsesChart(snapshots, this.activeRange));
    } else {
      this.appendMarkup(chart, this.buildSvgChart(snapshots, this.activeMetric, metric.colorVar, this.activeRange));
    }
  }

  private appendMarkup(container: Element, markup: string): void {
    container.appendChild(sanitizeHTMLToDom(markup));
  }

  private getChartAnimationKey(snapshots: Snapshot[]): string {
    const snapshotKey = snapshots
      .map((snapshot) =>
        [
          snapshot.date,
          snapshot.capturedAt,
          snapshot.noteCount,
          snapshot.nonEmptyNoteCount ?? "",
          snapshot.matureNoteCount ?? "",
          snapshot.shortNoteCount ?? "",
          snapshot.recentlyModifiedNoteCount ?? "",
          snapshot.bodyCount,
          snapshot.chineseBodyCount ?? "",
          snapshot.englishWordCount ?? "",
          snapshot.numberTokenCount ?? "",
          snapshot.otherCharacterCount ?? "",
          snapshot.uniqueTagCount,
          snapshot.singleUseTagCount ?? "",
          snapshot.tagCoverageRatio ?? "",
          snapshot.connectionCount ?? "",
          snapshot.bidirectionalLinkCount ?? "",
          snapshot.linkCoverageRatio ?? "",
          snapshot.averageLinksPerNote ?? ""
        ].join(":")
      )
      .join("|");
    return `${this.activeMetric}:${this.activeRange}:${snapshotKey}`;
  }

  private renderRangeSelector(container: Element): void {
    const rangeKeys = Object.keys(RANGE_LABELS) as RangeKey[];
    const range = container.createDiv({ cls: "brain-growth-range brain-growth-chart-range" });
    range.setAttr("data-active-index", String(Math.max(0, rangeKeys.indexOf(this.activeRange))));
    for (const key of rangeKeys) {
      const button = range.createEl("button", { text: RANGE_LABELS[key] });
      button.toggleClass("is-active", this.activeRange === key);
      button.addEventListener("click", () => {
        this.activeRange = key;
        this.feedback = "idle";
        this.shouldAnimateNextChart = true;
        this.render({ preserveScroll: true });
      });
    }
  }

  private renderChartLegend(container: Element): void {
    const legend = container.createDiv({ cls: "brain-growth-chart-legend" });
    for (const item of this.getActiveLegendItems()) {
      const legendItem = legend.createDiv({ cls: "brain-growth-chart-legend-item" });
      legendItem.setAttr("style", `--legend-color: ${item.color}`);
      this.bindMetricInsight(legendItem, item.label);
      legendItem.createSpan({ cls: "brain-growth-chart-legend-dot" });
      legendItem.createSpan({ text: item.label });
    }
  }

  private getActiveLegendItems(): Array<{ label: string; color: string }> {
    if (this.activeMetric === "noteCount") {
      return NEURON_TREND_SERIES.map(({ label, color }) => ({ label, color }));
    }
    if (this.activeMetric === "bodyCount") {
      return SIGNAL_TREND_SERIES.map(({ label, color }) => ({ label, color }));
    }
    if (this.activeMetric === "uniqueTagCount") {
      return [
        ...ENGRAM_COUNT_TREND_SERIES.map(({ label, color }) => ({ label, color })),
        { label: ENGRAM_RATIO_SERIES.label, color: ENGRAM_RATIO_SERIES.color },
        { label: "Top 5 Tag Types", color: "var(--bg-tag)" }
      ];
    }
    return [
      ...SYNAPSE_COUNT_TREND_SERIES.map(({ label, color }) => ({ label, color })),
      { label: SYNAPSE_RATIO_SERIES.label, color: SYNAPSE_RATIO_SERIES.color },
      { label: "Average Links Per Note", color: "#a88f56" }
    ];
  }

  private renderSummary(container: Element, window: ReturnType<typeof selectSnapshotWindow>): void {
    const panel = container.createDiv({ cls: "brain-growth-panel" });
    panel.createDiv({ text: "Growth Summary", cls: "brain-growth-summary-title" });

    if (!window.current) {
      panel.createDiv({
        text: "Run your first scan to start tracking your Obsidian growth.",
        cls: "brain-growth-summary-text"
      });
      return;
    }

    if (window.snapshots.length < 2) {
      panel.createDiv({
        text: "Try a longer range or capture more daily snapshots.",
        cls: "brain-growth-summary-text"
      });
    }

    const grid = panel.createDiv({ cls: "brain-growth-summary-grid" });
    if (this.activeMetric === "noteCount") {
      for (const series of NEURON_TREND_SERIES) {
        const item = grid.createDiv({ cls: "brain-growth-summary-item" });
        item.setAttr("style", `--metric-color: ${series.color}`);
        this.bindMetricInsight(item, series.label);
        item.createDiv({ text: series.label, cls: "brain-growth-summary-text" });
        item.createDiv({
          text: formatGrowth(this.getSnapshotNumberGrowth(window, series.key)),
          cls: "brain-growth-summary-value"
        });
      }
      return;
    }

    if (this.activeMetric === "bodyCount") {
      for (const series of SIGNAL_TREND_SERIES) {
        const item = grid.createDiv({ cls: "brain-growth-summary-item" });
        item.setAttr("style", `--metric-color: ${series.color}`);
        this.bindMetricInsight(item, series.label);
        item.createDiv({ text: series.label, cls: "brain-growth-summary-text" });
        item.createDiv({
          text: formatGrowth(this.getSnapshotNumberGrowth(window, series.key)),
          cls: "brain-growth-summary-value"
        });
      }
      return;
    }

    if (this.activeMetric === "uniqueTagCount") {
      for (const series of ENGRAM_COUNT_TREND_SERIES) {
        const item = grid.createDiv({ cls: "brain-growth-summary-item" });
        item.setAttr("style", `--metric-color: ${series.color}`);
        this.bindMetricInsight(item, series.label);
        item.createDiv({ text: series.label, cls: "brain-growth-summary-text" });
        item.createDiv({
          text: formatGrowth(this.getSnapshotNumberGrowth(window, series.key)),
          cls: "brain-growth-summary-value"
        });
      }

      const ratioItem = grid.createDiv({ cls: "brain-growth-summary-item" });
      ratioItem.setAttr("style", `--metric-color: ${ENGRAM_RATIO_SERIES.color}`);
      this.bindMetricInsight(ratioItem, ENGRAM_RATIO_SERIES.label);
      ratioItem.createDiv({ text: ENGRAM_RATIO_SERIES.label, cls: "brain-growth-summary-text" });
      ratioItem.createDiv({
        text: this.formatRatioGrowth(window, ENGRAM_RATIO_SERIES.key),
        cls: "brain-growth-summary-value"
      });
      return;
    }

    if (this.activeMetric === "connectionCount") {
      for (const series of SYNAPSE_COUNT_TREND_SERIES) {
        const item = grid.createDiv({ cls: "brain-growth-summary-item" });
        item.setAttr("style", `--metric-color: ${series.color}`);
        this.bindMetricInsight(item, series.label);
        item.createDiv({ text: series.label, cls: "brain-growth-summary-text" });
        item.createDiv({
          text: formatGrowth(this.getSnapshotNumberGrowth(window, series.key)),
          cls: "brain-growth-summary-value"
        });
      }

      const ratioItem = grid.createDiv({ cls: "brain-growth-summary-item" });
      ratioItem.setAttr("style", `--metric-color: ${SYNAPSE_RATIO_SERIES.color}`);
      this.bindMetricInsight(ratioItem, SYNAPSE_RATIO_SERIES.label);
      ratioItem.createDiv({ text: SYNAPSE_RATIO_SERIES.label, cls: "brain-growth-summary-text" });
      ratioItem.createDiv({
        text: this.formatRatioGrowth(window, SYNAPSE_RATIO_SERIES.key),
        cls: "brain-growth-summary-value"
      });

      const averageItem = grid.createDiv({ cls: "brain-growth-summary-item" });
      averageItem.setAttr("style", "--metric-color: #a88f56");
      this.bindMetricInsight(averageItem, "Average Links Per Note");
      averageItem.createDiv({ text: "Average Links Per Note", cls: "brain-growth-summary-text" });
      averageItem.createDiv({
        text: this.formatAverageGrowth(window, "averageLinksPerNote"),
        cls: "brain-growth-summary-value"
      });
      return;
    }

    for (const metric of METRICS) {
      const item = grid.createDiv({ cls: "brain-growth-summary-item" });
      item.setAttr("style", `--metric-color: ${metric.colorVar}`);
      this.bindMetricInsight(item, metric.label);
      item.createDiv({ text: metric.shortLabel, cls: "brain-growth-summary-text" });
      item.createDiv({
        text: formatGrowth(getGrowth(window, metric.key)),
        cls: "brain-growth-summary-value"
      });
    }
  }

  private renderEmpty(container: Element, title: string, text: string): void {
    const empty = container.createDiv({ cls: "brain-growth-empty" });
    empty.createDiv({ text: title, cls: "brain-growth-empty-title" });
    empty.createDiv({ text, cls: "brain-growth-empty-text" });
  }

  private renderMetricInsight(container: Element): void {
    const panel = container.createDiv({ cls: "brain-growth-insight-panel" });
    const title = panel.createDiv({ cls: "brain-growth-insight-title" });
    const icon = title.createSpan({ cls: "brain-growth-insight-icon" });
    setIcon(icon, "lightbulb");
    this.insightTitleEl = title.createSpan({ cls: "brain-growth-insight-title-text" });
    if (this.plugin.canInitializeHistoricalGrowth()) {
      const action = title.createEl("button", { text: "Initialize Historical Growth", cls: "brain-growth-init-action" });
      action.addEventListener("click", async () => {
        action.disabled = true;
        action.textContent = "Initializing...";
        await this.plugin.initializeHistoricalGrowth();
      });
    }
    this.insightTextEl = panel.createDiv({ cls: "brain-growth-insight-text" });
    this.resetMetricInsight();
  }

  private bindMetricInsight(element: HTMLElement, label: string): void {
    element.addClass("brain-growth-insight-trigger");
    element.addClass("brain-growth-highlight-target");
    element.setAttr("data-metric-label", label);
    element.setAttr("tabindex", "0");
    element.addEventListener("mouseenter", () => this.activateMetricInsight(label));
    element.addEventListener("focus", () => this.activateMetricInsight(label));
    element.addEventListener("mouseleave", () => this.resetMetricInsight());
    element.addEventListener("blur", () => this.resetMetricInsight());
  }

  private bindRenderedHighlightTargets(container: Element): void {
    container.querySelectorAll(".brain-growth-highlight-target:not(.brain-growth-insight-trigger)").forEach((target) => {
      const label = target.getAttribute("data-metric-label");
      if (!label) return;
      target.addEventListener("mouseenter", () => this.activateMetricInsight(label));
      target.addEventListener("focus", () => this.activateMetricInsight(label));
      target.addEventListener("mouseleave", () => this.resetMetricInsight());
      target.addEventListener("blur", () => this.resetMetricInsight());
      target.setAttribute("tabindex", "0");
    });
  }

  private activateMetricInsight(label: string): void {
    this.setMetricInsight(label);
    this.applyMetricHighlight(label);
  }

  private setMetricInsight(label: string): void {
    if (!this.insightTitleEl || !this.insightTextEl) return;
    this.insightTitleEl.textContent = label;
    this.insightTextEl.textContent = METRIC_INSIGHTS[label] ?? "";
  }

  private resetMetricInsight(): void {
    if (!this.insightTitleEl || !this.insightTextEl) return;
    this.insightTitleEl.textContent = DEFAULT_INSIGHT_TITLE;
    this.insightTextEl.textContent = DEFAULT_INSIGHT_TEXT;
    this.clearMetricHighlight();
  }

  private applyMetricHighlight(label: string): void {
    const root = this.containerEl.children[1];
    if (!(root instanceof activeWindow.HTMLElement)) return;
    root.addClass("is-metric-highlight-active");
    root.querySelectorAll(".brain-growth-highlight-target").forEach((target) => {
      const isMatch = target.getAttribute("data-metric-label") === label;
      target.classList.toggle("is-highlight", isMatch);
      target.classList.toggle("is-dim", !isMatch);
    });
  }

  private clearMetricHighlight(): void {
    const root = this.containerEl.children[1];
    if (!(root instanceof activeWindow.HTMLElement)) return;
    root.removeClass("is-metric-highlight-active");
    root.querySelectorAll(".brain-growth-highlight-target").forEach((target) => {
      target.classList.remove("is-highlight", "is-dim");
    });
  }

  private buildSvgChart(snapshots: Snapshot[], metric: MetricKey, color: string, range: RangeKey): string {
    const width = 900;
    const height = 260;
    const paddingLeft = 48;
    const paddingRight = 24;
    const paddingTop = 20;
    const paddingBottom = 44;
    const values = snapshots.map((snapshot) => snapshot[metric] ?? 0);
    const max = Math.max(...values);
    const yMax = Math.max(1, max);
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    const xAxisY = height - paddingBottom;
    const points = snapshots.map((snapshot, index) => {
      const x = paddingLeft + (index / Math.max(1, snapshots.length - 1)) * chartWidth;
      const value = snapshot[metric] ?? 0;
      const y = xAxisY - (value / yMax) * chartHeight;
      return { x, y, value };
    });
    const last = points[points.length - 1];
    const highest = points.reduce((currentHighest, point) =>
      point.value >= currentHighest.value ? point : currentHighest
    );
    const visualPoints = this.smoothVisualPoints(points);
    const path = this.buildSmoothPath(visualPoints);
    const areaPath = this.buildAreaPath(visualPoints, xAxisY);
    const xTicks = this.buildXAxisTicks(snapshots, points, range, xAxisY);
    const gradientId = `brain-growth-area-${metric}`;

    return `
      <svg class="brain-growth-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${getMetricDefinition(metric).label} growth trend">
        <defs>
          ${this.buildAreaGradient(gradientId, color)}
        </defs>
        <line class="brain-growth-chart-axis" x1="${paddingLeft}" y1="${xAxisY}" x2="${width - paddingRight}" y2="${xAxisY}" />
        <line class="brain-growth-chart-axis" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${xAxisY}" />
        ${xTicks}
        <line class="brain-growth-chart-guide" x1="${paddingLeft}" y1="${highest.y.toFixed(1)}" x2="${highest.x.toFixed(1)}" y2="${highest.y.toFixed(1)}" />
        <path class="brain-growth-chart-area brain-growth-highlight-target" data-metric-label="${this.escapeAttribute(getMetricDefinition(metric).label)}" d="${areaPath}" fill="url(#${gradientId})" />
        <path class="brain-growth-chart-line brain-growth-highlight-target" data-metric-label="${this.escapeAttribute(getMetricDefinition(metric).label)}" d="${path}" pathLength="1" fill="none" stroke="${color}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
        <circle class="brain-growth-chart-point brain-growth-highlight-target" data-metric-label="${this.escapeAttribute(getMetricDefinition(metric).label)}" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="5" fill="${color}" />
        <text class="brain-growth-chart-label" x="${paddingLeft - 10}" y="${highest.y.toFixed(1)}" text-anchor="end" dominant-baseline="middle">${formatNumber(max)}</text>
        <text class="brain-growth-chart-label" x="${paddingLeft - 10}" y="${xAxisY}" text-anchor="end" dominant-baseline="middle">0</text>
      </svg>
    `;
  }

  private buildMultiLineSvgChart(snapshots: Snapshot[], series: TrendSeries[], range: RangeKey): string {
    const width = 900;
    const height = 260;
    const paddingLeft = 48;
    const paddingRight = 24;
    const paddingTop = 20;
    const paddingBottom = 44;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    const xAxisY = height - paddingBottom;
    const allValues = snapshots.flatMap((snapshot) => series.map((item) => this.getSnapshotNumber(snapshot, item.key)));
    const max = Math.max(...allValues, 0);
    const yMax = Math.max(1, max);
    const xTicks = this.buildXAxisTicks(
      snapshots,
      snapshots.map((snapshot, index) => ({
        x: paddingLeft + (index / Math.max(1, snapshots.length - 1)) * chartWidth,
        y: xAxisY,
        value: this.getSnapshotNumber(snapshot, "noteCount")
      })),
      range,
      xAxisY
    );

    const paths = series
      .map((item, seriesIndex) => {
        const points = snapshots.map((snapshot, index) => {
          const value = this.getSnapshotNumber(snapshot, item.key);
          const x = paddingLeft + (index / Math.max(1, snapshots.length - 1)) * chartWidth;
          const y = xAxisY - (value / yMax) * chartHeight;
          return { x, y };
        });
        const last = points[points.length - 1];
        const label = this.escapeAttribute(item.label);
        const visualPoints = this.smoothVisualPoints(points);
        const gradientId = `brain-growth-area-${this.sanitizeSvgId(item.key)}-${seriesIndex}`;
        return `
          <path class="brain-growth-chart-area brain-growth-highlight-target" data-metric-label="${label}" d="${this.buildAreaPath(visualPoints, xAxisY)}" fill="url(#${gradientId})" />
          <path class="brain-growth-chart-line brain-growth-highlight-target brain-growth-chart-line-${seriesIndex}" data-metric-label="${label}" d="${this.buildSmoothPath(visualPoints)}" pathLength="1" fill="none" stroke="${item.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          <circle class="brain-growth-chart-point brain-growth-highlight-target" data-metric-label="${label}" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.6" fill="${item.color}" />
        `;
      })
      .join("");
    const gradients = series
      .map((item, seriesIndex) =>
        this.buildAreaGradient(`brain-growth-area-${this.sanitizeSvgId(item.key)}-${seriesIndex}`, item.color)
      )
      .join("");

    return `
      <svg class="brain-growth-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Neurons growth trend">
        <defs>
          ${gradients}
        </defs>
        <line class="brain-growth-chart-axis brain-growth-chart-axis-engraved" x1="${paddingLeft}" y1="${xAxisY}" x2="${width - paddingRight}" y2="${xAxisY}" />
        <line class="brain-growth-chart-axis brain-growth-chart-axis-engraved" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${xAxisY}" />
        ${xTicks}
        ${paths}
        <text class="brain-growth-chart-label" x="${paddingLeft - 10}" y="${paddingTop}" text-anchor="end" dominant-baseline="middle">${formatNumber(max)}</text>
        <text class="brain-growth-chart-label" x="${paddingLeft - 10}" y="${xAxisY}" text-anchor="end" dominant-baseline="middle">0</text>
      </svg>
    `;
  }

  private buildSignalsChart(snapshots: Snapshot[], range: RangeKey): string {
    const latest = snapshots[snapshots.length - 1];
    return `
      <div class="brain-growth-combo-chart brain-growth-signals-chart">
        <div class="brain-growth-combo-line">
          ${this.buildMultiLineSvgChart(snapshots, SIGNAL_TREND_SERIES, range)}
        </div>
        <div class="brain-growth-combo-pie brain-growth-signals-pie">
          ${latest ? this.buildPieChart(latest, SIGNAL_COMPOSITION_SERIES, "Signals Current Composition") : ""}
        </div>
      </div>
    `;
  }

  private buildEngramChart(snapshots: Snapshot[], range: RangeKey): string {
    const latest = snapshots[snapshots.length - 1];
    return `
      <div class="brain-growth-combo-chart">
        <div class="brain-growth-combo-line">
          ${this.buildDualAxisSvgChart(snapshots, ENGRAM_COUNT_TREND_SERIES, ENGRAM_RATIO_SERIES, range)}
        </div>
        <div class="brain-growth-combo-tags">
          ${latest ? this.buildTopTagsPanel(latest) : ""}
        </div>
      </div>
    `;
  }

  private buildSynapsesChart(snapshots: Snapshot[], range: RangeKey): string {
    const latest = snapshots[snapshots.length - 1];
    return `
      <div class="brain-growth-combo-chart">
        <div class="brain-growth-combo-line">
          ${this.buildDualAxisSvgChart(snapshots, SYNAPSE_COUNT_TREND_SERIES, SYNAPSE_RATIO_SERIES, range, "Synapses growth trend")}
        </div>
        <div class="brain-growth-combo-tags">
          ${latest ? this.buildNetworkStrengthPanel(latest) : ""}
        </div>
      </div>
    `;
  }

  private buildNoteCompositionPanel(snapshot: Snapshot): string {
    const total = Math.max(0, snapshot.noteCount ?? 0);
    const maturityRatio = total > 0 ? (snapshot.matureNoteCount ?? 0) / total : 0;
    const shortFormRatio = total > 0 ? (snapshot.shortNoteCount ?? 0) / total : 0;

    return `
      <div class="brain-growth-tags-panel brain-growth-note-composition-panel">
        <div class="brain-growth-tags-title">Note Composition</div>
        ${this.buildNoteRatioRow("Maturity Ratio", maturityRatio, "#9b6aa8")}
        ${this.buildNoteRatioRow("Short-form Ratio", shortFormRatio, "#a88f56")}
      </div>
    `;
  }

  private buildNoteRatioRow(label: string, ratio: number, color: string): string {
    const width = Math.min(100, Math.max(0, ratio * 100));
    return `
      <div class="brain-growth-note-ratio brain-growth-highlight-target" data-metric-label="${this.escapeAttribute(label)}">
        <div class="brain-growth-phase3-ratio-head">
          <span class="brain-growth-phase3-label">${label}</span>
          <span class="brain-growth-phase3-value">${this.formatRatio(ratio)}</span>
        </div>
        <div class="brain-growth-phase3-ratio-track">
          <div class="brain-growth-phase3-ratio-fill brain-growth-highlight-target" data-metric-label="${this.escapeAttribute(label)}" style="--bar-color: ${color}; --bar-width: ${width}%"></div>
        </div>
      </div>
    `;
  }

  private buildDualAxisSvgChart(
    snapshots: Snapshot[],
    countSeries: TrendSeries[],
    ratioSeries: { key: SnapshotRatioKey; label: string; color: string },
    range: RangeKey,
    ariaLabel = "Engram growth trend"
  ): string {
    const width = 900;
    const height = 260;
    const paddingLeft = 48;
    const paddingRight = 52;
    const paddingTop = 20;
    const paddingBottom = 44;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    const xAxisY = height - paddingBottom;
    const allCountValues = snapshots.flatMap((snapshot) => countSeries.map((item) => this.getSnapshotNumber(snapshot, item.key)));
    const countMax = Math.max(...allCountValues, 0);
    const countYMax = Math.max(1, countMax);
    const ratioMax = 1;
    const pointsForTicks = snapshots.map((snapshot, index) => ({
      x: paddingLeft + (index / Math.max(1, snapshots.length - 1)) * chartWidth,
      y: xAxisY,
      value: this.getSnapshotNumber(snapshot, "uniqueTagCount")
    }));
    const xTicks = this.buildXAxisTicks(snapshots, pointsForTicks, range, xAxisY);

    const countPaths = countSeries
      .map((item, seriesIndex) => {
        const points = snapshots.map((snapshot, index) => {
          const value = this.getSnapshotNumber(snapshot, item.key);
          const x = paddingLeft + (index / Math.max(1, snapshots.length - 1)) * chartWidth;
          const y = xAxisY - (value / countYMax) * chartHeight;
          return { x, y };
        });
        const last = points[points.length - 1];
        const label = this.escapeAttribute(item.label);
        const visualPoints = this.smoothVisualPoints(points);
        const gradientId = `brain-growth-area-${this.sanitizeSvgId(item.key)}-${seriesIndex}`;
        return `
          <path class="brain-growth-chart-area brain-growth-highlight-target" data-metric-label="${label}" d="${this.buildAreaPath(visualPoints, xAxisY)}" fill="url(#${gradientId})" />
          <path class="brain-growth-chart-line brain-growth-highlight-target brain-growth-chart-line-${seriesIndex}" data-metric-label="${label}" d="${this.buildSmoothPath(visualPoints)}" pathLength="1" fill="none" stroke="${item.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          <circle class="brain-growth-chart-point brain-growth-highlight-target" data-metric-label="${label}" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.6" fill="${item.color}" />
        `;
      })
      .join("");
    const gradients = [
      ...countSeries.map((item, seriesIndex) =>
        this.buildAreaGradient(`brain-growth-area-${this.sanitizeSvgId(item.key)}-${seriesIndex}`, item.color)
      ),
      this.buildAreaGradient(`brain-growth-area-${this.sanitizeSvgId(ratioSeries.key)}`, ratioSeries.color)
    ].join("");

    const ratioPoints = snapshots.map((snapshot, index) => {
      const value = this.getSnapshotRatio(snapshot, ratioSeries.key);
      const x = paddingLeft + (index / Math.max(1, snapshots.length - 1)) * chartWidth;
      const y = xAxisY - (value / ratioMax) * chartHeight;
      return { x, y };
    });
    const ratioLast = ratioPoints[ratioPoints.length - 1];
    const ratioVisualPoints = this.smoothVisualPoints(ratioPoints);
    const ratioGradientId = `brain-growth-area-${this.sanitizeSvgId(ratioSeries.key)}`;

    return `
      <svg class="brain-growth-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}">
        <defs>
          ${gradients}
        </defs>
        <line class="brain-growth-chart-axis brain-growth-chart-axis-engraved" x1="${paddingLeft}" y1="${xAxisY}" x2="${width - paddingRight}" y2="${xAxisY}" />
        <line class="brain-growth-chart-axis brain-growth-chart-axis-engraved" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${xAxisY}" />
        <line class="brain-growth-chart-axis brain-growth-chart-axis-engraved" x1="${width - paddingRight}" y1="${paddingTop}" x2="${width - paddingRight}" y2="${xAxisY}" />
        ${xTicks}
        ${countPaths}
        <path class="brain-growth-chart-area brain-growth-highlight-target" data-metric-label="${this.escapeAttribute(ratioSeries.label)}" d="${this.buildAreaPath(ratioVisualPoints, xAxisY)}" fill="url(#${ratioGradientId})" />
        <path class="brain-growth-chart-line brain-growth-chart-line-ratio brain-growth-highlight-target" data-metric-label="${this.escapeAttribute(ratioSeries.label)}" d="${this.buildSmoothPath(ratioVisualPoints)}" fill="none" stroke="${ratioSeries.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        <circle class="brain-growth-chart-point brain-growth-highlight-target" data-metric-label="${this.escapeAttribute(ratioSeries.label)}" cx="${ratioLast.x.toFixed(1)}" cy="${ratioLast.y.toFixed(1)}" r="3.6" fill="${ratioSeries.color}" />
        <text class="brain-growth-chart-label" x="${paddingLeft - 10}" y="${paddingTop}" text-anchor="end" dominant-baseline="middle">${formatNumber(countMax)}</text>
        <text class="brain-growth-chart-label" x="${paddingLeft - 10}" y="${xAxisY}" text-anchor="end" dominant-baseline="middle">0</text>
        <text class="brain-growth-chart-label" x="${width - paddingRight + 10}" y="${paddingTop}" text-anchor="start" dominant-baseline="middle">100%</text>
        <text class="brain-growth-chart-label" x="${width - paddingRight + 10}" y="${xAxisY}" text-anchor="start" dominant-baseline="middle">0%</text>
      </svg>
    `;
  }

  private buildTopTagsPanel(snapshot: Snapshot): string {
    const tags = this.getSortedTopTags(snapshot.topTags);
    const label = this.escapeAttribute("Top 5 Tag Types");
    if (tags.length === 0) {
      return `<div class="brain-growth-tags-panel brain-growth-highlight-target" data-metric-label="${label}"><div class="brain-growth-tags-title">Top 5 Tag Types</div><div class="brain-growth-summary-text">Pending scan</div></div>`;
    }

    const max = Math.max(...tags.map((tag) => tag.count), 1);
    const rows = tags
      .map(
        (tag, index) => `
          <div class="brain-growth-tags-row brain-growth-highlight-target" data-metric-label="${label}" style="--tag-color: ${this.getTagColor(index)}">
            <div class="brain-growth-tags-label tag">${this.escapeHtml(tag.tag)}</div>
            <div class="brain-growth-tags-track">
              <div class="brain-growth-tags-fill" style="--bar-width: ${(tag.count / max) * 100}%"></div>
            </div>
            <div class="brain-growth-tags-value">${formatNumber(tag.count)}</div>
          </div>
        `
      )
      .join("");

    return `
      <div class="brain-growth-tags-panel">
        <div class="brain-growth-tags-title brain-growth-highlight-target" data-metric-label="${label}">Top 5 Tag Types</div>
        ${rows}
      </div>
    `;
  }

  private getTagColor(index: number): string {
    return ["#7fb7b2", "#8fa8d9", "#a38ac0", "#9aa86f", "#c0a16f"][index % 5];
  }

  private buildNetworkStrengthPanel(snapshot: Snapshot): string {
    const coverage = snapshot.linkCoverageRatio ?? 0;
    return `
      <div class="brain-growth-tags-panel brain-growth-network-panel">
        <div class="brain-growth-tags-title">Network Strength</div>
        <div class="brain-growth-network-ratio brain-growth-highlight-target" data-metric-label="${this.escapeAttribute("Link Coverage Ratio")}">
          <div class="brain-growth-phase3-ratio-head">
            <span class="brain-growth-phase3-label">Link Coverage Ratio</span>
            <span class="brain-growth-phase3-value">${this.formatRatio(snapshot.linkCoverageRatio)}</span>
          </div>
          <div class="brain-growth-phase3-ratio-track">
            <div class="brain-growth-phase3-ratio-fill brain-growth-highlight-target" data-metric-label="${this.escapeAttribute("Link Coverage Ratio")}" style="--bar-color: ${SYNAPSE_RATIO_SERIES.color}; --bar-width: ${Math.min(100, Math.max(0, coverage * 100))}%"></div>
          </div>
        </div>
        <div class="brain-growth-network-card">
          <div class="brain-growth-phase3-label">Average Links Per Note</div>
          <div class="brain-growth-network-value brain-growth-highlight-target" data-metric-label="${this.escapeAttribute("Average Links Per Note")}">${this.formatDecimal(snapshot.averageLinksPerNote)}</div>
        </div>
      </div>
    `;
  }

  private buildPieChart(snapshot: Snapshot, series: TrendSeries[], label: string): string {
    const radius = 76;
    const circumference = 2 * Math.PI * radius;
    const values = series.map((item) => Math.max(0, this.getSnapshotNumber(snapshot, item.key)));
    const total = values.reduce((sum, value) => sum + value, 0);
    let offset = 0;
    const circles = series
      .map((item, index) => {
        const value = values[index];
        const dash = total > 0 ? (value / total) * circumference : 0;
        const circle = `
          <circle
            class="brain-growth-pie-segment brain-growth-highlight-target"
            data-metric-label="${this.escapeAttribute(item.label)}"
            cx="100"
            cy="100"
            r="${radius}"
            fill="none"
            stroke="${item.color}"
            stroke-width="32"
            stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"
            stroke-dashoffset="${(-offset).toFixed(2)}"
            transform="rotate(-90 100 100)"
          />`;
        offset += dash;
        return circle;
      })
      .join("");

    return `
      <svg viewBox="0 0 200 200" role="img" aria-label="${label}">
        <circle cx="100" cy="100" r="${radius}" fill="none" stroke="color-mix(in srgb, var(--text-muted) 14%, transparent)" stroke-width="32" />
        ${circles}
        <circle class="brain-growth-pie-center" cx="100" cy="100" r="48" />
        <text class="brain-growth-pie-label" x="100" y="96" text-anchor="middle">Current</text>
        <text class="brain-growth-pie-value brain-growth-highlight-target" data-metric-label="${this.escapeAttribute("Total Body Count")}" x="100" y="116" text-anchor="middle">${formatNumber(total)}</text>
      </svg>
    `;
  }

  private buildXAxisTicks(
    snapshots: Snapshot[],
    points: Array<{ x: number; y: number; value: number }>,
    range: RangeKey,
    xAxisY: number
  ): string {
    const tickCount = range === "7d" ? 3 : range === "all" ? 5 : 4;
    const indexes = this.pickTickIndexes(snapshots.length, tickCount);

    return indexes
      .map((index) => {
        const point = points[index];
        const snapshot = snapshots[index];
        const anchor = index === 0 ? "start" : index === snapshots.length - 1 ? "end" : "middle";
        return `
          <line class="brain-growth-chart-tick" x1="${point.x.toFixed(1)}" y1="${xAxisY}" x2="${point.x.toFixed(1)}" y2="${(xAxisY + 5).toFixed(1)}" />
          <text class="brain-growth-chart-x-label" x="${point.x.toFixed(1)}" y="${(xAxisY + 22).toFixed(1)}" text-anchor="${anchor}">${this.formatXAxisDate(snapshot.date, range)}</text>
        `;
      })
      .join("");
  }

  private pickTickIndexes(length: number, count: number): number[] {
    if (length <= 1) return [0];
    const indexes = new Set<number>();
    for (let tick = 0; tick < count; tick += 1) {
      indexes.add(Math.round((tick / Math.max(1, count - 1)) * (length - 1)));
    }
    return [...indexes].sort((left, right) => left - right);
  }

  private formatXAxisDate(date: string, range: RangeKey): string {
    const [year, month, day] = date.split("-");
    if (range === "all") return `${year}-${month}`;
    return `${month}-${day}`;
  }

  private buildSmoothPath(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    if (points.length === 2) {
      return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
    }

    const commands = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const middleX = (current.x + next.x) / 2;

      commands.push(
        `C ${middleX.toFixed(1)} ${current.y.toFixed(1)}, ${middleX.toFixed(1)} ${next.y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`
      );
    }

    return commands.join(" ");
  }

  private buildAreaPath(points: Array<{ x: number; y: number }>, baselineY: number): string {
    if (points.length === 0) return "";
    const linePath = this.buildSmoothPath(points);
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePath} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
  }

  private buildAreaGradient(id: string, color: string): string {
    return `
      <linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.12" />
        <stop offset="46%" stop-color="${color}" stop-opacity="0.055" />
        <stop offset="100%" stop-color="${color}" stop-opacity="0" />
      </linearGradient>
    `;
  }

  private sanitizeSvgId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  private smoothVisualPoints<T extends { x: number; y: number }>(points: T[]): T[] {
    if (points.length < 5) return points;
    const radius = points.length > 90 ? 3 : 2;
    return points.map((point, index) => {
      if (index === 0 || index === points.length - 1) return point;
      const from = Math.max(0, index - radius);
      const to = Math.min(points.length - 1, index + radius);
      let weightedY = 0;
      let weightTotal = 0;
      for (let cursor = from; cursor <= to; cursor += 1) {
        const distance = Math.abs(cursor - index);
        const weight = radius + 1 - distance;
        weightedY += points[cursor].y * weight;
        weightTotal += weight;
      }
      return { ...point, y: weightedY / weightTotal };
    });
  }

  private getSnapshotNumber(snapshot: Snapshot, key: SnapshotNumberKey): number {
    return snapshot[key] ?? 0;
  }

  private getSnapshotRatio(snapshot: Snapshot, key: SnapshotRatioKey): number {
    return snapshot[key] ?? 0;
  }

  private getSnapshotAverageLinks(snapshot: Snapshot): number {
    return snapshot.averageLinksPerNote ?? 0;
  }

  private getSnapshotNumberGrowth(window: ReturnType<typeof selectSnapshotWindow>, key: SnapshotNumberKey): number {
    if (!window.current || !window.baseline) return 0;
    return this.getSnapshotNumber(window.current, key) - this.getSnapshotNumber(window.baseline, key);
  }

  private getSnapshotRatioGrowth(window: ReturnType<typeof selectSnapshotWindow>, key: SnapshotRatioKey): number {
    if (!window.current || !window.baseline) return 0;
    return this.getSnapshotRatio(window.current, key) - this.getSnapshotRatio(window.baseline, key);
  }

  private renderPhase3Metrics(container: Element, current: Snapshot | null): void {
    const panel = container.createDiv({ cls: "brain-growth-panel brain-growth-phase3-panel" });
    const head = panel.createDiv({ cls: "brain-growth-chart-head" });
    head.createDiv({ text: `${this.getMetricFamilyName(this.activeMetric)} Drilldown`, cls: "brain-growth-chart-title" });
    head.createDiv({ text: getMetricDefinition(this.activeMetric).label, cls: "brain-growth-summary-text" });

    if (!current) {
      panel.createDiv({
        text: "Run a scan to collect Phase 3 metrics.",
        cls: "brain-growth-summary-text"
      });
      return;
    }

    const sections = panel.createDiv({ cls: "brain-growth-phase3-grid brain-growth-phase3-grid-single" });
    if (this.activeMetric === "noteCount") {
      this.renderNeuronsSection(sections, current);
      return;
    }
    if (this.activeMetric === "bodyCount") {
      this.renderSignalsSection(sections, current);
      return;
    }
    if (this.activeMetric === "uniqueTagCount") {
      this.renderEngramSection(sections, current);
      return;
    }
    this.renderSynapsesSection(sections, current);
  }

  private renderNeuronsSection(container: Element, current: Snapshot): void {
    const section = this.createPhase3Section(container, "Neurons", "Note maturity and activity");
    this.renderMetricRows(section, [
      ["Non-empty Note Count", current.nonEmptyNoteCount],
      ["Mature Note Count", current.matureNoteCount],
      ["Short Note Count", current.shortNoteCount],
      ["Recently Modified Note Count", current.recentlyModifiedNoteCount]
    ]);
    this.renderBarSet(section, [
      { label: "Non-empty", value: current.nonEmptyNoteCount, total: current.noteCount, color: "var(--bg-note)" },
      { label: "Mature", value: current.matureNoteCount, total: current.noteCount, color: "var(--bg-note)" },
      { label: "Short", value: current.shortNoteCount, total: current.noteCount, color: "var(--bg-note)" }
    ]);
  }

  private renderSignalsSection(container: Element, current: Snapshot): void {
    const section = this.createPhase3Section(container, "Signals", "Body composition");
    this.renderCompositionBar(section, [
      { label: "Chinese Body Count", value: current.chineseBodyCount, color: "var(--bg-body)" },
      { label: "English Word Count", value: current.englishWordCount, color: "#61b58d" },
      { label: "Number Token Count", value: current.numberTokenCount, color: "#9bd2b7" },
      { label: "Other Character Count", value: current.otherCharacterCount, color: "var(--text-muted)" }
    ]);
    this.renderMetricRows(section, [
      ["Chinese Body Count", current.chineseBodyCount],
      ["English Word Count", current.englishWordCount],
      ["Number Token Count", current.numberTokenCount],
      ["Other Character Count", current.otherCharacterCount]
    ]);
  }

  private renderEngramSection(container: Element, current: Snapshot): void {
    const section = this.createPhase3Section(container, "Engram", "Tag coverage and structure");
    this.renderRatioBar(section, "Tag Coverage Ratio", current.tagCoverageRatio, "var(--bg-tag)");
    this.renderMetricRows(section, [
      ["Body Tag Occurrence Count", current.bodyTagOccurrenceCount],
      ["Single-use Tag Count", current.singleUseTagCount]
    ]);
    this.renderTopTags(section, current.topTags);
  }

  private renderSynapsesSection(container: Element, current: Snapshot): void {
    const section = this.createPhase3Section(container, "Synapses", "Graph connection summary");
    this.renderRatioBar(section, "Link Coverage Ratio", current.linkCoverageRatio, "var(--bg-connection)");
    this.renderMetricRows(section, [
      ["Total Internal Link Count", current.internalLinkCount],
      ["Bidirectional Link Count", current.bidirectionalLinkCount],
      ["Average Links Per Note", this.formatDecimal(current.averageLinksPerNote)]
    ]);
  }

  private createPhase3Section(container: Element, title: string, subtitle: string): HTMLElement {
    const section = container.createDiv({ cls: "brain-growth-phase3-section" });
    const head = section.createDiv({ cls: "brain-growth-phase3-section-head" });
    head.createDiv({ text: title, cls: "brain-growth-phase3-title" });
    head.createDiv({ text: subtitle, cls: "brain-growth-phase3-subtitle" });
    return section;
  }

  private renderMetricRows(container: Element, rows: Array<[string, number | string | undefined]>): void {
    const list = container.createDiv({ cls: "brain-growth-phase3-rows" });
    for (const [label, value] of rows) {
      const row = list.createDiv({ cls: "brain-growth-phase3-row" });
      row.createSpan({ text: label, cls: "brain-growth-phase3-label" });
      row.createSpan({ text: this.formatPhase3Value(value), cls: "brain-growth-phase3-value" });
    }
  }

  private renderCompositionBar(
    container: Element,
    items: Array<{ label: string; value: number | undefined; color: string }>
  ): void {
    const total = items.reduce((sum, item) => sum + (item.value ?? 0), 0);
    const wrap = container.createDiv({ cls: "brain-growth-phase3-composition" });
    const bar = wrap.createDiv({ cls: "brain-growth-phase3-stacked-bar" });

    for (const item of items) {
      const value = item.value ?? 0;
      if (value <= 0 || total <= 0) continue;
      const segment = bar.createDiv({ cls: "brain-growth-phase3-stacked-segment" });
      segment.setAttr("style", `--segment-color: ${item.color}; --segment-width: ${(value / total) * 100}%`);
      segment.setAttr("title", `${item.label}: ${formatNumber(value)}`);
    }
  }

  private renderBarSet(
    container: Element,
    items: Array<{ label: string; value: number | undefined; total: number | undefined; color: string }>
  ): void {
    const bars = container.createDiv({ cls: "brain-growth-phase3-bars" });
    for (const item of items) {
      const value = item.value ?? 0;
      const total = Math.max(1, item.total ?? 0);
      const row = bars.createDiv({ cls: "brain-growth-phase3-bar-row" });
      row.createDiv({ text: item.label, cls: "brain-growth-phase3-bar-label" });
      const track = row.createDiv({ cls: "brain-growth-phase3-bar-track" });
      const fill = track.createDiv({ cls: "brain-growth-phase3-bar-fill" });
      fill.setAttr("style", `--bar-color: ${item.color}; --bar-width: ${Math.min(100, (value / total) * 100)}%`);
      row.createDiv({ text: formatNumber(value), cls: "brain-growth-phase3-bar-value" });
    }
  }

  private renderRatioBar(container: Element, label: string, value: number | undefined, color: string): void {
    const ratio = typeof value === "number" ? value : 0;
    const row = container.createDiv({ cls: "brain-growth-phase3-ratio" });
    const head = row.createDiv({ cls: "brain-growth-phase3-ratio-head" });
    head.createSpan({ text: label, cls: "brain-growth-phase3-label" });
    head.createSpan({ text: this.formatRatio(value), cls: "brain-growth-phase3-value" });
    const track = row.createDiv({ cls: "brain-growth-phase3-ratio-track" });
    const fill = track.createDiv({ cls: "brain-growth-phase3-ratio-fill" });
    fill.setAttr("style", `--bar-color: ${color}; --bar-width: ${Math.min(100, Math.max(0, ratio * 100))}%`);
  }

  private renderTopTags(container: Element, tags: Snapshot["topTags"]): void {
    const list = container.createDiv({ cls: "brain-growth-phase3-ranking" });
    list.createDiv({ text: "Top Tag Types", cls: "brain-growth-phase3-ranking-title" });

    if (!tags || tags.length === 0) {
      list.createDiv({ text: "Pending scan", cls: "brain-growth-summary-text" });
      return;
    }

    const max = Math.max(...tags.map((tag) => tag.count), 1);
    for (const tag of tags) {
      const row = list.createDiv({ cls: "brain-growth-phase3-rank-row" });
      row.createDiv({ text: tag.tag, cls: "brain-growth-phase3-rank-label" });
      const track = row.createDiv({ cls: "brain-growth-phase3-rank-track" });
      const fill = track.createDiv({ cls: "brain-growth-phase3-rank-fill" });
      fill.setAttr("style", `--bar-width: ${(tag.count / max) * 100}%`);
      row.createDiv({ text: formatNumber(tag.count), cls: "brain-growth-phase3-rank-value" });
    }
  }

  private formatPhase3Value(value: number | string | undefined): string {
    if (typeof value === "string") return value;
    if (typeof value === "number") return formatNumber(value);
    return "Pending scan";
  }

  private formatRatio(value: number | undefined): string | undefined {
    if (typeof value !== "number") return undefined;
    return `${Math.round(value * 100)}%`;
  }

  private formatDecimal(value: number | undefined): string | undefined {
    if (typeof value !== "number") return undefined;
    return value.toFixed(2);
  }

  private formatTopTags(tags: Snapshot["topTags"]): string | undefined {
    if (!tags || tags.length === 0) return undefined;
    return tags.map((tag) => `${tag.tag} (${tag.count})`).join(", ");
  }

  private formatRatioGrowth(window: ReturnType<typeof selectSnapshotWindow>, key: SnapshotRatioKey): string {
    const value = this.getSnapshotRatioGrowth(window, key);
    const sign = value > 0 ? "+" : "";
    return `${sign}${Math.round(value * 100)}% in range`;
  }

  private formatAverageGrowth(window: ReturnType<typeof selectSnapshotWindow>, key: "averageLinksPerNote"): string {
    if (!window.current || !window.baseline) return "+0.00 in range";
    const value = this.getSnapshotAverageLinks(window.current) - this.getSnapshotAverageLinks(window.baseline);
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)} in range`;
  }

  private getSortedTopTags(tags: Snapshot["topTags"]): NonNullable<Snapshot["topTags"]> {
    if (!tags) return [];
    return [...tags]
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
      .slice(0, 5);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value);
  }

  private getMetricFamilyName(metric: MetricKey): string {
    if (metric === "noteCount") return "Neurons";
    if (metric === "bodyCount") return "Signals";
    if (metric === "uniqueTagCount") return "Engram";
    return "Synapses";
  }

  private getFeedbackText(): string {
    if (this.feedback === "updated") return "Updated just now";
    if (this.feedback === "upToDate") return "Already up to date";
    if (this.feedback === "failed") return "Scan failed. Previous stats are still shown. You can refresh later.";
    return "";
  }
}
