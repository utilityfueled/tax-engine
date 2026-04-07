import { describe, expect, it } from "vitest";
import { redactTextForAiAnalysis } from "../../../apps/web/src/lib/ai-document-redaction";
import { containsUnsafeDirectIdentifier } from "../../../apps/web/src/lib/provider-request-privacy";

describe("AI document redaction", () => {
  it("redacts W-2 personal identifiers before AI analysis", () => {
    const { redactedText, replacementCount } = redactTextForAiAnalysis(`
Employee's name, address, and ZIP code
CASEY SAMPLE
123 EXAMPLE STREET
SPRINGFIELD IL 62701
Employer's FED ID number
04-3097449
Filer SSN is 123-45-6789
`);

    expect(replacementCount).toBeGreaterThan(0);
    expect(redactedText).not.toContain("CASEY SAMPLE");
    expect(redactedText).not.toContain("123 EXAMPLE STREET");
    expect(redactedText).not.toContain("62701");
    expect(redactedText).not.toContain("123-45-6789");
    expect(redactedText).not.toContain("04-3097449");
    expect(containsUnsafeDirectIdentifier(redactedText)).toBe(false);
  });

  it("keeps merchant rows while redacting bank statement header identifiers", () => {
    const { redactedText } = redactTextForAiAnalysis(`
2025 Year-End Summary
Prepared for CASEY SAMPLE American Express Gold Card - 61005
Card Member CASEY SAMPLE
Account Summary
X CORP. PAID FEATURE
$2.19
OPENAI *CHATGPT SUBS
$20.00
`);

    expect(redactedText).not.toContain("CASEY SAMPLE");
    expect(redactedText).not.toContain("61005");
    expect(redactedText).toContain("X CORP. PAID FEATURE");
    expect(redactedText).toContain("OPENAI *CHATGPT SUBS");
    expect(containsUnsafeDirectIdentifier(redactedText)).toBe(false);
  });
});
