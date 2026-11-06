import type {
  SeededFactId,
  WorkspaceDocumentRecord,
  WorkspaceStructuredFactMachineValue1095ASummary,
  WorkspaceStructuredFactMachineValue1098ESummary,
  WorkspaceStructuredFactMachineValue1099GSummary,
  WorkspaceStructuredFactMachineValue1099DivSummary,
  WorkspaceStructuredFactMachineValue1099IntSummary,
  WorkspaceStructuredFactMachineValue1099OIDSummary,
  WorkspaceStructuredFactMachineValue1099NecSummary,
  WorkspaceStructuredFactMachineValue1099RSummary,
  WorkspaceStructuredFactMachineValueSSA1099Summary,
  WorkspaceStructuredFactMachineValue1099SASummary,
  WorkspaceStructuredFactMachineValue1099BTransaction,
  WorkspaceStructuredFactMachineValueW2Summary,
  WorkspaceStructuredFactRecord
} from "@tax-engine/contracts";

interface FixtureStructuredFactTemplate {
  idSuffix: string;
  factId: SeededFactId;
  label: string;
  value: string;
  machineValue?: WorkspaceStructuredFactRecord["machineValue"];
}

// These values are explicit synthetic examples attached to blank IRS templates,
// not facts extracted from a taxpayer's upload or IRS worked-example evidence.
const fixtureStructuredFactsByFixtureId: Record<string, FixtureStructuredFactTemplate[]> = {
  "irs-w2-2025": [
    {
      idSuffix: "fixture-wages",
      factId: "wages",
      label: "Wages",
      value: "Official fixture wages: Form W-2 box 1 wages $52,000, box 2 federal withholding $5,000, and boxes 3 and 5 payroll wages $52,000.",
      machineValue: {
        entryKind: "w2-summary",
        stateTaxReporting: "none",
        employerName: "Official fixture employer",
        employerEin: "12-3456789",
        wages: "52000",
        socialSecurityWages: "52000",
        socialSecurityTips: "0",
        box10DependentCareBenefits: "0",
        socialSecurityWithheld: "3224",
        medicareWages: "52000",
        medicareWithheld: "754",
        federalWithheld: "5000"
      } satisfies WorkspaceStructuredFactMachineValueW2Summary
    },
    {
      idSuffix: "fixture-withholding",
      factId: "withholding",
      label: "Federal withholding",
      value: "Official fixture withholding: Form W-2 box 2 federal income tax withheld $5,000."
    }
  ],
  "irs-w2-2026": [
    {
      idSuffix: "fixture-wages",
      factId: "wages",
      label: "Wages",
      value: "Official fixture wages: Form W-2 box 1 wages $52,000, box 2 federal withholding $5,000, and boxes 3 and 5 payroll wages $52,000.",
      machineValue: {
        entryKind: "w2-summary",
        stateTaxReporting: "none",
        employerName: "Official fixture employer",
        employerEin: "12-3456789",
        wages: "52000",
        socialSecurityWages: "52000",
        socialSecurityTips: "0",
        box10DependentCareBenefits: "0",
        socialSecurityWithheld: "3224",
        medicareWages: "52000",
        medicareWithheld: "754",
        federalWithheld: "5000"
      } satisfies WorkspaceStructuredFactMachineValueW2Summary
    },
    {
      idSuffix: "fixture-withholding",
      factId: "withholding",
      label: "Federal withholding",
      value: "Official fixture withholding: Form W-2 box 2 federal income tax withheld $5,000."
    }
  ],
  "irs-1099-int-2024": [
    {
      idSuffix: "fixture-interest-income",
      factId: "taxable-interest",
      label: "Taxable interest",
      value: "Official fixture taxable interest: box 1 interest income $20,000 with no withholding or penalty.",
      machineValue: {
        entryKind: "1099-int-summary",
        payer: "Official fixture savings bank",
        interestIncome: "20000",
        earlyWithdrawalPenalty: "0",
        federalWithheld: "0",
        taxExemptInterest: "0",
        usSavingsBondInterest: "0"
      } satisfies WorkspaceStructuredFactMachineValue1099IntSummary
    }
  ],
  "irs-1099-g-2025": [
    {
      idSuffix: "fixture-government-payments-review",
      factId: "government-payments-review",
      label: "Government payments review",
      value: "Official fixture government payments: Form 1099-G box 1 unemployment compensation $6,200, box 2 state income tax refund $1,100, box 4 federal withholding $620, and box 11 state withholding $55 for California.",
      machineValue: {
        entryKind: "1099-g-summary",
        payer: "Official fixture state agency",
        unemploymentCompensation: "6200",
        stateLocalIncomeTaxRefund: "1100",
        federalWithheld: "620",
        stateWithheld: "55",
        state: "CA"
      } satisfies WorkspaceStructuredFactMachineValue1099GSummary
    }
  ],
  "irs-1099-oid-2025": [
    {
      idSuffix: "fixture-oid-interest-income",
      factId: "taxable-interest",
      label: "Taxable interest",
      value: "Official fixture original issue discount: box 1 OID $1,200, acquisition premium $200, box 2 other periodic interest $400, bond premium $100, box 3 early withdrawal penalty $25, and box 4 withholding $40.",
      machineValue: {
        entryKind: "1099-oid-summary",
        payer: "Official fixture OID issuer",
        originalIssueDiscount: "1200",
        otherPeriodicInterest: "400",
        earlyWithdrawalPenalty: "25",
        federalWithheld: "40",
        acquisitionPremium: "200",
        treasuryOID: "0",
        bondPremium: "100",
        taxExemptBondPremium: "0",
        taxExemptOID: "0"
      } satisfies WorkspaceStructuredFactMachineValue1099OIDSummary
    }
  ],
  "irs-1099-div-2024": [
    {
      idSuffix: "fixture-dividend-income",
      factId: "ordinary-dividends",
      label: "Ordinary dividends",
      value: "Official fixture dividends: ordinary dividends $4,000, qualified dividends $3,000, capital gain distributions $1,000.",
      machineValue: {
        entryKind: "1099-div-summary",
        payer: "Official fixture mutual fund",
        ordinaryDividends: "4000",
        qualifiedDividends: "3000",
        capitalGainDistributions: "1000",
        federalWithheld: "0",
        section199ADividends: "0",
        foreignTaxPaid: "0"
      } satisfies WorkspaceStructuredFactMachineValue1099DivSummary
    },
    {
      idSuffix: "fixture-qualified-dividends",
      factId: "qualified-dividends",
      label: "Qualified dividends",
      value: "Official fixture qualified dividends: box 1b qualified dividends $3,000."
    },
    {
      idSuffix: "fixture-capital-gain-distributions",
      factId: "capital-gain-distributions",
      label: "Capital gain distributions",
      value: "Official fixture capital gain distributions: box 2a capital gain distributions $1,000."
    }
  ],
  "irs-1099-b-2025": [
    {
      idSuffix: "fixture-short-term-sale",
      factId: "broker-proceeds",
      label: "Broker sale proceeds",
      value: "Official fixture short-term sale: proceeds $42,000, cost basis $12,000, sold 2025-06-15.",
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
      idSuffix: "fixture-long-term-sale",
      factId: "broker-proceeds",
      label: "Broker sale proceeds",
      value: "Official fixture long-term sale: proceeds $40,000, cost basis $15,000, sold 2025-09-30.",
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
    }
  ],
  "irs-1095-a-2025": [
    {
      idSuffix: "fixture-premium-tax-credit-review",
      factId: "premium-tax-credit-review",
      label: "Marketplace coverage and premium tax credit review",
      value: "Official fixture Marketplace coverage: Form 1095-A annual enrollment premiums $7,200, annual SLCSP premiums $7,800, and annual advance premium tax credit $6,000 across 12 covered months.",
      machineValue: {
        entryKind: "1095-a-summary",
        marketplace: "Official fixture Health Insurance Marketplace",
        policyNumber: "OFFICIAL-ACA-2025",
        monthlyPremiums: Array.from({ length: 12 }, (_, index) => ({
          month: index + 1,
          enrolleePremium: "600",
          slcsp: "650",
          advancePremiumTaxCredit: "500"
        }))
      } satisfies WorkspaceStructuredFactMachineValue1095ASummary
    }
  ],
  "irs-1098-e-2025": [
    {
      idSuffix: "fixture-student-loan-interest",
      factId: "student-loan-interest-review",
      label: "Student loan interest review",
      value: "Official fixture student loan interest: Form 1098-E box 1 student loan interest received $2,100, including capitalized interest.",
      machineValue: {
        entryKind: "1098-e-summary",
        lender: "Official fixture loan servicer",
        studentLoanInterestReceived: "2100",
        includesOriginationFeesOrCapitalizedInterest: true
      } satisfies WorkspaceStructuredFactMachineValue1098ESummary
    }
  ],
  "irs-1099-r-2025": [
    {
      idSuffix: "fixture-retirement-distribution",
      factId: "retirement-distribution-review",
      label: "Retirement distribution review",
      value: "Official fixture retirement distribution: gross distribution $22,000, taxable amount $18,000, and federal withholding $1,200 from an IRA Form 1099-R.",
      machineValue: {
        entryKind: "1099-r-summary",
        payer: "Official fixture retirement custodian",
        grossDistribution: "22000",
        taxableAmount: "18000",
        federalWithheld: "1200",
        distributionCode: "7",
        iraSepSimple: true
      } satisfies WorkspaceStructuredFactMachineValue1099RSummary
    }
  ],
  "irs-ssa-1099-2025": [
    {
      idSuffix: "fixture-social-security-benefits",
      factId: "social-security-benefits-review",
      label: "Social Security benefits review",
      value: "Official fixture Social Security benefits: Form SSA-1099 net benefits $60,000 and federal withholding $1,500.",
      machineValue: {
        entryKind: "ssa-1099-summary",
        recipient: "Official fixture beneficiary",
        netBenefits: "60000",
        federalWithheld: "1500"
      } satisfies WorkspaceStructuredFactMachineValueSSA1099Summary
    }
  ],
  "irs-1099-sa-2025": [
    {
      idSuffix: "fixture-hsa-distribution",
      factId: "hsa-distribution-review",
      label: "HSA distribution review",
      value: "Official fixture HSA distribution: Form 1099-SA box 1 distribution $2,400 with no rollover, no qualified medical expenses, and no disability, death, or prohibited-transaction exception facts in the seeded fixture.",
      machineValue: {
        entryKind: "1099-sa-summary",
        payer: "Official fixture HSA custodian",
        grossDistribution: "2400",
        distributionCode: "1",
        accountType: "hsa",
        accountHolder: "primary",
      } satisfies WorkspaceStructuredFactMachineValue1099SASummary
    }
  ],
  "irs-1099-nec-2025": [
    {
      idSuffix: "fixture-nec-income",
      factId: "nonemployee-compensation",
      label: "1099-NEC income classification",
      value: "Official fixture nonemployee compensation: box 1 nonemployee compensation $18,000 with no withholding.",
      machineValue: {
        entryKind: "1099-nec-summary",
        payer: "Official fixture contract payer",
        nonemployeeCompensation: "18000",
        federalWithheld: "0"
      } satisfies WorkspaceStructuredFactMachineValue1099NecSummary
    },
    {
      idSuffix: "fixture-schedule-c-expense-review",
      factId: "schedule-c-expense-review",
      label: "Schedule C expense review",
      value: "Official fixture Schedule C review: no business expenses or home office deduction are provided in the seeded fixture."
    }
  ]
};

