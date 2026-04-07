import { describe, expect, it } from "vitest";
import { formatStructuredFactConfidence, hasAnsweredReviewForStructuredFact } from "../../../apps/web/src/lib/structured-fact-copy";

describe("structured fact copy", () => {
  it("shows upload facts as reviewed once the matching question is answered", () => {
    const structuredFact = {
      factId: "wages",
      sourceType: "upload",
      confidence: "low",
      sourceDocumentIds: ["doc-1"],
    } as const;

    const seededFacts = [{
      id: "wages",
      status: "answered",
      sourceDocumentIds: ["doc-1"],
    }] as const;

    expect(hasAnsweredReviewForStructuredFact(structuredFact, seededFacts)).toBe(true);
    expect(formatStructuredFactConfidence(structuredFact, seededFacts)).toBe("reviewed with your answer");
  });

  it("keeps unmatched upload facts in needs-review status", () => {
    const structuredFact = {
      factId: "wages",
      sourceType: "upload",
      confidence: "low",
      sourceDocumentIds: ["doc-1"],
    } as const;

    const seededFacts = [{
      id: "withholding",
      status: "answered",
      sourceDocumentIds: ["doc-1"],
    }] as const;

    expect(hasAnsweredReviewForStructuredFact(structuredFact, seededFacts)).toBe(false);
    expect(formatStructuredFactConfidence(structuredFact, seededFacts)).toBe("needs review");
  });

  it("leaves high-confidence sample facts unchanged", () => {
    const structuredFact = {
      factId: "wages",
      sourceType: "official-fixture",
      confidence: "high",
      sourceDocumentIds: ["doc-1"],
    } as const;

    const seededFacts = [{
      id: "wages",
      status: "answered",
      sourceDocumentIds: ["doc-1"],
    }] as const;

    expect(formatStructuredFactConfidence(structuredFact, seededFacts)).toBe("high confidence");
  });
});
