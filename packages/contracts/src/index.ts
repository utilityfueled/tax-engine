export type SupportedDocumentKind =
  | "w2"
  | "1099-int"
  | "1099-g"
  | "1099-oid"
  | "1099-div"
  | "1099-b"
  | "1099-da"
  | "1095-a"
  | "1098-e"
  | "1099-r"
  | "ssa-1099"
  | "1099-sa"
  | "1099-nec"
  | "schedule-c-support"
  | "training-scenario";

export type CoverageStatus =
  | "supported"
  | "partially-supported"
  | "needs-review"
  | "planned";

export interface SupportMatrixEntry {
  kind: SupportedDocumentKind;
  label: string;
  coverage: CoverageStatus;
  notes: string;
}

export interface OfficialSampleDocumentFixture {
  id: string;
  kind: Extract<
    SupportedDocumentKind,
    "w2" | "1099-int" | "1099-g" | "1099-oid" | "1099-div" | "1099-b" | "1095-a" | "1098-e" | "1099-r" | "ssa-1099" | "1099-sa" | "1099-nec" | "training-scenario"
  >;
  title: string;
  aliases: string[];
  taxYearHint: number | null;
}

export type WorkspaceDeploymentMode =
  | "self-host"
  | "hosted";

export type HostedPlanId =
  | "starter"
  | "plus"
  | "review";

export interface HostedPlanDefinition {
  id: HostedPlanId;
  name: string;
  priceLabel: string;
  summary: string;
  featureBullets: string[];
}

export interface HostedAffordanceDefinition {
  id: string;
  label: string;
  minimumPlanId: HostedPlanId;
  rollout: "preview" | "coming-soon";
  summary: string;
}

export const hostedPlanCatalog: HostedPlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    priceLabel: "$19/mo",
    summary: "Hosted account, billing, privacy-safe workspace shells, and reminder workflow tooling for people who do not want to self-host.",
    featureBullets: [
      "Hosted account and billing",
      "Privacy-safe workspace shells across devices",
      "AI explanations are planned and unavailable pending qualification",
      "Deadline tracking (coming soon)",
      "Quarterly deadline reminder emails (coming soon)",
      "Draft-return AI summaries are unavailable pending qualification"
    ]
  },
  {
    id: "plus",
    name: "Plus",
    priceLabel: "$49/mo",
    summary: "Adds reminder automation, calendars, and workflow continuity tools without storing raw source forms on the server.",
    featureBullets: [
      "Everything in Starter",
      "Deadline dashboard and ICS calendar feed for tax deadlines (coming soon)",
      "What changed this quarter rule-change digest (coming soon)",
      "Reminder automation and continuity tools (coming soon)"
    ]
  },
  {
    id: "review",
    name: "Review",
    priceLabel: "Custom quote",
    summary: "Reserved for custom workflow tooling under a separate written agreement.",
    featureBullets: [
      "Everything in Plus",
      "Redacted review bundle controls (coming soon)",
      "Complex-return workflow setup (coming soon)"
    ]
  }
];

export const publicHostedPlanCatalog = hostedPlanCatalog.filter((plan) => plan.id !== "review");

export const hostedAffordanceCatalog: HostedAffordanceDefinition[] = [
  {
    id: "provider-summary",
    label: "AI-powered return summary",
    minimumPlanId: "starter",
    rollout: "coming-soon",
    summary: "AI summaries remain unavailable until independent evaluation and production qualification pass."
  },
  {
    id: "filing-pack-history",
    label: "Saved return metadata",
    minimumPlanId: "plus",
    rollout: "preview",
    summary: "See saved return metadata across devices. Original documents, private answers and review downloads remain on your device."
  },
  {
    id: "partner-review",
    label: "Redacted review bundle",
    minimumPlanId: "review",
    rollout: "coming-soon",
    summary: "Export a redacted bundle you can share with a professional you engage separately."
  }
];

export const publicHostedAffordanceCatalog = hostedAffordanceCatalog.filter(
  (affordance) => affordance.minimumPlanId !== "review"
);

