import { activeWindow, Notice, Plugin } from "obsidian";
import { BrainGrowthDashboardView, BRAIN_GROWTH_VIEW_TYPE } from "./dashboardView";
import { BrainGrowthMiniPanelView, BRAIN_GROWTH_MINI_PANEL_VIEW_TYPE } from "./miniPanelView";
import { canInitializeHistoricalGrowth, initializeHistoricalGrowth } from "./historicalInitializer";
import { RefreshCoordinator } from "./refreshCoordinator";
import { registerRefreshTriggers } from "./refreshTriggers";
import { normalizeData } from "./snapshotStore";
import type { BackgroundMode, BrainGrowthData, RefreshFeedback, RefreshSource } from "./types";

export default class BrainGrowthPlugin extends Plugin {
  private data: BrainGrowthData = normalizeData(null);
  private refreshCoordinator: RefreshCoordinator | null = null;

  async onload(): Promise<void> {
    this.data = normalizeData(await this.loadData());
    this.refreshCoordinator = new RefreshCoordinator(
      {
        app: this.app,
        loadBrainGrowthData: () => this.data,
        saveBrainGrowthData: async (data) => {
          this.data = data;
          await this.saveData(this.data);
        },
        notifyBrainGrowthViews: (feedback) => this.refreshOpenViews(feedback),
        showNotice: (message) => new Notice(message)
      },
      this
    );

    this.registerView(
      BRAIN_GROWTH_VIEW_TYPE,
      (leaf) => new BrainGrowthDashboardView(leaf, this)
    );
    this.registerView(
      BRAIN_GROWTH_MINI_PANEL_VIEW_TYPE,
      (leaf) => new BrainGrowthMiniPanelView(leaf, this)
    );

    this.addRibbonIcon("brain-circuit", "Brain Growth", async () => {
      await this.openDashboard();
    });

    this.addCommand({
      id: "open-mini-panel",
      name: "Open mini panel",
      callback: async () => {
        await this.openMiniPanel();
      }
    });

    this.app.workspace.onLayoutReady(() => {
      void this.refreshStats("startup").catch((error) => {
        console.error("Brain Growth startup refresh failed", error);
      });
      registerRefreshTriggers(this);
      this.ensureMiniPanelResidentOnStartup();
    });
  }

  onunload(): void {
    this.refreshCoordinator?.dispose();
  }

  getData(): BrainGrowthData {
    return this.data;
  }

  getVaultName(): string {
    return this.app.vault.getName();
  }

  getBackgroundMode(): BackgroundMode {
    return this.data.backgroundMode === "light" ? "light" : "dark";
  }

  async setBackgroundMode(backgroundMode: BackgroundMode): Promise<void> {
    if (this.getBackgroundMode() === backgroundMode) return;
    this.data = { ...this.data, backgroundMode };
    await this.saveData(this.data);
    this.refreshOpenViews();
  }

  async toggleBackgroundMode(): Promise<void> {
    await this.setBackgroundMode(this.getBackgroundMode() === "light" ? "dark" : "light");
  }

  isScanning(): boolean {
    return this.refreshCoordinator?.isScanning() ?? false;
  }

  canInitializeHistoricalGrowth(): boolean {
    return canInitializeHistoricalGrowth(this.data) && this.app.vault.getMarkdownFiles().length > 0;
  }

  async initializeHistoricalGrowth(): Promise<void> {
    if (!this.canInitializeHistoricalGrowth()) return;
    this.data = await initializeHistoricalGrowth(this.app, this.data);
    await this.saveData(this.data);
    this.refreshOpenViews("updated");
    new Notice("Historical growth initialized.");
  }

  async openDashboard(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(BRAIN_GROWTH_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: BRAIN_GROWTH_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async openMiniPanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(BRAIN_GROWTH_MINI_PANEL_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      this.refreshOpenViews();
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getRightLeaf(true);
    if (!leaf) return;
    await leaf.setViewState({ type: BRAIN_GROWTH_MINI_PANEL_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.refreshOpenViews();
  }

  async closeMiniPanel(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(BRAIN_GROWTH_MINI_PANEL_VIEW_TYPE);
    for (const leaf of leaves) {
      leaf.detach();
    }
    this.refreshOpenViews();
  }

  async toggleMiniPanel(): Promise<void> {
    if (this.isMiniPanelOpen()) {
      await this.closeMiniPanel();
      return;
    }
    await this.openMiniPanel();
  }

  isMiniPanelOpen(): boolean {
    return this.app.workspace.getLeavesOfType(BRAIN_GROWTH_MINI_PANEL_VIEW_TYPE).length > 0;
  }

  async markMiniPanelOpened(): Promise<void> {
    if (this.data.hasOpenedMiniPanel) return;
    this.data = { ...this.data, hasOpenedMiniPanel: true };
    await this.saveData(this.data);
  }

  private ensureMiniPanelResidentOnStartup(): void {
    void this.openMiniPanel().catch((error) => {
      console.error("Brain Growth mini panel failed to open", error);
    });
    this.queueMiniPanelEnsure(1500);
    this.queueMiniPanelEnsure(5000);
  }

  private queueMiniPanelEnsure(delayMs: number): void {
    const timer = activeWindow.setTimeout(() => {
      void this.openMiniPanel().catch((error) => {
        console.error("Brain Growth mini panel failed to open", error);
      });
    }, delayMs);
    this.register(() => activeWindow.clearTimeout(timer));
  }

  async refreshStats(source: RefreshSource): Promise<void> {
    await this.refreshCoordinator?.refresh(source);
  }

  scheduleRefresh(source: RefreshSource): void {
    this.refreshCoordinator?.schedule(source);
  }

  private refreshOpenViews(feedback?: RefreshFeedback): void {
    for (const leaf of this.app.workspace.getLeavesOfType(BRAIN_GROWTH_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof BrainGrowthDashboardView) {
        view.refresh(feedback);
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType(BRAIN_GROWTH_MINI_PANEL_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof BrainGrowthMiniPanelView) {
        view.refresh(feedback);
      }
    }
  }
}