export function buildFixtureStructuredFacts(
  document: WorkspaceDocumentRecord,
  supportedFactIds: ReadonlySet<SeededFactId>,
  namespaceDocument = false
): WorkspaceStructuredFactRecord[] {
  if (!document.matchedFixtureId) {
    return [];
  }

  return (fixtureStructuredFactsByFixtureId[document.matchedFixtureId] ?? []).flatMap((fact) => {
    if (!supportedFactIds.has(fact.factId)) {
      return [];
    }

    return [{
      id: `${fact.factId}:${fact.idSuffix}${namespaceDocument ? `:${document.id}` : ""}`,
      factId: fact.factId,
      label: fact.label,
      kind: "fixture-derived",
      value: fact.value,
      sourceType: "official-fixture",
      confidence: "high",
      sourceDocumentIds: [document.id],
      questionId: null,
      updatedAt: document.uploadedAt,
      ...(fact.machineValue ? { machineValue: fact.machineValue } : {})
    }];
  });
}

export function extract1099BTransactionsFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      (fact.kind !== "fixture-derived" && fact.kind !== "document-detected")
      || (fact.sourceType !== "official-fixture" && fact.sourceType !== "upload")
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "1099-b-transaction"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValue1099BTransaction];
  });
}

export function extractW2SummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      (fact.kind !== "fixture-derived" && fact.kind !== "document-detected")
      || (fact.sourceType !== "official-fixture" && fact.sourceType !== "upload")
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "w2-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValueW2Summary];
  });
}

