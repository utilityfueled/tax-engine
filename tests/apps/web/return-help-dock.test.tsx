import { describe, expect, it } from "vitest";
import {
  decodeDisplayEntities,
  formatSelectedDocumentCount,
  shouldShowQuickPrompts,
} from "../../../apps/web/src/components/return-help-dock";

describe("return help dock", () => {
  it("decodes escaped apostrophes and quotes for display", () => {
    expect(
      decodeDisplayEntities("you&#x27;re ready &amp; you&apos;ll see &quot;Review&quot; next.")
    ).toBe("you're ready & you'll see \"Review\" next.");
  });

  it("decodes angle brackets as visible text instead of entity strings", () => {
    expect(decodeDisplayEntities("&lt;not a tag&gt;")).toBe("<not a tag>");
  });

  it("hides quick prompts once the user starts typing or after the first message", () => {
    expect(shouldShowQuickPrompts(0, "")).toBe(true);
    expect(shouldShowQuickPrompts(0, "what is my w2 total")).toBe(false);
    expect(shouldShowQuickPrompts(1, "")).toBe(false);
  });

  it("summarizes selected document count for collapsed document context", () => {
    expect(formatSelectedDocumentCount(0)).toBe("No documents selected.");
    expect(formatSelectedDocumentCount(1)).toBe("1 document selected for AI context.");
    expect(formatSelectedDocumentCount(3)).toBe("3 documents selected for AI context.");
  });
});
