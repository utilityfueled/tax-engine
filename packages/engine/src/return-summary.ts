import type {
  SeededFactId,
  SeededReturnSummary,
  WorkspaceDocumentRecord,
  WorkspaceReturnSummaryBlocker,
  WorkspaceReturnSummary,
  WorkspaceReturnSummaryItem
} from "@tax-engine/contracts";
import { isSupportedEngineTaxYear, latestEngineTargetYear } from "@tax-engine/contracts";

interface ReturnSummaryBlueprint {
  id: string;
  label: string;
  factIds: SeededFactId[];
  engineTargets: string[];
}

const returnSummaryBlueprints: ReturnSummaryBlueprint[] = [
  {
    id: "wages-and-withholding",
    label: "Wages and withholding",
    factIds: ["wages", "withholding"],
    engineTargets: ["Form 1040 Lines 1 and 25a"]
  },
  {
    id: "interest-income",
    label: "Interest income",
    factIds: ["taxable-interest"],
    engineTargets: ["Schedule B Part I", "Form 1040 Line 2b"]
  },
  {
    id: "dividend-income",
    label: "Dividend income",
    factIds: ["ordinary-dividends", "qualified-dividends", "capital-gain-distributions"],
    engineTargets: ["Schedule B Part II", "Form 1040 Lines 3a and 3b"]
  },
  {
    id: "capital-gains",
    label: "Capital gains and basis review",
    factIds: ["broker-proceeds", "cost-basis-review"],
    engineTargets: ["Form 8949", "Schedule D", "Form 1040 Line 7"]
  },
  {
    id: "government-payments",
    label: "Government payments",
    factIds: ["government-payments-review"],
    engineTargets: ["Form 1099-G", "Taxable Refund Worksheet", "Schedule 1 Lines 1 and 7", "Form 1040 Lines 8 and 25d"]
  },
  {
    id: "retirement-distributions",
    label: "Retirement distributions",
    factIds: ["retirement-distribution-review"],
    engineTargets: ["Form 1099-R", "Form 1040 Lines 4a, 4b, 5a, 5b, and 25b"]
  },
  {
    id: "social-security-benefits",
    label: "Social Security benefits",
    factIds: ["social-security-benefits-review"],
    engineTargets: ["Social Security Benefits Worksheet", "Form 1040 Lines 6a, 6b, and 25b"]
  },
  {
    id: "hsa-distributions",
    label: "HSA distributions and exceptions",
    factIds: ["hsa-distribution-review"],
    engineTargets: ["Form 1099-SA", "Form 8889", "Schedule 1 Line 8f", "Schedule 2 Line 17c"]
  },
  {
    id: "premium-tax-credit",
    label: "Marketplace coverage and premium tax credit",
    factIds: ["premium-tax-credit-review"],
    engineTargets: ["Form 1095-A", "Form 8962", "Schedule 2 Line 2", "Schedule 3 Line 10"]
  },
  {
    id: "student-loan-interest",
    label: "Student loan interest",
    factIds: ["student-loan-interest-review"],
    engineTargets: ["Form 1098-E", "Schedule 1 Line 21", "Form 1040 Line 10"]
  },
  {
    id: "schedule-c-income",
    label: "Schedule C income and expenses",
    factIds: ["nonemployee-compensation", "schedule-c-expense-review"],
    engineTargets: ["Schedule C", "Schedule SE", "Schedule 1 Line 3"]
  }
];

function buildUnmappedDocumentReviewBlocker(
  sourceDocumentIds: string[]
): WorkspaceReturnSummaryBlocker | null {
  if (sourceDocumentIds.length === 0) {
    return null;
  }

  const documentCount = sourceDocumentIds.length;
  const documentLabel = documentCount === 1 ? "document" : "documents";
  const verb = documentCount === 1 ? "needs" : "need";

  return {
    id: "needs-review:unmapped-documents",
    message: `${documentCount} uploaded ${documentLabel} still ${verb} manual coverage review before deterministic recompute can run.`,
    relatedFactIds: [],
    sourceDocumentIds
  };
}

function isPendingReviewCoverage(coverage: WorkspaceDocumentRecord["coverage"]) {
  return coverage === "partially-supported"
    || coverage === "planned"
    || coverage === "needs-review"
    || coverage === "unsupported";
}

function buildReturnSummaryItem(
  blueprint: ReturnSummaryBlueprint,
  factsById: Map<SeededFactId, SeededReturnSummary["facts"][number]>,
  documentsById: Map<string, WorkspaceDocumentRecord>
): WorkspaceReturnSummaryItem | null {
  const relatedFacts = blueprint.factIds
    .map((factId) => factsById.get(factId))
    .filter((fact): fact is NonNullable<typeof fact> => fact !== undefined);

  if (relatedFacts.length === 0) {
    return null;
  }

  const sourceDocumentIds = Array.from(new Set(
    relatedFacts.flatMap((fact) => fact.sourceDocumentIds)
  )).sort();
  const sourceDocuments = sourceDocumentIds
    .map((documentId) => documentsById.get(documentId))
    .filter((document): document is WorkspaceDocumentRecord => document !== undefined);
  const answeredFactCount = relatedFacts.filter((fact) => fact.status === "answered").length;
  const status = sourceDocuments.some((document) => document.coverage !== "supported")
    ? "needs-review"
    : answeredFactCount === relatedFacts.length
      ? "ready"
      : "needs-answer";

  return {
    id: blueprint.id,
    label: blueprint.label,
    status,
    engineTargets: blueprint.engineTargets,
    relatedFactIds: relatedFacts.map((fact) => fact.id),
    sourceDocumentIds,
    answeredFactCount,
    factCount: relatedFacts.length
  };
}

