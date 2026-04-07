import { describe, expect, it } from "vitest";
import type {
  SeededReturnSummary,
  WorkspaceDocumentRecord
} from "@tax-engine/contracts";
import { buildWorkspaceReturnSummary } from "@tax-engine/engine";

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
    taxYearHints: [2025],
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
    interviewQuestions: [],
    interviewQueue: [],
    nextQuestionId: "wages",
    reviewNotes: [],
    ...overrides
  };
}

describe("workspace return summary", () => {
  it("marks supported unanswered facts as awaiting interview", () => {
    const summary = buildWorkspaceReturnSummary(
      [createDocument({ id: "doc-1" })],
      createSeededReturn({})
    );

    expect(summary).toEqual({
      status: "awaiting-interview",
      targetTaxYear: 2025,
      taxYearState: "single",
      answeredFactCount: 0,
      totalFactCount: 2,
      readyItemCount: 0,
      itemCount: 1,
      blockers: [
        {
          id: "needs-answer:wages-and-withholding",
          message: "Wages and withholding still has 2 unanswered interview confirmation(s).",
          relatedFactIds: ["wages", "withholding"],
          sourceDocumentIds: ["doc-1"]
        }
      ],
      items: [
        {
          id: "wages-and-withholding",
          label: "Wages and withholding",
          status: "needs-answer",
          engineTargets: ["Form 1040 Lines 1 and 25a"],
          relatedFactIds: ["wages", "withholding"],
          sourceDocumentIds: ["doc-1"],
          answeredFactCount: 0,
          factCount: 2
        }
      ]
    });
  });

  it("becomes ready to recompute when supported facts are fully confirmed for one tax year", () => {
    const summary = buildWorkspaceReturnSummary(
      [createDocument({ id: "doc-1" })],
      createSeededReturn({
        taxYearHints: [2025],
        facts: [
          {
            id: "wages",
            label: "Wages",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Final W-2 confirmed.",
            sourceDocumentIds: ["doc-1"]
          },
          {
            id: "withholding",
            label: "Federal withholding",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Federal withholding confirmed.",
            sourceDocumentIds: ["doc-1"]
          }
        ],
        nextQuestionId: null
      })
    );

    expect(summary.status).toBe("ready-to-recompute");
    expect(summary.blockers).toEqual([]);
    expect(summary.items).toEqual([
      {
        id: "wages-and-withholding",
        label: "Wages and withholding",
        status: "ready",
        engineTargets: ["Form 1040 Lines 1 and 25a"],
        relatedFactIds: ["wages", "withholding"],
        sourceDocumentIds: ["doc-1"],
        answeredFactCount: 2,
        factCount: 2
      }
    ]);
  });

  it("maps confirmed Form 1095-A facts into a premium-tax-credit summary item", () => {
    const summary = buildWorkspaceReturnSummary(
      [createDocument({
        id: "doc-1095a",
        kind: "1095-a",
        coverage: "supported",
        label: "2025 Form 1095-A",
        matchedFixtureId: "irs-1095-a-2025",
        seededFactIds: ["premium-tax-credit-review"]
      })],
      {
        status: "ready-for-interview",
        taxYearHints: [2025],
        facts: [
          {
            id: "premium-tax-credit-review",
            label: "Marketplace coverage and premium tax credit review",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Marketplace statement amounts are confirmed.",
            sourceDocumentIds: ["doc-1095a"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null,
        reviewNotes: []
      }
    );

    expect(summary.items).toEqual([
      {
        id: "premium-tax-credit",
        label: "Marketplace coverage and premium tax credit",
        status: "ready",
        engineTargets: ["Form 1095-A", "Form 8962", "Schedule 2 Line 2", "Schedule 3 Line 10"],
        relatedFactIds: ["premium-tax-credit-review"],
        sourceDocumentIds: ["doc-1095a"],
        answeredFactCount: 1,
        factCount: 1
      }
    ]);
  });

  it("holds otherwise-ready facts in review when the tax year is newer than engine support", () => {
    const summary = buildWorkspaceReturnSummary(
      [createDocument({ id: "doc-1" })],
      createSeededReturn({
        taxYearHints: [2026],
        facts: [
          {
            id: "wages",
            label: "Wages",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Final W-2 confirmed.",
            sourceDocumentIds: ["doc-1"]
          },
          {
            id: "withholding",
            label: "Federal withholding",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Federal withholding confirmed.",
            sourceDocumentIds: ["doc-1"]
          }
        ],
        nextQuestionId: null
      })
    );

    expect(summary.status).toBe("needs-review");
    expect(summary.blockers).toEqual([
      {
        id: "unsupported-tax-year",
        message: "Tax year 2026 is not available for deterministic recompute yet. Latest supported engine year: 2025.",
        relatedFactIds: [],
        sourceDocumentIds: []
      }
    ]);
    expect(summary.items).toEqual([
      {
        id: "wages-and-withholding",
        label: "Wages and withholding",
        status: "ready",
        engineTargets: ["Form 1040 Lines 1 and 25a"],
        relatedFactIds: ["wages", "withholding"],
        sourceDocumentIds: ["doc-1"],
        answeredFactCount: 2,
        factCount: 2
      }
    ]);
  });

  it("keeps partially supported flows in review even after answers are captured", () => {
    const summary = buildWorkspaceReturnSummary(
      [createDocument({
        id: "doc-nec",
        kind: "1099-nec",
        coverage: "partially-supported",
        label: "Form 1099-NEC (Rev. April 2025)",
        matchedFixtureId: "irs-1099-nec-2025",
        seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"]
      })],
      {
        status: "needs-review",
        taxYearHints: [2025],
        facts: [
          {
            id: "nonemployee-compensation",
            label: "1099-NEC income classification",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "All amounts belong on Schedule C.",
            sourceDocumentIds: ["doc-nec"]
          },
          {
            id: "schedule-c-expense-review",
            label: "Schedule C expense review",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Mileage and supplies still need manual substantiation.",
            sourceDocumentIds: ["doc-nec"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null,
        reviewNotes: [
          "Form 1099-NEC (Rev. April 2025) still needs manual review before facts can be trusted."
        ]
      }
    );

    expect(summary.status).toBe("needs-review");
    expect(summary.blockers).toEqual([
      {
        id: "needs-review:schedule-c-income",
        message: "Schedule C income and expenses still depends on documents outside deterministic engine coverage.",
        relatedFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
        sourceDocumentIds: ["doc-nec"]
      }
    ]);
    expect(summary.items[0]).toEqual({
      id: "schedule-c-income",
      label: "Schedule C income and expenses",
      status: "needs-review",
      engineTargets: ["Schedule C", "Schedule SE", "Schedule 1 Line 3"],
      relatedFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
      sourceDocumentIds: ["doc-nec"],
      answeredFactCount: 2,
      factCount: 2
    });
  });

  it("promotes supported simple 1099-NEC facts into a ready-to-recompute Schedule C summary", () => {
    const summary = buildWorkspaceReturnSummary(
      [createDocument({
        id: "doc-nec",
        kind: "1099-nec",
        coverage: "supported",
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
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "All amounts belong on Schedule C.",
            sourceDocumentIds: ["doc-nec"]
          },
          {
            id: "schedule-c-expense-review",
            label: "Schedule C expense review",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "No business expenses or home office deduction apply to this fixture.",
            sourceDocumentIds: ["doc-nec"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null,
        reviewNotes: []
      }
    );

    expect(summary).toEqual({
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
    });
  });

  it("keeps ready facts in review when another uploaded document still needs manual coverage review", () => {
    const summary = buildWorkspaceReturnSummary(
      [
        createDocument({
          id: "doc-1099b",
          name: "f1099b--2025.pdf",
          kind: "1099-b",
          coverage: "supported",
          label: "2025 Form 1099-B",
          matchedFixtureId: "irs-1099-b-2025",
          seededFactIds: ["broker-proceeds", "cost-basis-review"]
        }),
        createDocument({
          id: "doc-unknown",
          name: "broker-export.pdf",
          kind: "unknown",
          coverage: "unsupported",
          label: "Unclassified upload",
          matchedFixtureId: null,
          seededFactIds: []
        })
      ],
      {
        status: "needs-review",
        taxYearHints: [2025],
        facts: [
          {
            id: "broker-proceeds",
            label: "Broker sale proceeds",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "All broker proceeds belong on Form 8949.",
            sourceDocumentIds: ["doc-1099b"]
          },
          {
            id: "cost-basis-review",
            label: "Cost basis and adjustments review",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Basis reporting and holding periods are confirmed.",
            sourceDocumentIds: ["doc-1099b"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null,
        reviewNotes: [
          "Unclassified upload still needs manual review before facts can be trusted."
        ]
      }
    );

    expect(summary).toEqual({
      status: "needs-review",
      targetTaxYear: 2025,
      taxYearState: "single",
      answeredFactCount: 2,
      totalFactCount: 2,
      readyItemCount: 1,
      itemCount: 1,
      blockers: [
        {
          id: "needs-review:unmapped-documents",
          message: "1 uploaded document still needs manual coverage review before deterministic recompute can run.",
          relatedFactIds: [],
          sourceDocumentIds: ["doc-unknown"]
        }
      ],
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
      ]
    });
  });

  it("promotes supported 1099-R facts into a ready retirement-distribution summary", () => {
    const summary = buildWorkspaceReturnSummary(
      [createDocument({
        id: "doc-1099r",
        name: "f1099r.pdf",
        kind: "1099-r",
        coverage: "supported",
        label: "Form 1099-R (Rev. January 2025)",
        matchedFixtureId: "irs-1099-r-2025",
        seededFactIds: ["retirement-distribution-review"]
      })],
      {
        status: "ready-for-interview",
        taxYearHints: [2025],
        facts: [
          {
            id: "retirement-distribution-review",
            label: "Retirement distribution review",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Gross, taxable, and withholding amounts are confirmed.",
            sourceDocumentIds: ["doc-1099r"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null,
        reviewNotes: []
      }
    );

    expect(summary).toEqual({
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
    });
  });

  it("promotes supported 1099-SA facts into a ready HSA-distribution summary", () => {
    const summary = buildWorkspaceReturnSummary(
      [createDocument({
        id: "doc-1099sa",
        name: "f1099sa.pdf",
        kind: "1099-sa",
        coverage: "supported",
        label: "Form 1099-SA (Rev. January 2025)",
        matchedFixtureId: "irs-1099-sa-2025",
        seededFactIds: ["hsa-distribution-review"]
      })],
      {
        status: "ready-for-interview",
        taxYearHints: [2025],
        facts: [
          {
            id: "hsa-distribution-review",
            label: "HSA distribution review",
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Gross distributions and the lack of rollovers, medical-expense offsets, and exceptions are confirmed.",
            sourceDocumentIds: ["doc-1099sa"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null,
        reviewNotes: []
      }
    );

    expect(summary).toEqual({
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
    });
  });

  it("promotes supported SSA-1099 facts into a ready Social Security summary", () => {
    const summary = buildWorkspaceReturnSummary(
      [createDocument({
        id: "doc-ssa1099",
        name: "ssa1099.pdf",
        kind: "ssa-1099",
        coverage: "supported",
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
            status: "answered",
            answeredAt: "2026-03-12T00:00:00.000Z",
            answerText: "Net benefits and withholding are confirmed.",
            sourceDocumentIds: ["doc-ssa1099"]
          }
        ],
        interviewQuestions: [],
        interviewQueue: [],
        nextQuestionId: null,
        reviewNotes: []
      }
    );

    expect(summary).toEqual({
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
    });
  });
});
