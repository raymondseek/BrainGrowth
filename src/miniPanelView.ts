import { ItemView, setIcon, type WorkspaceLeaf } from "obsidian";
import { calculateCognitiveCompute, formatFactor, formatTops } from "./benchmark";
import { animateNumber } from "./numberAnimation";
import { formatNumber } from "./metrics";
import type BrainGrowthPlugin from "./main";
import type { MetricKey, RefreshFeedback, Snapshot } from "./types";

export const BRAIN_GROWTH_MINI_PANEL_VIEW_TYPE = "brain-growth-mini-panel";

interface MiniMetric {
  key: MetricKey;
  label: string;
  colorVar: string;
  format: (value: number) => string;
}

interface MiniDrilldownRow {
  label: string;
  value: number | string | undefined;
  format?: (value: number) => string;
  round?: boolean;
}

const MINI_METRICS: MiniMetric[] = [
  {
    key: "noteCount",
    label: "Total Note Count",
    colorVar: "var(--bg-note)",
    format: (value) => String(value)
  },
  {
    key: "bodyCount",
    label: "Total Body Count",
    colorVar: "var(--bg-body)",
    format: formatNumber
  },
  {
    key: "uniqueTagCount",
    label: "Total Tag Type Count",
    colorVar: "var(--bg-tag)",
    format: (value) => String(value)
  },
  {
    key: "connectionCount",
    label: "Total Internal Link Count",
    colorVar: "var(--bg-connection)",
    format: formatNumber
  }
];

