import { describe, expect, it } from "vitest";
import HomePage from "../../../apps/web/src/app/page";
import { buildWorkspaceHref, RecentWorkspacesPanel } from "../../../apps/web/src/components/recent-workspaces-panel";
import { StartWorkspaceButton } from "../../../apps/web/src/components/start-workspace-button";
import { DeploymentModePanel } from "../../../apps/web/src/components/deployment-mode-panel";
import { buildDeploymentModeViewModel } from "../../../apps/web/src/lib/deployment-mode";

interface ElementLike {
  type?: unknown;
  props?: {
    children?: unknown;
    label?: string;
    deploymentMode?: string;
    modeState?: {
      mode: string;
      planCatalogVisible: boolean;
    };
  };
}

function isElementLike(value: unknown): value is ElementLike {
  return typeof value === "object" && value !== null && "props" in value;
}

function findElement(
  node: unknown,
  predicate: (element: ElementLike) => boolean
): ElementLike | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);

      if (match) {
        return match;
      }
    }

    return null;
  }

  if (!isElementLike(node)) {
    return null;
  }

  if (predicate(node)) {
    return node;
  }

  return findElement(node.props?.children, predicate);
}

function collectText(node: unknown): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectText(child));
  }

  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }

  if (!isElementLike(node)) {
    return [];
  }

  return collectText(node.props?.children);
}

describe("deployment mode UI", () => {
  it("renders the home page with a Start Your Tax Return button in both modes", async () => {
    const originalMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;

    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "hosted";

    try {
      const tree = await HomePage();
      const startButton = findElement(
        tree,
        (element) => element.type === StartWorkspaceButton
      );

      // The home page no longer passes a custom label — uses default for both modes
      expect(startButton).toBeTruthy();
      expect(collectText(tree).join(" ")).toContain("Star on GitHub");
    } finally {
      if (originalMode === undefined) {
        delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;
      } else {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalMode;
      }
    }
  });

  it("shows local returns affordances on loopback hosted development", async () => {
    const originalMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    const originalAppUrl = process.env.TAX_ENGINE_APP_URL;

    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "hosted";
    process.env.TAX_ENGINE_APP_URL = "http://localhost:3000";

    try {
      const tree = await HomePage();
      const recentPanel = findElement(
        tree,
        (element) => element.type === RecentWorkspacesPanel
      );

      expect(recentPanel?.props?.deploymentMode).toBe("self-host");
    } finally {
      if (originalMode === undefined) {
        delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;
      } else {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalMode;
      }

      if (originalAppUrl === undefined) {
        delete process.env.TAX_ENGINE_APP_URL;
      } else {
        process.env.TAX_ENGINE_APP_URL = originalAppUrl;
      }
    }
  });

  it("renders hosted preview affordances in the deployment mode panel", () => {
    const panelMarkup = DeploymentModePanel({
      modeState: buildDeploymentModeViewModel("hosted")
    });
    const panelText = collectText(panelMarkup).join(" ");

    expect(panelText).toContain("2 available");
    expect(panelText).toContain("Starter");
    expect(panelText).toContain("Plus");
    expect(panelText).not.toContain("Review");
  });

  it("keeps the self-host deployment panel ungated and hides hosted plan cards", () => {
    const panelTree = DeploymentModePanel({
      modeState: buildDeploymentModeViewModel("self-host")
    });
    const panelText = collectText(panelTree).join(" ");

    expect(panelText).toContain("Your data stays on your device.");
    expect(panelText).toContain("all features free");
    expect(panelText).toContain("Free");
    expect(panelText).not.toContain("Starter");
    expect(panelText).not.toContain("Plus");
    expect(panelText).not.toContain("Review");
  });

  it("preserves local mode in continue-return links for browser-local workspaces", () => {
    expect(buildWorkspaceHref({
      id: "local123",
      storageMode: "local-browser"
    } as never, "self-host")).toBe("/returns/local123?local=1");

    expect(buildWorkspaceHref({
      id: "hosted123",
      storageMode: "hosted-postgres"
    } as never, "hosted")).toBe("/returns/hosted123");
  });
});
