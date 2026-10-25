"use client";
import { formatGuidedDollars, parseGuidedDisplayAmount, sumGuidedDisplayAmounts } from "@/lib/guided-currency";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { RetroShell } from "@/components/retro-shell";
import {
  acceptSelfEmploymentIncomeSuggestion,
  dismissSelfEmploymentIncomeSuggestion,
  type ScheduleCBankStatementAnalysis,
  type ScheduleCExpenseData,
  type SelfEmploymentIncomeDocumentAnalysis,
  type NecEntryData,
  emptyNecEntry,
  emptyScheduleCExpenses,
} from "@/lib/guided-interview-flow";
import {
  addAmountToExpenseValue,
  analyzeSelfEmploymentIncomeDocuments,
  analyzeBusinessExpenseStatements,
  summarizeSelfEmploymentIncomeSuggestions,
  summarizeBankStatementSuggestionsByCategory,
} from "@/lib/business-expense-analysis";
import {
  collectNecSuggestions,
  type NecDocumentSuggestion,
} from "@/lib/workspace-assistant";
import {
  getCachedWorkspaceDocumentFile,
  hasCachedWorkspaceDocumentFile,
} from "@/lib/workspace-document-file-cache";
import { isGuidedSyntheticDocument } from "@/lib/workspace-status-copy";
import { CurrencyField } from "./currency-field";
import { BooleanFact } from "./fact-fields";

function toCurrencyInput(value: string | undefined) {
  if (!value) {
    return "";
  }

  const normalized = value.trim();
  return normalized === "0" ? "" : normalized;
}

function hasNecEntryContent(entry: NecEntryData) {
  return Boolean(
    entry.payerName.trim()
    || entry.payerTin.trim()
    || entry.nonemployeeCompensation.trim()
    || entry.federalWithheld.trim()
  );
}

function buildNecEntryFromSuggestion(suggestion: NecDocumentSuggestion): NecEntryData {
  return {
    payerName: suggestion.summary.payer,
    payerTin: "",
    nonemployeeCompensation: toCurrencyInput(suggestion.summary.nonemployeeCompensation),
    federalWithheld: toCurrencyInput(suggestion.summary.federalWithheld),
  };
}

function matchesNecSuggestion(entry: NecEntryData, suggestion: NecDocumentSuggestion) {
  const suggestedEntry = buildNecEntryFromSuggestion(suggestion);
  return (
    entry.payerName.trim() === suggestedEntry.payerName
    && entry.nonemployeeCompensation.trim() === suggestedEntry.nonemployeeCompensation
    && entry.federalWithheld.trim() === suggestedEntry.federalWithheld
  );
}

function isAttachedIncomeReviewCandidate(document: ReturnWorkspaceRecord["documents"][number]) {
  return !isGuidedSyntheticDocument(document)
    && document.matchedFixtureId === null
    && (document.kind === "unknown" || document.kind === "schedule-c-support");
}

export function filterAttachedIncomeReviewDocuments(
  documents: ReturnWorkspaceRecord["documents"],
  cachedDocumentIds: ReadonlySet<string>,
) {
  return documents.filter((document) =>
    isAttachedIncomeReviewCandidate(document) && cachedDocumentIds.has(document.id)
  );
}

function NecCard({
  index,
  entry,
  onUpdate,
  onRemove,
  removable,
}: {
  index: number;
  entry: NecEntryData;
  onUpdate: (field: keyof NecEntryData, value: string) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="guided-w2-card">
      <div className="guided-w2-card-header">
        <strong className="guided-w2-card-title">
          1099-NEC #{index + 1}
          {entry.payerName ? ` — ${entry.payerName}` : ""}
        </strong>
        {removable && (
          <button
            type="button"
            className="utility-button utility-button-small utility-button-danger"
            onClick={onRemove}
            aria-label={`Remove 1099-NEC #${index + 1}${entry.payerName ? ` — ${entry.payerName}` : ""}`}
          >
            Remove
          </button>
        )}
      </div>

      <div className="guided-form-grid">
        <label className="guided-field">
          <span className="guided-field-label">Payer name (who paid you)</span>
          <input
            type="text"
            className="guided-input"
            value={entry.payerName}
            onChange={(e) => onUpdate("payerName", e.target.value)}
            placeholder="Client or Company Name"
          />
        </label>
        <label className="guided-field">
          <span className="guided-field-label">Payer TIN (optional)</span>
          <input
            type="text"
            className="guided-input"
            value={entry.payerTin}
            onChange={(e) => onUpdate("payerTin", e.target.value)}
            placeholder="12-3456789"
            maxLength={10}
          />
        </label>
      </div>

      <div className="guided-form-grid">
        <CurrencyField
          label="Box 1 — Nonemployee compensation"
          hint="The total amount you were paid by this client."
          value={entry.nonemployeeCompensation}
          onChange={(v) => onUpdate("nonemployeeCompensation", v)}
        />
        <CurrencyField
          label="Box 4 — Federal income tax withheld"
          hint="Usually $0 for 1099-NEC, but check your form."
          value={entry.federalWithheld}
          onChange={(v) => onUpdate("federalWithheld", v)}
        />
      </div>
    </div>
  );
}