export const supportMatrix: SupportMatrixEntry[] = [
  {
    kind: "w2",
    label: "Form W-2",
    coverage: "supported",
    notes: "Core wage flow and withholding-driven returns are supported by the current engine."
  },
  {
    kind: "1099-int",
    label: "Form 1099-INT",
    coverage: "supported",
    notes: "Interest income and early withdrawal penalty inputs are already modeled."
  },
  {
    kind: "1099-g",
    label: "Form 1099-G",
    coverage: "supported",
    notes: "Unemployment compensation, state/local tax refund, and federal withholding inputs are supported. Prior-year state-refund taxability still depends on additional worksheet facts outside the uploaded statement."
  },
  {
    kind: "1099-oid",
    label: "Form 1099-OID",
    coverage: "supported",
    notes: "Original issue discount, acquisition premium, other periodic interest, and related withholding/penalty inputs are supported."
  },
  {
    kind: "1099-div",
    label: "Form 1099-DIV",
    coverage: "supported",
    notes: "Ordinary dividends, qualified dividends, and capital gain distributions are supported."
  },
  {
    kind: "1099-b",
    label: "Form 1099-B",
    coverage: "supported",
    notes: "Capital gain/loss flows are supported with Form 8949 and Schedule D coverage."
  },
  {
    kind: "1099-da",
    label: "Form 1099-DA",
    coverage: "supported",
    notes: "Digital asset sale and exchange flows are supported through Form 8949 and Schedule D when basis and holding period are provided."
  },
  {
    kind: "1095-a",
    label: "Form 1095-A",
    coverage: "supported",
    notes: "Marketplace enrollment premiums, SLCSP premiums, and advance premium tax credit amounts are supported for deterministic Form 8962 recompute."
  },
  {
    kind: "1098-e",
    label: "Form 1098-E",
    coverage: "supported",
    notes: "Student loan interest statements are supported for deterministic recompute, including Schedule 1 Line 21 deduction routing."
  },
  {
    kind: "1099-r",
    label: "Form 1099-R",
    coverage: "supported",
    notes: "Retirement distribution gross, taxable, and withholding flows are supported for deterministic recompute."
  },
  {
    kind: "ssa-1099",
    label: "Form SSA-1099",
    coverage: "supported",
    notes: "Social Security benefit statements are supported for deterministic recompute, including taxable-benefit and withholding flows."
  },
  {
    kind: "1099-sa",
    label: "Form 1099-SA",
    coverage: "supported",
    notes: "HSA distribution flows are supported for deterministic recompute, including document-backed Form 8889 support for simple HSA statements."
  },
  {
    kind: "1099-nec",
    label: "Form 1099-NEC",
    coverage: "partially-supported",
    notes: "Simple sole-proprietor income is supported; complex business bookkeeping remains out of scope."
  },
  {
    kind: "schedule-c-support",
    label: "Simple Schedule C",
    coverage: "partially-supported",
    notes: "Best for low-complexity single-business returns with clean records."
  },
  {
    kind: "training-scenario",
    label: "IRS training scenarios",
    coverage: "planned",
    notes: "Official IRS/VITA scenario packs will be used to harden ingestion and guided interview flows."
  }
];

