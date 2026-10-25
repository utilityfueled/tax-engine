import { describe, expect, it } from "vitest";
import type {
  SeededReturnSummary,
  WorkspaceDocumentRecord
} from "@tax-engine/contracts";
import { buildWorkspaceStructuredFacts } from "@tax-engine/engine";

function createDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-1",
    name: "fixture.pdf",
    size: 10,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "w2",
    coverage: "supported",
    label: "2026 Form W-2 (official info-copy PDF)",
    notes: "Fixture",
    matchedFixtureId: "irs-w2-2026",
    seededFactIds: ["wages", "withholding"],
    ...overrides
  };
}

function createSeededReturn(
  overrides: Partial<SeededReturnSummary>
): SeededReturnSummary {
  return {
    status: "ready-for-interview",
    taxYearHints: [2026],
    facts: [
      {
        id: "wages",
        label: "Wages",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["doc-1"]
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["doc-1"]
      }
    ],
    interviewQuestions: [
      {
        id: "wages",
        factId: "wages",
        prompt: "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Final W-2 confirmed.",
        sourceDocumentIds: ["doc-1"]
      },
      {
        id: "withholding",
        factId: "withholding",
        prompt: "Confirm federal and state withholding amounts from each wage statement.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["doc-1"]
      }
    ],
    interviewQueue: ["Confirm federal and state withholding amounts from each wage statement."],
    nextQuestionId: "withholding",
    reviewNotes: [],
    ...overrides
  };
}

