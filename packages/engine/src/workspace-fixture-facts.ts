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
