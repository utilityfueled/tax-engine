import { describe, expect, it } from "vitest";
import {
  buildDeploymentModeViewModel,
  getHostedPlanCatalog,
  resolveDeploymentMode
} from "../../../apps/web/src/lib/deployment-mode";
import {
  resolveBrowserWorkspaceDeploymentMode,
  shouldAllowLoopbackLocalAiAccess,
  shouldAllowLoopbackLocalWorkspaceResume
} from "../../../apps/web/src/lib/hosted-runtime-safety";

describe("deployment mode config", () => {
  it("defaults to self-host when deployment mode is missing or invalid", () => {
    expect(resolveDeploymentMode({})).toBe("self-host");
    expect(resolveDeploymentMode({
      TAX_ENGINE_DEPLOYMENT_MODE: "invalid"
    })).toBe("self-host");
  });

  it("exposes hosted plan and affordance details when hosted mode is enabled", () => {
    const modeState = buildDeploymentModeViewModel("hosted");

    expect(modeState.planCatalogVisible).toBe(true);
    expect(modeState.modeBadgeLabel).toBe("Cloud");
    expect(modeState.summary).toContain("workspace shells");
    expect(modeState.statusNotes[0]).toContain("Sign in");
    expect(modeState.affordances.map((affordance) => affordance.badgeLabel)).toEqual([
      "Coming Soon",
      "Plus"
    ]);
    expect(modeState.affordances.map((affordance) => affordance.label)).toEqual([
      "AI-powered return summary",
      "Saved return metadata"
    ]);
    expect(getHostedPlanCatalog().map((plan) => plan.name)).toEqual([
      "Starter",
      "Plus"
    ]);
  });

  it("keeps self-host mode explicitly ungated and hides hosted plans", () => {
    const modeState = buildDeploymentModeViewModel("self-host");

    expect(modeState.planCatalogVisible).toBe(false);
    expect(modeState.modeBadgeLabel).toBe("Local");
    expect(modeState.affordances.every((affordance) => affordance.badgeLabel === "Free")).toBe(true);
    expect(modeState.summary).toContain("your device");
    expect(modeState.statusNotes).toContain(
      "All features are free in local mode."
    );
  });

  it("keeps browser deployment mode aligned with the configured hosted mode", () => {
    expect(resolveBrowserWorkspaceDeploymentMode({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_APP_URL: "http://localhost:3000"
    })).toBe("hosted");

    expect(resolveBrowserWorkspaceDeploymentMode({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      TAX_ENGINE_APP_URL: "https://tax.example"
    })).toBe("hosted");
  });

  it("allows existing local workspaces to resume on loopback hosted development only", () => {
    expect(shouldAllowLoopbackLocalWorkspaceResume({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "development"
    }, "localhost")).toBe(true);

    expect(shouldAllowLoopbackLocalWorkspaceResume({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "development"
    }, "tax.example")).toBe(false);

    expect(shouldAllowLoopbackLocalWorkspaceResume({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "production"
    }, "localhost")).toBe(false);
  });

  it("allows AI helper access for local-browser workspaces on loopback only", () => {
    expect(shouldAllowLoopbackLocalAiAccess({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "development"
    }, "localhost", "local-browser")).toBe(true);

    expect(shouldAllowLoopbackLocalAiAccess({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "development"
    }, "localhost", "hosted-postgres")).toBe(false);

    expect(shouldAllowLoopbackLocalAiAccess({
      TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
      NODE_ENV: "production"
    }, "localhost", "local-browser")).toBe(false);
  });
});
