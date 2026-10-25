"use client";

import { formatGuidedCurrency } from "@/lib/guided-currency";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import type {
  ReturnWorkspaceRecord,
} from "@tax-engine/contracts";
import { RetroShell } from "@/components/retro-shell";
import {
  type GuidedSuggestedFieldState,
  type W2SuggestedField,
  type W2EntryData,
  emptyW2Entry,
} from "@/lib/guided-interview-flow";
import {
  collectW2Suggestions,
  type W2DocumentSuggestion,
} from "@/lib/workspace-assistant";
import {
  formatPendingW2SuggestionValueLabel,
  formatW2SuggestionActionLabel,
  formatW2SuggestionOrigin,
  isOfficialFixtureSourceType,
  resolveW2SuggestionSourceType,
} from "@/lib/document-fixture-copy";
import { getCachedWorkspaceDocumentFile, hasCachedWorkspaceDocumentFile } from "@/lib/workspace-document-file-cache";
import { detectUploadedDocumentFromFile } from "@/lib/uploaded-document-detection";
import { CurrencyField } from "./currency-field";

const confirmableFields: W2SuggestedField[] = [
  "accountHolder",
  "state",
  "employerName",
  "employerEin",
  "wages",
  "federalWithheld",
  "socialSecurityWages",
  "socialSecurityTips",
  "box10DependentCareBenefits",
  "box12CodeW",
  "socialSecurityWithheld",
  "medicareWages",
  "medicareWithheld",
  "stateWages",
  "stateWithheld",
];

function toCurrencyInput(value: string | undefined) {
  return value?.trim() ?? "";
}

function applySuggestionToEntry(
  entry: W2EntryData,
  suggestion: W2DocumentSuggestion
): W2EntryData {
  const nextAiSuggestedFields = { ...(entry.aiSuggestedFields ?? {}) };
  const nextEntry: W2EntryData = {
    ...entry,
    aiSuggestedFields: nextAiSuggestedFields,
  };

  const suggestedValues: Partial<Record<W2SuggestedField, string>> = {
    accountHolder: suggestion.summary.accountHolder,
    state: suggestion.summary.state,
    employerName: suggestion.summary.employerName || "",
    employerEin: suggestion.summary.employerEin || "",
    wages: toCurrencyInput(suggestion.summary.wages),
    federalWithheld: toCurrencyInput(suggestion.summary.federalWithheld),
    socialSecurityWages: toCurrencyInput(suggestion.summary.socialSecurityWages),
    socialSecurityTips: toCurrencyInput(suggestion.summary.socialSecurityTips),
    box10DependentCareBenefits: toCurrencyInput(suggestion.summary.box10DependentCareBenefits),
    box12CodeW: toCurrencyInput(suggestion.summary.box12CodeW),
    socialSecurityWithheld: toCurrencyInput(suggestion.summary.socialSecurityWithheld),
    medicareWages: toCurrencyInput(suggestion.summary.medicareWages),
    medicareWithheld: toCurrencyInput(suggestion.summary.medicareWithheld),
    stateWages: toCurrencyInput(suggestion.summary.stateWages),
    stateWithheld: toCurrencyInput(suggestion.summary.stateWithheld),
  };

  for (const field of confirmableFields) {
    const suggestedValue = suggestedValues[field];
    if (!suggestedValue || suggestedValue === entry[field]) {
      continue;
    }

    Object.assign(nextEntry, { [field]: suggestedValue });
    nextAiSuggestedFields[field] = {
      sourceLabel: suggestion.documentLabel,
      sourceType: suggestion.sourceType,
      status: "pending-confirmation",
    };
  }

  return nextEntry;
}

function clearSuggestedField(
  entry: W2EntryData,
  field: keyof W2EntryData
): W2EntryData {
  if (!confirmableFields.includes(field as W2SuggestedField)) {
    return entry;
  }

  if (!entry.aiSuggestedFields?.[field as W2SuggestedField]) {
    return entry;
  }

  const nextAiSuggestedFields = { ...(entry.aiSuggestedFields ?? {}) };
  delete nextAiSuggestedFields[field as W2SuggestedField];

  return {
    ...entry,
    aiSuggestedFields: nextAiSuggestedFields,
  };
}

function confirmSuggestedField(
  entry: W2EntryData,
  field: W2SuggestedField
): W2EntryData {
  const suggestion = entry.aiSuggestedFields?.[field];
  if (!suggestion) {
    return entry;
  }

  return {
    ...entry,
    aiSuggestedFields: {
      ...(entry.aiSuggestedFields ?? {}),
      [field]: {
        ...suggestion,
        status: "confirmed",
      },
    },
  };
}

