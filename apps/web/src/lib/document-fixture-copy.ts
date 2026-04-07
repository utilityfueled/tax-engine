import {
  officialSampleDocumentFixtures,
  type WorkspaceDocumentRecord,
} from "@tax-engine/contracts";

const officialSampleFixtureTitles = new Set(
  officialSampleDocumentFixtures.map((fixture) => fixture.title)
);

export function isOfficialFixtureSourceType(sourceType?: string | null) {
  return sourceType === "official-fixture";
}

export function formatStructuredFactSourceType(sourceType: string) {
  if (sourceType === "upload") {
    return "uploaded document";
  }

  if (sourceType === "official-fixture") {
    return "IRS sample document";
  }

  if (sourceType === "user-answer") {
    return "your answer";
  }

  return sourceType;
}

function isGuidedInterviewDocument(
  document: Pick<WorkspaceDocumentRecord, "id" | "name" | "notes">
) {
  return document.id.startsWith("guided:")
    || document.name.startsWith("Guided Interview")
    || document.notes === "Entered via guided interview.";
}

export function formatMatchedDocumentStatus(
  document: Pick<WorkspaceDocumentRecord, "id" | "name" | "notes" | "matchedFixtureId">
) {
  if (document.matchedFixtureId) {
    return "Matched IRS sample document";
  }

  if (isGuidedInterviewDocument(document)) {
    return "Added from guided interview";
  }

  return "Unrecognized — may need review";
}

export function formatFixtureDocumentCount(count: number) {
  return `${count} IRS sample document${count === 1 ? "" : "s"}`;
}

export function formatWorkspaceDocumentSummary(
  totalDocuments: number,
  officialFixtureMatches: number,
  pendingReviewDocuments: number
) {
  if (totalDocuments === 0) {
    return "No documents added yet";
  }

  const parts: string[] = [];

  if (officialFixtureMatches > 0) {
    parts.push(`${formatFixtureDocumentCount(officialFixtureMatches)} loaded`);
  }

  if (pendingReviewDocuments > 0) {
    parts.push(
      `${pendingReviewDocuments} document${pendingReviewDocuments === 1 ? "" : "s"} still need${pendingReviewDocuments === 1 ? "s" : ""} review`
    );
  }

  if (parts.length === 0) {
    return `${totalDocuments} document${totalDocuments === 1 ? "" : "s"} uploaded`;
  }

  return parts.join(" · ");
}

export function formatW2SuggestionOrigin(sourceLabel: string, sourceType?: string | null) {
  return isOfficialFixtureSourceType(sourceType)
    ? `Sample values from ${sourceLabel}.`
    : `Suggested from ${sourceLabel}.`;
}

export function formatW2SuggestionActionLabel(sourceType?: string | null) {
  return isOfficialFixtureSourceType(sourceType)
    ? "Insert sample values"
    : "Insert detected values";
}

function inferW2SuggestionSourceTypeFromLabel(sourceLabel: string) {
  return officialSampleFixtureTitles.has(sourceLabel) ? "official-fixture" : null;
}

export function formatPendingW2SuggestionValueLabel(
  suggestions: Iterable<{
    sourceLabel: string;
    sourceType?: string | null;
  }>,
  count: number
) {
  const sourceTypes = Array.from(new Set(
    Array.from(suggestions, (suggestion) => (
      suggestion.sourceType ?? inferW2SuggestionSourceTypeFromLabel(suggestion.sourceLabel)
    )).filter((sourceType): sourceType is string => Boolean(sourceType))
  ));

  const pluralSuffix = count === 1 ? "" : "s";

  if (sourceTypes.length === 1) {
    if (sourceTypes[0] === "official-fixture") {
      return `sample value${pluralSuffix}`;
    }

    if (sourceTypes[0] === "upload") {
      return `document-detected value${pluralSuffix}`;
    }
  }

  return `suggested value${pluralSuffix}`;
}

export function resolveW2SuggestionSourceType(
  sourceLabel: string,
  sourceType: string | null | undefined,
  availableSuggestions: ReadonlyArray<{
    documentLabel: string;
    sourceType?: string | null;
  }>
) {
  if (sourceType) {
    return sourceType;
  }

  const matchingSuggestion = availableSuggestions.find((suggestion) => suggestion.documentLabel === sourceLabel)?.sourceType;
  if (matchingSuggestion) {
    return matchingSuggestion;
  }

  return inferW2SuggestionSourceTypeFromLabel(sourceLabel);
}