export function extract1099IntSummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      (fact.kind !== "fixture-derived" && fact.kind !== "document-detected")
      || (fact.sourceType !== "official-fixture" && fact.sourceType !== "upload")
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "1099-int-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValue1099IntSummary];
  });
}

export function extract1099GSummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      fact.kind !== "fixture-derived"
      || fact.sourceType !== "official-fixture"
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "1099-g-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValue1099GSummary];
  });
}

export function extract1099DivSummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      (fact.kind !== "fixture-derived" && fact.kind !== "document-detected")
      || (fact.sourceType !== "official-fixture" && fact.sourceType !== "upload")
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "1099-div-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValue1099DivSummary];
  });
}

export function extract1099OIDSummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      fact.kind !== "fixture-derived"
      || fact.sourceType !== "official-fixture"
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "1099-oid-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValue1099OIDSummary];
  });
}

export function extract1098ESummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      fact.kind !== "fixture-derived"
      || fact.sourceType !== "official-fixture"
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "1098-e-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValue1098ESummary];
  });
}

export function extract1095ASummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      fact.kind !== "fixture-derived"
      || fact.sourceType !== "official-fixture"
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "1095-a-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValue1095ASummary];
  });
}

export function extract1099NecSummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      fact.kind !== "fixture-derived"
      || fact.sourceType !== "official-fixture"
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "1099-nec-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValue1099NecSummary];
  });
}

export function extract1099RSummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      fact.kind !== "fixture-derived"
      || fact.sourceType !== "official-fixture"
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "1099-r-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValue1099RSummary];
  });
}

export function extract1099SASummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      fact.kind !== "fixture-derived"
      || fact.sourceType !== "official-fixture"
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "1099-sa-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValue1099SASummary];
  });
}

export function extractSSA1099SummariesFromStructuredFacts(
  structuredFacts: WorkspaceStructuredFactRecord[],
  sourceDocumentId: string
) {
  return structuredFacts.flatMap((fact) => {
    if (
      fact.kind !== "fixture-derived"
      || fact.sourceType !== "official-fixture"
      || !fact.sourceDocumentIds.includes(sourceDocumentId)
      || fact.machineValue?.entryKind !== "ssa-1099-summary"
    ) {
      return [];
    }

    return [fact.machineValue satisfies WorkspaceStructuredFactMachineValueSSA1099Summary];
  });
}
