import type {
  WorkspaceDocumentRecord,
  WorkspaceEnginePreview,
  WorkspaceEnginePreviewLine,
  WorkspaceReturnSummary,
  WorkspaceStructuredFactRecord
} from "@tax-engine/contracts";
import { isSupportedEngineTaxYear } from "@tax-engine/contracts";
import { calculateFederalTax } from "../../../src/engine/federal";
import type { TaxReturnResult } from "../../../src/models/outputs";
import { buildWorkspaceEngineInput } from "./workspace-engine-input";

type HighlightedPreviewLineRef = {
  id: string;
  form: string;
  line: string;
  skipZero?: boolean;
  sourceItemIds: string[] | "all";
};

const highlightedPreviewLineRefs: HighlightedPreviewLineRef[] = [
  { id: "1040:1", form: "1040", line: "1", skipZero: true, sourceItemIds: ["wages-and-withholding"] },
  { id: "1040:2b", form: "1040", line: "2b", skipZero: true, sourceItemIds: ["interest-income"] },
  { id: "Sched 1:1", form: "Sched 1", line: "1", skipZero: true, sourceItemIds: ["government-payments"] },
  { id: "Sched 1:7", form: "Sched 1", line: "7", skipZero: true, sourceItemIds: ["government-payments"] },
  { id: "1040:3a", form: "1040", line: "3a", skipZero: true, sourceItemIds: ["dividend-income"] },
  { id: "1040:3b", form: "1040", line: "3b", skipZero: true, sourceItemIds: ["dividend-income"] },
  { id: "1040:8-1099g", form: "1040", line: "8", skipZero: true, sourceItemIds: ["government-payments"] },
  { id: "1040:4a", form: "1040", line: "4a", skipZero: true, sourceItemIds: ["retirement-distributions"] },
  { id: "1040:4b", form: "1040", line: "4b", skipZero: true, sourceItemIds: ["retirement-distributions"] },
  { id: "1040:5a", form: "1040", line: "5a", skipZero: true, sourceItemIds: ["retirement-distributions"] },
  { id: "1040:5b", form: "1040", line: "5b", skipZero: true, sourceItemIds: ["retirement-distributions"] },
  { id: "1040:6a", form: "1040", line: "6a", skipZero: true, sourceItemIds: ["social-security-benefits"] },
  { id: "1040:6b", form: "1040", line: "6b", skipZero: true, sourceItemIds: ["social-security-benefits"] },
  { id: "Sched 1:8f", form: "Sched 1", line: "8f", skipZero: true, sourceItemIds: ["hsa-distributions"] },
  { id: "1040:8", form: "1040", line: "8", skipZero: true, sourceItemIds: ["hsa-distributions"] },
  { id: "Sched 1:21", form: "Sched 1", line: "21", skipZero: true, sourceItemIds: ["student-loan-interest"] },
  { id: "Sched 2:17c", form: "Sched 2", line: "17c", skipZero: true, sourceItemIds: ["hsa-distributions"] },
  { id: "Sched C:31", form: "Sched C", line: "31", skipZero: true, sourceItemIds: ["schedule-c-income"] },
  { id: "Sched 1:3", form: "Sched 1", line: "3", skipZero: true, sourceItemIds: ["schedule-c-income"] },
  { id: "1040:8-sched-c", form: "1040", line: "8-sched-c", skipZero: true, sourceItemIds: ["schedule-c-income"] },
  { id: "Sched D:7", form: "Sched D", line: "7", skipZero: true, sourceItemIds: ["capital-gains"] },
  { id: "Sched D:15", form: "Sched D", line: "15", skipZero: true, sourceItemIds: ["capital-gains", "dividend-income"] },
  { id: "1040:7", form: "1040", line: "7", skipZero: true, sourceItemIds: ["capital-gains", "dividend-income"] },
  { id: "1040:11", form: "1040", line: "11", sourceItemIds: "all" },
  { id: "1040:15", form: "1040", line: "15", sourceItemIds: "all" },
  { id: "1040:24", form: "1040", line: "24", sourceItemIds: "all" },
  {
    id: "1040:25a",
    form: "1040",
    line: "25a",
    skipZero: true,
    sourceItemIds: ["wages-and-withholding", "interest-income", "dividend-income", "schedule-c-income"]
  },
  {
    id: "1040:25b",
    form: "1040",
    line: "25b",
    skipZero: true,
    sourceItemIds: ["retirement-distributions", "social-security-benefits"]
  },
  {
    id: "1040:25d-1099g",
    form: "1040",
    line: "25d",
    skipZero: true,
    sourceItemIds: ["government-payments"]
  },
  { id: "1040:33", form: "1040", line: "33", sourceItemIds: "all" },
  { id: "1040:34", form: "1040", line: "34", sourceItemIds: "all" },
  { id: "1040:37", form: "1040", line: "37", sourceItemIds: "all" }
];

