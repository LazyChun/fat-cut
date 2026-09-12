/*
 * Entry point of the FatNotes bespoke plugin.
 *
 * - `activate(sdk)` is called by FatNotes after the remote is loaded.
 *   Register contributions and store every `Disposable` you get back.
 * - `deactivate()` is called when the plugin is toggled off or uninstalled.
 *   Dispose everything you registered.
 *
 * NOTE: writes to the *secondary* sidebar are reserved for the Chat block
 * and will be rejected at the host SDK layer.
 */
import React from "react";
import type { Disposable, FatNotesPluginSDK } from "fat-notes-sdk";
import { WorkPage } from "./pages";
import { registerMcpTools } from "./mcpRegistration";

const disposables: Disposable[] = [];

export async function activate(sdk: FatNotesPluginSDK): Promise<void> {
  // 0. Register MCP tools (readAssetInfo / generateArrangement / buildTimeline)
  //    so AI can read asset descriptions & clipInfos for auto clip arrangement.
  void registerMcpTools(sdk).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[fat-cut] MCP tool registration failed:", err);
  });

  // 1. Activity bar icon that activates a primary sidebar view.
  disposables.push(
    sdk.contributions.registerActivityBarItem({
      id: "fat-cut.main",
      title: "fat-cut",
      icon: "Puzzle",
    }),
  );

  // 2. Workbench page shown when the activity bar item is active.
  disposables.push(
    sdk.contributions.registerWorkbenchPage({
      id: "fat-cut.main",
      render: () => React.createElement(WorkPage, { sdk }),
    }),
  );

  // 3. Footer status item.
  disposables.push(
    sdk.contributions.registerFooterItem({
      id: "fat-cut.footer",
      align: "right",
      render: () =>
        React.createElement(
          "span",
          { style: { opacity: 0.75 } },
          `[fat-cut] ready`,
        ),
    }),
  );

  // 4. Example command — invoke via sdk.commands.execute(...).
  disposables.push(
    sdk.commands.register("fat-cut.ping", async () => {
      sdk.ui.toast.info(`[fat-cut] pong (host ${sdk.host.version})`);
      return "pong";
    }),
  );

  // 5. While the fat-cut workbench page is active, hide both the secondary
  //    sidebar and the bottom panel. On other pages both follow their normal
  //    state.
  const FAT_CUT_ACTIVITY_KEY = "bespoke:fat-cut.main";
  const selectActivityMenuKey = (state: unknown): string | undefined => {
    if (state && typeof state === "object") {
      const frame = (state as { frame?: unknown }).frame;
      if (frame && typeof frame === "object") {
        const key = (frame as { activityMenuKey?: unknown }).activityMenuKey;
        if (typeof key === "string") return key;
      }
    }
    return undefined;
  };

  let hideSecondarySidebarDisposable: Disposable | null = null;
  let hidePanelDisposable: Disposable | null = null;
  const syncHideOnActivePage = (activeKey: string | undefined): void => {
    const shouldHide = activeKey === FAT_CUT_ACTIVITY_KEY;
    if (shouldHide) {
      if (!hideSecondarySidebarDisposable) {
        hideSecondarySidebarDisposable =
          sdk.contributions.registerHideSecondarySidebar();
      }
      if (!hidePanelDisposable) {
        hidePanelDisposable = sdk.contributions.registerHidePanel();
      }
    } else {
      if (hideSecondarySidebarDisposable) {
        hideSecondarySidebarDisposable.dispose();
        hideSecondarySidebarDisposable = null;
      }
      if (hidePanelDisposable) {
        hidePanelDisposable.dispose();
        hidePanelDisposable = null;
      }
    }
  };

  // Apply to the current state immediately, then react to changes.
  syncHideOnActivePage(sdk.store.select(selectActivityMenuKey));
  disposables.push(
    sdk.store.subscribe(selectActivityMenuKey, (nextKey) =>
      syncHideOnActivePage(nextKey),
    ),
  );
  disposables.push({
    dispose() {
      if (hideSecondarySidebarDisposable) {
        hideSecondarySidebarDisposable.dispose();
        hideSecondarySidebarDisposable = null;
      }
      if (hidePanelDisposable) {
        hidePanelDisposable.dispose();
        hidePanelDisposable = null;
      }
    },
  });
}

export function deactivate(): void {
  while (disposables.length) {
    try {
      disposables.pop()?.dispose();
    } catch (e) {
      // Swallow — deactivate() must never throw.
      // eslint-disable-next-line no-console
      console.warn("[fat-cut] dispose error", e);
    }
  }
}
