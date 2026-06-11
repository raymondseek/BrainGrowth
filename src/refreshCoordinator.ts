import type { App, Plugin } from "obsidian";
import { scanVault as defaultScanVault } from "./scanner";
import { upsertSnapshot } from "./snapshotStore";
import type { BrainGrowthData, RefreshFeedback, RefreshSource, RefreshState } from "./types";

export interface RefreshCoordinatorHost {
  app: App;
  loadBrainGrowthData(): BrainGrowthData;
  saveBrainGrowthData(data: BrainGrowthData): Promise<void>;
  notifyBrainGrowthViews(feedback?: RefreshFeedback): void;
  showNotice?(message: string): void;
}

export const REFRESH_DEBOUNCE_MS = 3000;

interface RefreshCoordinatorOptions {
  debounceMs?: number;
  scan?: (app: App) => Promise<import("./types").ScanResult>;
}

export class RefreshCoordinator {
  private state: RefreshState = {
    isScanning: false,
    feedback: "idle",
    lastSource: null
  };
  private debounceTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private pendingRefresh = false;

  private readonly debounceMs: number;
  private readonly scan: (app: App) => Promise<import("./types").ScanResult>;

  constructor(
    private readonly host: RefreshCoordinatorHost,
    private readonly plugin: Plugin,
    options: RefreshCoordinatorOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? REFRESH_DEBOUNCE_MS;
    this.scan = options.scan ?? defaultScanVault;
  }

  getState(): RefreshState {
    return this.state;
  }

  isScanning(): boolean {
    return this.state.isScanning;
  }

  dispose(): void {
    if (this.debounceTimer !== null) {
      globalThis.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  schedule(source: RefreshSource): void {
    if (this.debounceTimer !== null) {
      globalThis.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = globalThis.setTimeout(() => {
      this.debounceTimer = null;
      void this.refresh(source);
    }, this.debounceMs);
  }

  async refresh(source: RefreshSource): Promise<void> {
    if (this.state.isScanning) {
      this.pendingRefresh = true;
      return;
    }

    const previous = JSON.stringify(this.getLatestSnapshot());
    this.setState({ isScanning: true, feedback: "idle", lastSource: source });
    this.host.notifyBrainGrowthViews("idle");

    try {
      const result = await this.scan(this.host.app);
      const nextData = upsertSnapshot(this.host.loadBrainGrowthData(), result);
      await this.host.saveBrainGrowthData(nextData);
      const current = JSON.stringify(this.getLatestSnapshot());
      const feedback: RefreshFeedback = previous === current ? "upToDate" : "updated";
      this.setState({ isScanning: false, feedback, lastSource: source });
      this.host.notifyBrainGrowthViews(feedback);
      this.showManualNotice(source, feedback);
    } catch (error) {
      console.error("Brain Growth scan failed", error);
      this.setState({ isScanning: false, feedback: "failed", lastSource: source });
      this.host.notifyBrainGrowthViews("failed");
      if (source === "dashboard-manual") {
        this.host.showNotice?.("Brain Growth scan failed. Previous stats are still shown.");
      }
    }

    if (this.pendingRefresh) {
      this.pendingRefresh = false;
      await this.refresh(source);
    }
  }

  private setState(next: RefreshState): void {
    this.state = next;
  }

  private getLatestSnapshot(): unknown {
    const snapshots = this.host.loadBrainGrowthData().snapshots;
    return snapshots[snapshots.length - 1] ?? null;
  }

  private showManualNotice(source: RefreshSource, feedback: RefreshFeedback): void {
    if (source !== "dashboard-manual") return;
    this.host.showNotice?.(feedback === "upToDate" ? "Brain Growth is already up to date." : "Brain Growth updated.");
  }
}