function buildPreviewMetrics(result: TaxReturnResult): WorkspaceEnginePreview["metrics"] {
  return {
    totalIncome: result.totalIncome.toString(),
    agi: result.agi.toString(),
    taxableIncome: result.taxableIncome.toString(),
    totalTax: result.totalTax.toString(),
    totalPayments: result.totalPayments.toString(),
    refund: result.refund.toString(),
    amountOwed: result.amountOwed.toString()
  };
}

function getLineSourceFactIds(
  sourceItemIds: HighlightedPreviewLineRef["sourceItemIds"],
  sourceFactIdsByItemId: Record<string, string[]>
) {
  if (sourceItemIds === "all") {
    return Array.from(new Set(
      Object.values(sourceFactIdsByItemId).flat()
    ));
  }

  return Array.from(new Set(
    sourceItemIds.flatMap((itemId) => sourceFactIdsByItemId[itemId] ?? [])
  ));
}

function buildHighlightedLines(
  result: TaxReturnResult,
  sourceFactIdsByItemId: Record<string, string[]>
): WorkspaceEnginePreviewLine[] {
  return highlightedPreviewLineRefs.flatMap(({ id, form, line, skipZero, sourceItemIds }) => {
    const previewLine = result.allLines.find((entry) => entry.form === form && entry.line === line);

    if (!previewLine || (skipZero && previewLine.value.isZero())) {
      return [];
    }

    return [{
      id,
      form,
      line,
      label: previewLine.description,
      value: previewLine.value.toString(),
      formula: previewLine.formula,
      sourceFactIds: getLineSourceFactIds(sourceItemIds, sourceFactIdsByItemId)
    }];
  });
}

export function buildWorkspaceEnginePreview(
  documents: WorkspaceDocumentRecord[],
  returnSummary: WorkspaceReturnSummary,
  structuredFacts: WorkspaceStructuredFactRecord[] = []
): WorkspaceEnginePreview | null {
  const taxYear = returnSummary.targetTaxYear;

  if (
    returnSummary.status !== "ready-to-recompute"
    || taxYear === null
    || !isSupportedEngineTaxYear(taxYear)
  ) {
    return null;
  }

  const previewInput = buildWorkspaceEngineInput(documents, returnSummary, structuredFacts);

  if (!previewInput) {
    return null;
  }

  const result = calculateFederalTax(previewInput.taxInput);

  return {
    mode: "engine-recompute",
    title: "Deterministic engine recompute preview",
    taxYear,
    filingStatus: result.filingStatus,
    filingState: previewInput.taxInput.taxpayer.address.state,
    sourceDocumentIds: previewInput.sourceDocumentIds,
    sourceFixtureIds: previewInput.sourceFixtureIds,
    assumptions: previewInput.assumptions,
    metrics: buildPreviewMetrics(result),
    highlightedLines: buildHighlightedLines(result, previewInput.sourceFactIdsByItemId)
  };
}