export const officialSampleDocumentFixtures: OfficialSampleDocumentFixture[] = [
  {
    id: "irs-w2-2025",
    kind: "w2",
    title: "2025 Form W-2",
    aliases: ["irs-w2-2025", "fw2--2025"],
    taxYearHint: 2025
  },
  {
    id: "irs-w2-2026",
    kind: "w2",
    title: "2026 Form W-2 (official info-copy PDF)",
    aliases: ["irs-w2-2026", "fw2--2026"],
    taxYearHint: 2026
  },
  {
    id: "irs-1099-int-2024",
    kind: "1099-int",
    title: "Form 1099-INT (Rev. January 2024)",
    aliases: ["irs-1099-int-2024", "f1099int"],
    taxYearHint: 2025
  },
  {
    id: "irs-1099-g-2025",
    kind: "1099-g",
    title: "Form 1099-G (Rev. March 2024)",
    aliases: ["irs-1099-g-2025", "f1099g"],
    taxYearHint: 2025
  },
  {
    id: "irs-1099-oid-2025",
    kind: "1099-oid",
    title: "Form 1099-OID (Rev. January 2024)",
    aliases: ["irs-1099-oid-2025", "f1099oid"],
    taxYearHint: 2025
  },
  {
    id: "irs-1099-div-2024",
    kind: "1099-div",
    title: "Form 1099-DIV (Rev. January 2024)",
    aliases: ["irs-1099-div-2024", "f1099div"],
    taxYearHint: 2025
  },
  {
    id: "irs-1099-b-2025",
    kind: "1099-b",
    title: "2025 Form 1099-B",
    aliases: ["irs-1099-b-2025", "f1099b--2025", "f1099b"],
    taxYearHint: 2025
  },
  {
    id: "irs-1095-a-2025",
    kind: "1095-a",
    title: "2025 Form 1095-A",
    aliases: ["irs-1095-a-2025", "f1095a"],
    taxYearHint: 2025
  },
  {
    id: "irs-1098-e-2025",
    kind: "1098-e",
    title: "Form 1098-E (Rev. January 2025)",
    aliases: ["irs-1098-e-2025", "f1098e"],
    taxYearHint: 2025
  },
  {
    id: "irs-1099-r-2025",
    kind: "1099-r",
    title: "Form 1099-R (Rev. January 2025)",
    aliases: ["irs-1099-r-2025", "f1099r"],
    taxYearHint: 2025
  },
  {
    id: "irs-ssa-1099-2025",
    kind: "ssa-1099",
    title: "Form SSA-1099 benefit statement reference (2025)",
    aliases: ["irs-ssa-1099-2025", "ssa1099", "ssa-1099", "p915"],
    taxYearHint: 2025
  },
  {
    id: "irs-1099-sa-2025",
    kind: "1099-sa",
    title: "Form 1099-SA (Rev. January 2025)",
    aliases: ["irs-1099-sa-2025", "f1099sa"],
    taxYearHint: 2025
  },
  {
    id: "irs-1099-nec-2025",
    kind: "1099-nec",
    title: "Form 1099-NEC (Rev. April 2025)",
    aliases: ["irs-1099-nec-2025", "f1099nec"],
    taxYearHint: 2025
  },
  {
    id: "irs-publication-4491-2025",
    kind: "training-scenario",
    title: "Publication 4491, VITA/TCE Training Guide",
    aliases: ["irs-publication-4491-2025", "p4491"],
    taxYearHint: 2025
  },
  {
    id: "irs-publication-4491x-2026",
    kind: "training-scenario",
    title: "Publication 4491-X (Rev. 1-2026)",
    aliases: ["irs-publication-4491x-2026", "p4491x"],
    taxYearHint: 2026
  }
];

export interface WorkspaceChecklistItem {
  id: string;
  label: string;
  status: "ready" | "needs-input" | "blocked";
}

export type WorkspaceAuditEventKind =
  | "workspace-created"
  | "documents-ingested"
  | "document-removed"
  | "document-year-confirmed"
  | "workspace-cleared"
  | "interview-answered"
  | "interview-reopened";

export interface WorkspaceAuditEventRecord {
  id: string;
  occurredAt: string;
  kind: WorkspaceAuditEventKind;
  message: string;
  documentIds: string[];
  questionId: SeededFactId | null;
  answerText: string | null;
}

export const defaultChecklist: WorkspaceChecklistItem[] = [
  { id: "documents", label: "Upload tax documents", status: "ready" },
  { id: "coverage", label: "Check document support", status: "ready" },
  { id: "interview", label: "Answer missing questions", status: "needs-input" },
  { id: "review", label: "Review summary and completed return", status: "blocked" }
];

export type WorkspaceDocumentKind = SupportedDocumentKind | "unknown";

export type WorkspaceDocumentCoverage = CoverageStatus | "unsupported" | "reviewed";

export type SeededFactId =
  | "wages"
  | "withholding"
  | "taxable-interest"
  | "ordinary-dividends"
  | "qualified-dividends"
  | "capital-gain-distributions"
  | "government-payments-review"
  | "retirement-distribution-review"
  | "social-security-benefits-review"
  | "hsa-distribution-review"
  | "student-loan-interest-review"
  | "premium-tax-credit-review"
  | "nonemployee-compensation"
  | "schedule-c-expense-review"
  | "broker-proceeds"
  | "cost-basis-review";

