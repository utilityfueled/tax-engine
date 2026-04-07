import { describe, expect, it } from "vitest";
import { NavBar } from "../../../apps/web/src/components/nav-bar";

interface ElementLike {
  type?: unknown;
  props?: {
    children?: unknown;
    className?: string;
    href?: string;
    role?: string;
    [key: string]: unknown;
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

function findByClass(node: unknown, className: string): ElementLike | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findByClass(child, className);
      if (match) return match;
    }
    return null;
  }

  if (!isElementLike(node)) {
    return null;
  }

  if (typeof node.props?.className === "string" && node.props.className.includes(className)) {
    return node;
  }

  return findByClass(node.props?.children, className);
}

describe("nav bar", () => {
  it("renders Viva La Tax logo linking to home", async () => {
    const originalMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;

    try {
      const tree = await NavBar();
      const logo = findByClass(tree, "site-nav-logo");

      expect(logo).toBeTruthy();
      expect(logo?.props?.href).toBe("/");
      expect(collectText(logo)).toContain("Viva La Tax");
    } finally {
      if (originalMode !== undefined) {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalMode;
      }
    }
  });

  it("renders My Returns and Help links", async () => {
    const originalMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;

    try {
      const tree = await NavBar();
      const allText = collectText(tree).join(" ");

      expect(allText).toContain("My Returns");
      expect(allText).toContain("Help");
    } finally {
      if (originalMode !== undefined) {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalMode;
      }
    }
  });

  it("shows Local Mode badge in self-host mode", async () => {
    const originalMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;

    try {
      const tree = await NavBar();
      const badge = findByClass(tree, "site-nav-badge");

      expect(badge).toBeTruthy();
      expect(collectText(badge)).toContain("Local Mode");
    } finally {
      if (originalMode !== undefined) {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalMode;
      }
    }
  });

  it("shows Sign In link in hosted mode when unauthenticated", async () => {
    const originalMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "hosted";

    try {
      const tree = await NavBar();
      const allText = collectText(tree).join(" ");

      // Unauthenticated: headers() throws in test env, caught by NavBar
      expect(allText).toContain("Sign In");
      expect(allText).not.toContain("Local Mode");
    } finally {
      if (originalMode === undefined) {
        delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;
      } else {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalMode;
      }
    }
  });

  it("uses nav element with aria-label", async () => {
    const originalMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;

    try {
      const tree = await NavBar();

      expect(tree).toBeTruthy();
      // <nav> has implicit navigation role — no explicit role needed
      expect(isElementLike(tree) && tree.type).toBe("nav");
      expect(isElementLike(tree) && tree.props?.["aria-label"]).toBe("Main navigation");
    } finally {
      if (originalMode !== undefined) {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalMode;
      }
    }
  });
});
