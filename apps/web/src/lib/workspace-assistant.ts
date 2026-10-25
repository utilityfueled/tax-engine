import type {
  ReturnWorkspaceRecord,
  WorkspaceStructuredFactMachineValue1099NecSummary,
  WorkspaceStructuredFactMachineValueW2Summary,
  WorkspaceStructuredFactRecord,
} from "@tax-engine/contracts";
import Decimal from "decimal.js";
import { formatGuidedCurrency } from "@/lib/guided-currency";
import {
  formatFixtureDocumentCount,
  isOfficialFixtureSourceType,
} from "@/lib/document-fixture-copy";
import { seededFactLabels } from "@/lib/workspace-storage";

export interface W2DocumentSuggestion {
  documentId: string;
  documentLabel: string;
  sourceType: WorkspaceStructuredFactRecord["sourceType"];
  summary: WorkspaceStructuredFactMachineValueW2Summary;
}

export interface NecDocumentSuggestion {
  documentId: string;
  documentLabel: string;
  sourceType: WorkspaceStructuredFactRecord["sourceType"];
  summary: WorkspaceStructuredFactMachineValue1099NecSummary;
}

export interface ReturnAssistantContext {
  mode: "workspace" | "guided";
  currentSectionId?: string | null;
  currentSectionLabel?: string | null;
}

export interface ReturnAssistantReply {
  title: string;
  summary: string;
  bullets: string[];
  action: "open-guided" | "review-w2" | null;
}

function parseSuggestionAmount(value: string | undefined) {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value.trim())) {
    return null;
  }

  const numericValue = new Decimal(value.trim());

  return numericValue.isFinite() ? numericValue : null;
}

function sanitizeSuggestedWageAmount(value: string | undefined, box1Wages: Decimal | null) {
  const numericValue = parseSuggestionAmount(value);

  if (numericValue === null) {
    return undefined;
  }

  if (box1Wages !== null && numericValue.gt(box1Wages.times(3))) {
    return undefined;
  }

  return value;
}

function sanitizeSuggestedWithholdingAmount(value: string | undefined, relatedWages: Decimal | null) {
  const numericValue = parseSuggestionAmount(value);

  if (numericValue === null) {
    return undefined;
  }

  if (relatedWages !== null && numericValue.gt(0) && numericValue.gte(relatedWages)) {
    return undefined;
  }

  return value;
}

function sanitizeW2SummarySuggestion(summary: WorkspaceStructuredFactMachineValueW2Summary): WorkspaceStructuredFactMachineValueW2Summary {
  const box1Wages = parseSuggestionAmount(summary.wages);
  const socialSecurityWages = sanitizeSuggestedWageAmount(summary.socialSecurityWages, box1Wages);
  const medicareWages = sanitizeSuggestedWageAmount(summary.medicareWages, box1Wages);
  const stateWages = sanitizeSuggestedWageAmount(summary.stateWages, box1Wages);

  return {
    entryKind: "w2-summary",
    employerName: summary.employerName,
    employerEin: summary.employerEin,
    wages: summary.wages,
    federalWithheld: summary.federalWithheld,
    ...(socialSecurityWages ? { socialSecurityWages } : {}),
    ...(sanitizeSuggestedWithholdingAmount(
      summary.socialSecurityWithheld,
      parseSuggestionAmount(socialSecurityWages) ?? box1Wages
    ) ? { socialSecurityWithheld: summary.socialSecurityWithheld } : {}),
    ...(medicareWages ? { medicareWages } : {}),
    ...(sanitizeSuggestedWithholdingAmount(
      summary.medicareWithheld,
      parseSuggestionAmount(medicareWages) ?? box1Wages
    ) ? { medicareWithheld: summary.medicareWithheld } : {}),
    ...(stateWages ? { stateWages } : {}),
    ...(sanitizeSuggestedWithholdingAmount(
      summary.stateWithheld,
      parseSuggestionAmount(stateWages) ?? box1Wages
    ) ? { stateWithheld: summary.stateWithheld } : {}),
    ...(summary.box12CodeW !== undefined ? { box12CodeW: summary.box12CodeW } : {}),
    ...(summary.accountHolder !== undefined ? { accountHolder: summary.accountHolder } : {}),
  };
}