export interface SeededFactDefinition {
  id: SeededFactId;
  label: string;
  prompt: string;
}

export const seededFactDefinitions: SeededFactDefinition[] = [
  {
    id: "wages",
    label: "Wages",
    prompt: "Confirm whether every W-2 is final and whether any boxes require follow-up questions."
  },
  {
    id: "withholding",
    label: "Federal withholding",
    prompt: "Confirm federal and state withholding amounts from each wage statement."
  },
  {
    id: "taxable-interest",
    label: "Taxable interest",
    prompt: "Confirm whether any tax-exempt interest or early withdrawal penalties also apply."
  },
  {
    id: "ordinary-dividends",
    label: "Ordinary dividends",
    prompt: "Confirm whether all dividend statements are included for the year."
  },
  {
    id: "qualified-dividends",
    label: "Qualified dividends",
    prompt: "Confirm qualified dividend amounts and whether any foreign tax was paid."
  },
  {
    id: "capital-gain-distributions",
    label: "Capital gain distributions",
    prompt: "Confirm whether capital gain distributions or reinvested dividends need basis review."
  },
  {
    id: "government-payments-review",
    label: "Government payments review",
    prompt: "Confirm unemployment compensation, any state or local income tax refund amounts, withholding, and whether prior-year itemized deductions make any refund taxable."
  },
  {
    id: "retirement-distribution-review",
    label: "Retirement distribution review",
    prompt: "Confirm gross distributions, taxable amounts, withholding, whether each retirement statement belongs on the current-year return, and any early-distribution exception, distribution-date, or governmental 457(b) details that affect Form 5329."
  },
  {
    id: "social-security-benefits-review",
    label: "Social Security benefits review",
    prompt: "Confirm net Social Security benefits, withholding, and whether any prior-year lump-sum or repayment adjustments still need to be entered manually."
  },
  {
    id: "hsa-distribution-review",
    label: "HSA distribution review",
    prompt: "Confirm gross HSA distributions, rollovers, qualified medical expenses, any decedent medical expenses paid within 1 year after death, and whether any disability, death, or prohibited-transaction exceptions apply."
  },
  {
    id: "student-loan-interest-review",
    label: "Student loan interest review",
    prompt: "Confirm student loan interest reported on Form 1098-E, whether any capitalized interest is already included, and whether any additional below-threshold interest still needs manual entry."
  },
  {
    id: "premium-tax-credit-review",
    label: "Marketplace coverage and premium tax credit review",
    prompt: "Confirm Form 1095-A marketplace premiums, SLCSP amounts, advance premium tax credit, and whether any allocation or corrected-form follow-up is still needed."
  },
  {
    id: "nonemployee-compensation",
    label: "1099-NEC income classification",
    prompt: "Confirm whether each Form 1099-NEC amount belongs on Schedule C and whether any payments should be reclassified or excluded."
  },
  {
    id: "schedule-c-expense-review",
    label: "Schedule C expense review",
    prompt: "Confirm the business expenses, mileage, and home office records needed to compute Schedule C net profit."
  },
  {
    id: "broker-proceeds",
    label: "Broker sale proceeds",
    prompt: "Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing."
  },
  {
    id: "cost-basis-review",
    label: "Cost basis and adjustments review",
    prompt: "Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B."
  }
];

export interface SeededReturnFactRecord {
  id: SeededFactId;
  label: string;
  status: "pending" | "answered";
  answeredAt: string | null;
  answerText: string | null;
  sourceDocumentIds: string[];
}

export interface InterviewQuestionRecord {
  id: SeededFactId;
  factId: SeededFactId;
  prompt: string;
  status: "pending" | "answered";
  answeredAt: string | null;
  answerText: string | null;
  sourceDocumentIds: string[];
}

export interface SeededReturnSummary {
  status: "empty" | "ready-for-interview" | "needs-review";
  taxYearHints: number[];
  facts: SeededReturnFactRecord[];
  interviewQuestions: InterviewQuestionRecord[];
  interviewQueue: string[];
  nextQuestionId: SeededFactId | null;
  reviewNotes: string[];
}

export type WorkspaceStructuredFactKind =
  | "document-detected"
  | "fixture-derived"
  | "interview-answer";