describe("workspace structured facts", () => {
  it("builds a shared fact ledger from document detections and interview answers", () => {
    const structuredFacts = buildWorkspaceStructuredFacts(
      [createDocument({ id: "doc-1" })],
      createSeededReturn({})
    );

    expect(structuredFacts).toEqual([
      {
        id: "wages:document-detected",
        factId: "wages",
        label: "Wages",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-1"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "wages:fixture-wages",
        factId: "wages",
        label: "Wages",
        kind: "fixture-derived",
        value: "Official fixture wages: Form W-2 box 1 wages $52,000, box 2 federal withholding $5,000, and boxes 3 and 5 payroll wages $52,000.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        machineValue: {
          entryKind: "w2-summary",
          employerName: "Official fixture employer",
          employerEin: "12-3456789",
          wages: "52000",
          socialSecurityWages: "52000",
          socialSecurityWithheld: "3224",
          medicareWages: "52000",
          medicareWithheld: "754",
          federalWithheld: "5000"
        }
      },
      {
        id: "wages:interview-answer",
        factId: "wages",
        label: "Wages",
        kind: "interview-answer",
        value: "Final W-2 confirmed.",
        sourceType: "user-answer",
        confidence: "high",
        sourceDocumentIds: ["doc-1"],
        questionId: "wages",
        updatedAt: "2026-03-13T00:00:00.000Z"
      },
      {
        id: "withholding:document-detected",
        factId: "withholding",
        label: "Federal withholding",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-1"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "withholding:fixture-withholding",
        factId: "withholding",
        label: "Federal withholding",
        kind: "fixture-derived",
        value: "Official fixture withholding: Form W-2 box 2 federal income tax withheld $5,000.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      }
    ]);
  });

  it("returns an empty fact ledger when no facts are seeded", () => {
    const structuredFacts = buildWorkspaceStructuredFacts([], {
      status: "empty",
      taxYearHints: [],
      facts: [],
      interviewQuestions: [],
      interviewQueue: [],
      nextQuestionId: null,
      reviewNotes: []
    });

    expect(structuredFacts).toEqual([]);
  });

  it("includes parsed upload facts alongside generic document detections", () => {
    const structuredFacts = buildWorkspaceStructuredFacts(
      [createDocument({
        id: "parsed-w2",
        name: "2025 Northwind W2.pdf",
        matchedFixtureId: null,
        label: "NORTHWIND FABRICATION LLC W-2",
        detectedFacts: [
          {
            idSuffix: "parsed-w2-summary",
            factId: "wages",
            label: "Wages",
            value: "Parsed uploaded W-2: NORTHWIND FABRICATION LLC box 1 wages $107,175.28 and box 2 federal withholding $15,251.46.",
            confidence: "high",
            machineValue: {
              entryKind: "w2-summary",
              employerName: "NORTHWIND FABRICATION LLC",
              employerEin: "04-3097449",
              wages: "107175.28",
              federalWithheld: "15251.46",
              socialSecurityWages: "107175.28",
              socialSecurityWithheld: "6644.87",
              medicareWages: "107175.28",
              medicareWithheld: "1554.04",
              stateWages: "107175.28",
              stateWithheld: "2962.12"
            }
          }
        ]
      })],
      createSeededReturn({
        facts: [
          {
            id: "wages",
            label: "Wages",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["parsed-w2"]
          },
          {
            id: "withholding",
            label: "Federal withholding",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["parsed-w2"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: "wages"
      })
    );

    expect(structuredFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "wages:document-detected",
          kind: "document-detected",
          sourceDocumentIds: ["parsed-w2"]
        }),
        expect.objectContaining({
          id: "wages:parsed-w2:parsed-w2-summary",
          kind: "document-detected",
          sourceType: "upload",
          confidence: "high",
          sourceDocumentIds: ["parsed-w2"],
          machineValue: {
            entryKind: "w2-summary",
            employerName: "NORTHWIND FABRICATION LLC",
            employerEin: "04-3097449",
            wages: "107175.28",
            federalWithheld: "15251.46",
            socialSecurityWages: "107175.28",
            socialSecurityWithheld: "6644.87",
            medicareWages: "107175.28",
            medicareWithheld: "1554.04",
            stateWages: "107175.28",
            stateWithheld: "2962.12"
          }
        })
      ])
    );
  });

  it("adds fixture-derived 1099-B transaction facts for supported official fixtures", () => {
    const structuredFacts = buildWorkspaceStructuredFacts(
      [createDocument({
        id: "doc-1099b",
        name: "f1099b--2025.pdf",
        kind: "1099-b",
        label: "2025 Form 1099-B",
        matchedFixtureId: "irs-1099-b-2025",
        seededFactIds: ["broker-proceeds", "cost-basis-review"]
      })],
      {
        status: "ready-for-interview",
        taxYearHints: [2025],
        facts: [
          {
            id: "broker-proceeds",
            label: "Broker sale proceeds",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["doc-1099b"]
          },
          {
            id: "cost-basis-review",
            label: "Cost basis and adjustments review",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["doc-1099b"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: "broker-proceeds",
        reviewNotes: []
      }
    );

    expect(structuredFacts).toEqual([
      {
        id: "broker-proceeds:document-detected",
        factId: "broker-proceeds",
        label: "Broker sale proceeds",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-1099b"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "broker-proceeds:fixture-long-term-sale",
        factId: "broker-proceeds",
        label: "Broker sale proceeds",
        kind: "fixture-derived",
        value: "Official fixture long-term sale: proceeds $40,000, cost basis $15,000, sold 2025-09-30.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099b"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-b-transaction",
          description: "Official fixture long-term sale",
          dateAcquired: "2023-02-01",
          dateSold: "2025-09-30",
          proceeds: "40000",
          costBasis: "15000",
          adjustments: "0",
          basisReportedToIRS: true,
          holdingPeriod: "long",
          washSale: false,
          washSaleDisallowed: "0"
        }
      },
      {
        id: "broker-proceeds:fixture-short-term-sale",
        factId: "broker-proceeds",
        label: "Broker sale proceeds",
        kind: "fixture-derived",
        value: "Official fixture short-term sale: proceeds $42,000, cost basis $12,000, sold 2025-06-15.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099b"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-b-transaction",
          description: "Official fixture short-term sale",
          dateAcquired: "2025-01-15",
          dateSold: "2025-06-15",
          proceeds: "42000",
          costBasis: "12000",
          adjustments: "0",
          basisReportedToIRS: true,
          holdingPeriod: "short",
          washSale: false,
          washSaleDisallowed: "0"
        }
      },
      {
        id: "cost-basis-review:document-detected",
        factId: "cost-basis-review",
        label: "Cost basis and adjustments review",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-1099b"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      }
    ]);
  });

  it("adds fixture-derived 1099-INT and 1099-DIV facts for supported official fixtures", () => {
    const structuredFacts = buildWorkspaceStructuredFacts(
      [
        createDocument({
          id: "doc-1099int",
          name: "f1099int.pdf",
          kind: "1099-int",
          label: "Form 1099-INT (Rev. January 2024)",
          matchedFixtureId: "irs-1099-int-2024",
          seededFactIds: ["taxable-interest"]
        }),
        createDocument({
          id: "doc-1099div",
          name: "f1099div.pdf",
          kind: "1099-div",
          label: "Form 1099-DIV (Rev. January 2024)",
          matchedFixtureId: "irs-1099-div-2024",
          seededFactIds: [
            "ordinary-dividends",
            "qualified-dividends",
            "capital-gain-distributions"
          ]
        })
      ],
      {
        status: "ready-for-interview",
        taxYearHints: [2024],
        facts: [
          {
            id: "taxable-interest",
            label: "Taxable interest",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["doc-1099int"]
          },
          {
            id: "ordinary-dividends",
            label: "Ordinary dividends",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["doc-1099div"]
          },
          {
            id: "qualified-dividends",
            label: "Qualified dividends",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["doc-1099div"]
          },
          {
            id: "capital-gain-distributions",
            label: "Capital gain distributions",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["doc-1099div"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: "taxable-interest",
        reviewNotes: []
      }
    );

    expect(structuredFacts).toEqual([
      {
        id: "taxable-interest:document-detected",
        factId: "taxable-interest",
        label: "Taxable interest",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-1099int"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "taxable-interest:fixture-interest-income",
        factId: "taxable-interest",
        label: "Taxable interest",
        kind: "fixture-derived",
        value: "Official fixture taxable interest: box 1 interest income $20,000 with no withholding or penalty.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099int"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-int-summary",
          payer: "Official fixture savings bank",
          interestIncome: "20000",
          earlyWithdrawalPenalty: "0",
          federalWithheld: "0",
          taxExemptInterest: "0",
          usSavingsBondInterest: "0"
        }
      },
      {
        id: "ordinary-dividends:document-detected",
        factId: "ordinary-dividends",
        label: "Ordinary dividends",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-1099div"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "ordinary-dividends:fixture-dividend-income",
        factId: "ordinary-dividends",
        label: "Ordinary dividends",
        kind: "fixture-derived",
        value: "Official fixture dividends: ordinary dividends $4,000, qualified dividends $3,000, capital gain distributions $1,000.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099div"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-div-summary",
          payer: "Official fixture mutual fund",
          ordinaryDividends: "4000",
          qualifiedDividends: "3000",
          capitalGainDistributions: "1000",
          federalWithheld: "0",
          section199ADividends: "0",
          foreignTaxPaid: "0"
        }
      },
      {
        id: "qualified-dividends:document-detected",
        factId: "qualified-dividends",
        label: "Qualified dividends",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-1099div"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "qualified-dividends:fixture-qualified-dividends",
        factId: "qualified-dividends",
        label: "Qualified dividends",
        kind: "fixture-derived",
        value: "Official fixture qualified dividends: box 1b qualified dividends $3,000.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099div"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "capital-gain-distributions:document-detected",
        factId: "capital-gain-distributions",
        label: "Capital gain distributions",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-1099div"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "capital-gain-distributions:fixture-capital-gain-distributions",
        factId: "capital-gain-distributions",
        label: "Capital gain distributions",
        kind: "fixture-derived",
        value: "Official fixture capital gain distributions: box 2a capital gain distributions $1,000.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099div"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      }
    ]);
  });

  it("adds fixture-derived 1099-NEC income facts for supported simple Schedule C fixtures", () => {
    const structuredFacts = buildWorkspaceStructuredFacts(
      [createDocument({
        id: "doc-1099nec",
        name: "f1099nec.pdf",
        kind: "1099-nec",
        label: "Form 1099-NEC (Rev. April 2025)",
        matchedFixtureId: "irs-1099-nec-2025",
        seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"]
      })],
      {
        status: "ready-for-interview",
        taxYearHints: [2025],
        facts: [
          {
            id: "nonemployee-compensation",
            label: "1099-NEC income classification",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["doc-1099nec"]
          },
          {
            id: "schedule-c-expense-review",
            label: "Schedule C expense review",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["doc-1099nec"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: "nonemployee-compensation",
        reviewNotes: []
      }
    );

    expect(structuredFacts).toEqual([
      {
        id: "nonemployee-compensation:document-detected",
        factId: "nonemployee-compensation",
        label: "1099-NEC income classification",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-1099nec"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "nonemployee-compensation:fixture-nec-income",
        factId: "nonemployee-compensation",
        label: "1099-NEC income classification",
        kind: "fixture-derived",
        value: "Official fixture nonemployee compensation: box 1 nonemployee compensation $18,000 with no withholding.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099nec"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-nec-summary",
          payer: "Official fixture contract payer",
          nonemployeeCompensation: "18000",
          federalWithheld: "0"
        }
      },
      {
        id: "schedule-c-expense-review:document-detected",
        factId: "schedule-c-expense-review",
        label: "Schedule C expense review",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-1099nec"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "schedule-c-expense-review:fixture-schedule-c-expense-review",
        factId: "schedule-c-expense-review",
        label: "Schedule C expense review",
        kind: "fixture-derived",
        value: "Official fixture Schedule C review: no business expenses or home office deduction are provided in the seeded fixture.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099nec"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      }
    ]);
  });

  it("adds fixture-derived SSA-1099 summary facts for supported Social Security fixtures", () => {
    const structuredFacts = buildWorkspaceStructuredFacts(
      [createDocument({
        id: "doc-ssa1099",
        name: "ssa1099.pdf",
        kind: "ssa-1099",
        label: "Form SSA-1099 benefit statement reference (2025)",
        matchedFixtureId: "irs-ssa-1099-2025",
        seededFactIds: ["social-security-benefits-review"]
      })],
      {
        status: "ready-for-interview",
        taxYearHints: [2025],
        facts: [
          {
            id: "social-security-benefits-review",
            label: "Social Security benefits review",
            status: "pending",
            answeredAt: null,
            answerText: null,
            sourceDocumentIds: ["doc-ssa1099"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: "social-security-benefits-review",
        reviewNotes: []
      }
    );

    expect(structuredFacts).toEqual([
      {
        id: "social-security-benefits-review:document-detected",
        factId: "social-security-benefits-review",
        label: "Social Security benefits review",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["doc-ssa1099"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z"
      },
      {
        id: "social-security-benefits-review:fixture-social-security-benefits",
        factId: "social-security-benefits-review",
        label: "Social Security benefits review",
        kind: "fixture-derived",
        value: "Official fixture Social Security benefits: Form SSA-1099 net benefits $60,000 and federal withholding $1,500.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-ssa1099"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        machineValue: {
          entryKind: "ssa-1099-summary",
          recipient: "Official fixture beneficiary",
          netBenefits: "60000",
          federalWithheld: "1500"
        }
      }
    ]);
  });
});
