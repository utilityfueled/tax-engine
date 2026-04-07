import { describe, expect, it } from "vitest";
import {
  ConfidenceBadge,
  DisclaimerBanner,
  StateReturnPanel,
} from "../../../apps/web/src/components/confidence-tier";

interface ElementLike {
  type?: unknown;
  props?: {
    children?: unknown;
    className?: string;
    role?: string;
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

function getClassName(node: unknown): string {
  if (isElementLike(node)) {
    return node.props?.className ?? "";
  }
  return "";
}

describe("ConfidenceBadge component", () => {
  it("renders validated badge with green styling for PA", () => {
    const tree = ConfidenceBadge({ stateCode: "PA" });
    const text = collectText(tree).join(" ");
    const className = getClassName(tree);

    expect(text).toContain("Verified");
    expect(className).toContain("confidence-validated");
    expect(className).toContain("confidence-badge");
  });

  it("renders best-effort badge with warning styling for GA", () => {
    const tree = ConfidenceBadge({ stateCode: "GA" });
    const text = collectText(tree).join(" ");
    const className = getClassName(tree);

    expect(text).toContain("Draft");
    expect(className).toContain("confidence-best-effort");
  });

  it("renders not-applicable badge with muted styling for FL", () => {
    const tree = ConfidenceBadge({ stateCode: "FL" });
    const text = collectText(tree).join(" ");
    const className = getClassName(tree);

    expect(text).toContain("No state income tax");
    expect(className).toContain("confidence-not-applicable");
  });

  it("renders correct badge for each validated state", () => {
    for (const code of ["CA", "NY", "NJ", "IL", "PA", "OH"]) {
      const tree = ConfidenceBadge({ stateCode: code });
      const className = getClassName(tree);
      expect(className).toContain("confidence-validated");
    }
  });
});

describe("StateReturnPanel component", () => {
  it("returns null when stateCodes is empty", () => {
    const tree = StateReturnPanel({ stateCodes: [] });
    expect(tree).toBeNull();
  });

  it("renders panel with state name and description for a validated state", () => {
    const tree = StateReturnPanel({ stateCodes: ["PA"] });
    const text = collectText(tree).join(" ");

    expect(tree).not.toBeNull();
    expect(text).toContain("Pennsylvania");
    expect(text).toContain("fully verified");
    expect(text).not.toContain("Draft Estimate");
  });

  it("renders panel with disclaimer for a best-effort state", () => {
    const tree = StateReturnPanel({ stateCodes: ["GA"] });
    const text = collectText(tree).join(" ");

    expect(tree).not.toBeNull();
    expect(text).toContain("Georgia");
    expect(text).toContain("Draft estimate");
    expect(text).toContain("Draft Estimate");
    expect(text).toContain("published tax rates");
    expect(text).toContain("additional credits");
  });

  it("renders panel for no-income-tax state without disclaimer", () => {
    const tree = StateReturnPanel({ stateCodes: ["TX"] });
    const text = collectText(tree).join(" ");

    expect(tree).not.toBeNull();
    expect(text).toContain("Texas");
    expect(text).toContain("does not levy");
    expect(text).not.toContain("Draft Estimate");
  });

  it("renders multiple states in a single panel", () => {
    const tree = StateReturnPanel({ stateCodes: ["CA", "GA", "FL"] });
    const text = collectText(tree).join(" ");

    expect(text).toContain("California");
    expect(text).toContain("Georgia");
    expect(text).toContain("Florida");
    expect(text).toContain("fully verified");
    expect(text).toContain("Draft estimate");
    expect(text).toContain("does not levy");
  });

  it("uses singular wording for a single state", () => {
    const tree = StateReturnPanel({ stateCodes: ["PA"] });
    const text = collectText(tree).join(" ");

    expect(text).toContain("the");
    expect(text).toContain("state");
    expect(text).not.toContain("states");
  });

  it("uses plural wording for multiple states", () => {
    const tree = StateReturnPanel({ stateCodes: ["PA", "GA"] });
    const text = collectText(tree).join(" ");

    expect(text).toContain("each");
    expect(text).toContain("states");
  });

  it("wraps content in a RetroShell with correct props", () => {
    const tree = StateReturnPanel({ stateCodes: ["PA"] });

    if (isElementLike(tree)) {
      // RetroShell is the wrapper component — check it receives the right props
      const props = tree.props as Record<string, unknown>;
      expect(props.title).toBe("State Returns");
      expect(props.eyebrow).toBe("CONFIDENCE");
      expect(props.panelId).toBe("workspace-state-returns");
    }
  });
});

describe("DisclaimerBanner component", () => {
  it("renders disclaimer for best-effort states", () => {
    const tree = DisclaimerBanner({ stateCode: "GA" });
    const text = collectText(tree).join(" ");

    expect(tree).not.toBeNull();
    expect(text).toContain("published tax rates");
    expect(text).toContain("additional credits");
    expect(text).toContain("standard deductions");
  });

  it("returns null for validated states", () => {
    const tree = DisclaimerBanner({ stateCode: "PA" });
    expect(tree).toBeNull();
  });

  it("returns null for no-income-tax states", () => {
    const tree = DisclaimerBanner({ stateCode: "FL" });
    expect(tree).toBeNull();
  });

  it("has role=note for informational disclaimer", () => {
    const tree = DisclaimerBanner({ stateCode: "GA" });
    if (isElementLike(tree)) {
      expect(tree.props?.role).toBe("note");
    }
  });
});
