import { describe, expect, it } from "vitest";
import { SiteFooter } from "../../../apps/web/src/components/site-footer";

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

function findAllByTag(node: unknown, tagType: unknown): ElementLike[] {
  const results: ElementLike[] = [];

  if (Array.isArray(node)) {
    for (const child of node) {
      results.push(...findAllByTag(child, tagType));
    }
    return results;
  }

  if (!isElementLike(node)) {
    return results;
  }

  if (node.type === tagType) {
    results.push(node);
  }

  if (node.props?.children) {
    results.push(...findAllByTag(node.props.children, tagType));
  }

  return results;
}

describe("site footer", () => {
  it("renders with contentinfo role", () => {
    const tree = SiteFooter();

    expect(tree).toBeTruthy();
    expect(isElementLike(tree) && tree.props?.role).toBe("contentinfo");
  });

  it("displays Viva La Tax brand and tagline", () => {
    const tree = SiteFooter();
    const allText = collectText(tree).join(" ");

    expect(allText).toContain("Viva La Tax");
    expect(allText).toContain("Your data can stay on your device");
  });

  it("includes Home and Help Center links", () => {
    const tree = SiteFooter();
    const allText = collectText(tree).join(" ");

    expect(allText).toContain("Home");
    expect(allText).toContain("Help Center");
    expect(allText).toContain("Source Code");
  });

  it("includes Terms of Service and Privacy Policy links", () => {
    const tree = SiteFooter();
    const allText = collectText(tree).join(" ");

    expect(allText).toContain("Terms of Service");
    expect(allText).toContain("Privacy Policy");
  });

  it("includes legal disclaimer about not being professional tax advice", () => {
    const tree = SiteFooter();
    const allText = collectText(tree).join(" ");

    expect(allText).toContain("not a substitute");
    expect(allText).toContain("professional tax advice");
  });

  it("has footer navigation with aria-label", () => {
    const tree = SiteFooter();

    function findNavWithLabel(node: unknown): boolean {
      if (Array.isArray(node)) {
        return node.some((child) => findNavWithLabel(child));
      }
      if (!isElementLike(node)) return false;
      if (node.type === "nav" && node.props?.["aria-label"] === "Footer navigation") {
        return true;
      }
      return findNavWithLabel(node.props?.children);
    }

    expect(findNavWithLabel(tree)).toBe(true);
  });
});
