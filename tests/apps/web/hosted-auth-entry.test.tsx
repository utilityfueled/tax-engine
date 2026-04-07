import { describe, expect, it } from "vitest";
import {
  buildNewWorkspaceRedirectPath,
  resolveNewWorkspaceEntry
} from "../../../apps/web/src/lib/new-workspace-entry";
import { HostedWorkspaceEntryScreen } from "../../../apps/web/src/components/hosted-workspace-entry-screen";

interface ElementLike {
  props?: {
    children?: unknown;
  };
}

function isElementLike(value: unknown): value is ElementLike {
  return typeof value === "object" && value !== null && "props" in value;
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

describe("new workspace entry", () => {
  it("keeps self-host mode on the direct local-draft redirect path", async () => {
    const outcome = await resolveNewWorkspaceEntry({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "self-host"
      },
      createWorkspaceId: () => "abcd1234"
    });

    expect(buildNewWorkspaceRedirectPath("abcd1234")).toBe("/returns/abcd1234?create=1");
    expect(outcome).toEqual({
      kind: "redirect",
      location: "/returns/abcd1234?create=1"
    });
  });

  it("renders the hosted auth gate instead of creating an anonymous draft", async () => {
    const outcome = await resolveNewWorkspaceEntry({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "hosted-auth-secret-for-tests-1234567890"
      },
      requestHeaders: new Headers()
    });

    expect(outcome.kind).toBe("gate");

    if (outcome.kind !== "gate") {
      throw new Error("Expected hosted outcome to return the auth gate.");
    }

    expect(outcome.gate).toMatchObject({
      state: "hosted-auth-required",
      canCreateWorkspace: false,
      routeEnabled: true,
      sessionPath: "/api/auth/get-session",
      userLabel: null
    });

    const panelText = collectText(
      HostedWorkspaceEntryScreen({
        gate: outcome.gate
      })
    ).join(" ");

    expect(panelText).toContain("ACCOUNT");
    expect(panelText).toContain(outcome.gate.title);
    expect(panelText).toContain("Hosted Plans");
    expect(panelText).toContain("Starter");
    expect(panelText).toContain("Plus");
    expect(panelText).toContain("Sign In");
    expect(panelText).toContain("Back to Home");
  });

  it("allows an explicit local draft bypass on loopback hosts during hosted development", async () => {
    const outcome = await resolveNewWorkspaceEntry({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_APP_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "hosted-auth-secret-for-tests-1234567890"
      },
      requestHeaders: new Headers({
        host: "localhost:3000"
      }),
      localDraftRequested: true,
      createWorkspaceId: () => "local1234"
    });

    expect(outcome).toEqual({
      kind: "redirect",
      location: "/returns/local1234?create=1&local=1"
    });
  });

  it("keeps hosted auth enabled on non-loopback hosts even when a local draft is requested", async () => {
    const outcome = await resolveNewWorkspaceEntry({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_APP_URL: "https://tax.example",
        BETTER_AUTH_SECRET: "hosted-auth-secret-for-tests-1234567890"
      },
      requestHeaders: new Headers({
        host: "tax.example"
      }),
      localDraftRequested: true
    });

    expect(outcome.kind).toBe("gate");

    if (outcome.kind !== "gate") {
      throw new Error("Expected hosted outcome to remain gated for non-loopback hosts.");
    }

    expect(outcome.gate.state).toBe("hosted-auth-required");
    expect(outcome.gate.canCreateWorkspace).toBe(false);
  });

  it("redirects authenticated hosted preview actors into owner-scoped draft creation", async () => {
    const outcome = await resolveNewWorkspaceEntry({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_ID: "owner-ada",
        TAX_ENGINE_HOSTED_PREVIEW_ACTOR_LABEL: "Ada Preview"
      },
      createWorkspaceId: () => "hosted123"
    });

    expect(outcome).toEqual({
      kind: "redirect",
      location: "/returns/hosted123?create=1"
    });
  });

  it("surfaces fallback-secret preview mode when hosted auth env is incomplete", async () => {
    const outcome = await resolveNewWorkspaceEntry({
      env: {
        TAX_ENGINE_DEPLOYMENT_MODE: "hosted",
        TAX_ENGINE_APP_URL: "https://preview.tax.example"
      },
      requestHeaders: new Headers()
    });

    expect(outcome.kind).toBe("gate");

    if (outcome.kind !== "gate") {
      throw new Error("Expected hosted outcome to return the auth gate.");
    }

    const panelText = collectText(
      HostedWorkspaceEntryScreen({
        gate: outcome.gate
      })
    ).join(" ");

    expect(panelText).toContain("ACCOUNT");
    expect(panelText).toContain(outcome.gate.title);
    expect(panelText).toContain("Sign In");
  });
});
