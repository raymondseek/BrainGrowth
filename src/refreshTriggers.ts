import { TFile } from "obsidian";
import type BrainGrowthPlugin from "./main";

export function registerRefreshTriggers(plugin: BrainGrowthPlugin): void {
  let previousMarkdownPath: string | null = getMarkdownPath(plugin.app.workspace.getActiveFile());

  plugin.registerEvent(
    plugin.app.workspace.on("file-open", (file) => {
      const nextMarkdownPath = getMarkdownPath(file);

      if (previousMarkdownPath && previousMarkdownPath !== nextMarkdownPath) {
        plugin.scheduleRefresh("markdown-close");
      }

      if (nextMarkdownPath && nextMarkdownPath !== previousMarkdownPath) {
        plugin.scheduleRefresh("markdown-open");
      }

      previousMarkdownPath = nextMarkdownPath;
    })
  );

  plugin.registerEvent(
    plugin.app.vault.on("create", (file) => {
      if (isMarkdownFile(file)) plugin.scheduleRefresh("vault-change");
    })
  );

  plugin.registerEvent(
    plugin.app.vault.on("modify", (file) => {
      if (isMarkdownFile(file)) plugin.scheduleRefresh("vault-change");
    })
  );

  plugin.registerEvent(
    plugin.app.vault.on("delete", (file) => {
      if (isMarkdownFile(file)) plugin.scheduleRefresh("vault-change");
    })
  );

  plugin.registerEvent(
    plugin.app.vault.on("rename", (file, oldPath) => {
      if (isMarkdownFile(file) || oldPath.endsWith(".md")) {
        plugin.scheduleRefresh("vault-change");
      }
    })
  );
}

function getMarkdownPath(file: TFile | null): string | null {
  return isMarkdownFile(file) ? file.path : null;
}

function isMarkdownFile(file: unknown): file is TFile {
  return file instanceof TFile && file.extension === "md";
}
