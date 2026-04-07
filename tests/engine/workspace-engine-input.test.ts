import { describe, expect, it } from "vitest";
import type {
  SeededReturnSummary,
  WorkspaceDocumentRecord,
  WorkspaceReturnSummary,
  WorkspaceStructuredFactRecord
} from "@tax-engine/contracts";
import {
  buildWorkspaceEngineInput,
  buildWorkspaceStructuredFacts
} from "@tax-engine/engine";
import { calculateFederalTax } from "@/engine/federal.js";

function createDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-1099r",
    name: "f1099r--2025.pdf",
    size: 12,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "1099-r",
    coverage: "supported",
    label: "Form 1099-R (Rev. January 2025)",
    notes: "Fixture",
    matchedFixtureId: "irs-1099-r-2025",
    seededFactIds: ["retirement-distribution-review"],
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
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [],
    ...overrides
  };
}

function createHsaDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-1099sa",
    name: "f1099sa--2025.pdf",
    size: 12,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "1099-sa",
    coverage: "supported",
    label: "Form 1099-SA (Rev. January 2025)",
    notes: "Fixture",
    matchedFixtureId: "irs-1099-sa-2025",
    seededFactIds: ["hsa-distribution-review"],
    ...overrides
  };
}

function createW2Document(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-w2",
    name: "fw2--2025.pdf",
    size: 12,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "w2",
    coverage: "supported",
    label: "Form W-2 (2025)",
    notes: "Fixture",
    matchedFixtureId: "irs-w2-2025",
    seededFactIds: ["wages", "withholding"],
    ...overrides
  };
}

function createWagesReturnSummary(
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
        id: "wages-and-withholding",
        label: "Wages and withholding",
        status: "ready",
        engineTargets: ["Form 1040 Lines 1 and 25a"],
        relatedFactIds: ["wages", "withholding"],
        sourceDocumentIds: ["doc-w2"],
        answeredFactCount: 2,
        factCount: 2
      }
    ],
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

function createHsaReturnSummary(
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
        id: "hsa-distributions",
        label: "HSA distributions",
        status: "ready",
        engineTargets: ["Form 1099-SA", "Form 8889", "Schedule 1 Line 8f", "Schedule 2 Line 17c"],
        relatedFactIds: ["hsa-distribution-review"],
        sourceDocumentIds: ["doc-1099sa"],
        answeredFactCount: 1,
        factCount: 1
      }
    ],
    ...overrides
  };
}

function createSocialSecurityDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-ssa1099",
    name: "ssa1099--2025.pdf",
    size: 12,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "ssa-1099",
    coverage: "supported",
    label: "Form SSA-1099 (2025)",
    notes: "Fixture",
    matchedFixtureId: "irs-ssa-1099-2025",
    seededFactIds: ["social-security-benefits-review"],
    ...overrides
  };
}

function createSocialSecurityReturnSummary(
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
        id: "social-security-benefits",
        label: "Social Security benefits",
        status: "ready",
        engineTargets: ["SSA-1099", "Form 1040 Lines 6a, 6b, and 25b"],
        relatedFactIds: ["social-security-benefits-review"],
        sourceDocumentIds: ["doc-ssa1099"],
        answeredFactCount: 1,
        factCount: 1
      }
    ],
    ...overrides
  };
}

function createSocialSecuritySeededReturn(
  overrides: Partial<SeededReturnSummary>
): SeededReturnSummary {
  return {
    status: "ready-for-interview",
    taxYearHints: [2025],
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
        prompt: "Confirm net Social Security benefits and withholding from the SSA-1099.",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Net benefits and withholding are confirmed.",
        sourceDocumentIds: ["doc-ssa1099"]
      }
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [],
    ...overrides
  };
}

function createStudentLoanDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-1098e",
    name: "f1098e.pdf",
    size: 12,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "1098-e",
    coverage: "supported",
    label: "Form 1098-E (Rev. January 2025)",
    notes: "Fixture",
    matchedFixtureId: "irs-1098-e-2025",
    seededFactIds: ["student-loan-interest-review"],
    ...overrides
  };
}

function createStudentLoanReturnSummary(
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
        id: "student-loan-interest",
        label: "Student loan interest",
        status: "ready",
        engineTargets: ["Form 1098-E", "Schedule 1 Line 21", "Form 1040 Line 10"],
        relatedFactIds: ["student-loan-interest-review"],
        sourceDocumentIds: ["doc-1098e"],
        answeredFactCount: 1,
        factCount: 1
      }
    ],
    ...overrides
  };
}