function confirmAllSuggestedFields(entry: W2EntryData): W2EntryData {
  return confirmableFields.reduce((nextEntry, field) => (
    nextEntry.aiSuggestedFields?.[field]?.status === "pending-confirmation"
      ? confirmSuggestedField(nextEntry, field)
      : nextEntry
  ), entry);
}

function buildUploadedW2Suggestion(
  document: ReturnWorkspaceRecord["documents"][number],
  detectedDocument: Awaited<ReturnType<typeof detectUploadedDocumentFromFile>>,
): W2DocumentSuggestion | null {
  const summary = detectedDocument?.detectedFacts.find(
    (fact) => fact.machineValue?.entryKind === "w2-summary",
  )?.machineValue;

  if (!summary || summary.entryKind !== "w2-summary") {
    return null;
  }

  return {
    documentId: document.id,
    documentLabel: document.label || document.name,
    sourceType: "upload",
    summary,
  };
}

function isGuidedSyntheticDocument(
  document: Pick<ReturnWorkspaceRecord["documents"][number], "id" | "name" | "notes">
) {
  return document.id.startsWith("guided:")
    || document.name.startsWith("Guided Interview")
    || document.notes === "Entered via guided interview.";
}

function isGenericAttachedDocumentLabel(label: string | undefined) {
  if (!label) {
    return true;
  }

  return /^unclassified upload$/i.test(label.trim());
}

function resolveAttachedDocumentTitle(
  document: Pick<ReturnWorkspaceRecord["documents"][number], "label" | "name">
) {
  if (isGenericAttachedDocumentLabel(document.label)) {
    return document.name;
  }

  return document.label || document.name;
}

function resolveAttachedDocumentFilename(
  document: Pick<ReturnWorkspaceRecord["documents"][number], "label" | "name">
) {
  const title = resolveAttachedDocumentTitle(document);
  return title === document.name ? null : document.name;
}

function scoreAttachedDocumentForW2Review(
  document: Pick<ReturnWorkspaceRecord["documents"][number], "label" | "name" | "kind" | "coverage">
) {
  const text = `${document.label} ${document.name}`.toLowerCase();

  if (/\bw-?2\b/.test(text) || /\bwage\b/.test(text)) {
    return 0;
  }

  if (document.kind !== "unknown" || document.coverage !== "unsupported") {
    return 1;
  }

  return 2;
}

function SuggestedFieldNotice({
  suggestion,
  availableSuggestions,
  onConfirm,
}: {
  suggestion?: GuidedSuggestedFieldState;
  availableSuggestions: W2DocumentSuggestion[];
  onConfirm: () => void;
}) {
  if (!suggestion) {
    return null;
  }

  const sourceType = resolveW2SuggestionSourceType(
    suggestion.sourceLabel,
    suggestion.sourceType,
    availableSuggestions
  );

  return (
    <div className={`guided-ai-field-note ${suggestion.status === "pending-confirmation" ? "guided-ai-field-note-pending" : "guided-ai-field-note-confirmed"}`}>
      <span>
        {formatW2SuggestionOrigin(suggestion.sourceLabel, sourceType)}
      </span>
      {suggestion.status === "pending-confirmation" ? (
        <button
          type="button"
          className="utility-button utility-button-small"
          onClick={onConfirm}
        >
          Confirm value
        </button>
      ) : (
        <strong>Confirmed</strong>
      )}
    </div>
  );
}

