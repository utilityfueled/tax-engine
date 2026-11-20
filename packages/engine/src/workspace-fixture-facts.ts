import type {
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