export function collectW2Suggestions(
  documents: ReturnWorkspaceRecord["documents"],
  structuredFacts: WorkspaceStructuredFactRecord[],
): W2DocumentSuggestion[] {
  return documents.flatMap((document) => {
    if (document.kind !== "w2") {
      return [];
    }

    return structuredFacts.flatMap((fact) => {
      if (
        (fact.kind !== "fixture-derived" && fact.kind !== "document-detected")
        || !fact.sourceDocumentIds.includes(document.id)
        || fact.machineValue?.entryKind !== "w2-summary"
      ) {
        return [];
      }

      return [{
        documentId: document.id,
        documentLabel: document.label || document.name,
        sourceType: fact.sourceType,
        summary: sanitizeW2SummarySuggestion(
          fact.machineValue satisfies WorkspaceStructuredFactMachineValueW2Summary
        ),
      }];
    });
  });
}

function sanitizeNecSummarySuggestion(
  summary: WorkspaceStructuredFactMachineValue1099NecSummary,
): WorkspaceStructuredFactMachineValue1099NecSummary | null {
  const compensationAmount = parseSuggestionAmount(summary.nonemployeeCompensation);
  const withholdingAmount = parseSuggestionAmount(summary.federalWithheld);

  if (compensationAmount === null) {
    return null;
  }

  if (withholdingAmount !== null && withholdingAmount.gt(0) && withholdingAmount.gte(compensationAmount)) {
    return null;
  }

  return summary;
}

export function collectNecSuggestions(
  documents: ReturnWorkspaceRecord["documents"],
  structuredFacts: WorkspaceStructuredFactRecord[],
): NecDocumentSuggestion[] {
  return documents.flatMap((document) => {
    if (document.kind !== "1099-nec") {
      return [];
    }

    return structuredFacts.flatMap((fact) => {
      if (
        (fact.kind !== "fixture-derived" && fact.kind !== "document-detected")
        || !fact.sourceDocumentIds.includes(document.id)
        || fact.machineValue?.entryKind !== "1099-nec-summary"
      ) {
        return [];
      }

      const summary = sanitizeNecSummarySuggestion(
        fact.machineValue satisfies WorkspaceStructuredFactMachineValue1099NecSummary
      );

      if (!summary) {
        return [];
      }

      return [{
        documentId: document.id,
        documentLabel: document.label || document.name,
        sourceType: fact.sourceType,
        summary,
      }];
    });
  });
}

function buildW2Bullets(suggestions: W2DocumentSuggestion[]) {
  return suggestions.slice(0, 3).map((suggestion) => (
    `${suggestion.documentLabel}: Box 1 ${formatGuidedCurrency(suggestion.summary.wages)} and Box 2 ${formatGuidedCurrency(suggestion.summary.federalWithheld)}`
  ));
}