function createStudentLoanSeededReturn(
  overrides: Partial<SeededReturnSummary>
): SeededReturnSummary {
  return {
    status: "ready-for-interview",
    taxYearHints: [2025],
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
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [],
    ...overrides
  };
}

function createPremiumTaxCreditDocument(
  overrides: Partial<WorkspaceDocumentRecord>
): WorkspaceDocumentRecord {
  return {
    id: "doc-1095a",
    name: "f1095a.pdf",
    size: 12,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "1095-a",
    coverage: "supported",
    label: "2025 Form 1095-A",
    notes: "Fixture",
    matchedFixtureId: "irs-1095-a-2025",
    seededFactIds: ["premium-tax-credit-review"],
    ...overrides
  };
}

function createPremiumTaxCreditReturnSummary(
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
        id: "premium-tax-credit",
        label: "Marketplace coverage and premium tax credit",
        status: "ready",
        engineTargets: ["Form 1095-A", "Form 8962", "Schedule 2 Line 2", "Schedule 3 Line 10"],
        relatedFactIds: ["premium-tax-credit-review"],
        sourceDocumentIds: ["doc-1095a"],
        answeredFactCount: 1,
        factCount: 1
      }
    ],
    ...overrides
  };
}

function createPremiumTaxCreditSeededReturn(
  overrides: Partial<SeededReturnSummary>
): SeededReturnSummary {
  return {
    status: "ready-for-interview",
    taxYearHints: [2025],
    facts: [
      {
        id: "premium-tax-credit-review",
        label: "Marketplace coverage and premium tax credit review",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Marketplace premiums, SLCSP, and advance premium tax credit are confirmed.",
        sourceDocumentIds: ["doc-1095a"]
      }
    ],
    interviewQuestions: [
      {
        id: "premium-tax-credit-review",
        factId: "premium-tax-credit-review",
        prompt: "Confirm Form 1095-A marketplace premiums, SLCSP amounts, advance premium tax credit, and whether any allocation or corrected-form follow-up is still needed.",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Marketplace premiums, SLCSP, and advance premium tax credit are confirmed.",
        sourceDocumentIds: ["doc-1095a"]
      }
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [],
    ...overrides
  };
}

describe("workspace engine input", () => {
  it("builds taxable-interest preview input from confirmed Form 1099-OID fixture facts", () => {
    const documents = [createInterestDocument({})];
    const structuredFacts = buildWorkspaceStructuredFacts(documents, createInterestSeededReturn({}));

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createInterestReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099Int).toEqual([]);
    expect(previewInput?.taxInput.form1099OID).toEqual([
      {
        payer: "Official fixture OID issuer",
        originalIssueDiscount: "1200",
        otherPeriodicInterest: "400",
        earlyWithdrawalPenalty: "25",
        federalWithheld: "40",
        acquisitionPremium: "200",
        treasuryOID: "0",
        bondPremium: "100",
        taxExemptBondPremium: "0",
        taxExemptOID: "0",
      }
    ]);
    expect(previewInput?.assumptions).toContain(
      "The confirmed 2025 Form 1099-OID upload contributes $1,300 of taxable interest with $40 of withholding and $25 of early-withdrawal penalty."
    );
    expect(previewInput?.assumptions).toContain(
      "This interest preview nets any confirmed Form 1099-OID acquisition premium and bond premium adjustments before Schedule B is recomputed."
    );
    expect(previewInput?.sourceDocumentIds).toEqual(["doc-1099oid"]);
    expect(previewInput?.sourceFixtureIds).toEqual(["irs-1099-oid-2025"]);
    expect(previewInput?.sourceFactIdsByItemId["interest-income"]).toEqual([
      "taxable-interest:document-detected",
      "taxable-interest:fixture-oid-interest-income",
      "taxable-interest:interview-answer"
    ]);
  });

  it("builds government-payments preview input from confirmed Form 1099-G fixture facts", () => {
    const documents = [createGovernmentPaymentsDocument({})];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createGovernmentPaymentsSeededReturn({})
    );

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createGovernmentPaymentsReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099G).toEqual([
      expect.objectContaining({
        payer: "Official fixture state agency",
        unemploymentCompensation: "6200",
        stateLocalIncomeTaxRefund: "1100",
        federalWithheld: "620",
        stateWithheld: "55",
        state: "CA"
      })
    ]);
    expect(previewInput?.assumptions).toContain(
      "The confirmed 2025 Form 1099-G upload contributes $6,200 of unemployment compensation, $1,100 of state or local income tax refunds, and $620 of federal withholding."
    );
    expect(previewInput?.assumptions).toContain(
      "This government-payments preview leaves the prior-year state-refund tax-benefit worksheet manual, so uploaded Form 1099-G Box 2 amounts stay non-taxable until prior-year itemized-deduction context is confirmed."
    );
    expect(previewInput?.sourceDocumentIds).toEqual(["doc-1099g"]);
    expect(previewInput?.sourceFixtureIds).toEqual(["irs-1099-g-2025"]);
    expect(previewInput?.sourceFactIdsByItemId["government-payments"]).toEqual([
      "government-payments-review:document-detected",
      "government-payments-review:fixture-government-payments-review",
      "government-payments-review:interview-answer"
    ]);
  });

  it("builds premium-tax-credit preview input from confirmed Form 1095-A fixture facts", () => {
    const documents = [createPremiumTaxCreditDocument({})];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createPremiumTaxCreditSeededReturn({})
    );

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createPremiumTaxCreditReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1095A).toEqual([
      {
        marketplace: "Official fixture Health Insurance Marketplace",
        policyNumber: "OFFICIAL-ACA-2025",
        monthlyPremiums: Array.from({ length: 12 }, (_, index) => ({
          month: index + 1,
          enrolleePremium: "600",
          slcsp: "650",
          advancePremiumTaxCredit: "500"
        }))
      }
    ]);
    expect(previewInput?.assumptions).toContain(
      "The confirmed 2025 Form 1095-A upload contributes $7,200 of marketplace enrollment premiums, $7,800 of SLCSP premiums, and $6,000 of advance premium tax credit."
    );
    expect(previewInput?.assumptions).toContain(
      "This premium tax credit preview still depends on the workspace's confirmed filing status, household income, and dependent roster because Form 8962 reconciles the uploaded policy amounts against household MAGI and tax family size."
    );
    expect(previewInput?.sourceDocumentIds).toEqual(["doc-1095a"]);
    expect(previewInput?.sourceFixtureIds).toEqual(["irs-1095-a-2025"]);
    expect(previewInput?.sourceFactIdsByItemId["premium-tax-credit"]).toEqual([
      "premium-tax-credit-review:document-detected",
      "premium-tax-credit-review:fixture-premium-tax-credit-review",
      "premium-tax-credit-review:interview-answer"
    ]);
  });

  it("does not fabricate primary ownership for retirement distributions when fixture facts do not identify an owner", () => {
    const documents = [createDocument({})];
    const structuredFacts = buildWorkspaceStructuredFacts(documents, createSeededReturn({}));

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099R).toHaveLength(1);
    expect(previewInput?.taxInput.form1099R?.[0]).toMatchObject({
      payer: "Official fixture retirement custodian",
      grossDistribution: "22000",
      taxableAmount: "18000",
      federalWithheld: "1200",
      distributionCode: "7",
      iraSepSimple: true,
      taxableAmountNotDetermined: false,
    });
    expect(previewInput?.taxInput.form1099R?.[0]?.accountHolder).toBeUndefined();
  });

  it("preserves explicit retirement account-owner metadata when structured facts provide it", () => {
    const documents = [createDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "retirement-distribution-review:manual-primary-owner",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Primary taxpayer retirement distribution.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
        questionId: null,
        updatedAt: "2026-03-13T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Explicit owner retirement custodian",
          grossDistribution: "8000",
          taxableAmount: "6000",
          federalWithheld: "500",
          distributionCode: "7",
          iraSepSimple: true,
          accountHolder: "primary",
        }
      }
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099R?.[0]?.accountHolder).toBe("primary");
  });

  it("preserves Roth-qualified retirement metadata when structured facts provide it", () => {
    const documents = [createDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "retirement-distribution-review:qualified-roth",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Qualified Roth IRA distribution.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
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
        sourceDocumentIds: ["doc-1099r"],
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
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099R).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payer: "Qualified Roth IRA custodian",
        distributionCode: "J",
        qualifiedRothDistribution: true,
      }),
      expect.objectContaining({
        payer: "Safe harbor Roth IRA custodian",
        distributionCode: "T",
        rothContributionOrConversionMadeBefore2021: true,
      })
    ]));
    expect(previewInput?.assumptions).toContain(
      "Confirmed Roth-qualified or pre-2021 Roth contribution history metadata from the upload is applied before the final retirement taxable lines are recomputed."
    );
  });

  it("preserves Box 2b and Box 5 retirement metadata when structured facts provide them", () => {
    const documents = [createDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "retirement-distribution-review:box-2b-and-box-5",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Pension distribution with taxable amount not determined and employee contributions.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
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
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099R).toEqual([
      expect.objectContaining({
        payer: "Box 2b pension payer",
        grossDistribution: "12000",
        federalWithheld: "300",
        distributionCode: "7",
        iraSepSimple: false,
        taxableAmountNotDetermined: true,
        employeeContributions: "2000",
      })
    ]);
    expect(previewInput?.taxInput.form1099R?.[0]?.taxableAmount).toBeUndefined();
    expect(previewInput?.assumptions).toContain(
      "The confirmed 2025 Form 1099-R upload contributes $12,000 of gross retirement distributions, statement-reported taxable amount not determined, and $300 of withholding."
    );
  });

  it("preserves qualified charitable distribution retirement metadata when structured facts provide it", () => {
    const documents = [createDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "retirement-distribution-review:qcd",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Qualified charitable distribution confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
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
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099R).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payer: "QCD IRA custodian",
        qualifiedCharitableDistribution: "7000",
      })
    ]));
    expect(previewInput?.assumptions).toContain(
      "Confirmed qualified charitable distribution metadata from the upload is applied before the final retirement taxable lines are recomputed."
    );
  });

  it("preserves Simplified Method and retired public safety officer retirement metadata through workspace recompute", () => {
    const documents = [createDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "retirement-distribution-review:simplified-method-public-safety",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Simplified Method pension basis and retired public safety officer premium metadata confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Municipal pension board",
          grossDistribution: "5000",
          federalWithheld: "0",
          distributionCode: "7",
          iraSepSimple: false,
          taxableAmountNotDetermined: true,
          simplifiedMethodCostInPlan: "31000",
          simplifiedMethodAnnuityStartingDate: "2024-01-01",
          simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
          simplifiedMethodPaymentsReceivedThisYear: 12,
          simplifiedMethodPriorYearRecovered: "0",
          retiredPublicSafetyOfficerInsurancePremiums: "1500",
        }
      }
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099R).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payer: "Municipal pension board",
        taxableAmountNotDetermined: true,
        simplifiedMethodCostInPlan: "31000",
        simplifiedMethodAnnuityStartingDate: "2024-01-01",
        simplifiedMethodPrimaryAnnuitantAgeAtStartingDate: 60,
        simplifiedMethodPaymentsReceivedThisYear: 12,
        simplifiedMethodPriorYearRecovered: "0",
        retiredPublicSafetyOfficerInsurancePremiums: "1500",
      })
    ]));
    expect(previewInput?.assumptions).toContain(
      "Confirmed Simplified Method pension-basis metadata from the upload is applied before the final retirement taxable lines are recomputed."
    );
    expect(previewInput?.assumptions).toContain(
      "Confirmed retired public safety officer insurance-premium metadata from the upload is applied before the final retirement taxable lines are recomputed."
    );

    const result = calculateFederalTax(previewInput!.taxInput);
    const line5b = result.allLines.find((line) => line.form === "1040" && line.line === "5b");
    const form1099RLine4 = result.form1099R?.lines.find((line) => line.form === "Form 1099-R" && line.line === "4");

    expect(line5b?.value.toNumber()).toBe(2300);
    expect(String(form1099RLine4?.inputs["Simplified Method current-year excludable amount"])).toBe("1200");
    expect(String(form1099RLine4?.inputs["Retired public safety officer premium exclusion"])).toBe("1500");
  });

  it("preserves Form 8606 defaulting retirement metadata when structured facts provide it", () => {
    const documents = [createDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "retirement-distribution-review:roth-conversion",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Traditional IRA to Roth IRA conversion confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Conversion IRA custodian",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "2",
          iraSepSimple: true,
          rothConversionAmount: "11750",
        }
      },
      {
        id: "retirement-distribution-review:corrective-distribution",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Current-year IRA contribution returned by the due date confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Corrective IRA custodian",
          grossDistribution: "4200",
          taxableAmount: "200",
          federalWithheld: "0",
          distributionCode: "8",
          iraSepSimple: true,
          returnedContributionByDueDate: true,
        }
      },
      {
        id: "retirement-distribution-review:roth-rollover-and-excess",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Roth IRA rollover and returned excess contribution metadata confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Roth rollover custodian",
          grossDistribution: "6100",
          taxableAmount: "0",
          federalWithheld: "0",
          distributionCode: "J",
          iraSepSimple: true,
          rothIraRolledOverAmount: "5000",
          excessContributionReturnedWithoutEarnings: true,
        }
      }
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099R).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payer: "Conversion IRA custodian",
        rothConversionAmount: "11750",
      }),
      expect.objectContaining({
        payer: "Corrective IRA custodian",
        returnedContributionByDueDate: true,
      }),
      expect.objectContaining({
        payer: "Roth rollover custodian",
        rothIraRolledOverAmount: "5000",
        excessContributionReturnedWithoutEarnings: true,
      })
    ]));
    expect(previewInput?.assumptions).toContain(
      "Confirmed Roth conversion, rollover, and corrective-distribution metadata from the upload is applied before Form 8606 defaults and the final retirement taxable lines are recomputed."
    );
  });

  it("preserves Form 5329 retirement metadata when structured facts provide it", () => {
    const documents = [createDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "retirement-distribution-review:dated-separation",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Distribution date and separation-from-service exception metadata confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
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
      },
      {
        id: "retirement-distribution-review:governmental-457b",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Eligible governmental 457(b) transfer metadata confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "City Deferred Compensation Plan",
          grossDistribution: "12000",
          taxableAmount: "12000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
          eligibleGovernmental457bPlan: true,
          eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "3000",
        }
      },
      {
        id: "retirement-distribution-review:terminal-illness",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Terminal illness exception metadata confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-r-summary",
          payer: "Former Employer Pension",
          grossDistribution: "9000",
          taxableAmount: "9000",
          federalWithheld: "0",
          distributionCode: "1",
          iraSepSimple: false,
          terminalIllnessExceptionApplies: true,
        }
      }
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099R).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payer: "Former Employer 401(k)",
        distributionDate: "2025-09-15",
        separationFromServiceAfterAge55ExceptionApplies: true,
      }),
      expect.objectContaining({
        payer: "City Deferred Compensation Plan",
        eligibleGovernmental457bPlan: true,
        eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "3000",
      }),
      expect.objectContaining({
        payer: "Former Employer Pension",
        terminalIllnessExceptionApplies: true,
      })
    ]));
    expect(previewInput?.assumptions).toContain(
      "Confirmed retirement distribution-date, early-distribution exception, and eligible governmental 457(b) metadata from the upload is applied before Form 5329 defaults and the final retirement taxable lines are recomputed."
    );
  });

  it("excludes retirement statements flagged as prior-year-only from the current-year preview input", () => {
    const documents = [createDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "retirement-distribution-review:prior-year-only",
        factId: "retirement-distribution-review",
        label: "Retirement distribution review",
        kind: "fixture-derived",
        value: "Prior-year taxable retirement distribution.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099r"],
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
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099R).toEqual([]);
    expect(previewInput?.assumptions).toContain(
      "The confirmed 2025 Form 1099-R upload was marked as not belonging on the current-year return, so no retirement distributions were included in this preview."
    );
    expect(previewInput?.sourceFactIdsByItemId["retirement-distributions"]).toEqual([
      "retirement-distribution-review:prior-year-only"
    ]);
  });

  it("builds Social Security preview input from confirmed SSA-1099 fixture facts", () => {
    const documents = [createSocialSecurityDocument({})];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createSocialSecuritySeededReturn({})
    );

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createSocialSecurityReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.formSSA1099).toEqual([
      {
        recipient: "Official fixture beneficiary",
        netBenefits: "60000",
        federalWithheld: "1500"
      }
    ]);
    expect(previewInput?.assumptions).toContain(
      "The confirmed 2025 Form SSA-1099 upload contributes $60,000 of net Social Security benefits and $1,500 of withholding."
    );
    expect(previewInput?.sourceDocumentIds).toEqual(["doc-ssa1099"]);
    expect(previewInput?.sourceFixtureIds).toEqual(["irs-ssa-1099-2025"]);
    expect(previewInput?.sourceFactIdsByItemId["social-security-benefits"]).toEqual([
      "social-security-benefits-review:document-detected",
      "social-security-benefits-review:fixture-social-security-benefits",
      "social-security-benefits-review:interview-answer"
    ]);
  });

  it("builds student loan interest preview input from confirmed Form 1098-E fixture facts", () => {
    const documents = [createStudentLoanDocument({})];
    const structuredFacts = buildWorkspaceStructuredFacts(
      documents,
      createStudentLoanSeededReturn({})
    );

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createStudentLoanReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1098E).toEqual([
      {
        lender: "Official fixture loan servicer",
        studentLoanInterestReceived: "2100",
        includesOriginationFeesOrCapitalizedInterest: true
      }
    ]);
    expect(previewInput?.assumptions).toContain(
      "The confirmed 2025 Form 1098-E upload contributes $2,100 of student loan interest."
    );
    expect(previewInput?.assumptions).toContain(
      "This student loan preview keeps any uploaded capitalized-interest indicator attached to Form 1098-E before Schedule 1 Line 21 is recomputed."
    );
    expect(previewInput?.assumptions).toContain(
      "This student loan preview assumes no additional below-threshold interest needs manual entry beyond the uploaded statements."
    );
    expect(previewInput?.sourceDocumentIds).toEqual(["doc-1098e"]);
    expect(previewInput?.sourceFixtureIds).toEqual(["irs-1098-e-2025"]);
    expect(previewInput?.sourceFactIdsByItemId["student-loan-interest"]).toEqual([
      "student-loan-interest-review:document-detected",
      "student-loan-interest-review:fixture-student-loan-interest",
      "student-loan-interest-review:interview-answer"
    ]);
  });

  it("preserves explicit HSA owner metadata when structured facts provide it", () => {
    const documents = [createHsaDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "hsa-distribution-review:manual-spouse-owner",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "Spouse-owned HSA distribution.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa"],
        questionId: null,
        updatedAt: "2026-03-13T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-sa-summary",
          payer: "Explicit owner HSA custodian",
          grossDistribution: "4800",
          distributionCode: "1",
          accountType: "hsa",
          accountHolder: "spouse",
        }
      }
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createHsaReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099SA).toHaveLength(1);
    expect(previewInput?.taxInput.form1099SA?.[0]?.accountHolder).toBe("spouse");
  });

  it("preserves HSA death-distribution metadata when structured facts provide it", () => {
    const documents = [createHsaDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "hsa-distribution-review:estate-death-distribution",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "Estate HSA death distribution.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa"],
        questionId: null,
        updatedAt: "2026-03-13T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-sa-summary",
          payer: "Estate HSA custodian",
          grossDistribution: "11000",
          distributionCode: "4",
          accountType: "hsa",
          beneficiaryRole: "estate",
          deathDistributionTiming: "year_of_death",
          fmvOnDateOfDeath: "6000",
        }
      }
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createHsaReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099SA).toHaveLength(1);
    expect(previewInput?.taxInput.form1099SA?.[0]).toMatchObject({
      payer: "Estate HSA custodian",
      grossDistribution: "11000",
      distributionCode: "4",
      accountType: "hsa",
      beneficiaryRole: "estate",
      deathDistributionTiming: "year_of_death",
      fmvOnDateOfDeath: "6000",
    });
    expect(previewInput?.assumptions).toContain(
      "Confirmed Form 1099-SA death-distribution metadata uses $6,000 of date-of-death fair market value on Form 8889 and routes $5,000 of post-death earnings to other income."
    );
    expect(previewInput?.assumptions).toContain(
      "This HSA preview still leaves rollover and medical-expense offsets manual unless they are separately confirmed in the workspace ledger."
    );
  });

  it("preserves HSA death-distribution timing metadata when structured facts provide it", () => {
    const documents = [createHsaDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "hsa-distribution-review:nonspouse-after-year-of-death",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "After-year-of-death nonspouse beneficiary HSA distribution.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa"],
        questionId: null,
        updatedAt: "2026-03-19T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-sa-summary",
          payer: "Inherited HSA custodian",
          grossDistribution: "9000",
          distributionCode: "6",
          accountType: "hsa",
          beneficiaryRole: "other_beneficiary",
          deathDistributionTiming: "after_year_of_death",
          fmvOnDateOfDeath: "6200",
        }
      }
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createHsaReturnSummary({}),
      structuredFacts
    );

    expect(previewInput?.taxInput.form1099SA?.[0]).toMatchObject({
      payer: "Inherited HSA custodian",
      distributionCode: "6",
      beneficiaryRole: "other_beneficiary",
      deathDistributionTiming: "after_year_of_death",
      fmvOnDateOfDeath: "6200",
    });
  });

  it("preserves Form 1099-SA Box 2 earnings when structured facts provide a returned excess contribution summary", () => {
    const documents = [createHsaDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "hsa-distribution-review:returned-excess-earnings",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "Returned excess contribution with taxable earnings.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa"],
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

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createHsaReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099SA).toEqual([
      {
        payer: "HSA Bank",
        grossDistribution: "1500",
        earningsOnExcessContributions: "60",
        distributionCode: "2",
        accountType: "hsa",
      }
    ]);
    expect(previewInput?.assumptions).toContain(
      "Confirmed Form 1099-SA Box 2 earnings on returned excess contributions add $60 of other income."
    );
    expect(previewInput?.assumptions).toContain(
      "This HSA preview still leaves rollover and medical-expense offsets manual unless they are separately confirmed in the workspace ledger."
    );
  });

  it("uses confirmed HSA rollover and qualified medical-expense facts to prefill Form 8889 preview input", () => {
    const documents = [createHsaDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "hsa-distribution-review:confirmed-offsets",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "Confirmed HSA rollovers and qualified medical expenses.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa"],
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

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createHsaReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099SA).toEqual([
      {
        payer: "HSA Bank",
        grossDistribution: "2400",
        earningsOnExcessContributions: "0",
        distributionCode: "1",
        accountType: "hsa",
      }
    ]);
    expect(previewInput?.taxInput.form8889).toMatchObject({
      rolloverDistributions: "400",
      qualifiedMedicalExpenses: "1500",
    });
    expect(previewInput?.assumptions).toContain(
      "Confirmed HSA rollover review excludes $400 of distributions on Form 8889 Line 14b."
    );
    expect(previewInput?.assumptions).toContain(
      "Confirmed qualified medical-expense review applies $1,500 on Form 8889 Line 15."
    );
    expect(previewInput?.assumptions).not.toContain(
      "This HSA preview still leaves rollover and medical-expense offsets manual unless they are separately confirmed in the workspace ledger."
    );
  });

  it("uses confirmed decedent medical expenses to prefill the beneficiary-only Form 8889 Line 15 branch", () => {
    const documents = [createHsaDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "hsa-distribution-review:confirmed-decedent-medical-expenses",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "Confirmed beneficiary-paid decedent medical expenses after death.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa"],
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

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createHsaReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.form1099SA).toEqual([
      {
        payer: "Inherited HSA Bank",
        grossDistribution: "5300",
        earningsOnExcessContributions: "0",
        distributionCode: "6",
        accountType: "hsa",
        beneficiaryRole: "other_beneficiary",
        deathDistributionTiming: "after_year_of_death",
        fmvOnDateOfDeath: "5000",
      }
    ]);
    expect(previewInput?.taxInput.form8889).toMatchObject({
      decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath: "1200",
    });
    expect(previewInput?.assumptions).toContain(
      "Confirmed Form 1099-SA death-distribution metadata uses $5,000 of date-of-death fair market value on Form 8889 and routes $300 of post-death earnings to other income."
    );
    expect(previewInput?.assumptions).toContain(
      "Confirmed decedent medical-expense review applies $1,200 on the beneficiary-only Form 8889 Line 15 branch."
    );
    expect(previewInput?.assumptions).toContain(
      "This HSA preview still leaves rollover offsets manual unless they are separately confirmed in the workspace ledger."
    );
  });

  it("describes disability and prohibited-transaction HSA metadata in the preview assumptions", () => {
    const documents = [createHsaDocument({})];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "hsa-distribution-review:disability",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "Disability distribution confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-sa-summary",
          payer: "HSA Bank",
          grossDistribution: "900",
          distributionCode: "3",
          accountType: "hsa",
        }
      },
      {
        id: "hsa-distribution-review:prohibited-transaction",
        factId: "hsa-distribution-review",
        label: "HSA distribution review",
        kind: "fixture-derived",
        value: "Prohibited transaction confirmed.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-1099sa"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "1099-sa-summary",
          payer: "HSA Bank",
          grossDistribution: "2400",
          distributionCode: "5",
          accountType: "hsa",
        }
      }
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createHsaReturnSummary({}),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.assumptions).toContain(
      "Confirmed Form 1099-SA disability coding automatically exempts $900 from the HSA 20% additional-tax base before any remaining manual exception inputs."
    );
    expect(previewInput?.assumptions).toContain(
      "Confirmed Form 1099-SA prohibited-transaction coding keeps $2,400 of deemed distributions out of the qualified medical-expense offset path."
    );
  });

  it("preserves W-2 Box 12 code W owner metadata for mixed-owner HSA preview recomputes", () => {
    const documents = [
      createW2Document({
        id: "doc-w2-primary",
        name: "primary-w2.pdf",
      }),
      createW2Document({
        id: "doc-w2-spouse",
        name: "spouse-w2.pdf",
      })
    ];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "wages:primary-hsa-owner",
        factId: "wages",
        label: "Wages",
        kind: "fixture-derived",
        value: "Primary W-2 with owner-tagged HSA employer contributions.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-w2-primary"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "w2-summary",
          employerName: "Primary Employer",
          employerEin: "12-3456789",
          wages: "65000",
          federalWithheld: "7000",
          box12CodeW: "500",
          accountHolder: "primary",
        }
      },
      {
        id: "wages:spouse-hsa-owner",
        factId: "wages",
        label: "Wages",
        kind: "fixture-derived",
        value: "Spouse W-2 with owner-tagged HSA employer contributions.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["doc-w2-spouse"],
        questionId: null,
        updatedAt: "2026-03-18T00:00:00.000Z",
        machineValue: {
          entryKind: "w2-summary",
          employerName: "Spouse Employer",
          employerEin: "98-7654321",
          wages: "42000",
          federalWithheld: "4500",
          box12CodeW: "900",
          accountHolder: "spouse",
        }
      }
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createWagesReturnSummary({
        taxYearState: "multiple",
        items: [
          {
            id: "wages-and-withholding",
            label: "Wages and withholding",
            status: "ready",
            engineTargets: ["Form 1040 Lines 1 and 25a"],
            relatedFactIds: ["wages", "withholding"],
            sourceDocumentIds: ["doc-w2-primary", "doc-w2-spouse"],
            answeredFactCount: 2,
            factCount: 2
          }
        ]
      }),
      structuredFacts
    );

    expect(previewInput).not.toBeNull();
    expect(previewInput?.taxInput.w2s).toEqual(expect.arrayContaining([
      expect.objectContaining({
        employer: { name: "Primary Employer", ein: "12-3456789" },
        box12CodeW: "500",
        accountHolder: "primary",
      }),
      expect.objectContaining({
        employer: { name: "Spouse Employer", ein: "98-7654321" },
        box12CodeW: "900",
        accountHolder: "spouse",
      })
    ]));

    const marriedPreviewTaxInput = {
      ...previewInput!.taxInput,
      taxpayer: {
        ...previewInput!.taxInput.taxpayer,
        filingStatus: "married_filing_jointly" as const,
        spouse: {
          firstName: "Jordan",
          lastName: "Preview",
          ssn: "000-00-0001",
          dateOfBirth: "1991-02-02",
        }
      }
    };
    const result = calculateFederalTax(marriedPreviewTaxInput);

    expect(result.form8889ByOwner?.primary?.line9.toNumber()).toBe(500);
    expect(result.form8889ByOwner?.primary?.line13.toNumber()).toBe(0);
    expect(result.form8889ByOwner?.spouse?.line9.toNumber()).toBe(900);
    expect(result.form8889ByOwner?.spouse?.line13.toNumber()).toBe(0);
  });

  it("uses parsed extended W-2 box values when uploads include them", () => {
    const documents = [
      createW2Document({
        id: "doc-w2-upload",
        name: "uploaded-w2.pdf",
      }),
    ];
    const structuredFacts: WorkspaceStructuredFactRecord[] = [
      {
        id: "wages:uploaded-w2",
        factId: "wages",
        label: "Wages",
        kind: "document-detected",
        value: "Parsed uploaded W-2 values.",
        sourceType: "upload",
        confidence: "high",
        sourceDocumentIds: ["doc-w2-upload"],
        questionId: null,
        updatedAt: "2026-03-28T00:00:00.000Z",
        machineValue: {
          entryKind: "w2-summary",
          employerName: "Uploaded Employer",
          employerEin: "12-3456789",
          wages: "107175.28",
          federalWithheld: "15251.46",
          socialSecurityWages: "107175.28",
          socialSecurityWithheld: "6644.87",
          medicareWages: "107175.28",
          medicareWithheld: "1554.04",
          stateWages: "107175.28",
          stateWithheld: "2962.12",
        }
      }
    ];

    const previewInput = buildWorkspaceEngineInput(
      documents,
      createWagesReturnSummary({
        taxYearState: "single",
        items: [
          {
            id: "wages-and-withholding",
            label: "Wages and withholding",
            status: "ready",
            engineTargets: ["Form 1040 Lines 1 and 25a"],
            relatedFactIds: ["wages", "withholding"],
            sourceDocumentIds: ["doc-w2-upload"],
            answeredFactCount: 2,
            factCount: 2
          }
        ]
      }),
      structuredFacts
    );

    expect(previewInput?.taxInput.w2s).toEqual([
      expect.objectContaining({
        wages: "107175.28",
        federalWithheld: "15251.46",
        socialSecurityWages: "107175.28",
        socialSecurityWithheld: "6644.87",
        medicareWages: "107175.28",
        medicareWithheld: "1554.04",
        stateWages: "107175.28",
        stateTaxWithheld: "2962.12",
      })
    ]);
  });
});