export class BrainGrowthMiniPanelView extends ItemView {
  private lastValues: Partial<Record<MetricKey, number>> = {};
  private lastDrilldownValues: Partial<Record<string, number>> = {};
  private lastComputeValues: Partial<
    Record<"cognitiveComputeTops" | "neuronMass" | "signalStrength" | "engramDensity" | "synapseConnectivity", number>
  > = {};
  private hasRendered = false;
  private expandedMetrics = new Set<MetricKey>();
  private isComputeExpanded = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: BrainGrowthPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return BRAIN_GROWTH_MINI_PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Brain Growth Mini Panel";
  }

  getIcon(): string {
    return "brain-circuit";
  }

  async onOpen(): Promise<void> {
    this.render();
    await this.plugin.markMiniPanelOpened();
    this.plugin.scheduleRefresh("mini-panel-open");
  }

  refresh(_feedback?: RefreshFeedback): void {
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("brain-growth-mini-panel");

    const latest = this.getLatestSnapshot();
    const header = container.createDiv({ cls: "brain-growth-mini-header" });
    const top = header.createDiv({ cls: "brain-growth-mini-header-top" });
    const title = top.createDiv({ cls: "brain-growth-mini-title" });
    const icon = title.createSpan({ cls: "brain-growth-mini-title-icon" });
    setIcon(icon, "brain-circuit");
    title.createSpan({ text: "Brain Growth" });
    this.renderComputeButton(top, latest);
    if (this.isComputeExpanded) {
      this.renderComputeFactors(header, latest);
    }

    const rows = container.createDiv({ cls: "brain-growth-mini-rows" });
    for (const metric of MINI_METRICS) {
      this.renderMetricRow(rows, metric, latest);
    }

    const footer = container.createDiv({ cls: "brain-growth-mini-footer" });
    const openDashboard = footer.createEl("button", { text: "Open Dashboard", cls: "brain-growth-mini-open" });
    openDashboard.addEventListener("click", async () => {
      await this.plugin.openDashboard();
    });

    this.hasRendered = true;
  }

  private renderComputeButton(container: Element, latest: Snapshot | null): void {
    const compute = calculateCognitiveCompute(latest);
    const button = container.createEl("button", { cls: "brain-growth-mini-compute" });
    button.setAttr("aria-expanded", String(this.isComputeExpanded));
    button.addEventListener("click", () => {
      this.isComputeExpanded = !this.isComputeExpanded;
      this.render();
    });
    const computeValue = button.createSpan({ cls: "brain-growth-mini-compute-value" });
    this.renderAnimatedComputeNumber(computeValue, "cognitiveComputeTops", compute.cognitiveComputeTops, formatTops);
    button.createSpan({ text: compute.computeClass, cls: "brain-growth-mini-compute-class" });
    const chevron = button.createSpan({ cls: "brain-growth-mini-compute-chevron" });
    setIcon(chevron, this.isComputeExpanded ? "chevron-up" : "chevron-down");
  }

  private renderComputeFactors(container: Element, latest: Snapshot | null): void {
    const compute = calculateCognitiveCompute(latest);
    const factors = container.createDiv({ cls: "brain-growth-mini-compute-factors" });
    for (const [label, value, color] of [
      ["Neuron Mass", compute.neuronMass, "var(--bg-note)"],
      ["Signal Strength", compute.signalStrength, "var(--bg-body)"],
      ["Engram Density", compute.engramDensity, "var(--bg-tag)"],
      ["Synapse Connectivity", compute.synapseConnectivity, "var(--bg-connection)"]
    ] as const) {
      const row = factors.createDiv({ cls: "brain-growth-mini-compute-factor" });
      row.setAttr("style", `--factor-color: ${color}`);
      row.createSpan({ text: label, cls: "brain-growth-mini-compute-factor-label" });
      const valueEl = row.createSpan({ cls: "brain-growth-mini-compute-factor-value" });
      this.renderAnimatedComputeNumber(valueEl, this.getComputeFactorKey(label), value, formatFactor);
    }
  }

  private renderAnimatedComputeNumber(
    element: HTMLElement,
    key: keyof BrainGrowthMiniPanelView["lastComputeValues"],
    value: number,
    format: (value: number) => string
  ): void {
    const previous = this.lastComputeValues[key];
    if (this.hasRendered && typeof previous === "number" && previous !== value) {
      element.textContent = format(previous);
      animateNumber({ element, from: previous, to: value, format, round: false, durationMs: 760 });
    } else {
      element.textContent = format(value);
    }
    this.lastComputeValues[key] = value;
  }

  private getComputeFactorKey(
    label: "Neuron Mass" | "Signal Strength" | "Engram Density" | "Synapse Connectivity"
  ): keyof BrainGrowthMiniPanelView["lastComputeValues"] {
    if (label === "Neuron Mass") return "neuronMass";
    if (label === "Signal Strength") return "signalStrength";
    if (label === "Engram Density") return "engramDensity";
    return "synapseConnectivity";
  }

  private renderMetricRow(container: Element, metric: MiniMetric, latest: Snapshot | null): void {
    const item = container.createDiv({ cls: "brain-growth-mini-item" });
    const row = item.createEl("button", { cls: "brain-growth-mini-row" });
    row.setAttr("style", `--metric-color: ${metric.colorVar}`);
    row.setAttr("aria-expanded", String(this.expandedMetrics.has(metric.key)));
    row.addEventListener("click", () => {
      if (this.expandedMetrics.has(metric.key)) {
        this.expandedMetrics.delete(metric.key);
      } else {
        this.expandedMetrics.add(metric.key);
      }
      this.render();
    });

    row.createSpan({ text: metric.label, cls: "brain-growth-mini-label" });
    const valueWrap = row.createDiv({ cls: "brain-growth-mini-value-wrap" });
    const valueEl = valueWrap.createDiv({ cls: "brain-growth-mini-value" });
    const value = latest ? latest[metric.key] ?? 0 : 0;
    const previous = this.lastValues[metric.key];

    if (this.hasRendered && typeof previous === "number" && previous !== value) {
      valueEl.textContent = metric.format(previous);
      animateNumber({ element: valueEl, from: previous, to: value, format: metric.format });
    } else {
      valueEl.textContent = metric.format(value);
    }

    this.lastValues[metric.key] = value;
    const chevron = valueWrap.createSpan({ cls: "brain-growth-mini-row-chevron" });
    setIcon(chevron, this.expandedMetrics.has(metric.key) ? "chevron-up" : "chevron-down");

    if (this.expandedMetrics.has(metric.key)) {
      this.renderDrilldown(item, metric.key, latest);
    }
  }

  private renderDrilldown(container: Element, metric: MetricKey, latest: Snapshot | null): void {
    const drilldown = container.createDiv({ cls: "brain-growth-mini-drilldown" });
    for (const rowData of this.getDrilldownRows(metric, latest)) {
      const row = drilldown.createDiv({ cls: "brain-growth-mini-drilldown-row" });
      row.createSpan({ text: rowData.label, cls: "brain-growth-mini-drilldown-label" });
      const valueEl = row.createSpan({ cls: "brain-growth-mini-drilldown-value" });
      this.renderAnimatedDrilldownValue(valueEl, metric, rowData);
    }
  }

  private renderAnimatedDrilldownValue(element: HTMLElement, metric: MetricKey, row: MiniDrilldownRow): void {
    if (typeof row.value !== "number") {
      element.textContent = typeof row.value === "string" ? row.value : "Pending scan";
      return;
    }

    const key = `${metric}:${row.label}`;
    const previous = this.lastDrilldownValues[key];
    const format = row.format ?? formatNumber;
    if (this.hasRendered && typeof previous === "number" && previous !== row.value) {
      element.textContent = format(previous);
      animateNumber({
        element,
        from: previous,
        to: row.value,
        format,
        round: row.round ?? true,
        durationMs: 650
      });
    } else {
      element.textContent = format(row.value);
    }

    this.lastDrilldownValues[key] = row.value;
  }

  private getDrilldownRows(metric: MetricKey, latest: Snapshot | null): MiniDrilldownRow[] {
    if (!latest) return [{ label: "Status", value: "Pending scan" }];

    if (metric === "noteCount") {
      return [
        this.countDrilldownRow("Non-empty Note Count", latest.nonEmptyNoteCount),
        this.countDrilldownRow("Mature Note Count", latest.matureNoteCount),
        this.countDrilldownRow("Short Note Count", latest.shortNoteCount),
        this.countDrilldownRow("Recently Modified Note Count", latest.recentlyModifiedNoteCount)
      ];
    }

    if (metric === "bodyCount") {
      return [
        this.countDrilldownRow("Chinese Body Count", latest.chineseBodyCount),
        this.countDrilldownRow("English Word Count", latest.englishWordCount),
        this.countDrilldownRow("Number Token Count", latest.numberTokenCount),
        this.countDrilldownRow("Other Character Count", latest.otherCharacterCount)
      ];
    }

    if (metric === "uniqueTagCount") {
      return [
        this.countDrilldownRow("Body Tag Occurrence Count", latest.bodyTagOccurrenceCount),
        this.ratioDrilldownRow("Tag Coverage Ratio", latest.tagCoverageRatio),
        this.countDrilldownRow("Single-use Tag Count", latest.singleUseTagCount),
        { label: "Top 5 Tag Types", value: this.formatTopTags(latest.topTags) }
      ];
    }

    return [
      this.countDrilldownRow("Bidirectional Link Count", latest.bidirectionalLinkCount),
      this.ratioDrilldownRow("Link Coverage Ratio", latest.linkCoverageRatio),
      {
        label: "Average Links Per Note",
        value: latest.averageLinksPerNote,
        format: (value) => value.toFixed(2),
        round: false
      }
    ];
  }

  private countDrilldownRow(label: string, value: number | undefined): MiniDrilldownRow {
    return { label, value, format: formatNumber };
  }

  private ratioDrilldownRow(label: string, value: number | undefined): MiniDrilldownRow {
    return {
      label,
      value: typeof value === "number" ? value * 100 : undefined,
      format: (ratio) => `${Math.round(ratio)}%`
    };
  }

  private formatTopTags(tags: Snapshot["topTags"]): string {
    if (!tags || tags.length === 0) return "Pending scan";
    return tags.map((tag) => `${tag.tag} (${tag.count})`).join("\n");
  }

  private getLatestSnapshot(): Snapshot | null {
    const snapshots = this.plugin.getData().snapshots;
    return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  }
}