export function buildReturnAssistantReply(
  workspace: ReturnWorkspaceRecord,
  context: ReturnAssistantContext,
  question: string,
): ReturnAssistantReply {
  const normalizedQuestion = question.trim().toLowerCase();
  const recognizedDocuments = workspace.documents.filter((document) => document.matchedFixtureId);
  const w2Suggestions = collectW2Suggestions(workspace.documents, workspace.structuredFacts);
  const sampleFixtureSuggestionCount = w2Suggestions.filter((suggestion) => isOfficialFixtureSourceType(suggestion.sourceType)).length;
  const nextQuestionLabel = workspace.seededReturn.nextQuestionId
    ? seededFactLabels[workspace.seededReturn.nextQuestionId]
    : null;
  const mentionGuided = normalizedQuestion === ""
    || /guided|step|walk me|start|where.*start|help fill/.test(normalizedQuestion);
  const mentionW2 = /w-?2|wages|withhold|upload|autofill|auto fill|fill.*field/.test(normalizedQuestion)
    || context.currentSectionId === "income-w2";

  if (mentionW2 && w2Suggestions.length > 0) {
    const fixtureOnlySuggestions = sampleFixtureSuggestionCount === w2Suggestions.length;

    return {
      title: fixtureOnlySuggestions ? "Sample W-2 values are ready" : "W-2 values are ready",
      summary: fixtureOnlySuggestions
        ? context.mode === "guided"
          ? "I found sample W-2 values for this return. Use the document suggestion helper in the W-2 card to review them, then confirm anything you actually want to keep before continuing."
          : "I found sample W-2 values for this return. Start the guided interview to review them section by section and confirm any value you want to keep before relying on it."
        : context.mode === "guided"
          ? "I found W-2 values for this return. Use the document suggestion helper in the W-2 card to insert them, then confirm each highlighted field before continuing."
          : "I found W-2 values from your uploads. Start the guided interview to review those values section by section and confirm each highlighted field before relying on them.",
      bullets: [
        ...buildW2Bullets(w2Suggestions),
        fixtureOnlySuggestions
          ? "IRS sample values stay marked until you confirm them one field at a time."
          : "Doc-derived values stay marked until you confirm them one field at a time.",
      ],
      action: context.mode === "workspace" ? "open-guided" : "review-w2",
    };
  }

  if (mentionGuided && context.mode === "workspace") {
    return {
      title: "Use the guided interview first",
      summary: "The guided interview is the clearest path for most filers. It asks only the sections that apply to you, uses uploaded documents and IRS samples as context, and keeps any AI-suggested values highlighted until you confirm them.",
      bullets: [
        `${formatFixtureDocumentCount(recognizedDocuments.length)} ${recognizedDocuments.length === 1 ? "is" : "are"} already available as context.`,
        nextQuestionLabel
          ? `The next missing item in the current return is ${nextQuestionLabel.toLowerCase()}.`
          : "There are no pending interview prompts blocking the current return.",
      ],
      action: "open-guided",
    };
  }

  if (context.mode === "guided" && context.currentSectionLabel) {
    return {
      title: `${context.currentSectionLabel} help`,
      summary: `You're in ${context.currentSectionLabel}. The helper can use uploaded documents and IRS samples to point you at relevant values, but you still need to review and confirm anything it suggests before filing.`,
      bullets: [
        `${workspace.summary.totalDocuments} uploaded document${workspace.summary.totalDocuments === 1 ? "" : "s"} are attached to this return.`,
        nextQuestionLabel
          ? `The broader return still has a pending review item for ${nextQuestionLabel.toLowerCase()}.`
          : "No seeded interview question is currently blocking the return summary.",
      ],
      action: mentionW2 ? "review-w2" : null,
    };
  }

  return {
    title: "Best next step",
    summary: nextQuestionLabel
      ? `The next thing to resolve is ${nextQuestionLabel.toLowerCase()}. Upload or review the related document values, then confirm the fields you want to keep.`
      : "Upload documents, review the detected values, and confirm any highlighted AI-suggested fields before relying on the result.",
    bullets: [
      `${workspace.summary.totalDocuments} document${workspace.summary.totalDocuments === 1 ? "" : "s"} uploaded.`,
      `${workspace.summary.supportedDocuments} document${workspace.summary.supportedDocuments === 1 ? "" : "s"} ready for calculation.`,
      `${workspace.summary.interviewQuestionsRemaining} review question${workspace.summary.interviewQuestionsRemaining === 1 ? "" : "s"} still open.`,
    ],
    action: context.mode === "workspace" ? "open-guided" : null,
  };
}