export function buildWorkspaceReturnSummary(
  documents: WorkspaceDocumentRecord[],
  seededReturn: SeededReturnSummary
): WorkspaceReturnSummary {
  const taxYearState = seededReturn.taxYearHints.length === 0
    ? "missing"
    : seededReturn.taxYearHints.length === 1
      ? "single"
      : "multiple";
  const targetTaxYear = seededReturn.taxYearHints.length === 1 ? seededReturn.taxYearHints[0] : null;
  const reviewDocumentIds = documents
    .filter((document) => isPendingReviewCoverage(document.coverage))
    .map((document) => document.id);
  const unmappedDocumentReviewBlocker = buildUnmappedDocumentReviewBlocker(reviewDocumentIds);

  if (documents.length === 0 || seededReturn.facts.length === 0) {
    const blockers: WorkspaceReturnSummaryBlocker[] = [];

    if (taxYearState === "multiple") {
      blockers.push({
        id: "ambiguous-tax-year",
        message: `Multiple tax years detected: ${seededReturn.taxYearHints.join(", ")}.`,
        relatedFactIds: [],
        sourceDocumentIds: []
      });
    }

    if (unmappedDocumentReviewBlocker) {
      blockers.push(unmappedDocumentReviewBlocker);
    }

    return {
      status: blockers.length > 0 ? "needs-review" : "empty",
      targetTaxYear,
      taxYearState,
      answeredFactCount: 0,
      totalFactCount: seededReturn.facts.length,
      readyItemCount: 0,
      itemCount: 0,
      blockers,
      items: []
    };
  }

  const factsById = new Map(seededReturn.facts.map((fact) => [fact.id, fact]));
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const items = returnSummaryBlueprints
    .map((blueprint) => buildReturnSummaryItem(blueprint, factsById, documentsById))
    .filter((item): item is WorkspaceReturnSummaryItem => item !== null);
  const blockers: WorkspaceReturnSummaryBlocker[] = [];
  const answeredFactCount = seededReturn.facts.filter((fact) => fact.status === "answered").length;
  const engineYearSupported = targetTaxYear !== null && isSupportedEngineTaxYear(targetTaxYear);
  const itemDocumentIds = new Set(items.flatMap((item) => item.sourceDocumentIds));
  const unmappedReviewDocumentIds = reviewDocumentIds.filter((documentId) => !itemDocumentIds.has(documentId));

  if (taxYearState === "missing") {
    blockers.push({
      id: "missing-tax-year",
      message: "No tax year hint detected from the current workspace documents.",
      relatedFactIds: [],
      sourceDocumentIds: []
    });
  }

  if (taxYearState === "multiple") {
    blockers.push({
      id: "ambiguous-tax-year",
      message: `Multiple tax years detected: ${seededReturn.taxYearHints.join(", ")}.`,
      relatedFactIds: [],
      sourceDocumentIds: []
    });
  }

  if (taxYearState === "single" && !engineYearSupported) {
    blockers.push({
      id: "unsupported-tax-year",
      message: `Tax year ${targetTaxYear} is not available for deterministic recompute yet. Latest supported engine year: ${latestEngineTargetYear}.`,
      relatedFactIds: [],
      sourceDocumentIds: []
    });
  }

  for (const item of items) {
    if (item.status === "needs-review") {
      blockers.push({
        id: `needs-review:${item.id}`,
        message: `${item.label} still depends on documents outside deterministic engine coverage.`,
        relatedFactIds: item.relatedFactIds,
        sourceDocumentIds: item.sourceDocumentIds
      });
    }

    if (item.status === "needs-answer") {
      blockers.push({
        id: `needs-answer:${item.id}`,
        message: `${item.label} still has ${item.factCount - item.answeredFactCount} unanswered interview confirmation(s).`,
        relatedFactIds: item.relatedFactIds,
        sourceDocumentIds: item.sourceDocumentIds
      });
    }
  }

  const unmappedReviewDocumentsBlocker = buildUnmappedDocumentReviewBlocker(unmappedReviewDocumentIds);

  if (unmappedReviewDocumentsBlocker) {
    blockers.push(unmappedReviewDocumentsBlocker);
  }

  const status = items.length === 0
    ? "empty"
    : items.some((item) => item.status === "needs-review")
      || unmappedReviewDocumentIds.length > 0
      || taxYearState !== "single"
      ? "needs-review"
      : items.some((item) => item.status === "needs-answer")
        ? "awaiting-interview"
        : !engineYearSupported
          ? "needs-review"
        : "ready-to-recompute";

  return {
    status,
    targetTaxYear,
    taxYearState,
    answeredFactCount,
    totalFactCount: seededReturn.facts.length,
    readyItemCount: items.filter((item) => item.status === "ready").length,
    itemCount: items.length,
    blockers,
    items
  };
}