export type WorkspaceStructuredFactSourceType =
  | "upload"
  | "official-fixture"
  | "user-answer";

export type WorkspaceStructuredFactConfidence =
  | "low"
  | "high";

export interface WorkspaceStructuredFactMachineValue1099BTransaction {
  entryKind: "1099-b-transaction";
  sourceFactsVersion?: 2;
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: string;
  costBasis: string;
  adjustments?: string;
  basisReportedToIRS?: boolean;
  holdingPeriod?: "short" | "long";
  digitalAsset?: boolean;
  washSale?: boolean;
  washSaleDisallowed?: string;
}

export interface WorkspaceStructuredFactMachineValueW2Summary {
  entryKind: "w2-summary";
  sourceFactsVersion?: 2;
  employerName: string;
  employerEin: string;
  wages: string;
  federalWithheld: string;
  socialSecurityWages?: string;
  socialSecurityTips?: string;
  socialSecurityWithheld?: string;
  medicareWages?: string;
  medicareWithheld?: string;
  stateWages?: string;
  stateWithheld?: string;
  state?: string;
  stateTaxReporting?: "none" | "single" | "multiple";
  box10DependentCareBenefits?: string;
  box12CodeW?: string;
  accountHolder?: "primary" | "spouse";
}

export interface WorkspaceStructuredFactMachineValue1099IntSummary {
  entryKind: "1099-int-summary";
  sourceFactsVersion?: 2;
  payer: string;
  interestIncome: string;
  earlyWithdrawalPenalty?: string;
  federalWithheld?: string;
  taxExemptInterest?: string;
  usSavingsBondInterest?: string;
}

export interface WorkspaceStructuredFactMachineValue1099GSummary {
  entryKind: "1099-g-summary";
  payer: string;
  unemploymentCompensation: string;
  stateLocalIncomeTaxRefund?: string;
  federalWithheld?: string;
  stateWithheld?: string;
  state?: string;
}

export interface WorkspaceStructuredFactMachineValue1099OIDSummary {
  entryKind: "1099-oid-summary";
  payer: string;
  originalIssueDiscount: string;
  otherPeriodicInterest: string;
  earlyWithdrawalPenalty: string;
  federalWithheld: string;
  acquisitionPremium: string;
  treasuryOID: string;
  bondPremium: string;
  taxExemptBondPremium: string;
  taxExemptOID: string;
}

export interface WorkspaceStructuredFactMachineValue1099DivSummary {
  entryKind: "1099-div-summary";
  sourceFactsVersion?: 2;
  payer: string;
  ordinaryDividends: string;
  qualifiedDividends?: string;
  capitalGainDistributions?: string;
  federalWithheld?: string;
  section199ADividends?: string;
  foreignTaxPaid?: string;
}

export interface WorkspaceStructuredFactMachineValue1095ASummary {
  entryKind: "1095-a-summary";
  marketplace: string;
  policyNumber: string;
  monthlyPremiums: Array<{
    month: number;
    enrolleePremium: string;
    slcsp: string;
    advancePremiumTaxCredit: string;
  }>;
}

export interface WorkspaceStructuredFactMachineValue1098ESummary {
  entryKind: "1098-e-summary";
  lender: string;
  studentLoanInterestReceived: string;
  includesOriginationFeesOrCapitalizedInterest?: boolean;
}

export interface WorkspaceStructuredFactMachineValue1099NecSummary {
  entryKind: "1099-nec-summary";
  sourceFactsVersion?: 2;
  payer: string;
  payerTin?: string;
  accountHolder?: "primary" | "spouse";
  nonemployeeCompensation: string;
  federalWithheld?: string;
  stateTaxReporting?: "none" | "single" | "multiple";
  state?: string;
  stateIncome?: string;
  stateWithheld?: string;
}