function W2Card({
  index,
  entry,
  onUpdate,
  onConfirmField,
  onConfirmAllFields,
  onApplySuggestion,
  onUploadDocuments,
  onRemove,
  removable,
  availableSuggestions,
}: {
  index: number;
  entry: W2EntryData;
  onUpdate: (field: keyof W2EntryData, value: string) => void;
  onConfirmField: (field: W2SuggestedField) => void;
  onConfirmAllFields: () => void;
  onApplySuggestion: (suggestion: W2DocumentSuggestion) => void;
  onUploadDocuments?: (files: File[]) => Promise<string>;
  onRemove: () => void;
  removable: boolean;
  availableSuggestions: W2DocumentSuggestion[];
}) {
  const [helperOpen, setHelperOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const uploadInputId = useId();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSuggestions = Object.values(entry.aiSuggestedFields ?? {}).filter(
    (suggestion): suggestion is GuidedSuggestedFieldState => suggestion?.status === "pending-confirmation"
  );
  const pendingSuggestionCount = pendingSuggestions.length;
  const canReviewSuggestions = availableSuggestions.length > 0;
  const hasSampleSuggestions = availableSuggestions.some((suggestion) => isOfficialFixtureSourceType(suggestion.sourceType));
  const pendingSuggestionValueLabel = formatPendingW2SuggestionValueLabel(
    pendingSuggestions,
    pendingSuggestionCount
  );

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0 || !onUploadDocuments) {
      return;
    }

    setUploadPending(true);
    try {
      const message = await onUploadDocuments(files);
      setUploadMessage({
        tone: "success",
        text: message || `${files.length} W-2 PDF${files.length === 1 ? "" : "s"} uploaded.`
      });
      setHelperOpen(true);
    } catch (error) {
      setUploadMessage({
        tone: "error",
        text: error instanceof Error
          ? error.message
          : "Could not upload the W-2. Please try again."
      });
    } finally {
      setUploadPending(false);
      event.target.value = "";
    }
  }

  return (
    <div className="guided-w2-card">
      <div className="guided-w2-card-header">
        <strong className="guided-w2-card-title">
          W-2 #{index + 1}
          {entry.employerName ? ` — ${entry.employerName}` : ""}
        </strong>
        {removable && (
          <button
            type="button"
            className="utility-button utility-button-small utility-button-danger"
            onClick={onRemove}
            aria-label={`Remove W-2 #${index + 1}${entry.employerName ? ` — ${entry.employerName}` : ""}`}
          >
            Remove
          </button>
        )}
      </div>

      <div className="guided-doc-helper">
        <div className="guided-doc-helper-copy">
          <strong>Need help filling this in?</strong>
          <p>
            Upload a W-2 PDF here to pull the detected boxes into this card, or review
            values from documents already on this return. IRS sample PDFs stay labeled
            as sample data so you can tell demo values apart from your own document details
            before anything is saved.
          </p>
        </div>
        <div className="guided-doc-helper-actions">
          {onUploadDocuments ? (
            <>
              <button
                type="button"
                className="utility-button utility-button-small guided-doc-upload-button"
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploadPending}
              >
                {uploadPending ? "Uploading W-2..." : "Upload W-2 PDF"}
              </button>
              <input
                id={uploadInputId}
                ref={uploadInputRef}
                className="guided-doc-upload-input"
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={handleUpload}
              />
            </>
          ) : null}
          <button
            type="button"
            className="utility-button utility-button-small"
            onClick={() => setHelperOpen((open) => !open)}
            disabled={!helperOpen && !canReviewSuggestions}
          >
            {helperOpen
              ? "Hide W-2 suggestions"
              : !canReviewSuggestions
                ? "No W-2 suggestions yet"
                : hasSampleSuggestions
                  ? "Review W-2 and sample suggestions"
                  : "Review uploaded W-2 suggestions"}
          </button>
        </div>
      </div>

      {uploadMessage ? (
        <p
          className={`guided-doc-helper-status guided-doc-helper-status-${uploadMessage.tone}`}
          role="status"
        >
          {uploadMessage.text}
        </p>
      ) : null}

      {pendingSuggestionCount > 0 ? (
        <div className="guided-doc-helper-actions">
          <p className="guided-doc-helper-empty">
            Confirm {pendingSuggestionCount} highlighted {pendingSuggestionValueLabel} before you continue.
          </p>
          <button
            type="button"
            className="utility-button utility-button-small"
            onClick={onConfirmAllFields}
          >
            {pendingSuggestionCount === 1
              ? `Confirm the highlighted ${pendingSuggestionValueLabel}`
              : `Confirm all ${pendingSuggestionCount} highlighted ${pendingSuggestionValueLabel}`}
          </button>
        </div>
      ) : null}

      {helperOpen && (
        <div className="guided-doc-helper-results" aria-live="polite">
          {availableSuggestions.length > 0 ? (
            availableSuggestions.map((suggestion) => (
              <div className="guided-doc-helper-result" key={`${index}:${suggestion.documentId}`}>
                <div>
                  <strong>{suggestion.documentLabel}</strong>
                  {isOfficialFixtureSourceType(suggestion.sourceType) ? (
                    <p className="guided-doc-helper-meta">IRS sample values for testing only.</p>
                  ) : null}
                  <p className="guided-doc-helper-meta">
                    {suggestion.summary.employerName} · Box 1 {formatGuidedCurrency(suggestion.summary.wages)} · Box 2 {formatGuidedCurrency(suggestion.summary.federalWithheld)}
                  </p>
                </div>
                <button
                  type="button"
                  className="utility-button utility-button-small"
                  onClick={() => {
                    onApplySuggestion(suggestion);
                    setHelperOpen(false);
                  }}
                >
                  {formatW2SuggestionActionLabel(suggestion.sourceType)}
                </button>
              </div>
            ))
          ) : (
            <p className="guided-doc-helper-empty">
              No W-2 values are ready yet. Upload a W-2 or continue entering the boxes manually.
            </p>
          )}
        </div>
      )}

      <div className="guided-form-grid">
        <label className="guided-field">
          <span className="guided-field-label">W-2 recipient</span>
          <select className="guided-select" value={entry.accountHolder ?? ""} onChange={(event) => onUpdate("accountHolder", event.target.value)}>
            <option value="">Not answered</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse on a joint return</option>
          </select>
          <SuggestedFieldNotice suggestion={entry.aiSuggestedFields?.accountHolder} availableSuggestions={availableSuggestions} onConfirm={() => onConfirmField("accountHolder")} />
        </label>
        <label className="guided-field">
          <span className="guided-field-label">Employer name</span>
          <input
            type="text"
            className={`guided-input${entry.aiSuggestedFields?.employerName?.status === "pending-confirmation" ? " guided-input-ai-pending" : entry.aiSuggestedFields?.employerName?.status === "confirmed" ? " guided-input-ai-confirmed" : ""}`}
            value={entry.employerName}
            onChange={(e) => onUpdate("employerName", e.target.value)}
            placeholder="Acme Corp"
          />
          <SuggestedFieldNotice
            suggestion={entry.aiSuggestedFields?.employerName}
            availableSuggestions={availableSuggestions}
            onConfirm={() => onConfirmField("employerName")}
          />
        </label>
        <label className="guided-field">
          <span className="guided-field-label">Employer EIN (Box b)</span>
          <input
            type="text"
            className={`guided-input${entry.aiSuggestedFields?.employerEin?.status === "pending-confirmation" ? " guided-input-ai-pending" : entry.aiSuggestedFields?.employerEin?.status === "confirmed" ? " guided-input-ai-confirmed" : ""}`}
            value={entry.employerEin}
            onChange={(e) => onUpdate("employerEin", e.target.value)}
            placeholder="12-3456789"
            maxLength={10}
          />
          <SuggestedFieldNotice
            suggestion={entry.aiSuggestedFields?.employerEin}
            availableSuggestions={availableSuggestions}
            onConfirm={() => onConfirmField("employerEin")}
          />
        </label>
      </div>

      <div className="guided-form-grid">
        <CurrencyField
          label="Box 1 — Wages, tips, other comp"
          hint="This is your gross income from this employer."
          value={entry.wages}
          onChange={(v) => onUpdate("wages", v)}
          required
          fieldClassName={entry.aiSuggestedFields?.wages?.status === "pending-confirmation"
            ? "guided-field-ai-pending"
            : entry.aiSuggestedFields?.wages?.status === "confirmed"
              ? "guided-field-ai-confirmed"
              : undefined}
          footer={(
            <SuggestedFieldNotice
              suggestion={entry.aiSuggestedFields?.wages}
              availableSuggestions={availableSuggestions}
              onConfirm={() => onConfirmField("wages")}
            />
          )}
        />
        <CurrencyField
          label="Box 2 — Federal income tax withheld"
          value={entry.federalWithheld}
          onChange={(v) => onUpdate("federalWithheld", v)}
          fieldClassName={entry.aiSuggestedFields?.federalWithheld?.status === "pending-confirmation"
            ? "guided-field-ai-pending"
            : entry.aiSuggestedFields?.federalWithheld?.status === "confirmed"
              ? "guided-field-ai-confirmed"
              : undefined}
          footer={(
            <SuggestedFieldNotice
              suggestion={entry.aiSuggestedFields?.federalWithheld}
              availableSuggestions={availableSuggestions}
              onConfirm={() => onConfirmField("federalWithheld")}
            />
          )}
        />
      </div>

      <details className="guided-expand">
        <summary className="guided-expand-trigger">More W-2 boxes</summary>
        <div className="guided-expand-body">
          <p className="guided-hint">Enter the actual payroll boxes, including 0 where the source confirms zero. An empty field remains unknown.</p>
          <div className="guided-form-grid">
            <CurrencyField
              label="Box 3 — Social Security wages"
              value={entry.socialSecurityWages}
              onChange={(v) => onUpdate("socialSecurityWages", v)}
              fieldClassName={entry.aiSuggestedFields?.socialSecurityWages?.status === "pending-confirmation"
                ? "guided-field-ai-pending"
                : entry.aiSuggestedFields?.socialSecurityWages?.status === "confirmed"
                  ? "guided-field-ai-confirmed"
                  : undefined}
              footer={(
                <SuggestedFieldNotice
                  suggestion={entry.aiSuggestedFields?.socialSecurityWages}
                  availableSuggestions={availableSuggestions}
                  onConfirm={() => onConfirmField("socialSecurityWages")}
                />
              )}
            />
            <CurrencyField
              label="Box 4 — SS tax withheld"
              value={entry.socialSecurityWithheld}
              onChange={(v) => onUpdate("socialSecurityWithheld", v)}
              fieldClassName={entry.aiSuggestedFields?.socialSecurityWithheld?.status === "pending-confirmation"
                ? "guided-field-ai-pending"
                : entry.aiSuggestedFields?.socialSecurityWithheld?.status === "confirmed"
                  ? "guided-field-ai-confirmed"
                  : undefined}
              footer={(
                <SuggestedFieldNotice
                  suggestion={entry.aiSuggestedFields?.socialSecurityWithheld}
                  availableSuggestions={availableSuggestions}
                  onConfirm={() => onConfirmField("socialSecurityWithheld")}
                />
              )}
            />
          </div>
          <div className="guided-form-grid">
            <CurrencyField
              label="Box 5 — Medicare wages"
              value={entry.medicareWages}
              onChange={(v) => onUpdate("medicareWages", v)}
              fieldClassName={entry.aiSuggestedFields?.medicareWages?.status === "pending-confirmation"
                ? "guided-field-ai-pending"
                : entry.aiSuggestedFields?.medicareWages?.status === "confirmed"
                  ? "guided-field-ai-confirmed"
                  : undefined}
              footer={(
                <SuggestedFieldNotice
                  suggestion={entry.aiSuggestedFields?.medicareWages}
                  availableSuggestions={availableSuggestions}
                  onConfirm={() => onConfirmField("medicareWages")}
                />
              )}
            />
            <CurrencyField
              label="Box 6 — Medicare tax withheld"
              value={entry.medicareWithheld}
              onChange={(v) => onUpdate("medicareWithheld", v)}
              fieldClassName={entry.aiSuggestedFields?.medicareWithheld?.status === "pending-confirmation"
                ? "guided-field-ai-pending"
                : entry.aiSuggestedFields?.medicareWithheld?.status === "confirmed"
                  ? "guided-field-ai-confirmed"
                  : undefined}
              footer={(
                <SuggestedFieldNotice
                  suggestion={entry.aiSuggestedFields?.medicareWithheld}
                  availableSuggestions={availableSuggestions}
                  onConfirm={() => onConfirmField("medicareWithheld")}
                />
              )}
            />
          </div>
          <CurrencyField
            label="Box 7 — Social Security tips"
            hint="Enter the actual amount. A blank saved value is unknown; enter 0 only after checking the source."
            value={entry.socialSecurityTips ?? ""}
            onChange={value => onUpdate("socialSecurityTips", value)}
            fieldClassName={entry.aiSuggestedFields?.socialSecurityTips?.status === "pending-confirmation" ? "guided-field-ai-pending" : entry.aiSuggestedFields?.socialSecurityTips?.status === "confirmed" ? "guided-field-ai-confirmed" : undefined}
            footer={<SuggestedFieldNotice suggestion={entry.aiSuggestedFields?.socialSecurityTips} availableSuggestions={availableSuggestions} onConfirm={() => onConfirmField("socialSecurityTips")} />}
          />
          <CurrencyField label="Box 10 — Dependent-care benefits"
            hint="Check the actual W-2. Enter 0 only if no benefits are reported. Positive amounts need the benefit details in Tax Credits."
            value={entry.box10DependentCareBenefits ?? ""} onChange={value => onUpdate("box10DependentCareBenefits", value)}
            fieldClassName={entry.aiSuggestedFields?.box10DependentCareBenefits?.status === "pending-confirmation" ? "guided-field-ai-pending" : entry.aiSuggestedFields?.box10DependentCareBenefits?.status === "confirmed" ? "guided-field-ai-confirmed" : undefined}
            footer={<SuggestedFieldNotice suggestion={entry.aiSuggestedFields?.box10DependentCareBenefits} availableSuggestions={availableSuggestions} onConfirm={() => onConfirmField("box10DependentCareBenefits")} />} />
          <CurrencyField label="Box 12 code W — Employer HSA contributions" hint="Include cafeteria-plan contributions. Enter actual zero if no code W is reported; HSA employer worksheet reconciliation requires this source amount." value={entry.box12CodeW ?? ""} onChange={value => onUpdate("box12CodeW", value)}
            fieldClassName={entry.aiSuggestedFields?.box12CodeW?.status === "pending-confirmation" ? "guided-field-ai-pending" : entry.aiSuggestedFields?.box12CodeW?.status === "confirmed" ? "guided-field-ai-confirmed" : undefined}
            footer={<SuggestedFieldNotice suggestion={entry.aiSuggestedFields?.box12CodeW} availableSuggestions={availableSuggestions} onConfirm={() => onConfirmField("box12CodeW")} />} />
          <div className="guided-form-grid">
            <label className="guided-field">
              <span className="guided-field-label">State reporting on this W-2</span>
              <select className="guided-select" value={entry.stateTaxReporting ?? ""} onChange={(event) => onUpdate("stateTaxReporting", event.target.value)}>
                <option value="">Not answered</option><option value="none">No state section reported</option><option value="single">One state reported</option><option value="multiple">Multiple states reported</option>
              </select>
              <small>Use the actual form. Multiple-state allocation needs separate state records before this return can be calculated.</small>
            </label>
            <label className="guided-field">
              <span className="guided-field-label">Box 15 — State</span>
              <input className="guided-input" value={entry.state ?? ""} onChange={(event) => onUpdate("state", event.target.value.toUpperCase())} maxLength={2} placeholder="Actual two-letter state" />
              <SuggestedFieldNotice suggestion={entry.aiSuggestedFields?.state} availableSuggestions={availableSuggestions} onConfirm={() => onConfirmField("state")} />
            </label>
          </div>
          <div className="guided-form-grid">
            <CurrencyField
              label="Box 16 — State wages"
              value={entry.stateWages}
              onChange={(v) => onUpdate("stateWages", v)}
              fieldClassName={entry.aiSuggestedFields?.stateWages?.status === "pending-confirmation"
                ? "guided-field-ai-pending"
                : entry.aiSuggestedFields?.stateWages?.status === "confirmed"
                  ? "guided-field-ai-confirmed"
                  : undefined}
              footer={(
                <SuggestedFieldNotice
                  suggestion={entry.aiSuggestedFields?.stateWages}
                  availableSuggestions={availableSuggestions}
                  onConfirm={() => onConfirmField("stateWages")}
                />
              )}
            />
            <CurrencyField
              label="Box 17 — State tax withheld"
              value={entry.stateWithheld}
              onChange={(v) => onUpdate("stateWithheld", v)}
              fieldClassName={entry.aiSuggestedFields?.stateWithheld?.status === "pending-confirmation"
                ? "guided-field-ai-pending"
                : entry.aiSuggestedFields?.stateWithheld?.status === "confirmed"
                  ? "guided-field-ai-confirmed"
                  : undefined}
              footer={(
                <SuggestedFieldNotice
                  suggestion={entry.aiSuggestedFields?.stateWithheld}
                  availableSuggestions={availableSuggestions}
                  onConfirm={() => onConfirmField("stateWithheld")}
                />
              )}
            />
          </div>
        </div>
      </details>
    </div>
  );
}

