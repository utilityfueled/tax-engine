import { workspaceTaxpayerFixture } from "../helpers/workspace-taxpayer";
import { describe, expect, it } from "vitest";
import type {
  SeededReturnSummary,
  WorkspaceStructuredFactRecord,
  WorkspaceDocumentRecord,
  WorkspaceReturnSummary
} from "@tax-engine/contracts";
import {
  buildWorkspaceEnginePreview,
  buildWorkspaceStructuredFacts
} from "@tax-engine/engine";

function createDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-1099b",
    name: "f1099b--2025.pdf",
    size: 12,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "1099-b",
    coverage: "supported",
    label: "2025 Form 1099-B",
    notes: "Fixture",
    matchedFixtureId: "irs-1099-b-2025",
    seededFactIds: ["broker-proceeds", "cost-basis-review"],
    ...overrides
  };
}

function createReturnSummary(
  overrides: Partial<WorkspaceReturnSummary>
): WorkspaceReturnSummary {
  return {
    status: "ready-to-recompute",
    targetTaxYear: 2025,
    taxYearState: "single",
    answeredFactCount: 2,
    totalFactCount: 2,
    readyItemCount: 1,
    itemCount: 1,
    blockers: [],
    items: [
      {
        id: "capital-gains",
        label: "Capital gains and basis review",
        status: "ready",
        engineTargets: ["Form 8949", "Schedule D", "Form 1040 Line 7"],
        relatedFactIds: ["broker-proceeds", "cost-basis-review"],
        sourceDocumentIds: ["doc-1099b"],
        answeredFactCount: 2,
        factCount: 2
      }
    ],
    ...overrides
  };
}

function createSeededReturn(
  overrides: Partial<SeededReturnSummary>
): SeededReturnSummary {
  return {
    status: "ready-for-interview",
    taxYearHints: [2025],
    facts: [
      {
        id: "broker-proceeds",
        label: "Broker sale proceeds",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "All broker proceeds belong on Form 8949.",
        sourceDocumentIds: ["doc-1099b"]
      },
      {
        id: "cost-basis-review",
        label: "Cost basis and adjustments review",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Basis reporting and holding periods are confirmed.",
        sourceDocumentIds: ["doc-1099b"]
      }
    ],
    interviewQuestions: [
      {
        id: "broker-proceeds",
        factId: "broker-proceeds",
        prompt: "Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing.",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "All broker proceeds belong on Form 8949.",
        sourceDocumentIds: ["doc-1099b"]
      },
      {
        id: "cost-basis-review",
        factId: "cost-basis-review",
        prompt: "Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B.",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Basis reporting and holding periods are confirmed.",
        sourceDocumentIds: ["doc-1099b"]
      }
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [],
    ...overrides
  };
}

function createInterestDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-1099oid",
    name: "f1099oid.pdf",
    size: 12,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "1099-oid",
    coverage: "supported",
    label: "Form 1099-OID (Rev. January 2024)",
    notes: "Fixture",
    matchedFixtureId: "irs-1099-oid-2025",
    seededFactIds: ["taxable-interest"],
    ...overrides
  };
}

function createInterestReturnSummary(
  overrides: Partial<WorkspaceReturnSummary>
): WorkspaceReturnSummary {
  return {
    status: "ready-to-recompute",
    targetTaxYear: 2025,
    taxYearState: "single",
    answeredFactCount: 1,
    totalFactCount: 1,
    readyItemCount: 1,
    itemCount: 1,
    blockers: [],
    items: [
      {
        id: "interest-income",
        label: "Interest income",
        status: "ready",
        engineTargets: ["Schedule B Part I", "Form 1040 Line 2b"],
        relatedFactIds: ["taxable-interest"],
        sourceDocumentIds: ["doc-1099oid"],
        answeredFactCount: 1,
        factCount: 1
      }
    ],
    ...overrides
  };
}

function createInterestSeededReturn(
  overrides: Partial<SeededReturnSummary>
): SeededReturnSummary {
  return {
    status: "ready-for-interview",
    taxYearHints: [2025],
    facts: [
      {
        id: "taxable-interest",
        label: "Taxable interest",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Taxable interest, withholding, and penalty adjustments are confirmed.",
        sourceDocumentIds: ["doc-1099oid"]
      }
    ],
    interviewQuestions: [
      {
        id: "taxable-interest",
        factId: "taxable-interest",
        prompt: "Confirm whether any tax-exempt interest or early withdrawal penalties also apply.",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Taxable interest, withholding, and penalty adjustments are confirmed.",
        sourceDocumentIds: ["doc-1099oid"]
      }
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [],
    ...overrides
  };
}

function createGovernmentPaymentsDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-1099g",
    name: "f1099g.pdf",
    size: 12,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "1099-g",
    coverage: "supported",
    label: "Form 1099-G (Rev. March 2024)",
    notes: "Fixture",
    matchedFixtureId: "irs-1099-g-2025",
    seededFactIds: ["government-payments-review"],
    ...overrides
  };
}

function createGovernmentPaymentsReturnSummary(
  overrides: Partial<WorkspaceReturnSummary>
): WorkspaceReturnSummary {
  return {
    status: "ready-to-recompute",
    targetTaxYear: 2025,
    taxYearState: "single",
    answeredFactCount: 1,
    totalFactCount: 1,
    readyItemCount: 1,
    itemCount: 1,
    blockers: [],
    items: [
      {
        id: "government-payments",
        label: "Government payments",
        status: "ready",
        engineTargets: ["Form 1099-G", "Taxable Refund Worksheet", "Schedule 1 Lines 1 and 7", "Form 1040 Lines 8 and 25d"],
        relatedFactIds: ["government-payments-review"],
        sourceDocumentIds: ["doc-1099g"],
        answeredFactCount: 1,
        factCount: 1
      }
    ],
    ...overrides
  };
}