export interface WorkspaceStructuredFactMachineValue1099RSummary {
  entryKind: "1099-r-summary";
  payer: string;
  grossDistribution: string;
  taxableAmount?: string;
  federalWithheld: string;
  distributionCode: string;
  iraSepSimple: boolean;
  belongsOnCurrentYearReturn?: boolean;
  taxableAmountNotDetermined?: boolean;
  employeeContributions?: string;
  simplifiedMethodCostInPlan?: string;
  simplifiedMethodExpectedPayments?: number;
  simplifiedMethodAnnuityStartingDate?: string;
  simplifiedMethodPrimaryAnnuitantAgeAtStartingDate?: number;
  simplifiedMethodSecondaryAnnuitantAgeAtStartingDate?: number;
  simplifiedMethodPaymentsReceivedThisYear?: number;
  simplifiedMethodPriorYearRecovered?: string;
  retiredPublicSafetyOfficerInsurancePremiums?: string;
  accountHolder?: "primary" | "spouse";
  rothConversionAmount?: string;
  rothIraRolledOverAmount?: string;
  returnedContributionByDueDate?: boolean;
  excessContributionReturnedWithoutEarnings?: boolean;
  qualifiedRothDistribution?: boolean;
  qualifiedCharitableDistribution?: string;
  rothContributionOrConversionMadeBefore2021?: boolean;
  eligibleGovernmental457bPlan?: boolean;
  eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount?: string;
  distributionDate?: string;
  separationFromServiceAfterAge55ExceptionApplies?: boolean;
  qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies?: boolean;
  qualifiedDomesticRelationsOrderExceptionApplies?: boolean;
  terminalIllnessExceptionApplies?: boolean;
}

export interface WorkspaceStructuredFactMachineValueSSA1099Summary {
  entryKind: "ssa-1099-summary";
  recipient: string;
  netBenefits: string;
  federalWithheld: string;
}

export interface WorkspaceStructuredFactMachineValue1099SASummary {
  entryKind: "1099-sa-summary";
  payer: string;
  grossDistribution: string;
  distributionCode: "1" | "2" | "3" | "4" | "5" | "6";
  earningsOnExcessContributions?: string;
  fmvOnDateOfDeath?: string;
  beneficiaryRole?: "surviving_spouse" | "other_beneficiary" | "estate";
  deathDistributionTiming?: "year_of_death" | "after_year_of_death";
  accountHolder?: "primary" | "spouse";
  rolloverDistributions?: string;
  qualifiedMedicalExpenses?: string;
  decedentQualifiedMedicalExpensesPaidWithinOneYearAfterDeath?: string;
  accountType: "hsa";
}

export type WorkspaceStructuredFactMachineValue =
  | WorkspaceStructuredFactMachineValueW2Summary
  | WorkspaceStructuredFactMachineValue1099BTransaction
  | WorkspaceStructuredFactMachineValue1099IntSummary
  | WorkspaceStructuredFactMachineValue1099GSummary
  | WorkspaceStructuredFactMachineValue1099OIDSummary
  | WorkspaceStructuredFactMachineValue1099DivSummary
  | WorkspaceStructuredFactMachineValue1095ASummary
  | WorkspaceStructuredFactMachineValue1098ESummary
  | WorkspaceStructuredFactMachineValue1099NecSummary
  | WorkspaceStructuredFactMachineValue1099RSummary
  | WorkspaceStructuredFactMachineValueSSA1099Summary
  | WorkspaceStructuredFactMachineValue1099SASummary;

export interface WorkspaceDocumentDetectedFactRecord {
  idSuffix: string;
  factId: SeededFactId;
  label: string;
  value: string;
  confidence: WorkspaceStructuredFactConfidence;
  machineValue?: WorkspaceStructuredFactMachineValue | null;
}

export interface WorkspaceStructuredFactRecord {
  id: string;
  factId: SeededFactId;
  label: string;
  kind: WorkspaceStructuredFactKind;
  value: string;
  sourceType: WorkspaceStructuredFactSourceType;
  confidence: WorkspaceStructuredFactConfidence;
  sourceDocumentIds: string[];
  questionId: SeededFactId | null;
  updatedAt: string | null;
  machineValue?: WorkspaceStructuredFactMachineValue | null;
}

export interface WorkspaceReturnSummaryItem {
  id: string;
  label: string;
  status: "ready" | "needs-answer" | "needs-review";
  engineTargets: string[];
  relatedFactIds: SeededFactId[];
  sourceDocumentIds: string[];
  answeredFactCount: number;
  factCount: number;
}

export interface WorkspaceReturnSummaryBlocker {
  id: string;
  message: string;
  relatedFactIds: SeededFactId[];
  sourceDocumentIds: string[];
}

