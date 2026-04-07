import { describe, expect, it } from "vitest";
import {
  buildFallbackBankStatementAnalysis,
  buildTransactionLevelBankStatementAnalysis,
  compactRedactedAiDocumentText,
  extractJsonObjectFromText,
  normalizeBankStatementAnalysis,
  normalizeSelfEmploymentIncomeDocumentAnalysis,
  normalizeUnsupportedDocumentAiInsight,
} from "../../../apps/web/src/lib/business-expense-analysis";

describe("business expense analysis helpers", () => {
  it("extracts JSON from fenced model output", () => {
    expect(extractJsonObjectFromText("```json\n{\"summary\":\"ok\"}\n```")).toBe("{\"summary\":\"ok\"}");
  });

  it("extracts the first complete JSON object when the model adds trailing text", () => {
    expect(
      extractJsonObjectFromText("{\"summary\":\"ok\",\"notes\":[\"a\",\"b\"]}\nAdditional explanation.")
    ).toBe("{\"summary\":\"ok\",\"notes\":[\"a\",\"b\"]}");
  });

  it("normalizes unsupported document AI insight", () => {
    const insight = normalizeUnsupportedDocumentAiInsight({
      title: "Northwind Brokerage Packet",
      documentType: "Brokerage annual tax packet",
      summary: "Contains consolidated 1099 data that still needs manual review.",
      suggestedNextStep: "Review the brokerage section before filing.",
      relevantTaxTopics: ["investments", "capital gains"],
      bankStatementLike: false,
    }, "packet.pdf");

    expect(insight).toEqual({
      title: "Northwind Brokerage Packet",
      documentType: "Brokerage annual tax packet",
      summary: "Contains consolidated 1099 data that still needs manual review.",
      suggestedNextStep: "Review the brokerage section before filing.",
      relevantTaxTopics: ["investments", "capital gains"],
      bankStatementLike: false,
    });
  });

  it("normalizes bank statement suggestions and drops malformed rows", () => {
    const analysis = normalizeBankStatementAnalysis({
      label: "January business checking",
      institution: "Northwind Credit Union",
      statementPeriod: "2025-01-01 to 2025-01-31",
      summary: "Three likely business expenses and one charge that needs review.",
      suggestions: [
        {
          date: "2025-01-08",
          description: "Office Depot",
          amount: "84.91",
          suggestedCategory: "officeExpense",
          suggestedBusinessUse: true,
          confidence: "high",
          reason: "Office supply merchant.",
        },
        {
          date: "2025-01-10",
          description: "Unknown merchant",
          amount: "19.99",
          suggestedCategory: "needs-review",
          suggestedBusinessUse: false,
          confidence: "low",
          reason: "Merchant is ambiguous.",
        },
        {
          description: "bad row",
          amount: "oops",
        },
      ],
    }, "statement.pdf");

    expect(analysis).toMatchObject({
      fileName: "statement.pdf",
      label: "January business checking",
      institution: "Northwind Credit Union",
      statementPeriod: "2025-01-01 to 2025-01-31",
      summary: "Three likely business expenses and one charge that needs review.",
    });
    expect(analysis?.suggestions).toHaveLength(2);
    expect(analysis?.suggestions[0]).toMatchObject({
      description: "Office Depot",
      amount: "84.91",
      suggestedCategory: "officeExpense",
      suggestedBusinessUse: true,
      confidence: "high",
      appliedCategory: null,
    });
  });

  it("normalizes self-employment income document suggestions and drops malformed rows", () => {
    const analysis = normalizeSelfEmploymentIncomeDocumentAnalysis({
      label: "Northwind freelance invoices",
      payer: "Northwind Studio",
      documentPeriod: "January 2025",
      summary: "Two invoice totals were clear enough to suggest.",
      suggestions: [
        {
          date: "2025-01-05",
          description: "Invoice 1042 total",
          amount: "2400.00",
          confidence: "high",
          reason: "Invoice total clearly labeled.",
        },
        {
          date: "2025-01-19",
          description: "Invoice 1048 total",
          amount: "$1800",
          confidence: "low",
          reason: "Readable total, but payment status is unclear.",
        },
        {
          description: "bad row",
          amount: "oops",
        },
      ],
    }, "invoices.pdf");

    expect(analysis).toMatchObject({
      fileName: "invoices.pdf",
      label: "Northwind freelance invoices",
      payer: "Northwind Studio",
      documentPeriod: "January 2025",
      summary: "Two invoice totals were clear enough to suggest.",
    });
    expect(analysis?.suggestions).toHaveLength(2);
    expect(analysis?.suggestions[0]).toMatchObject({
      description: "Invoice 1042 total",
      amount: "2400.00",
      confidence: "high",
      applied: false,
    });
    expect(analysis?.suggestions[1]).toMatchObject({
      description: "Invoice 1048 total",
      amount: "1800.00",
      confidence: "low",
      applied: false,
    });
  });

  it("compacts redacted statement text down to informative lines", () => {
    const compacted = compactRedactedAiDocumentText([
      "2025 Year-End Summary",
      "",
      "Prepared for [person-name-1] American Express Gold Card - [other-1]",
      "",
      "Business",
      "$853.83",
      "$476.40",
      "$13,721.51",
      "",
      "Communications",
      "$54.08",
      "$668.96",
      "",
      "Random filler line that should be dropped eventually",
    ].join("\n"), { maxLines: 8, maxChars: 300 });

    expect(compacted).toContain("2025 Year-End Summary");
    expect(compacted).toContain("Business");
    expect(compacted).toContain("$13,721.51");
    expect(compacted.split("\n").length).toBeLessThanOrEqual(8);
  });

  it("builds low-confidence fallback suggestions from statement summary totals", () => {
    const analysis = buildFallbackBankStatementAnalysis("amex-summary.pdf", [
      "2025 Year-End Summary",
      "Business",
      "$853.83",
      "$476.40",
      "$13,721.51",
      "Communications",
      "$54.08",
      "$668.96",
      "Restaurant",
      "$229.92",
      "$179.85",
      "$297.35",
      "$331.63",
      "$249.26",
      "$192.19",
      "$134.49",
      "$1,614.69",
    ].join("\n"));

    expect(analysis).toMatchObject({
      fileName: "amex-summary.pdf",
    });
    expect(analysis?.suggestions).toEqual([
      expect.objectContaining({
        description: "Business annual summary total",
        amount: "13721.51",
        suggestedCategory: "otherExpenses",
        confidence: "low",
      }),
      expect.objectContaining({
        description: "Communications annual summary total",
        amount: "668.96",
        suggestedCategory: "utilities",
        confidence: "low",
      }),
      expect.objectContaining({
        description: "Restaurant annual summary total",
        amount: "1614.69",
        suggestedCategory: "meals",
        confidence: "low",
      }),
    ]);
  });

  it("prefers transaction-level statement suggestions when dated purchases are readable", () => {
    const analysis = buildTransactionLevelBankStatementAnalysis("amex-summary.pdf", [
      "Restaurant",
      "Card Member [person-name-1]",
      "Date",
      "Month Billed",
      "Transaction",
      "Charges",
      "12/06/2025",
      "December",
      "INSURGENTES TORTIL YCHICAGO IL",
      "$25.63",
      "11/15/2025",
      "November",
      "MERPAGO*SOLER",
      "$29.10",
      "Transportation",
      "Card Member [person-name-1]",
      "Date",
      "Month Billed",
      "Transaction",
      "Charges",
      "01/19/2025",
      "January",
      "UBER TRIP",
      "HTTPS://HELP.UBER.COCA",
      "$2.75",
    ].join("\n"));

    expect(analysis?.summary).toContain("transaction-level purchases");
    expect(analysis?.suggestions).toEqual([
      expect.objectContaining({
        date: "12/06/2025",
        description: "INSURGENTES TORTIL YCHICAGO IL",
        amount: "25.63",
        suggestedCategory: "meals",
      }),
      expect.objectContaining({
        date: "11/15/2025",
        description: "MERPAGO*SOLER",
        amount: "29.10",
        suggestedCategory: "meals",
      }),
      expect.objectContaining({
        date: "01/19/2025",
        description: "UBER TRIP HTTPS://HELP.UBER.COCA",
        amount: "2.75",
        suggestedCategory: "travel",
      }),
    ]);
  });

  it("maps electronics-store purchases to a specific Schedule C category instead of other expenses", () => {
    const analysis = buildTransactionLevelBankStatementAnalysis("amex-summary.pdf", [
      "Electronics Stores",
      "Card Member [person-name-1]",
      "Date",
      "Month Billed",
      "Transaction",
      "Charges",
      "12/12/2025",
      "December",
      "K TRONIX 94 CHICAGO IL",
      "$1837.68",
    ].join("\n"));

    expect(analysis?.suggestions[0]).toMatchObject({
      description: "K TRONIX 94 CHICAGO IL",
      amount: "1837.68",
      sourceSection: "Electronics Stores",
      suggestedCategory: "officeExpense",
    });
  });
});
