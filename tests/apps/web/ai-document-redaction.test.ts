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

  it.each(["Casey Sample", "CASEY SAMPLE", "Anne-Marie O'Neil", "María-José Nuñez", "Sukarno"])(
    "redacts a multiline account holder without relying on another identifier: %s",
    (name) => {
      const { redactedText } = redactTextForAiAnalysis(`Account holder\n${name}\nAccount Summary\n2026-02-02 COFFEE SHOP 12.34`);
      expect(redactedText).not.toContain(name);
      expect(redactedText).toContain("Account Summary\n2026-02-02 COFFEE SHOP 12.34");
    },
  );

  it.each(["Account Holder", "recipient name", "Taxpayer Name", "Spouse Name", "Employee Name"])(
    "redacts inline names after a colon or mixed-case label: %s",
    (label) => {
      const { redactedText } = redactTextForAiAnalysis(`${label}: Anne-Marie O'Neil\nWages 65000.25`);
      expect(redactedText).not.toContain("Anne-Marie O'Neil");
      expect(redactedText).toContain("Wages 65000.25");
    },
  );

  it("redacts the complete labelled mailing block and stops before financial fields", () => {
    const { redactedText } = redactTextForAiAnalysis("Employee's name, address, and ZIP code\nCasey Sample\n123 Example Street\nApartment 4B\nSpringfield IL 62701\n1 Wages, tips, other compensation\n65000.25\n2 Federal income tax withheld\n8123.45");
    for (const identifier of ["Casey Sample", "123 Example Street", "Apartment 4B", "Springfield", "62701"]) {
      expect(redactedText).not.toContain(identifier);
    }
    expect(redactedText).toContain("1 Wages, tips, other compensation\n65000.25\n2 Federal income tax withheld\n8123.45");
  });

  it("keeps transaction dates and amounts while removing contact, birth and account identifiers", () => {
    const { redactedText } = redactTextForAiAnalysis("Email: casey@example.invalid\nPhone: (202) 555-0147\nDOB: 03/04/1980\nRouting: 021000021\nAccount: 123456789012\n2026-03-04 BOOK STORE 25.99\n2026-03-05 REFUND -4.25");
    for (const identifier of ["casey@example.invalid", "555-0147", "03/04/1980", "021000021", "123456789012"]) {
      expect(redactedText).not.toContain(identifier);
    }
    expect(redactedText).toContain("2026-03-04 BOOK STORE 25.99\n2026-03-05 REFUND -4.25");
    expect(containsUnsafeDirectIdentifier(redactedText)).toBe(false);
  });

  it("reuses tokens within a document without sharing names across separate requests", () => {
    const first = redactTextForAiAnalysis("Account Holder: Casey Sample\nRecipient Name: Casey Sample");
    expect(first.redactedText.match(/\[person-name-1\]/g)).toHaveLength(2);
    expect(first.replacementCount).toBe(2);
    expect(redactTextForAiAnalysis("Account Holder: Different Person").redactedText).toContain("[person-name-1]");
  });

  it("does not trust redaction-looking tokens supplied inside the source document", () => {
    const result = redactTextForAiAnalysis("Account Holder: [person-name-1] Casey Sample");
    expect(result.redactedText).not.toContain("Casey Sample");
  });
});