const expenseFields: { field: keyof ScheduleCExpenseData; label: string; hint?: string }[] = [
  { field: "advertising", label: "Advertising" },
  { field: "carAndTruck", label: "Car & truck expenses", hint: "Business use of your vehicle" },
  { field: "insurance", label: "Insurance (business)", hint: "Not health insurance — that goes under Adjustments" },
  { field: "officeExpense", label: "Office expense" },
  { field: "supplies", label: "Supplies" },
  { field: "travel", label: "Travel" },
  { field: "meals", label: "Meals", hint: "Business meals are generally 50% deductible" },
  { field: "utilities", label: "Utilities" },
  { field: "otherExpenses", label: "Other expenses", hint: "Anything else not listed above" },
];

const expenseFieldLabels = Object.fromEntries(
  expenseFields.map((field) => [field.field, field.label])
) as Record<keyof ScheduleCExpenseData, string>;

const maxIncomeSuggestionSteps = 100;
const maxExpenseSuggestionSteps = 150;

function formatSuggestedAmount(value: string) {
  const amount = parseGuidedDisplayAmount(value);
  return amount.isFinite() ? formatGuidedDollars(amount) : "—";
}

function compareSuggestionPriority(
  left: { suggestion: { amount: string; date?: string } },
  right: { suggestion: { amount: string; date?: string } },
) {
  const amountDifference = parseGuidedDisplayAmount(right.suggestion.amount).comparedTo(parseGuidedDisplayAmount(left.suggestion.amount));
  if (amountDifference !== 0) {
    return amountDifference;
  }

  const leftDate = left.suggestion.date ? Date.parse(left.suggestion.date) : 0;
  const rightDate = right.suggestion.date ? Date.parse(right.suggestion.date) : 0;
  return rightDate - leftDate;
}

function isActionableBusinessSuggestion(
  suggestion: ScheduleCBankStatementAnalysis["suggestions"][number],
): suggestion is ScheduleCBankStatementAnalysis["suggestions"][number] & {
  suggestedCategory: keyof ScheduleCExpenseData;
} {
  return suggestion.suggestedBusinessUse
    && suggestion.suggestedCategory !== "not-business"
    && suggestion.suggestedCategory !== "needs-review";
}

