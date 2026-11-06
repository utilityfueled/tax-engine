import { describe, expect, it } from "vitest";
import { containsUnsafeDirectIdentifier } from "../../../apps/web/src/lib/provider-request-privacy";

describe("provider request privacy guard", () => {
  it.each([
    "Account holder\nMaría-José Nuñez", "Recipient Name: Anne-Marie O'Neil",
    "Card Member CASEY SAMPLE", "Taxpayer Name: Casey Sample", "Spouse Name: Casey Sample",
  ])("rejects labelled names even when there are no other identifiers: %s", (value) => {
    expect(containsUnsafeDirectIdentifier(value)).toBe(true);
  });

  it("accepts redaction tokens and traverses nested cyclic data without losing checks", () => {
    const safe: Record<string, unknown> = { value: [null, true, 2026, "Account holder\n[person-name-1]"] };
    safe.self = safe;
    expect(containsUnsafeDirectIdentifier(safe)).toBe(false);
    safe.nested = { details: ["Account holder\nMaría-José Nuñez"] };
    expect(containsUnsafeDirectIdentifier(safe)).toBe(true);
  });

  it("checks card checksums without classifying arbitrary grouped invoice numbers as cards", () => {
    expect(containsUnsafeDirectIdentifier("Card 4111 1111 1111 1111")).toBe(true);
    expect(containsUnsafeDirectIdentifier("Invoice 4111 1111 1111 1112")).toBe(false);
  });

  it("detects raw person names in common provider-facing request contexts", () => {
    expect(containsUnsafeDirectIdentifier({
      requestId: "provider-workspace:workspace-jane-doe:2026-03-12T00:00:00.000Z",
      notes: [
        "Uploaded by Jane Doe from a local workstation.",
        "Mail the follow-up summary to Alex Doe.",
        "Dependent Sam Doe confirmed the record matches."
      ]
    })).toBe(true);
  });

  it("does not flag standard tax labels that do not expose direct identifiers", () => {
    expect(containsUnsafeDirectIdentifier({
      requestId: "provider-workspace:workspace-redacted:2026-03-12T00:00:00.000Z",
      summary: "Form 1040 wages review complete. Federal withholding still needs confirmation."
    })).toBe(false);
  });

  it("detects undelimited SSNs in provider-facing filenames and notes", () => {
    expect(containsUnsafeDirectIdentifier({
      requestId: "provider-workspace:workspace-redacted:2026-03-12T00:00:00.000Z",
      workspace: {
        documents: [
          {
            name: "redacted-holder-123456789-w2.pdf",
            notes: "Reach the filer after verifying copy 123456789."
          }
        ]
      }
    })).toBe(true);
  });

  it("detects slash-formatted DOBs in provider-facing request notes", () => {
    expect(containsUnsafeDirectIdentifier({
      requestId: "provider-workspace:workspace-redacted:2026-03-12T00:00:00.000Z",
      notes: [
        "Confirm DOB 2/14/1988 before review.",
        "Mail the packet after date of birth: 02/14/1988 is verified."
      ]
    })).toBe(true);
  });
});