export function SectionW2Income({
  entries,
  workspace,
  onUploadDocuments,
  onEntriesChange,
}: {
  entries: W2EntryData[];
  workspace: ReturnWorkspaceRecord;
  onUploadDocuments?: (files: File[]) => Promise<string>;
  onEntriesChange: (entries: W2EntryData[]) => void;
}) {
  const current = entries.length > 0 ? entries : [emptyW2Entry];
  const workspaceSuggestions = useMemo(
    () => collectW2Suggestions(workspace.documents, workspace.structuredFacts),
    [workspace.documents, workspace.structuredFacts]
  );
  const [attachedSuggestionCandidates, setAttachedSuggestionCandidates] = useState<W2DocumentSuggestion[]>([]);
  const attachedSuggestionWorkspaceId = useRef(workspace.id);
  const attachedReviewToken = useRef(0);
  const activeWorkspaceId = useRef(workspace.id);
  activeWorkspaceId.current = workspace.id;
  const [cachedAttachedDocumentIds, setCachedAttachedDocumentIds] = useState<Set<string>>(new Set());
  const [selectedAttachedDocumentIds, setSelectedAttachedDocumentIds] = useState<string[]>([]);
  const [attachedReviewPending, setAttachedReviewPending] = useState(false);
  const [attachedReviewMessage, setAttachedReviewMessage] = useState<string | null>(null);
  const attachedReviewDocuments = useMemo(
    () => workspace.documents
      .filter((document) => (
        !document.matchedFixtureId
        && !isGuidedSyntheticDocument(document)
        && /\.pdf$/i.test(document.name)
        && !workspaceSuggestions.some((suggestion) => suggestion.documentId === document.id)
        && cachedAttachedDocumentIds.has(document.id)
      ))
      .sort((left, right) => {
        const scoreDifference = scoreAttachedDocumentForW2Review(left) - scoreAttachedDocumentForW2Review(right);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return resolveAttachedDocumentTitle(left).localeCompare(resolveAttachedDocumentTitle(right));
      }),
    [cachedAttachedDocumentIds, workspace.documents, workspaceSuggestions],
  );
  const suggestions = useMemo(() => {
    const suggestionsByDocumentId = new Map<string, W2DocumentSuggestion>();

    for (const suggestion of workspaceSuggestions) {
      suggestionsByDocumentId.set(suggestion.documentId, suggestion);
    }

    if (attachedSuggestionWorkspaceId.current === workspace.id) for (const suggestion of attachedSuggestionCandidates) suggestionsByDocumentId.set(suggestion.documentId, suggestion);

    return Array.from(suggestionsByDocumentId.values());
  }, [attachedSuggestionCandidates, workspaceSuggestions, workspace.id]);

  useEffect(() => {
    attachedReviewToken.current += 1;
    setAttachedSuggestionCandidates([]);
    setAttachedReviewMessage(null);
    setAttachedReviewPending(false);
    return () => { attachedReviewToken.current += 1; };
  }, [workspace.id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const nextIds = new Set<string>();

      await Promise.all(workspace.documents.map(async (document) => {
        if (await hasCachedWorkspaceDocumentFile(workspace.id, document.id)) {
          nextIds.add(document.id);
        }
      }));

      if (!cancelled) {
        setCachedAttachedDocumentIds(nextIds);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspace.documents, workspace.id]);

  useEffect(() => {
    setSelectedAttachedDocumentIds((currentIds) => {
      const nextIds = attachedReviewDocuments.map((document) => document.id);
      const retained = currentIds.filter((id) => nextIds.includes(id));
      const added = nextIds.filter((id) => !retained.includes(id));
      return [...retained, ...added];
    });
  }, [attachedReviewDocuments]);

  function updateEntry(index: number, field: keyof W2EntryData, value: string) {
    const next = current.map((entry, i) =>
      i === index ? { ...clearSuggestedField(entry, field), [field]: value } : entry
    );
    onEntriesChange(next);
  }

  function confirmField(index: number, field: W2SuggestedField) {
    const next = current.map((entry, i) =>
      i === index ? confirmSuggestedField(entry, field) : entry
    );
    onEntriesChange(next);
  }

  function confirmAllFields(index: number) {
    const next = current.map((entry, i) =>
      i === index ? confirmAllSuggestedFields(entry) : entry
    );
    onEntriesChange(next);
  }

  function applySuggestion(index: number, suggestion: W2DocumentSuggestion) {
    const next = current.map((entry, i) =>
      i === index ? applySuggestionToEntry(entry, suggestion) : entry
    );
    onEntriesChange(next);
  }

  function addEntry() {
    onEntriesChange([...current, emptyW2Entry]);
  }

  function removeEntry(index: number) {
    const next = current.filter((_, i) => i !== index);
    onEntriesChange(next.length > 0 ? next : [emptyW2Entry]);
  }

  async function reviewSelectedAttachedDocuments() {
    const selectedDocuments = attachedReviewDocuments.filter((document) =>
      selectedAttachedDocumentIds.includes(document.id),
    );

    if (selectedDocuments.length === 0) {
      setAttachedReviewMessage("Select at least one attached PDF first.");
      return;
    }

    setAttachedReviewPending(true);
    setAttachedReviewMessage(null);
    const token = ++attachedReviewToken.current;
    const sourceWorkspaceId = workspace.id;
    const isCurrent = () => attachedReviewToken.current === token && activeWorkspaceId.current === sourceWorkspaceId;

    try {
      const nextSuggestions: W2DocumentSuggestion[] = [];
      const missingDocumentLabels: string[] = [];
      const unparsedDocumentLabels: string[] = [];

      for (const document of selectedDocuments) {
        const file = await getCachedWorkspaceDocumentFile(workspace.id, document.id);
        if (!isCurrent()) return;

        if (!file) {
          missingDocumentLabels.push(document.label || document.name);
          continue;
        }

        const detectedDocument = await detectUploadedDocumentFromFile(file);
        if (!isCurrent()) return;
        const suggestion = buildUploadedW2Suggestion(document, detectedDocument);

        if (suggestion) {
          nextSuggestions.push(suggestion);
        } else {
          unparsedDocumentLabels.push(document.label || document.name);
        }
      }

      attachedSuggestionWorkspaceId.current = sourceWorkspaceId;
      setAttachedSuggestionCandidates((currentSuggestions) => {
        const suggestionsByDocumentId = new Map(
          currentSuggestions.map((suggestion) => [suggestion.documentId, suggestion]),
        );

        for (const suggestion of nextSuggestions) {
          suggestionsByDocumentId.set(suggestion.documentId, suggestion);
        }

        return Array.from(suggestionsByDocumentId.values());
      });

      if (nextSuggestions.length === 0) {
        setAttachedReviewMessage(
          missingDocumentLabels.length > 0
            ? "These attached PDFs could not be reopened because their raw bytes are no longer cached locally. Re-upload them once to retry parsing."
            : "No W-2 values were detected in the selected attached PDFs.",
        );
        return;
      }

      const skippedCount = missingDocumentLabels.length + unparsedDocumentLabels.length;
      setAttachedReviewMessage(
        skippedCount > 0
          ? `Detected W-2 values from ${nextSuggestions.length} attached PDF${nextSuggestions.length === 1 ? "" : "s"}. ${skippedCount} selected document${skippedCount === 1 ? "" : "s"} did not produce W-2 values.`
          : `Detected W-2 values from ${nextSuggestions.length} attached PDF${nextSuggestions.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      if (!isCurrent()) return;
      setAttachedReviewMessage(
        error instanceof Error
          ? error.message
          : "Could not review the selected attached PDFs.",
      );
    } finally {
      if (isCurrent()) setAttachedReviewPending(false);
    }
  }

  return (
    <RetroShell title="W-2 Wages" eyebrow="INCOME">
      <div className="guided-question">
        <p className="guided-prompt">Let&apos;s get your W-2 info.</p>
        <p className="guided-hint">
          Enter the amounts from each W-2 you received. The most important boxes are
          Box 1 (wages) and Box 2 (federal tax withheld). If you uploaded a W-2 or
          loaded an IRS sample first, you can pull those values into a card below
          and review them before saving.
        </p>

        {attachedReviewDocuments.length > 0 ? (
          <div className="guided-w2-card" style={{ marginBottom: "12px" }}>
            <div className="guided-w2-card-header">
              <strong className="guided-w2-card-title">Try parsing attached PDFs</strong>
              <span className="guided-field-badge-active">
                {attachedReviewDocuments.length} attached
              </span>
            </div>
            <p className="guided-hint" style={{ marginBottom: "12px" }}>
              Select PDFs already attached to this return and retry W-2 detection without uploading them again.
            </p>
            <div className="guided-bank-analysis-stack guided-attached-document-list">
              {attachedReviewDocuments.map((document) => {
                const checked = selectedAttachedDocumentIds.includes(document.id);
                const title = resolveAttachedDocumentTitle(document);
                const fileName = resolveAttachedDocumentFilename(document);

                return (
                  <label
                    key={document.id}
                    className={`guided-bank-analysis-item guided-attached-document-item${checked ? " guided-attached-document-item-selected" : ""}`}
                  >
                    <div>
                      <strong className="guided-bank-analysis-item-title">{title}</strong>
                      {fileName ? (
                        <p className="guided-attached-document-filename">{fileName}</p>
                      ) : null}
                      <p className="guided-doc-helper-meta">
                        {[document.kind, document.coverage].join(" · ")}
                      </p>
                      <p className="guided-hint guided-attached-document-notes">{document.notes}</p>
                    </div>
                    <div className="guided-bank-analysis-actions">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedAttachedDocumentIds((currentIds) => (
                            event.target.checked
                              ? [...currentIds, document.id]
                              : currentIds.filter((id) => id !== document.id)
                          ));
                        }}
                        aria-label={`Select ${document.label || document.name} for W-2 detection`}
                      />
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="guided-doc-helper-actions guided-attached-document-footer" style={{ marginTop: "12px" }}>
              <button
                type="button"
                className="utility-button utility-button-small guided-doc-upload-button"
                onClick={() => void reviewSelectedAttachedDocuments()}
                disabled={attachedReviewPending || selectedAttachedDocumentIds.length === 0}
              >
                {attachedReviewPending ? "Checking attached PDFs..." : "Try selected attached PDFs"}
              </button>
              {attachedReviewPending && <button type="button" className="utility-button utility-button-small" onClick={() => { attachedReviewToken.current += 1; setAttachedReviewPending(false); setAttachedReviewMessage("Local W-2 detection cancelled."); }}>Cancel W-2 detection</button>}
            </div>
          </div>
        ) : null}

        {attachedReviewMessage ? (
          <p className={`guided-doc-helper-status ${attachedReviewMessage.startsWith("Detected") ? "guided-doc-helper-status-success" : "guided-doc-helper-status-error"}`}>
            {attachedReviewMessage}
          </p>
        ) : null}

        <div className="guided-w2-stack">
          {current.map((entry, index) => (
            <W2Card
              key={index}
              index={index}
              entry={entry}
              onUpdate={(field, value) => updateEntry(index, field, value)}
              onConfirmField={(field) => confirmField(index, field)}
              onConfirmAllFields={() => confirmAllFields(index)}
              onApplySuggestion={(suggestion) => applySuggestion(index, suggestion)}
              onUploadDocuments={onUploadDocuments}
              onRemove={() => removeEntry(index)}
              removable={current.length > 1}
              availableSuggestions={suggestions}
            />
          ))}
        </div>

        <button
          type="button"
          className="utility-button"
          onClick={addEntry}
        >
          + Add another W-2
        </button>
      </div>
    </RetroShell>
  );
}