function createGovernmentPaymentsSeededReturn(
  overrides: Partial<SeededReturnSummary>
): SeededReturnSummary {
  return {
    status: "ready-for-interview",
    taxYearHints: [2025],
    facts: [
      {
        id: "government-payments-review",
        label: "Government payments review",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Unemployment compensation, refund amounts, and withholding are confirmed.",
        sourceDocumentIds: ["doc-1099g"]
      }
    ],
    interviewQuestions: [
      {
        id: "government-payments-review",
        factId: "government-payments-review",
        prompt: "Confirm unemployment compensation, any state or local income tax refund amounts, withholding, and whether prior-year itemized deductions make any refund taxable.",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Unemployment compensation, refund amounts, and withholding are confirmed.",
        sourceDocumentIds: ["doc-1099g"]
      }
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [],
    ...overrides
  };
}

describe("workspace engine preview", () => {
  it("builds an engine preview from structured fixture facts for fully confirmed uploads", () => {
    const documents = [createDocument({ id: "doc-1099b" })];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createSeededReturn({})
    );
    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({}),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).toMatchObject({
      mode: "engine-recompute",
      title: "Deterministic engine recompute preview",
      taxYear: 2025,
      filingStatus: "single",
      filingState: "TX",
      sourceDocumentIds: ["doc-1099b"],
      sourceFixtureIds: ["irs-1099-b-2025"],
      assumptions: [
        "Uploaded PDFs are not parsed yet; this engine run uses fixture-derived transaction facts captured in the workspace ledger.",
        "The confirmed 2025 Form 1099-B upload contributes 2 capital-gains transaction fact(s) with no withholding or carryforwards.",
        "This preview only runs after the related capital-gains facts are fully confirmed in the interview loop."
      ],
      metrics: {
        totalIncome: "55000",
        agi: "55000",
        // Published 2025 single row [14,250, 14,300): 1,475; 25,000 gain at 0%.
        taxableIncome: "39250",
        totalTax: "1475",
        totalPayments: "0",
        refund: "0",
        amountOwed: "1537"
      },
      highlightedLines: expect.arrayContaining([
        {
          id: "Sched D:7",
          form: "Sched D",
          line: "7",
          label: "Net short-term capital gain/loss",
          value: "30000",
          formula: "Form 8949 Part I + K-1 Box 8 + K-1 1041 Box 3 + K-1 1041 Box 11C + prior ST carryforward + Form 6781 short-term + Form 6252 short-term",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "Sched D:15",
          form: "Sched D",
          line: "15",
          label: "Net long-term capital gain/loss",
          value: "25000",
          formula: "Form 8949 Part II + K-1 Box 9a + K-1 1041 Box 4a + K-1 1041 Box 11D + Form 4797 Line 9 + 1099-DIV Box 2a + prior LT carryforward - §1202 exclusion + home sale gain + Form 6781 long-term + Form 6252 long-term",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:7",
          form: "1040",
          line: "7",
          label: "Capital gain or loss",
          value: "55000",
          formula: "Schedule D Line 21",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:11",
          form: "1040",
          line: "11",
          label: "Adjusted gross income",
          value: "55000",
          formula: "Line 9 - Line 10",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:15",
          form: "1040",
          line: "15",
          label: "Taxable income",
          value: "39250",
          formula: "AGI - total deductions",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:24",
          form: "1040",
          line: "24",
          label: "Total tax",
          value: "1475",
          formula: expect.stringContaining("Line 22"),
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:33",
          form: "1040",
          line: "33",
          label: "Total payments",
          value: "0",
          formula: "Withholding + estimated + EIC + ACTC + refundable credits",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:34",
          form: "1040",
          line: "34",
          label: "Overpayment before estimated-tax penalty",
          value: "0",
          formula: "max(0, total payments - total tax)",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:37",
          form: "1040",
          line: "37",
          label: "Amount you owe",
          value: "1537",
          formula: "max(0, total tax - total payments + line 38 penalty)",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        }
      ])
    });
  });

  it("stays empty until the workspace is ready for deterministic recompute", () => {
    const documents = [createDocument({ id: "doc-1099b" })];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createSeededReturn({})
    );
    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({ status: "awaiting-interview" }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).toBeNull();
  });

  it("aggregates fixture-derived capital gains facts across multiple confirmed 1099-B uploads", () => {
    const documents = [
      createDocument({ id: "doc-1099b-a", size: 12 }),
      createDocument({ id: "doc-1099b-b", size: 18 })
    ];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createSeededReturn({
        facts: [
          {
            id: "broker-proceeds",
            label: "Broker sale proceeds",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "All broker proceeds belong on Form 8949.",
            sourceDocumentIds: ["doc-1099b-a", "doc-1099b-b"]
          },
          {
            id: "cost-basis-review",
            label: "Cost basis and adjustments review",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "Basis reporting and holding periods are confirmed.",
            sourceDocumentIds: ["doc-1099b-a", "doc-1099b-b"]
          }
        ],
        interviewQuestions: [
          {
            id: "broker-proceeds",
            factId: "broker-proceeds",
            prompt: "Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing.",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "All broker proceeds belong on Form 8949.",
            sourceDocumentIds: ["doc-1099b-a", "doc-1099b-b"]
          },
          {
            id: "cost-basis-review",
            factId: "cost-basis-review",
            prompt: "Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B.",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "Basis reporting and holding periods are confirmed.",
            sourceDocumentIds: ["doc-1099b-a", "doc-1099b-b"]
          }
        ]
      })
    );
    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        items: [
          {
            id: "capital-gains",
            label: "Capital gains and basis review",
            status: "ready",
            engineTargets: ["Form 8949", "Schedule D", "Form 1040 Line 7"],
            relatedFactIds: ["broker-proceeds", "cost-basis-review"],
            sourceDocumentIds: ["doc-1099b-a", "doc-1099b-b"],
            answeredFactCount: 2,
            factCount: 2
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).toMatchObject({
      mode: "engine-recompute",
      title: "Deterministic engine recompute preview",
      taxYear: 2025,
      filingStatus: "single",
      filingState: "TX",
      sourceDocumentIds: ["doc-1099b-a", "doc-1099b-b"],
      sourceFixtureIds: ["irs-1099-b-2025"],
      assumptions: [
        "Uploaded PDFs are not parsed yet; this engine run uses fixture-derived transaction facts captured in the workspace ledger.",
        "The confirmed 2025 Form 1099-B uploads contribute 4 capital-gains transaction fact(s) with no withholding or carryforwards.",
        "This preview only runs after the related capital-gains facts are fully confirmed in the interview loop."
      ],
      metrics: {
        totalIncome: "110000",
        agi: "110000",
        // Single row [44,250, 44,300): 5,075 + 45,900 at 15% = 11,960.
        taxableIncome: "94250",
        totalTax: "11960",
        totalPayments: "0",
        refund: "0",
        amountOwed: "12461"
      },
      highlightedLines: expect.arrayContaining([
        {
          id: "Sched D:7",
          form: "Sched D",
          line: "7",
          label: "Net short-term capital gain/loss",
          value: "60000",
          formula: "Form 8949 Part I + K-1 Box 8 + K-1 1041 Box 3 + K-1 1041 Box 11C + prior ST carryforward + Form 6781 short-term + Form 6252 short-term",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-b",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-b",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "Sched D:15",
          form: "Sched D",
          line: "15",
          label: "Net long-term capital gain/loss",
          value: "50000",
          formula: "Form 8949 Part II + K-1 Box 9a + K-1 1041 Box 4a + K-1 1041 Box 11D + Form 4797 Line 9 + 1099-DIV Box 2a + prior LT carryforward - §1202 exclusion + home sale gain + Form 6781 long-term + Form 6252 long-term",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-b",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-b",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:7",
          form: "1040",
          line: "7",
          label: "Capital gain or loss",
          value: "110000",
          formula: "Schedule D Line 21",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-b",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-b",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:11",
          form: "1040",
          line: "11",
          label: "Adjusted gross income",
          value: "110000",
          formula: "Line 9 - Line 10",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-b",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-b",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:15",
          form: "1040",
          line: "15",
          label: "Taxable income",
          value: "94250",
          formula: "AGI - total deductions",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-b",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-b",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:24",
          form: "1040",
          line: "24",
          label: "Total tax",
          value: "11960",
          formula: expect.stringContaining("Line 22"),
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-b",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-b",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:33",
          form: "1040",
          line: "33",
          label: "Total payments",
          value: "0",
          formula: "Withholding + estimated + EIC + ACTC + refundable credits",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-b",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-b",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:34",
          form: "1040",
          line: "34",
          label: "Overpayment before estimated-tax penalty",
          value: "0",
          formula: "max(0, total payments - total tax)",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-b",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-b",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:37",
          form: "1040",
          line: "37",
          label: "Amount you owe",
          value: "12461",
          formula: "max(0, total tax - total payments + line 38 penalty)",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-long-term-sale:doc-1099b-b",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-a",
            "broker-proceeds:fixture-short-term-sale:doc-1099b-b",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        }
      ])
    });
  });

  it("builds a deterministic wage preview from confirmed W-2 fixture facts", () => {
    const documents = [
      createDocument({
        id: "doc-w2",
        name: "fw2--2025.pdf",
        kind: "w2",
        label: "2025 Form W-2",
        matchedFixtureId: "irs-w2-2025",
        seededFactIds: ["wages", "withholding"]
      })
    ];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createSeededReturn({
        taxYearHints: [2025],
        facts: [
          {
            id: "wages",
            label: "Wages",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "Final W-2 confirmed.",
            sourceDocumentIds: ["doc-w2"]
          },
          {
            id: "withholding",
            label: "Federal withholding",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "Federal withholding confirmed.",
            sourceDocumentIds: ["doc-w2"]
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
            sourceDocumentIds: ["doc-w2"]
          },
          {
            id: "withholding",
            factId: "withholding",
            prompt: "Confirm federal and state withholding amounts from each wage statement.",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "Federal withholding confirmed.",
            sourceDocumentIds: ["doc-w2"]
          }
        ],
        nextQuestionId: null
      })
    );
    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        targetTaxYear: 2025,
        answeredFactCount: 2,
        totalFactCount: 2,
        readyItemCount: 1,
        itemCount: 1,
        items: [
          {
            id: "wages-and-withholding",
            label: "Wages and withholding",
            status: "ready",
            engineTargets: ["Form 1040 Lines 1 and 25a"],
            relatedFactIds: ["wages", "withholding"],
            sourceDocumentIds: ["doc-w2"],
            answeredFactCount: 2,
            factCount: 2
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview).toMatchObject({
      mode: "engine-recompute",
      title: "Deterministic engine recompute preview",
      taxYear: 2025,
      filingStatus: "single",
      sourceDocumentIds: ["doc-w2"],
      sourceFixtureIds: ["irs-w2-2025"],
      assumptions: [
        "Uploaded PDFs are not parsed yet; this engine run uses fixture-derived facts captured in the workspace ledger.",
        "The confirmed 2025 Form W-2 upload contributes $52,000 of wages and $5,000 of federal withholding."
      ],
      metrics: {
        totalIncome: "52000",
        agi: "52000",
        // Published single row [36,250, 36,300): 4,115; 5,000 withheld leaves 885.
        taxableIncome: "36250",
        totalTax: "4115",
        totalPayments: "5000",
        refund: "885",
        amountOwed: "0"
      }
    });
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      {
        id: "1040:1",
        form: "1040",
        line: "1",
        label: "Wages, salaries, tips",
        value: "52000",
        formula: "Sum of all W-2 Box 1",
        sourceFactIds: [
          "wages:document-detected",
          "wages:fixture-wages",
          "wages:interview-answer",
          "withholding:document-detected",
          "withholding:fixture-withholding",
          "withholding:interview-answer"
        ]
      },
      {
        id: "1040:24",
        form: "1040",
        line: "24",
        label: "Total tax",
        value: "4115",
        formula: expect.stringContaining("Line 22"),
        sourceFactIds: [
          "wages:document-detected",
          "wages:fixture-wages",
          "wages:interview-answer",
          "withholding:document-detected",
          "withholding:fixture-withholding",
          "withholding:interview-answer"
        ]
      },
      {
        id: "1040:33",
        form: "1040",
        line: "33",
        label: "Total payments",
        value: "5000",
        formula: "Withholding + estimated + EIC + ACTC + refundable credits",
        sourceFactIds: [
          "wages:document-detected",
          "wages:fixture-wages",
          "wages:interview-answer",
          "withholding:document-detected",
          "withholding:fixture-withholding",
          "withholding:interview-answer"
        ]
      },
      {
        id: "1040:34",
        form: "1040",
        line: "34",
        label: "Overpayment before estimated-tax penalty",
        value: "885",
        formula: "max(0, total payments - total tax)",
        sourceFactIds: [
          "wages:document-detected",
          "wages:fixture-wages",
          "wages:interview-answer",
          "withholding:document-detected",
          "withholding:fixture-withholding",
          "withholding:interview-answer"
        ]
      }
    ]));
  });

  it("does not infer qualified business expenses from a source NEC and prose answer", () => {
    const documents = [
      createDocument({
        id: "doc-nec",
        name: "f1099nec.pdf",
        kind: "1099-nec",
        label: "Form 1099-NEC (Rev. April 2025)",
        matchedFixtureId: "irs-1099-nec-2025",
        seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"]
      })
    ];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createSeededReturn({
        taxYearHints: [2025],
        facts: [
          {
            id: "nonemployee-compensation",
            label: "1099-NEC income classification",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "All nonemployee compensation belongs on Schedule C.",
            sourceDocumentIds: ["doc-nec"]
          },
          {
            id: "schedule-c-expense-review",
            label: "Schedule C expense review",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "No business expenses or home office deduction apply to this fixture.",
            sourceDocumentIds: ["doc-nec"]
          }
        ],
        interviewQuestions: [
          {
            id: "nonemployee-compensation",
            factId: "nonemployee-compensation",
            prompt: "Confirm whether each Form 1099-NEC amount belongs on Schedule C and whether any payments should be reclassified or excluded.",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "All nonemployee compensation belongs on Schedule C.",
            sourceDocumentIds: ["doc-nec"]
          },
          {
            id: "schedule-c-expense-review",
            factId: "schedule-c-expense-review",
            prompt: "Confirm the business expenses, mileage, and home office records needed to compute Schedule C net profit.",
            status: "answered",
            answeredAt: "2026-03-13T00:00:00.000Z",
            answerText: "No business expenses or home office deduction apply to this fixture.",
            sourceDocumentIds: ["doc-nec"]
          }
        ],
        nextQuestionId: null
      })
    );
    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        targetTaxYear: 2025,
        answeredFactCount: 2,
        totalFactCount: 2,
        readyItemCount: 1,
        itemCount: 1,
        items: [
          {
            id: "schedule-c-income",
            label: "Schedule C income and expenses",
            status: "ready",
            engineTargets: ["Schedule C", "Schedule SE", "Schedule 1 Line 3"],
            relatedFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
            sourceDocumentIds: ["doc-nec"],
            answeredFactCount: 2,
            factCount: 2
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    // A prose answer and source NEC are not actual activity, owner, expense,
    // participation and loss-limit facts. Complete those in the guided path.
    expect(preview).toBeNull();
    expect(structuredFacts.some(fact => fact.machineValue?.entryKind === "1099-nec-summary"
      && fact.machineValue.nonemployeeCompensation === "18000")).toBe(true);
  });

  it("uses exact Decimal totals in preview assumptions when workspace fact amounts exceed JS integer precision", () => {
    const documents = [
      createDocument({
        id: "doc-w2-a",
        kind: "w2",
        name: "large-a.pdf",
        matchedFixtureId: "irs-w2-2025",
        seededFactIds: ["wages", "withholding"]
      }),
      createDocument({
        id: "doc-w2-b",
        kind: "w2",
        name: "large-b.pdf",
        matchedFixtureId: "irs-w2-2025",
        seededFactIds: ["wages", "withholding"]
      })
    ];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "wages:fixture-a",
        factId: "wages",
        label: "Wages",
        kind: "fixture-derived",
        value: "Large W-2 wages A",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-w2-a"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        machineValue: {
          entryKind: "w2-summary", stateTaxReporting: "none",
          employerName: "Large Employer A",
          employerEin: "12-3456789",
          wages: "9007199254740991",
          socialSecurityWages: "9007199254740991",
          socialSecurityWithheld: "0", // Explicit fictional withholding for this precision fixture.
          medicareWages: "9007199254740991",
          medicareWithheld: "0",
          federalWithheld: "10"
        }
      },
      {
        id: "wages:fixture-b",
        factId: "wages",
        label: "Wages",
        kind: "fixture-derived",
        value: "Large W-2 wages B",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-w2-b"],
        questionId: null,
        updatedAt: "2026-03-12T00:00:00.000Z",
        machineValue: {
          entryKind: "w2-summary", stateTaxReporting: "none",
          employerName: "Large Employer B",
          employerEin: "98-7654321",
          wages: "10",
          socialSecurityWages: "10",
          socialSecurityWithheld: "0",
          medicareWages: "10",
          medicareWithheld: "0",
          federalWithheld: "9007199254740991"
        }
      }
    ];

    const preview = buildWorkspaceEnginePreview(documents, {
      status: "ready-to-recompute",
      targetTaxYear: 2025,
      taxYearState: "single",
      answeredFactCount: 2,
      totalFactCount: 2,
      readyItemCount: 1,
      itemCount: 1,
      blockers: [],
      items: [
        {
          id: "wages-and-withholding",
          label: "Wages and withholding",
          status: "ready",
          engineTargets: ["Form 1040 Lines 1 and 25a"],
          relatedFactIds: ["wages", "withholding"],
          sourceDocumentIds: ["doc-w2-a", "doc-w2-b"],
          answeredFactCount: 2,
          factCount: 2
        }
      ]
    }, structuredFacts,
      workspaceTaxpayerFixture());

    expect(preview?.assumptions).toContain(
      "The confirmed 2025 Form W-2 uploads contribute $9,007,199,254,741,001 of wages and $9,007,199,254,741,001 of federal withholding."
    );
  });

  it("builds a retirement-distribution preview from a confirmed 1099-R fixture", () => {
    const documents = [
      createDocument({
        id: "doc-1099r",
        name: "f1099r.pdf",
        kind: "1099-r",
        label: "Form 1099-R (Rev. January 2025)",
        matchedFixtureId: "irs-1099-r-2025",
        seededFactIds: ["retirement-distribution-review"]
      })
    ];
    const seededReturn = createSeededReturn({
      facts: [
        {
          id: "retirement-distribution-review",
          label: "Retirement distribution review",
          status: "answered",
          answeredAt: "2026-03-13T00:00:00.000Z",
          answerText: "Gross, taxable, and withholding amounts are confirmed.",
          sourceDocumentIds: ["doc-1099r"]
        }
      ],
      interviewQuestions: [
        {
          id: "retirement-distribution-review",
          factId: "retirement-distribution-review",
          prompt: "Confirm gross distributions, taxable amounts, withholding, whether each retirement statement belongs on the current-year return, and any early-distribution exception, distribution-date, or governmental 457(b) details that affect Form 5329.",
          status: "answered",
          answeredAt: "2026-03-13T00:00:00.000Z",
          answerText: "Gross, taxable, and withholding amounts are confirmed.",
          sourceDocumentIds: ["doc-1099r"]
        }
      ]
    });
    const structuredFacts = buildWorkspaceStructuredFacts(documents, seededReturn);

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "retirement-distributions",
            label: "Retirement distributions",
            status: "ready",
            engineTargets: ["Form 1099-R", "Form 1040 Lines 4a, 4b, 5a, 5b, and 25b"],
            relatedFactIds: ["retirement-distribution-review"],
            sourceDocumentIds: ["doc-1099r"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.sourceFixtureIds).toEqual(["irs-1099-r-2025"]);
    expect(preview?.metrics.totalIncome).toBe("18000");
    expect(preview?.metrics.totalPayments).toBe("1200");
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "1040:4a",
        value: "22000"
      }),
      expect.objectContaining({
        id: "1040:4b",
        value: "18000"
      }),
      expect.objectContaining({
        id: "1040:33",
        value: "1200"
      })
    ]));
  });

  it("applies Roth-qualified retirement metadata from confirmed 1099-R facts before recomputing taxable lines", () => {
    const documents = [
      createDocument({
        id: "doc-1099r-qualified",
        name: "f1099r-qualified.pdf",
        kind: "1099-r",
        label: "Form 1099-R (Rev. January 2025)",
        matchedFixtureId: "irs-1099-r-2025",
        seededFactIds: ["retirement-distribution-review"]
      }),
      createDocument({
        id: "doc-1099r-safe-harbor",
        name: "f1099r-safe-harbor.pdf",
        kind: "1099-r",
        label: "Form 1099-R (Rev. January 2025)",
        matchedFixtureId: "irs-1099-r-2025",
        seededFactIds: ["retirement-distribution-review"]
      })
    ];
    const structuredFacts = [
      {
        id: "retirement-distribution-review:qualified-roth",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Qualified Roth IRA distribution.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r-qualified"],
        questionId: null,
        updatedAt: "2026-03-13T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Qualified Roth IRA custodian",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "300",
          distributionCode: "J",
          iraSepSimple: true,
          qualifiedRothDistribution: true,
        }
      },
      {
        id: "retirement-distribution-review:safe-harbor-roth",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Code T Roth IRA distribution with pre-2021 history confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r-safe-harbor"],
        questionId: null,
        updatedAt: "2026-03-13T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Safe harbor Roth IRA custodian",
          grossDistribution: "7000",
          taxableAmount: "7000",
          federalWithheld: "0",
          distributionCode: "T",
          iraSepSimple: true,
          rothContributionOrConversionMadeBefore2021: true,
        }
      }
    ] satisfies WorkspaceStructuredFactRecord[];

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "retirement-distributions",
            label: "Retirement distributions",
            status: "ready",
            engineTargets: ["Form 1099-R", "Form 1040 Lines 4a, 4b, 5a, 5b, and 25b"],
            relatedFactIds: ["retirement-distribution-review"],
            sourceDocumentIds: ["doc-1099r-qualified", "doc-1099r-safe-harbor"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.assumptions).toContain(
      "The confirmed 2025 Form 1099-R uploads contribute $16,000 of gross retirement distributions, $16,000 of statement-reported taxable amount, and $300 of withholding."
    );
    expect(preview?.assumptions).toContain(
      "Confirmed Roth-qualified or pre-2021 Roth contribution history metadata from the upload is applied before the final retirement taxable lines are recomputed."
    );
    expect(preview?.metrics).toMatchObject({
      totalIncome: "0",
      agi: "0",
      taxableIncome: "0",
      totalTax: "0",
      totalPayments: "300",
      refund: "300",
      amountOwed: "0"
    });
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "1040:4a",
        value: "16000"
      }),
      expect.objectContaining({
        id: "1040:33",
        value: "300"
      }),
      expect.objectContaining({
        id: "1040:34",
        value: "300"
      }),
      expect.objectContaining({
        id: "1040:37",
        value: "0"
      })
    ]));
    expect(preview?.highlightedLines.some((line) => line.id === "1040:4b")).toBe(false);
  });

  it("applies qualified charitable distribution metadata from confirmed 1099-R facts before recomputing taxable lines", () => {
    const documents = [
      createDocument({
        id: "doc-1099r-qcd",
        name: "f1099r-qcd.pdf",
        kind: "1099-r",
        label: "Form 1099-R (Rev. January 2025)",
        matchedFixtureId: "irs-1099-r-2025",
        seededFactIds: ["retirement-distribution-review"]
      })
    ];
    const structuredFacts = [
      {
        id: "retirement-distribution-review:qcd",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Qualified charitable distribution confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r-qcd"],
        questionId: null,
        updatedAt: "2026-03-13T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "QCD IRA custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "200",
          distributionCode: "7",
          iraSepSimple: true,
          qualifiedCharitableDistribution: "7000",
        }
      }
    ] satisfies WorkspaceStructuredFactRecord[];

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "retirement-distributions",
            label: "Retirement distributions",
            status: "ready",
            engineTargets: ["Form 1099-R", "Form 1040 Lines 4a, 4b, 5a, 5b, and 25b"],
            relatedFactIds: ["retirement-distribution-review"],
            sourceDocumentIds: ["doc-1099r-qcd"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.assumptions).toContain(
      "The confirmed 2025 Form 1099-R upload contributes $12,000 of gross retirement distributions, $12,000 of statement-reported taxable amount, and $200 of withholding."
    );
    expect(preview?.assumptions).toContain(
      "Confirmed qualified charitable distribution metadata from the upload is applied before the final retirement taxable lines are recomputed."
    );
    expect(preview?.metrics).toMatchObject({
      totalIncome: "5000",
      agi: "5000",
      taxableIncome: "0",
      totalTax: "0",
      totalPayments: "200",
      refund: "200",
      amountOwed: "0"
    });
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "1040:4a",
        value: "12000"
      }),
      expect.objectContaining({
        id: "1040:4b",
        value: "5000"
      }),
      expect.objectContaining({
        id: "1040:33",
        value: "200"
      }),
      expect.objectContaining({
        id: "1040:34",
        value: "200"
      }),
      expect.objectContaining({
        id: "1040:37",
        value: "0"
      })
    ]));
  });

  it("applies Form 5329 retirement metadata from confirmed 1099-R facts before recomputing additional-tax lines", () => {
    const documents = [
      createDocument({
        id: "doc-1099r-form5329",
        name: "f1099r-form5329.pdf",
        kind: "1099-r",
        label: "Form 1099-R (Rev. January 2025)",
        matchedFixtureId: "irs-1099-r-2025",
        seededFactIds: ["retirement-distribution-review"]
      })
    ];
    const structuredFacts = [
      {
        id: "retirement-distribution-review:dated-separation",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Distribution date and separation-from-service exception metadata confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r-form5329"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Former Employer 401(k)",
          grossDistribution: "10000",
          taxableAmount: "10000",
          federalWithheld: "0",
          distributionCode: "1",
          distributionDate: "2025-09-15",
          iraSepSimple: false,
          separationFromServiceAfterAge55ExceptionApplies: true,
        }
      }
    ] satisfies WorkspaceStructuredFactRecord[];

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "retirement-distributions",
            label: "Retirement distributions",
            status: "ready",
            engineTargets: ["Form 1099-R", "Form 1040 Lines 4a, 4b, 5a, 5b, and 25b"],
            relatedFactIds: ["retirement-distribution-review"],
            sourceDocumentIds: ["doc-1099r-form5329"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.assumptions).toContain(
      "Confirmed retirement distribution-date, early-distribution exception, and eligible governmental 457(b) metadata from the upload is applied before Form 5329 defaults and the final retirement taxable lines are recomputed."
    );
    expect(preview?.metrics).toMatchObject({
      totalIncome: "10000",
      agi: "10000",
      taxableIncome: "0",
      totalTax: "0",
      totalPayments: "0",
      refund: "0",
      amountOwed: "0"
    });
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "1040:5b",
        value: "10000"
      })
    ]));
  });

  it("uses Box 2b and Box 5 retirement metadata from confirmed 1099-R facts before recomputing taxable lines", () => {
    const documents = [
      createDocument({
        id: "doc-1099r-box2b-box5",
        name: "f1099r-box2b-box5.pdf",
        kind: "1099-r",
        label: "Form 1099-R (Rev. January 2025)",
        matchedFixtureId: "irs-1099-r-2025",
        seededFactIds: ["retirement-distribution-review"]
      })
    ];
    const structuredFacts = [
      {
        id: "retirement-distribution-review:box-2b-and-box-5",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Pension distribution with taxable amount not determined and employee contributions.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r-box2b-box5"],
        questionId: null,
        updatedAt: "2026-03-13T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Box 2b pension payer",
          grossDistribution: "12000",
          federalWithheld: "300",
          distributionCode: "7",
          iraSepSimple: false,
          taxableAmountNotDetermined: true,
          employeeContributions: "2000",
        }
      }
    ] satisfies WorkspaceStructuredFactRecord[];

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "retirement-distributions",
            label: "Retirement distributions",
            status: "ready",
            engineTargets: ["Form 1099-R", "Form 1040 Lines 4a, 4b, 5a, 5b, and 25b"],
            relatedFactIds: ["retirement-distribution-review"],
            sourceDocumentIds: ["doc-1099r-box2b-box5"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.assumptions).toContain(
      "The confirmed 2025 Form 1099-R upload contributes $12,000 of gross retirement distributions, statement-reported taxable amount not determined, and $300 of withholding."
    );
    expect(preview?.metrics).toMatchObject({
      totalIncome: "10000",
      agi: "10000",
      taxableIncome: "0",
      totalTax: "0",
      totalPayments: "300",
      refund: "300",
      amountOwed: "0"
    });
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "1040:5a",
        value: "12000"
      }),
      expect.objectContaining({
        id: "1040:5b",
        value: "10000"
      }),
      expect.objectContaining({
        id: "1040:33",
        value: "300"
      }),
      expect.objectContaining({
        id: "1040:34",
        value: "300"
      }),
      expect.objectContaining({
        id: "1040:37",
        value: "0"
      })
    ]));
  });

  it("keeps the retirement preview deterministic when a confirmed 1099-R is marked as prior-year-only", () => {
    const documents = [
      createDocument({
        id: "doc-1099r-prior-year",
        name: "f1099r-prior-year.pdf",
        kind: "1099-r",
        label: "Form 1099-R (Rev. January 2025)",
        matchedFixtureId: "irs-1099-r-2025",
        seededFactIds: ["retirement-distribution-review"]
      })
    ];
    const structuredFacts = [
      {
        id: "retirement-distribution-review:prior-year-only",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Prior-year taxable retirement distribution.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r-prior-year"],
        questionId: null,
        updatedAt: "2026-03-13T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Prior-year retirement custodian",
          grossDistribution: "6500",
          taxableAmount: "500",
          federalWithheld: "125",
          distributionCode: "P",
          iraSepSimple: true,
          belongsOnCurrentYearReturn: false,
        }
      }
    ] satisfies WorkspaceStructuredFactRecord[];

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "retirement-distributions",
            label: "Retirement distributions",
            status: "ready",
            engineTargets: ["Form 1099-R", "Form 1040 Lines 4a, 4b, 5a, 5b, and 25b"],
            relatedFactIds: ["retirement-distribution-review"],
            sourceDocumentIds: ["doc-1099r-prior-year"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.metrics.totalIncome).toBe("0");
    expect(preview?.metrics.totalPayments).toBe("0");
    expect(preview?.assumptions).toContain(
      "The confirmed 2025 Form 1099-R upload was marked as not belonging on the current-year return, so no retirement distributions were included in this preview."
    );
    expect(preview?.highlightedLines.some((line) => line.id === "1040:4a")).toBe(false);
    expect(preview?.highlightedLines.some((line) => line.id === "1040:25b")).toBe(false);
  });

  it("builds an HSA-distribution preview from a confirmed 1099-SA fixture", () => {
    const documents = [
      createDocument({
        id: "doc-1099sa",
        name: "f1099sa.pdf",
        kind: "1099-sa",
        label: "Form 1099-SA (Rev. January 2025)",
        matchedFixtureId: "irs-1099-sa-2025",
        seededFactIds: ["hsa-distribution-review"]
      })
    ];
    const seededReturn = createSeededReturn({
      facts: [
        {
          id: "hsa-distribution-review",
          label: "HSA distribution review",
          status: "answered",
          answeredAt: "2026-03-13T00:00:00.000Z",
          answerText: "Gross distributions and the lack of rollovers, medical-expense offsets, and exceptions are confirmed.",
          sourceDocumentIds: ["doc-1099sa"]
        }
      ],
      interviewQuestions: [
        {
          id: "hsa-distribution-review",
          factId: "hsa-distribution-review",
          prompt: "Confirm gross HSA distributions, rollovers, qualified medical expenses, any decedent medical expenses paid within 1 year after death, and whether any disability, death, or prohibited-transaction exceptions apply.",
          status: "answered",
          answeredAt: "2026-03-13T00:00:00.000Z",
          answerText: "Gross distributions and the lack of rollovers, medical-expense offsets, and exceptions are confirmed.",
          sourceDocumentIds: ["doc-1099sa"]
        }
      ]
    });
    const structuredFacts = buildWorkspaceStructuredFacts(documents, seededReturn);

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "hsa-distributions",
            label: "HSA distributions and exceptions",
            status: "ready",
            engineTargets: ["Form 1099-SA", "Form 8889", "Schedule 1 Line 8f", "Schedule 2 Line 17c"],
            relatedFactIds: ["hsa-distribution-review"],
            sourceDocumentIds: ["doc-1099sa"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.sourceFixtureIds).toEqual(["irs-1099-sa-2025"]);
    expect(preview?.metrics.totalIncome).toBe("2400");
    expect(preview?.metrics.totalTax).toBe("480");
    expect(preview?.metrics.amountOwed).toBe("480");
    expect(preview?.assumptions).toEqual(expect.arrayContaining([
      "The confirmed 2025 Form 1099-SA upload contributes $2,400 of HSA distributions.",
      "This HSA preview still leaves rollover and medical-expense offsets manual unless they are separately confirmed in the workspace ledger."
    ]));
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "Sched 1:8f",
        value: "2400"
      }),
      expect.objectContaining({
        id: "1040:8",
        value: "2400"
      }),
      expect.objectContaining({
        id: "Sched 2:17c",
        value: "480"
      }),
      expect.objectContaining({
        id: "1040:24",
        value: "480"
      })
    ]));
  });

  it("applies confirmed HSA rollover and qualified medical-expense facts before recomputing the preview", () => {
    const documents = [
      createDocument({
        id: "doc-1099sa-confirmed-offsets",
        name: "f1099sa-confirmed-offsets.pdf",
        kind: "1099-sa",
        label: "Form 1099-SA (Rev. January 2025)",
        matchedFixtureId: "irs-1099-sa-2025",
        seededFactIds: ["hsa-distribution-review"]
      })
    ];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "hsa-distribution-review:confirmed-offsets",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "Confirmed HSA rollovers and qualified medical expenses.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa-confirmed-offsets"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-sa-summary",
          payer: "HSA Bank",
          grossDistribution: "2400",
          distributionCode: "1",
          accountType: "hsa",
          rolloverDistributions: "400",
          qualifiedMedicalExpenses: "1500",
        }
      }
    ];

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "hsa-distributions",
            label: "HSA distributions and exceptions",
            status: "ready",
            engineTargets: ["Form 1099-SA", "Form 8889", "Schedule 1 Line 8f", "Schedule 2 Line 17c"],
            relatedFactIds: ["hsa-distribution-review"],
            sourceDocumentIds: ["doc-1099sa-confirmed-offsets"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.sourceFixtureIds).toEqual(["irs-1099-sa-2025"]);
    expect(preview?.metrics.totalIncome).toBe("500");
    expect(preview?.metrics.totalTax).toBe("100");
    expect(preview?.metrics.amountOwed).toBe("100");
    expect(preview?.assumptions).toEqual(expect.arrayContaining([
      "The confirmed 2025 Form 1099-SA upload contributes $2,400 of HSA distributions.",
      "Confirmed HSA rollover review excludes $400 of distributions on Form 8889 Line 14b.",
      "Confirmed qualified medical-expense review applies $1,500 on Form 8889 Line 15."
    ]));
    expect(preview?.assumptions).not.toContain(
      "This HSA preview still leaves rollover and medical-expense offsets manual unless they are separately confirmed in the workspace ledger."
    );
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "Sched 1:8f",
        value: "500"
      }),
      expect.objectContaining({
        id: "1040:8",
        value: "500"
      }),
      expect.objectContaining({
        id: "Sched 2:17c",
        value: "100"
      }),
      expect.objectContaining({
        id: "1040:24",
        value: "100"
      })
    ]));
  });

  it("applies confirmed decedent medical expenses before recomputing a beneficiary HSA death-distribution preview", () => {
    const documents = [
      createDocument({
        id: "doc-1099sa-decedent-medical-expenses",
        name: "f1099sa-decedent-medical-expenses.pdf",
        kind: "1099-sa",
        label: "Form 1099-SA (Rev. January 2025)",
        matchedFixtureId: "irs-1099-sa-2025",
        seededFactIds: ["hsa-distribution-review"]
      })
    ];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "hsa-distribution-review:confirmed-decedent-medical-expenses",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "Confirmed beneficiary-paid decedent medical expenses after death.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa-decedent-medical-expenses"],
        questionId: null,
        updatedAt: "2026-03-19T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-sa-summary",
          payer: "Inherited HSA Bank",
          grossDistribution: "5300",
          distributionCode: "6",
          accountType: "hsa",
          beneficiaryRole: "other_beneficiary",
          deathDistributionTiming: "after_year_of_death",
          fmvOnDateOfDeath: "5000",
          decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: "1200",
        }
      }
    ];

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "hsa-distributions",
            label: "HSA distributions and exceptions",
            status: "ready",
            engineTargets: ["Form 1099-SA", "Form 8889", "Schedule 1 Line 8f", "Schedule 2 Line 17c"],
            relatedFactIds: ["hsa-distribution-review"],
            sourceDocumentIds: ["doc-1099sa-decedent-medical-expenses"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.sourceFixtureIds).toEqual(["irs-1099-sa-2025"]);
    expect(preview?.metrics.totalIncome).toBe("4100");
    expect(preview?.metrics.totalTax).toBe("0");
    expect(preview?.metrics.amountOwed).toBe("0");
    expect(preview?.assumptions).toEqual(expect.arrayContaining([
      "The confirmed 2025 Form 1099-SA upload contributes $5,300 of HSA distributions.",
      "Confirmed Form 1099-SA death-distribution metadata uses $5,000 of date-of-death fair market value on Form 8889 and routes $300 of post-death earnings to other income.",
      "Confirmed decedent medical-expense review applies $1,200 on the beneficiary-only Form 8889 Line 15 branch.",
      "This HSA preview still leaves rollover offsets manual unless they are separately confirmed in the workspace ledger."
    ]));
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "Sched 1:8f",
        value: "3800"
      }),
      expect.objectContaining({
        id: "1040:8",
        value: "4100"
      })
    ]));
    expect(preview?.highlightedLines.some((line) => line.id === "Sched 2:17c")).toBe(false);
  });

  it("builds an interest-income preview from a confirmed Form 1099-OID fixture", () => {
    const documents = [createInterestDocument({})];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createInterestSeededReturn({})
    );

    const preview = buildWorkspaceEnginePreview(
      documents,
      createInterestReturnSummary({}),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.sourceFixtureIds).toEqual(["irs-1099-oid-2025"]);
    expect(preview?.metrics.totalIncome).toBe("1300");
    expect(preview?.metrics.agi).toBe("1275");
    expect(preview?.metrics.totalPayments).toBe("40");
    expect(preview?.metrics.refund).toBe("40");
    expect(preview?.assumptions).toEqual(expect.arrayContaining([
      "The confirmed 2025 Form 1099-OID upload contributes $1,300 of taxable interest with $40 of withholding and $25 of early-withdrawal penalty.",
      "This interest preview nets any confirmed Form 1099-OID acquisition premium and bond premium adjustments before Schedule B is recomputed."
    ]));
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "1040:2b",
        value: "1300"
      }),
      expect.objectContaining({
        id: "1040:11",
        value: "1275"
      }),
      expect.objectContaining({
        id: "1040:33",
        value: "40"
      }),
      expect.objectContaining({
        id: "1040:34",
        value: "40"
      })
    ]));
  });

  it("builds a government-payments preview from a confirmed Form 1099-G fixture", () => {
    const documents = [createGovernmentPaymentsDocument({})];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createGovernmentPaymentsSeededReturn({})
    );

    const preview = buildWorkspaceEnginePreview(
      documents,
      createGovernmentPaymentsReturnSummary({}),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.sourceFixtureIds).toEqual(["irs-1099-g-2025"]);
    expect(preview?.metrics.totalIncome).toBe("6200");
    expect(preview?.metrics.agi).toBe("6200");
    expect(preview?.metrics.totalPayments).toBe("620");
    expect(preview?.metrics.refund).toBe("620");
    expect(preview?.assumptions).toEqual(expect.arrayContaining([
      "The confirmed 2025 Form 1099-G upload contributes $6,200 of unemployment compensation, $1,100 of state or local income tax refunds, and $620 of federal withholding.",
      "This government-payments preview leaves the prior-year state-refund tax-benefit worksheet manual, so uploaded Form 1099-G Box 2 amounts stay non-taxable until prior-year itemized-deduction context is confirmed."
    ]));
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "Sched 1:7",
        value: "6200"
      }),
      expect.objectContaining({
        id: "1040:8-1099g",
        value: "6200"
      }),
      expect.objectContaining({
        id: "1040:25d-1099g",
        value: "620"
      }),
      expect.objectContaining({
        id: "1040:33",
        value: "620"
      }),
      expect.objectContaining({
        id: "1040:34",
        value: "620"
      })
    ]));
  });

  it("builds a Social Security preview from a confirmed SSA-1099 fixture", () => {
    const documents = [
      createDocument({
        id: "doc-ssa1099",
        name: "ssa1099.pdf",
        kind: "ssa-1099",
        label: "Form SSA-1099 benefit statement reference (2025)",
        matchedFixtureId: "irs-ssa-1099-2025",
        seededFactIds: ["social-security-benefits-review"]
      })
    ];
    const seededReturn = createSeededReturn({
      facts: [
        {
          id: "social-security-benefits-review",
          label: "Social Security benefits review",
          status: "answered",
          answeredAt: "2026-03-13T00:00:00.000Z",
          answerText: "Net benefits and withholding are confirmed.",
          sourceDocumentIds: ["doc-ssa1099"]
        }
      ],
      interviewQuestions: [
        {
          id: "social-security-benefits-review",
          factId: "social-security-benefits-review",
          prompt: "Confirm net Social Security benefits, withholding, and whether any prior-year lump-sum or repayment adjustments still need to be entered manually.",
          status: "answered",
          answeredAt: "2026-03-13T00:00:00.000Z",
          answerText: "Net benefits and withholding are confirmed.",
          sourceDocumentIds: ["doc-ssa1099"]
        }
      ]
    });
    const structuredFacts = buildWorkspaceStructuredFacts(documents, seededReturn);

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "social-security-benefits",
            label: "Social Security benefits",
            status: "ready",
            engineTargets: ["Social Security Benefits Worksheet", "Form 1040 Lines 6a, 6b, and 25b"],
            relatedFactIds: ["social-security-benefits-review"],
            sourceDocumentIds: ["doc-ssa1099"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.sourceFixtureIds).toEqual(["irs-ssa-1099-2025"]);
    expect(preview?.metrics.totalIncome).toBe("2500");
    expect(preview?.metrics.totalPayments).toBe("1500");
    expect(preview?.metrics.refund).toBe("1500");
    expect(preview?.assumptions).toEqual(expect.arrayContaining([
      "The confirmed 2025 Form SSA-1099 upload contributes $60,000 of net Social Security benefits and $1,500 of withholding.",
      "This Social Security preview assumes no lump-sum election, prior-year repayment, or Railroad Retirement equivalent-benefit adjustment facts beyond the uploaded statement summary."
    ]));
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "1040:6a",
        value: "60000"
      }),
      expect.objectContaining({
        id: "1040:6b",
        value: "2500"
      }),
      expect.objectContaining({
        id: "1040:33",
        value: "1500"
      })
    ]));
  });

  it("builds a student loan interest preview from a confirmed Form 1098-E fixture", () => {
    const documents = [
      createDocument({
        id: "doc-1098e",
        name: "f1098e.pdf",
        kind: "1098-e",
        label: "Form 1098-E (Rev. January 2025)",
        matchedFixtureId: "irs-1098-e-2025",
        seededFactIds: ["student-loan-interest-review"]
      })
    ];
    const seededReturn = createSeededReturn({
      facts: [
        {
          id: "student-loan-interest-review",
          label: "Student loan interest review",
          status: "answered",
          answeredAt: "2026-03-13T00:00:00.000Z",
          answerText: "Student loan interest and capitalized-interest treatment are confirmed.",
          sourceDocumentIds: ["doc-1098e"]
        }
      ],
      interviewQuestions: [
        {
          id: "student-loan-interest-review",
          factId: "student-loan-interest-review",
          prompt: "Confirm student loan interest reported on Form 1098-E, whether any capitalized interest is already included, and whether any additional below-threshold interest still needs manual entry.",
          status: "answered",
          answeredAt: "2026-03-13T00:00:00.000Z",
          answerText: "Student loan interest and capitalized-interest treatment are confirmed.",
          sourceDocumentIds: ["doc-1098e"]
        }
      ]
    });
    const structuredFacts = buildWorkspaceStructuredFacts(documents, seededReturn);

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "student-loan-interest",
            label: "Student loan interest",
            status: "ready",
            engineTargets: ["Form 1098-E", "Schedule 1 Line 21", "Form 1040 Line 10"],
            relatedFactIds: ["student-loan-interest-review"],
            sourceDocumentIds: ["doc-1098e"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.sourceFixtureIds).toEqual(["irs-1098-e-2025"]);
    expect(preview?.metrics.totalIncome).toBe("0");
    expect(preview?.metrics.agi).toBe("-2100");
    expect(preview?.metrics.refund).toBe("0");
    expect(preview?.assumptions).toEqual(expect.arrayContaining([
      "The confirmed 2025 Form 1098-E upload contributes $2,100 of student loan interest.",
      "This student loan preview keeps any uploaded capitalized-interest indicator attached to Form 1098-E before Schedule 1 Line 21 is recomputed.",
      "This student loan preview assumes no additional below-threshold interest needs manual entry beyond the uploaded statements."
    ]));
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "Sched 1:21",
        value: "2100"
      }),
      expect.objectContaining({
        id: "1040:11",
        value: "-2100"
      })
    ]));
  });

  it("includes Form 1099-SA Box 2 returned-excess earnings in the HSA preview when structured facts provide them", () => {
    const documents = [
      createDocument({
        id: "doc-1099sa-earned",
        name: "f1099sa-returned-excess.pdf",
        kind: "1099-sa",
        label: "Form 1099-SA (Rev. January 2025)",
        matchedFixtureId: "irs-1099-sa-2025",
        seededFactIds: ["hsa-distribution-review"]
      })
    ];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "hsa-distribution-review:returned-excess-earnings",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "Returned excess contribution with taxable earnings.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa-earned"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-sa-summary",
          payer: "HSA Bank",
          grossDistribution: "1500",
          earningsOnExcessContributions: "60",
          distributionCode: "2",
          accountType: "hsa",
        }
      }
    ];

    const preview = buildWorkspaceEnginePreview(
      documents,
      createReturnSummary({
        answeredFactCount: 1,
        totalFactCount: 1,
        items: [
          {
            id: "hsa-distributions",
            label: "HSA distributions and exceptions",
            status: "ready",
            engineTargets: ["Form 1099-SA", "Form 8889", "Schedule 1 Line 8f", "Schedule 2 Line 17c"],
            relatedFactIds: ["hsa-distribution-review"],
            sourceDocumentIds: ["doc-1099sa-earned"],
            answeredFactCount: 1,
            factCount: 1
          }
        ]
      }),
      structuredFacts,
      workspaceTaxpayerFixture()
    );

    expect(preview).not.toBeNull();
    expect(preview?.metrics.totalIncome).toBe("60");
    expect(preview?.metrics.totalTax).toBe("0");
    expect(preview?.assumptions).toEqual(expect.arrayContaining([
      "The confirmed 2025 Form 1099-SA upload contributes $1,500 of HSA distributions.",
      "Confirmed Form 1099-SA Box 2 earnings on returned excess contributions add $60 of other income."
    ]));
    expect(preview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "1040:8",
        value: "60"
      })
    ]));
  });
});