export interface WorkspaceReturnSummary {
  status: "empty" | "awaiting-interview" | "needs-review" | "ready-to-recompute";
  targetTaxYear: number | null;
  taxYearState: "missing" | "single" | "multiple";
  answeredFactCount: number;
  totalFactCount: number;
  readyItemCount: number;
  itemCount: number;
  blockers: WorkspaceReturnSummaryBlocker[];
  items: WorkspaceReturnSummaryItem[];
}

export interface WorkspaceGuidedCompletion {
  completedSectionCount: number;
  totalSectionCount: number;
  skippedSectionCount: number;
  needsReviewSectionCount: number;
}

export type WorkspaceUnsupportedRouteId =
  | "continue-interview"
  | "review-filing-pack"
  | "partner-review-later";

export type WorkspaceUnsupportedRouteUrgency = "now" | "next" | "later";

export interface WorkspaceUnsupportedRoute {
  id: WorkspaceUnsupportedRouteId;
  urgency: WorkspaceUnsupportedRouteUrgency;
  title: string;
  description: string;
  blockerIds: string[];
  relatedFactIds: SeededFactId[];
  sourceDocumentIds: string[];
  reasons: string[];
}

export interface WorkspaceEnginePreviewLine {
  id: string;
  form: string;
  line: string;
  label: string;
  value: string;
  formula: string;
  sourceFactIds: string[];
}

export interface WorkspaceEnginePreview {
  mode: "seeded-fixture" | "engine-recompute";
  title: string;
  taxYear: SupportedEngineTaxYear;
  filingStatus: string;
  filingState?: string;
  sourceDocumentIds: string[];
  sourceFixtureIds: string[];
  assumptions: string[];
  metrics: {
    totalIncome: string;
    agi: string;
    taxableIncome: string;
    totalTax: string;
    totalPayments: string;
    refund: string;
    amountOwed: string;
  };
  stateMetrics?: {
    stateCode: string;
    stateTax: string;
    totalPayments: string;
    refund: string;
    amountOwed: string;
  };
  highlightedLines: WorkspaceEnginePreviewLine[];
}

export interface WorkspaceDocumentRecord {
  id: string;
  /** Actual source/confirmed return year. Null is explicitly unknown; absent is legacy. */
  taxYear?: number | null;
  name: string;
  size: number;
  uploadedAt: string;
  blobStorageKey?: string | null;
  kind: WorkspaceDocumentKind;
  coverage: WorkspaceDocumentCoverage;
  label: string;
  notes: string;
  matchedFixtureId: string | null;
  seededFactIds: SeededFactId[];
  detectedFacts?: WorkspaceDocumentDetectedFactRecord[] | null;
}

export interface WorkspaceSummaryMetrics {
  totalDocuments: number;
  officialFixtureMatches: number;
  supportedDocuments: number;
  pendingReviewDocuments: number;
  interviewQuestionsRemaining: number;
}

export type WorkspaceStorageMode =
  | "local-browser"
  | "hosted-postgres";

export interface ReturnWorkspaceRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  storageMode: WorkspaceStorageMode;
  documents: WorkspaceDocumentRecord[];
  summary: WorkspaceSummaryMetrics;
  seededReturn: SeededReturnSummary;
  structuredFacts: WorkspaceStructuredFactRecord[];
  returnSummary: WorkspaceReturnSummary;
  enginePreview: WorkspaceEnginePreview | null;
  guidedCompletion?: WorkspaceGuidedCompletion | null;
  checklist: WorkspaceChecklistItem[];
  auditTrail: WorkspaceAuditEventRecord[];
}

export interface WorkspaceFilingPackFile {
  path: string;
  mediaType: "application/json" | "text/plain";
  contents: string;
}

export interface WorkspaceFilingPackManifestFile {
  path: WorkspaceFilingPackFile["path"];
  mediaType: WorkspaceFilingPackFile["mediaType"];
}

export interface WorkspaceFilingPackManifest {
  schemaVersion: 1;
  workspaceId: string;
  generatedAt: string;
  storageMode: ReturnWorkspaceRecord["storageMode"];
  targetTaxYear: number | null;
  returnStatus: WorkspaceReturnSummary["status"];
  downloadFileName: string;
  localOnly: true;
  fileCount: number;
  files: WorkspaceFilingPackManifestFile[];
}