export function SectionSelfEmployment({
  workspace,
  necEntries,
  manualGrossReceipts,
  expenses,
  bankStatementAnalyses,
  incomeDocumentAnalyses,
  qbiMateriallyParticipated,
  onSectionChange,
}: {
  workspace: ReturnWorkspaceRecord;
  necEntries: NecEntryData[];
  manualGrossReceipts: string;
  expenses: ScheduleCExpenseData;
  bankStatementAnalyses: ScheduleCBankStatementAnalysis[];
  incomeDocumentAnalyses: SelfEmploymentIncomeDocumentAnalysis[];
  qbiMateriallyParticipated?: boolean | null;
  onSectionChange: (next: {
    necEntries: NecEntryData[];
    manualGrossReceipts: string;
    expenses: ScheduleCExpenseData;
    bankStatementAnalyses: ScheduleCBankStatementAnalysis[];
    incomeDocumentAnalyses: SelfEmploymentIncomeDocumentAnalysis[];
    qbiMateriallyParticipated?: boolean | null;
  }) => void;
}) {
  const currentEntries = necEntries.length > 0 ? necEntries : [emptyNecEntry];
  const currentExpenses = expenses ?? emptyScheduleCExpenses;
  const currentAnalyses = bankStatementAnalyses ?? [];
  const currentIncomeAnalyses = incomeDocumentAnalyses ?? [];
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const incomeUploadInputRef = useRef<HTMLInputElement>(null);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [incomeAnalysisPending, setIncomeAnalysisPending] = useState(false);
  const [incomeAnalysisMessage, setIncomeAnalysisMessage] = useState<string | null>(null);
  const [cachedAttachedIncomeDocumentIds, setCachedAttachedIncomeDocumentIds] = useState<Set<string>>(new Set());
  const [selectedAttachedIncomeDocumentIds, setSelectedAttachedIncomeDocumentIds] = useState<string[]>(
    [],
  );
  const [currentIncomeSuggestionIndex, setCurrentIncomeSuggestionIndex] = useState(0);
  const [currentExpenseSuggestionIndex, setCurrentExpenseSuggestionIndex] = useState(0);
  const necSuggestions = useMemo(
    () => collectNecSuggestions(workspace.documents, workspace.structuredFacts),
    [workspace.documents, workspace.structuredFacts],
  );
  const attachedIncomeReviewCandidates = useMemo(
    () => workspace.documents.filter((document) => isAttachedIncomeReviewCandidate(document)),
    [workspace.documents],
  );
  const attachedIncomeReviewDocuments = useMemo(
    () => filterAttachedIncomeReviewDocuments(workspace.documents, cachedAttachedIncomeDocumentIds),
    [workspace.documents, cachedAttachedIncomeDocumentIds],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const nextIds = new Set<string>();

      await Promise.all(attachedIncomeReviewCandidates.map(async (document) => {
        if (await hasCachedWorkspaceDocumentFile(workspace.id, document.id)) {
          nextIds.add(document.id);
        }
      }));

      if (!cancelled) {
        setCachedAttachedIncomeDocumentIds(nextIds);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachedIncomeReviewCandidates, workspace.id]);

  useEffect(() => {
    setSelectedAttachedIncomeDocumentIds((currentIds) => {
      const nextIds = attachedIncomeReviewDocuments.map((document) => document.id);
      const retained = currentIds.filter((id) => nextIds.includes(id));
      const added = nextIds.filter((id) => !retained.includes(id));
      return [...retained, ...added];
    });
  }, [attachedIncomeReviewDocuments]);

  function commitSection(next: Partial<{
    necEntries: NecEntryData[];
    manualGrossReceipts: string;
    expenses: ScheduleCExpenseData;
    bankStatementAnalyses: ScheduleCBankStatementAnalysis[];
    incomeDocumentAnalyses: SelfEmploymentIncomeDocumentAnalysis[];
    qbiMateriallyParticipated?: boolean | null;
  }>) {
    onSectionChange({
      necEntries: next.necEntries ?? currentEntries,
      manualGrossReceipts: next.manualGrossReceipts ?? manualGrossReceipts,
      expenses: next.expenses ?? currentExpenses,
      bankStatementAnalyses: next.bankStatementAnalyses ?? currentAnalyses,
      incomeDocumentAnalyses: next.incomeDocumentAnalyses ?? currentIncomeAnalyses,
      qbiMateriallyParticipated: "qbiMateriallyParticipated" in next ? next.qbiMateriallyParticipated : qbiMateriallyParticipated,
    });
  }

  function updateEntry(index: number, field: keyof NecEntryData, value: string) {
    const next = currentEntries.map((entry, i) =>
      i === index ? { ...entry, [field]: value } : entry
    );
    commitSection({ necEntries: next });
  }

  function addEntry() {
    commitSection({ necEntries: [...currentEntries, emptyNecEntry] });
  }

  function applyNecSuggestion(suggestion: NecDocumentSuggestion) {
    const nextEntry = buildNecEntryFromSuggestion(suggestion);
    const firstEmptyIndex = currentEntries.findIndex((entry) => !hasNecEntryContent(entry));

    if (firstEmptyIndex >= 0) {
      commitSection({
        necEntries: currentEntries.map((entry, index) => (
          index === firstEmptyIndex ? nextEntry : entry
        )),
      });
      return;
    }

    commitSection({ necEntries: [...currentEntries, nextEntry] });
  }

  function removeEntry(index: number) {
    const next = currentEntries.filter((_, i) => i !== index);
    commitSection({ necEntries: next.length > 0 ? next : [emptyNecEntry] });
  }

  function updateExpense(field: keyof ScheduleCExpenseData, value: string) {
    commitSection({ expenses: { ...currentExpenses, [field]: value } });
  }

  function markSuggestionApplied(
    analysisId: string,
    suggestionId: string,
    category: keyof ScheduleCExpenseData,
  ) {
    return currentAnalyses.map((analysis) => (
      analysis.id !== analysisId
        ? analysis
        : {
            ...analysis,
            suggestions: analysis.suggestions.map((suggestion) => (
              suggestion.id !== suggestionId
                ? suggestion
                : {
                    ...suggestion,
                    appliedCategory: category,
                  }
            )),
          }
    ));
  }

  function applySuggestion(
    analysisId: string,
    suggestionId: string,
    overrideCategory?: keyof ScheduleCExpenseData,
  ) {
    const analysis = currentAnalyses.find((entry) => entry.id === analysisId);
    const suggestion = analysis?.suggestions.find((entry) => entry.id === suggestionId);
    const targetCategory = overrideCategory ?? (suggestion && isActionableBusinessSuggestion(suggestion)
      ? suggestion.suggestedCategory
      : null);

    if (!analysis || !suggestion || !targetCategory || suggestion.appliedCategory) {
      return;
    }

    commitSection({
      expenses: {
        ...currentExpenses,
        [targetCategory]: addAmountToExpenseValue(
          currentExpenses[targetCategory],
          suggestion.amount,
        ),
      },
      bankStatementAnalyses: markSuggestionApplied(analysisId, suggestionId, targetCategory),
    });
  }

  function dismissExpenseSuggestion(analysisId: string, suggestionId: string) {
    commitSection({
      bankStatementAnalyses: currentAnalyses.map((analysis) => (
        analysis.id !== analysisId
          ? analysis
          : {
              ...analysis,
              suggestions: analysis.suggestions.map((suggestion) => (
                suggestion.id !== suggestionId
                  ? suggestion
                  : {
                      ...suggestion,
                      dismissed: true,
                    }
              )),
            }
      )),
    });
  }

  function acceptNonActionableExpenseSuggestion(analysisId: string, suggestionId: string) {
    dismissExpenseSuggestion(analysisId, suggestionId);
  }

  function applyIncomeSuggestion(analysisId: string, suggestionId: string) {
    const nextSection = acceptSelfEmploymentIncomeSuggestion({
      necEntries: currentEntries,
      manualGrossReceipts,
      expenses: currentExpenses,
      bankStatementAnalyses: currentAnalyses,
      incomeDocumentAnalyses: currentIncomeAnalyses,
    }, analysisId, suggestionId);

    commitSection(nextSection);
  }

  function dismissIncomeSuggestion(analysisId: string, suggestionId: string) {
    const nextSection = dismissSelfEmploymentIncomeSuggestion({
      necEntries: currentEntries,
      manualGrossReceipts,
      expenses: currentExpenses,
      bankStatementAnalyses: currentAnalyses,
      incomeDocumentAnalyses: currentIncomeAnalyses,
    }, analysisId, suggestionId);

    commitSection(nextSection);
  }

  async function reviewSelectedAttachedIncomeDocuments() {
    const selectedDocuments = attachedIncomeReviewDocuments.filter((document) =>
      selectedAttachedIncomeDocumentIds.includes(document.id),
    );

    if (selectedDocuments.length === 0) {
      setIncomeAnalysisMessage("Select at least one attached paystub or invoice first.");
      return;
    }

    setIncomeAnalysisPending(true);
    setIncomeAnalysisMessage(null);

    try {
      const files: File[] = [];
      const missingDocumentLabels: string[] = [];

      for (const document of selectedDocuments) {
        const file = await getCachedWorkspaceDocumentFile(workspace.id, document.id);
        if (file) {
          files.push(file);
        } else {
          missingDocumentLabels.push(document.label || document.name);
        }
      }

      if (files.length === 0) {
        setIncomeAnalysisMessage(
          missingDocumentLabels.length > 0
            ? "These attached documents cannot be reopened for AI review because their raw file bytes were not cached locally. Re-upload them once to enable attached-document review."
            : "Could not load the selected attached documents.",
        );
        return;
      }

      const analyses = await analyzeSelfEmploymentIncomeDocuments(files);
      commitSection({
        incomeDocumentAnalyses: [
          ...currentIncomeAnalyses,
          ...analyses.map((analysis, index) => ({
            ...analysis,
            id: `${analysis.id}-${Date.now()}-${index}`,
          })),
        ],
      });

      setIncomeAnalysisMessage(
        missingDocumentLabels.length > 0
          ? `Reviewed ${files.length} attached income document${files.length === 1 ? "" : "s"} with AI. ${missingDocumentLabels.length} older attached document${missingDocumentLabels.length === 1 ? "" : "s"} could not be reopened and were skipped.`
          : `Reviewed ${files.length} attached income document${files.length === 1 ? "" : "s"} with AI.`,
      );
    } catch (error) {
      setIncomeAnalysisMessage(
        error instanceof Error
          ? error.message
          : "Could not analyze the selected attached documents.",
      );
    } finally {
      setIncomeAnalysisPending(false);
    }
  }

  async function handleIncomeDocumentUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    setIncomeAnalysisPending(true);
    setIncomeAnalysisMessage(null);

    try {
      const analyses = await analyzeSelfEmploymentIncomeDocuments(files);
      commitSection({
        incomeDocumentAnalyses: [
          ...currentIncomeAnalyses,
          ...analyses.map((analysis, index) => ({
            ...analysis,
            id: `${analysis.id}-${Date.now()}-${index}`,
          })),
        ],
      });
      setIncomeAnalysisMessage(`Reviewed ${files.length} income document${files.length === 1 ? "" : "s"} with AI.`);
    } catch (error) {
      setIncomeAnalysisMessage(
        error instanceof Error
          ? error.message
          : "Could not analyze the uploaded paystubs or invoices.",
      );
    } finally {
      setIncomeAnalysisPending(false);
    }
  }

  async function handleStatementUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    setAnalysisPending(true);
    setAnalysisMessage(null);

    try {
      const analyses = await analyzeBusinessExpenseStatements(files);
      commitSection({
        bankStatementAnalyses: [
          ...currentAnalyses,
          ...analyses.map((analysis, index) => ({
            ...analysis,
            id: `${analysis.id}-${Date.now()}-${index}`,
          })),
        ],
      });
      setAnalysisMessage(`Reviewed ${files.length} statement${files.length === 1 ? "" : "s"} with AI.`);
    } catch (error) {
      setAnalysisMessage(
        error instanceof Error
          ? error.message
          : "Could not analyze the uploaded statement.",
      );
    } finally {
      setAnalysisPending(false);
    }
  }

  const necIncome = sumGuidedDisplayAmounts(currentEntries.map((entry) => entry.nonemployeeCompensation));
  const manualIncome = parseGuidedDisplayAmount(manualGrossReceipts);
  const totalIncome = necIncome.plus(manualIncome);
  const totalExpenses = sumGuidedDisplayAmounts(Object.values(currentExpenses));
  const netProfit = totalIncome.minus(totalExpenses);
  const suggestedTotals = summarizeBankStatementSuggestionsByCategory(currentAnalyses);
  const suggestedIncomeTotal = summarizeSelfEmploymentIncomeSuggestions(currentIncomeAnalyses);
  const allIncomeSuggestionSteps = currentIncomeAnalyses.flatMap((analysis) => (
    analysis.suggestions
      .filter((suggestion) => !suggestion.applied && !suggestion.dismissed)
      .map((suggestion) => ({ analysis, suggestion }))
  ));
  const incomeSuggestionSteps = [...allIncomeSuggestionSteps]
    .sort(compareSuggestionPriority)
    .slice(0, maxIncomeSuggestionSteps);
  const allExpenseSuggestionSteps = currentAnalyses.flatMap((analysis) => (
    analysis.suggestions
      .filter((suggestion) => !suggestion.appliedCategory && !suggestion.dismissed)
      .map((suggestion) => ({ analysis, suggestion }))
  ));
  const expenseSuggestionSteps = [...allExpenseSuggestionSteps]
    .sort(compareSuggestionPriority)
    .slice(0, maxExpenseSuggestionSteps);
  const activeIncomeSuggestionIndex = Math.min(
    currentIncomeSuggestionIndex,
    Math.max(incomeSuggestionSteps.length - 1, 0),
  );
  const activeExpenseSuggestionIndex = Math.min(
    currentExpenseSuggestionIndex,
    Math.max(expenseSuggestionSteps.length - 1, 0),
  );
  const currentIncomeSuggestionStep = incomeSuggestionSteps[activeIncomeSuggestionIndex] ?? null;
  const currentExpenseSuggestionStep = expenseSuggestionSteps[activeExpenseSuggestionIndex] ?? null;

  return (
    <RetroShell title="Self-Employment Income" eyebrow="INCOME">
      <div className="guided-question">
        <p className="guided-prompt">Let&apos;s get your freelance and business income.</p>
        <p className="guided-hint">
          Enter any 1099-NEC forms you received, plus business income that was paid
          without a 1099. Then we&apos;ll capture your business expenses for Schedule C.
          The difference is your net self-employment income.
        </p>

        <div className="guided-w2-card">
          <CurrencyField
            label="Income not reported on a 1099-NEC"
            hint="Cash, checks, app payments, barter, or other self-employment income you earned without receiving a 1099-NEC."
            value={manualGrossReceipts}
            onChange={(value) => commitSection({ manualGrossReceipts: value })}
          />

          <div className="guided-doc-helper" style={{ marginTop: "12px" }}>
            <div className="guided-doc-helper-copy">
              <strong>AI paystub and invoice review</strong>
              <p>
                Review paystubs, invoices, or similar earnings documents already attached to this
                return, or upload new ones here, and we&apos;ll suggest the income amounts that likely
                belong in Schedule C gross receipts.
              </p>
              <p>
                This is a general AI review, not a format-specific parser. Nothing is added unless you accept it.
              </p>
            </div>
            <div className="guided-doc-helper-actions">
              <button
                type="button"
                className="utility-button utility-button-small guided-doc-upload-button"
                onClick={() => incomeUploadInputRef.current?.click()}
                disabled={incomeAnalysisPending}
              >
                {incomeAnalysisPending ? "Analyzing..." : "Upload paystubs or invoices"}
              </button>
              <input
                ref={incomeUploadInputRef}
                className="guided-doc-upload-input"
                type="file"
                accept="application/pdf"
                multiple
                onChange={handleIncomeDocumentUpload}
              />
            </div>
          </div>

          {attachedIncomeReviewDocuments.length > 0 ? (
            <div className="guided-w2-card" style={{ marginTop: "12px" }}>
              <div className="guided-w2-card-header">
                <strong className="guided-w2-card-title">Use attached paystubs or invoices</strong>
                <span className="guided-field-badge-active">
                  {attachedIncomeReviewDocuments.length} attached
                </span>
              </div>
              <p className="guided-hint" style={{ marginBottom: "12px" }}>
                Select documents already attached to this return and run the AI income review without uploading them again.
              </p>
              <div className="guided-bank-analysis-stack">
                {attachedIncomeReviewDocuments.map((document) => {
                  const checked = selectedAttachedIncomeDocumentIds.includes(document.id);

                  return (
                    <label key={document.id} className="guided-bank-analysis-item" style={{ cursor: "pointer" }}>
                      <div>
                        <strong className="guided-bank-analysis-item-title">{document.label || document.name}</strong>
                        <p className="guided-doc-helper-meta">
                          {[document.kind, document.coverage].join(" · ")}
                        </p>
                        <p className="guided-hint">{document.notes}</p>
                      </div>
                      <div className="guided-bank-analysis-actions">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setSelectedAttachedIncomeDocumentIds((currentIds) => (
                              event.target.checked
                                ? [...currentIds, document.id]
                                : currentIds.filter((id) => id !== document.id)
                            ));
                          }}
                          aria-label={`Select ${document.label || document.name} for attached income review`}
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="guided-doc-helper-actions" style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  className="utility-button utility-button-small guided-doc-upload-button"
                  onClick={() => void reviewSelectedAttachedIncomeDocuments()}
                  disabled={incomeAnalysisPending || selectedAttachedIncomeDocumentIds.length === 0}
                >
                  {incomeAnalysisPending ? "Analyzing attached docs..." : "Review selected attached docs"}
                </button>
              </div>
            </div>
          ) : null}

          {incomeAnalysisMessage ? (
            <p className={`guided-doc-helper-status ${incomeAnalysisMessage.startsWith("Reviewed") ? "guided-doc-helper-status-success" : "guided-doc-helper-status-error"}`}>
              {incomeAnalysisMessage}
            </p>
          ) : null}

          {currentIncomeAnalyses.length > 0 ? (
            <div className="guided-bank-analysis-stack" style={{ marginTop: "12px" }}>
              <div className="guided-bank-analysis-summary">
                <div className="guided-bank-analysis-total">
                  <span className="guided-bank-analysis-total-label">Suggested additional income</span>
                  <strong className="guided-bank-analysis-total-value">${formatSuggestedAmount(suggestedIncomeTotal)}</strong>
                </div>
              </div>
              {allIncomeSuggestionSteps.length > incomeSuggestionSteps.length ? (
                <p className="guided-hint" style={{ marginTop: "8px" }}>
                  Showing the top {incomeSuggestionSteps.length} highest-value income suggestions first out of {allIncomeSuggestionSteps.length}.
                </p>
              ) : null}

              {currentIncomeSuggestionStep ? (
                <div className="guided-w2-card">
                  <div className="guided-w2-card-header">
                    <strong className="guided-w2-card-title">{currentIncomeSuggestionStep.analysis.label}</strong>
                    <span className="guided-field-badge-active">
                      {activeIncomeSuggestionIndex + 1} / {incomeSuggestionSteps.length}
                    </span>
                  </div>
                  <p className="guided-hint" style={{ marginBottom: "8px" }}>
                    {currentIncomeSuggestionStep.analysis.summary}
                  </p>
                  {currentIncomeSuggestionStep.analysis.payer || currentIncomeSuggestionStep.analysis.documentPeriod ? (
                    <p className="guided-doc-helper-meta">
                      {[currentIncomeSuggestionStep.analysis.payer, currentIncomeSuggestionStep.analysis.documentPeriod].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}

                  <div className="guided-bank-analysis-item">
                    <div>
                      <strong className="guided-bank-analysis-item-title">
                        {currentIncomeSuggestionStep.suggestion.description}
                      </strong>
                      <p className="guided-doc-helper-meta">
                        {[currentIncomeSuggestionStep.suggestion.date || "Date unavailable", `$${formatSuggestedAmount(currentIncomeSuggestionStep.suggestion.amount)}`].join(" · ")}
                      </p>
                      <p className="guided-hint">{currentIncomeSuggestionStep.suggestion.reason}</p>
                    </div>
                    <div className="guided-bank-analysis-actions">
                      <span className={`guided-badge ${currentIncomeSuggestionStep.suggestion.confidence === "high" ? "guided-field-badge-active" : "guided-badge-neutral"}`}>
                        {currentIncomeSuggestionStep.suggestion.confidence} confidence
                      </span>
                    </div>
                  </div>

                  <div className="guided-bank-analysis-actions" style={{ justifyContent: "space-between", marginTop: "12px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="utility-button utility-button-small"
                        onClick={() => setCurrentIncomeSuggestionIndex((index) => Math.max(index - 1, 0))}
                        disabled={activeIncomeSuggestionIndex === 0}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="utility-button utility-button-small"
                        onClick={() => setCurrentIncomeSuggestionIndex((index) => Math.min(index + 1, Math.max(incomeSuggestionSteps.length - 1, 0)))}
                        disabled={activeIncomeSuggestionIndex >= incomeSuggestionSteps.length - 1}
                      >
                        Next
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="utility-button utility-button-small utility-button-danger"
                        onClick={() => dismissIncomeSuggestion(currentIncomeSuggestionStep.analysis.id, currentIncomeSuggestionStep.suggestion.id)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="utility-button utility-button-small"
                        onClick={() => applyIncomeSuggestion(currentIncomeSuggestionStep.analysis.id, currentIncomeSuggestionStep.suggestion.id)}
                      >
                        Accept & add amount
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="guided-doc-helper-empty">
                  No income suggestions are still waiting for review.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="guided-w2-stack">
          {necSuggestions.length > 0 ? (
            <div className="guided-w2-card">
              <div className="guided-w2-card-header">
                <strong className="guided-w2-card-title">Attached 1099-NEC documents</strong>
                <span className="guided-field-badge-active">
                  {necSuggestions.length} ready
                </span>
              </div>
              <p className="guided-hint" style={{ marginBottom: "12px" }}>
                Use a 1099-NEC that is already attached to this return instead of uploading it again.
              </p>
              <div className="guided-bank-analysis-stack">
                {necSuggestions.map((suggestion) => {
                  const alreadyUsed = currentEntries.some((entry) => matchesNecSuggestion(entry, suggestion));

                  return (
                    <div key={suggestion.documentId} className="guided-bank-analysis-item">
                      <div>
                        <strong className="guided-bank-analysis-item-title">{suggestion.documentLabel}</strong>
                        <p className="guided-doc-helper-meta">
                          {[suggestion.summary.payer, `$${formatSuggestedAmount(suggestion.summary.nonemployeeCompensation)}`].join(" · ")}
                        </p>
                        <p className="guided-hint">
                          {parseGuidedDisplayAmount(suggestion.summary.federalWithheld).gt(0)
                            ? `Federal withholding $${formatSuggestedAmount(suggestion.summary.federalWithheld)} is available too.`
                            : "No federal withholding detected on this attached 1099-NEC."}
                        </p>
                      </div>
                      <div className="guided-bank-analysis-actions">
                        <button
                          type="button"
                          className="utility-button utility-button-small"
                          onClick={() => applyNecSuggestion(suggestion)}
                          disabled={alreadyUsed}
                        >
                          {alreadyUsed ? "Already copied" : "Use attached document"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {currentEntries.map((entry, index) => (
            <NecCard
              key={index}
              index={index}
              entry={entry}
              onUpdate={(field, value) => updateEntry(index, field, value)}
              onRemove={() => removeEntry(index)}
              removable={currentEntries.length > 1}
            />
          ))}
        </div>

        <button
          type="button"
          className="utility-button"
          onClick={addEntry}
        >
          + Add another 1099-NEC
        </button>

        <div className="guided-review-card" style={{ marginTop: "16px" }}>
          <div className="guided-review-row">
            <span className="guided-review-label">Total 1099-NEC income</span>
            <span className="guided-review-value">{`$${formatSuggestedAmount(String(necIncome))}`}</span>
          </div>
          <div className="guided-review-row">
            <span className="guided-review-label">Other business income</span>
            <span className="guided-review-value">{`$${formatSuggestedAmount(String(manualIncome))}`}</span>
          </div>
          <div className="guided-review-row guided-review-row-total">
            <span className="guided-review-label">Total gross receipts</span>
            <span className="guided-review-value">{`$${formatSuggestedAmount(String(totalIncome))}`}</span>
          </div>
        </div>

        <details className="guided-expand" style={{ marginTop: "16px" }}>
          <summary className="guided-expand-trigger">Schedule C — Business Expenses</summary>
          <BooleanFact label="Did you materially participate in this business under the section 469 rules?" value={qbiMateriallyParticipated} onChange={(value) => commitSection({ qbiMateriallyParticipated: value })} />
          <p className="guided-hint">This actual participation answer is used when testing the 2026 minimum QBI deduction. Owning a business alone does not establish material participation.</p>
          <div className="guided-expand-body">
            <p className="guided-hint">
              Enter your business expenses by category. Only include amounts that are
              ordinary and necessary for your business. Leave categories at $0 if they
              don&apos;t apply.
            </p>

            <div className="guided-doc-helper" style={{ marginBottom: "16px" }}>
              <div className="guided-doc-helper-copy">
                <strong>AI bank-statement review</strong>
                <p>
                  Upload bank or card statements from the year and we&apos;ll suggest which charges
                  may belong on Schedule C. Suggestions stay separate until you explicitly add them
                  into an expense category.
                </p>
                <p>
                  Ambiguous charges stay marked for review instead of being silently added.
                </p>
              </div>
              <div className="guided-doc-helper-actions">
                <button
                  type="button"
                  className="utility-button utility-button-small guided-doc-upload-button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={analysisPending}
                >
                  {analysisPending ? "Analyzing..." : "Upload bank statements"}
                </button>
                <input
                  ref={uploadInputRef}
                  className="guided-doc-upload-input"
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  onChange={handleStatementUpload}
                />
              </div>
            </div>

            {analysisMessage ? (
              <p className={`guided-doc-helper-status ${analysisMessage.startsWith("Reviewed") ? "guided-doc-helper-status-success" : "guided-doc-helper-status-error"}`}>
                {analysisMessage}
              </p>
            ) : null}

            {currentAnalyses.length > 0 ? (
              <div className="guided-bank-analysis-stack">
                {suggestedTotals.length > 0 ? (
                  <div className="guided-bank-analysis-summary">
                    {suggestedTotals.map((entry) => (
                      <div key={entry.category} className="guided-bank-analysis-total">
                        <span className="guided-bank-analysis-total-label">{expenseFieldLabels[entry.category]}</span>
                        <strong className="guided-bank-analysis-total-value">${formatSuggestedAmount(entry.total)}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
                {allExpenseSuggestionSteps.length > expenseSuggestionSteps.length ? (
                  <p className="guided-hint" style={{ marginTop: "8px" }}>
                    Showing the top {expenseSuggestionSteps.length} highest-value expense suggestions first out of {allExpenseSuggestionSteps.length}.
                  </p>
                ) : null}

                {currentExpenseSuggestionStep ? (
                  <div className="guided-w2-card">
                    <div className="guided-w2-card-header">
                      <strong className="guided-w2-card-title">{currentExpenseSuggestionStep.analysis.label}</strong>
                      <span className="guided-field-badge-active">
                        {activeExpenseSuggestionIndex + 1} / {expenseSuggestionSteps.length}
                      </span>
                    </div>
                    <p className="guided-hint" style={{ marginBottom: "8px" }}>
                      {currentExpenseSuggestionStep.analysis.summary}
                    </p>
                    {currentExpenseSuggestionStep.analysis.institution || currentExpenseSuggestionStep.analysis.statementPeriod ? (
                      <p className="guided-doc-helper-meta">
                        {[currentExpenseSuggestionStep.analysis.institution, currentExpenseSuggestionStep.analysis.statementPeriod].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}

                    <div className="guided-bank-analysis-item">
                      <div>
                        <strong className="guided-bank-analysis-item-title">
                          {currentExpenseSuggestionStep.suggestion.description}
                        </strong>
                        <p className="guided-doc-helper-meta">
                          {[currentExpenseSuggestionStep.suggestion.date || "Date unavailable", `$${formatSuggestedAmount(currentExpenseSuggestionStep.suggestion.amount)}`].join(" · ")}
                        </p>
                        <p className="guided-hint">
                          {isActionableBusinessSuggestion(currentExpenseSuggestionStep.suggestion)
                            ? `${expenseFieldLabels[currentExpenseSuggestionStep.suggestion.suggestedCategory]} suggested. ${currentExpenseSuggestionStep.suggestion.reason}`
                            : `${currentExpenseSuggestionStep.suggestion.suggestedCategory === "not-business" ? "Likely personal or non-deductible" : "Needs review"}. ${currentExpenseSuggestionStep.suggestion.reason}`}
                        </p>
                      </div>
                      <div className="guided-bank-analysis-actions">
                        <span className={`guided-badge ${currentExpenseSuggestionStep.suggestion.confidence === "high" ? "guided-field-badge-active" : "guided-badge-neutral"}`}>
                          {currentExpenseSuggestionStep.suggestion.confidence} confidence
                        </span>
                      </div>
                    </div>

                    <div className="guided-bank-analysis-actions" style={{ justifyContent: "space-between", marginTop: "12px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          className="utility-button utility-button-small"
                          onClick={() => setCurrentExpenseSuggestionIndex((index) => Math.max(index - 1, 0))}
                          disabled={activeExpenseSuggestionIndex === 0}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="utility-button utility-button-small"
                          onClick={() => setCurrentExpenseSuggestionIndex((index) => Math.min(index + 1, Math.max(expenseSuggestionSteps.length - 1, 0)))}
                          disabled={activeExpenseSuggestionIndex >= expenseSuggestionSteps.length - 1}
                        >
                          Next
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          className="utility-button utility-button-small utility-button-danger"
                          onClick={() => dismissExpenseSuggestion(currentExpenseSuggestionStep.analysis.id, currentExpenseSuggestionStep.suggestion.id)}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="utility-button utility-button-small"
                          onClick={() => {
                            if (isActionableBusinessSuggestion(currentExpenseSuggestionStep.suggestion)) {
                              applySuggestion(
                                currentExpenseSuggestionStep.analysis.id,
                                currentExpenseSuggestionStep.suggestion.id,
                              );
                              return;
                            }

                            acceptNonActionableExpenseSuggestion(
                              currentExpenseSuggestionStep.analysis.id,
                              currentExpenseSuggestionStep.suggestion.id,
                            );
                          }}
                        >
                          {isActionableBusinessSuggestion(currentExpenseSuggestionStep.suggestion)
                            ? `Accept & add to ${expenseFieldLabels[currentExpenseSuggestionStep.suggestion.suggestedCategory]}`
                            : "Accept & keep out of expenses"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="guided-doc-helper-empty">
                    No expense suggestions are still waiting for review.
                  </p>
                )}
              </div>
            ) : null}

            <div className="guided-form-grid">
              {expenseFields.map((ef) => (
                <CurrencyField
                  key={ef.field}
                  label={ef.label}
                  hint={ef.hint}
                  value={currentExpenses[ef.field]}
                  onChange={(v) => updateExpense(ef.field, v)}
                />
              ))}
            </div>
          </div>
        </details>

        {(totalIncome.gt(0) || totalExpenses.gt(0)) && (
          <div className="guided-ticker-grid" style={{ marginTop: "16px" }}>
            <div className="guided-ticker-item">
              <span className="guided-ticker-label">Gross Income</span>
              <strong className="guided-ticker-value">
                ${formatSuggestedAmount(totalIncome.toFixed())}
              </strong>
            </div>
            <div className="guided-ticker-item">
              <span className="guided-ticker-label">Total Expenses</span>
              <strong className="guided-ticker-value">
                ${formatSuggestedAmount(totalExpenses.toFixed())}
              </strong>
            </div>
            <div className={`guided-ticker-item ${netProfit.gte(0) ? "" : "guided-ticker-negative"}`}>
              <span className="guided-ticker-label">Net Profit</span>
              <strong className="guided-ticker-value">
                ${formatSuggestedAmount(netProfit.toFixed())}
              </strong>
            </div>
          </div>
        )}
      </div>
    </RetroShell>
  );
}