export interface WorkspaceFilingPack {
  manifest: WorkspaceFilingPackManifest;
  files: WorkspaceFilingPackFile[];
}

export type ProviderDirectIdentifierKind =
  | "person-name"
  | "ssn"
  | "date-of-birth"
  | "email"
  | "phone"
  | "street-address"
  | "postal-code"
  | "other";

export interface ProviderDirectIdentifier {
  kind: ProviderDirectIdentifierKind;
  value: string;
}

export interface ProviderFacingPayloadRedaction {
  token: string;
  kind: ProviderDirectIdentifierKind;
}

export type ProviderFacingWorkspacePayloadRedaction = ProviderFacingPayloadRedaction;

export interface ProviderFacingPayloadMetadata {
  redactions: ProviderFacingPayloadRedaction[];
  replacementCount: number;
}

export interface ProviderFacingWorkspacePayload extends ProviderFacingPayloadMetadata {
  workspace: ReturnWorkspaceRecord;
  unsupportedRoutes: WorkspaceUnsupportedRoute[];
}

export interface ProviderFacingInterviewRequest {
  workspaceId: string;
  returnSummary: WorkspaceReturnSummary;
  questions: InterviewQuestionRecord[];
  structuredFacts: WorkspaceStructuredFactRecord[];
  auditTrail: WorkspaceAuditEventRecord[];
}

export interface ProviderFacingInterviewPayload extends ProviderFacingPayloadMetadata {
  interview: ProviderFacingInterviewRequest;
}

export interface ProviderFacingExportDraft {
  workspaceId: string;
  returnSummary: WorkspaceReturnSummary;
  enginePreview: WorkspaceEnginePreview | null;
  checklist: WorkspaceChecklistItem[];
  auditTrail: WorkspaceAuditEventRecord[];
}

export interface ProviderFacingExportDraftPayload extends ProviderFacingPayloadMetadata {
  exportDraft: ProviderFacingExportDraft;
}

export interface PartnerReviewConsentRecord {
  shareRedactedDataWithPartner: boolean;
  acknowledgeSoftwareOnlyService: boolean;
  acknowledgeSeparateProfessionalEngagement: boolean;
  capturedAt: string | null;
}

export interface ProviderFacingPartnerReviewDocument {
  id: WorkspaceDocumentRecord["id"];
  kind: WorkspaceDocumentRecord["kind"];
  coverage: WorkspaceDocumentRecord["coverage"];
  label: WorkspaceDocumentRecord["label"];
  matchedFixtureId: WorkspaceDocumentRecord["matchedFixtureId"];
  seededFactIds: WorkspaceDocumentRecord["seededFactIds"];
}

export interface ProviderFacingPartnerReviewRequest {
  schemaVersion: 1;
  requestKind: "partner-review";
  workspaceId: string;
  workspaceUpdatedAt: string;
  requestedAt: string;
  consent: PartnerReviewConsentRecord;
  workspaceSummary: WorkspaceSummaryMetrics;
  documents: ProviderFacingPartnerReviewDocument[];
  returnSummary: WorkspaceReturnSummary;
  enginePreview: WorkspaceEnginePreview | null;
  reviewNotes: string[];
  structuredFacts: WorkspaceStructuredFactRecord[];
  checklist: WorkspaceChecklistItem[];
  auditTrail: WorkspaceAuditEventRecord[];
  unsupportedRoutes: WorkspaceUnsupportedRoute[];
}

export interface ProviderFacingPartnerReviewPayload extends ProviderFacingPayloadMetadata {
  reviewRequest: ProviderFacingPartnerReviewRequest;
}

export const supportedEngineTaxYears = [2025] as const;
export type SupportedEngineTaxYear = (typeof supportedEngineTaxYears)[number];
export const latestEngineTargetYear = supportedEngineTaxYears[supportedEngineTaxYears.length - 1];

export function isSupportedEngineTaxYear(year: number): year is SupportedEngineTaxYear {
  return (supportedEngineTaxYears as readonly number[]).includes(year);
}
