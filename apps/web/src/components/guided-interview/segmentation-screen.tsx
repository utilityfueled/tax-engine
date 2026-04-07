"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import { RetroShell } from "@/components/retro-shell";
import {
  type FilingStatus,
  type IncomeType,
  type LifeEvent,
  type SegmentationAnswers,
  type SupportedStateCode,
  emptySegmentation,
  filingStatusOptions,
  incomeTypeOptions,
  lifeEventOptions,
  supportedStates,
} from "@/lib/guided-interview-flow";

type SegmentationStep = 0 | 1 | 2 | 3 | 4;

type UploadMessage = {
  tone: "success" | "error";
  text: string;
};

const stepLabels = [
  "Upload Documents",
  "Filing Status",
  "Income Types",
  "Life Events",
  "State of Residence",
] as const;

export function SegmentationScreen({
  onComplete,
  workspace,
  onUploadDocuments,
}: {
  onComplete: (answers: SegmentationAnswers) => void;
  workspace: ReturnWorkspaceRecord;
  onUploadDocuments?: (files: File[]) => Promise<string>;
}) {
  const [step, setStep] = useState<SegmentationStep>(0);
  const [answers, setAnswers] = useState<SegmentationAnswers>(emptySegmentation);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<UploadMessage | null>(null);
  const prevStep = useRef(step);
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Scroll to top and move focus on step change.
  useEffect(() => {
    if (prevStep.current !== step) {
      prevStep.current = step;
      window.scrollTo({ top: 0, behavior: "smooth" });
      requestAnimationFrame(() => {
        stepContainerRef.current?.focus({ preventScroll: true });
      });
    }
  }, [step]);

  // Keyboard shortcuts: Enter = continue, Escape = back
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        if (step === 0 && uploadPending) return;
        if (step === 1 && answers.filingStatus === null) return;
        if (step < 4) {
          setStep((step + 1) as SegmentationStep);
        } else {
          onComplete(answers);
        }
      } else if (e.key === "Escape" && step > 0) {
        e.preventDefault();
        setStep((step - 1) as SegmentationStep);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, answers, onComplete]);

  function setFilingStatus(value: FilingStatus) {
    setAnswers((prev) => ({ ...prev, filingStatus: value }));
  }

  function toggleIncomeType(value: IncomeType) {
    setAnswers((prev) => ({
      ...prev,
      incomeTypes: prev.incomeTypes.includes(value)
        ? prev.incomeTypes.filter((t) => t !== value)
        : [...prev.incomeTypes, value],
    }));
  }

  function toggleLifeEvent(value: LifeEvent) {
    setAnswers((prev) => ({
      ...prev,
      lifeEvents: prev.lifeEvents.includes(value)
        ? prev.lifeEvents.filter((e) => e !== value)
        : [...prev.lifeEvents, value],
    }));
  }

  function setStateCode(value: SupportedStateCode | null) {
    setAnswers((prev) => ({ ...prev, stateCode: value }));
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    if (!onUploadDocuments) {
      setUploadMessage({
        tone: "error",
        text: "Document upload is not available in this mode.",
      });
      return;
    }

    setUploadPending(true);
    setUploadMessage(null);

    try {
      const message = await onUploadDocuments(files);
      setUploadMessage({
        tone: "success",
        text: message || `Uploaded ${files.length} document${files.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setUploadMessage({
        tone: "error",
        text: error instanceof Error
          ? error.message
          : "Could not upload the selected document(s). Please try again.",
      });
    } finally {
      setUploadPending(false);
    }
  }

  function handleContinue() {
    if (step === 0 && uploadPending) return;
    if (step === 1 && answers.filingStatus === null) return;
    if (step < 4) {
      setStep((step + 1) as SegmentationStep);
    } else {
      onComplete(answers);
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep((step - 1) as SegmentationStep);
    }
  }

  const progressPercent = Math.round(((step + 1) / 5) * 100);
  const selectedState = supportedStates.find((state) => state.code === answers.stateCode) ?? null;
  const recentDocuments = workspace.documents.slice(0, 4);

  return (
    <div className="guided-segmentation" ref={stepContainerRef} tabIndex={-1} style={{ outline: "none" }}>
      <section className="hero">
        <p className="hero-kicker">GETTING STARTED</p>
        <h1>Let&apos;s tailor your return.</h1>
        <p className="hero-copy">
          Upload your tax documents first, then answer a few quick questions so we can focus on the parts of filing that actually apply to you.
        </p>
      </section>

      <div className="guided-progress-bar" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className="guided-progress-track">
          <div className="guided-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="guided-progress-steps">
          {stepLabels.map((label, index) => (
            <span
              key={label}
              className={`guided-progress-step ${index <= step ? "guided-progress-step-active" : ""} ${index < step ? "guided-progress-step-done" : ""}`}
              aria-current={index === step ? "step" : undefined}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Step {step + 1} of 5: {stepLabels[step]}
      </div>

      <RetroShell
        title={stepLabels[step]}
        eyebrow={`STEP ${step + 1} OF 5`}
      >
        <div key={step} className="guided-section-transition">
        {step === 0 && (
          <div className="guided-question">
            <p className="guided-prompt">Upload your tax documents.</p>
            <p className="guided-hint">
              Start with W-2s, 1099s, and other tax forms. We keep them attached to this return and use supported forms to help fill the guided interview automatically.
            </p>

            <div className="guided-doc-helper">
              <div className="guided-doc-helper-copy">
                <strong>Documents in this return</strong>
                <p>
                  {workspace.summary.totalDocuments > 0
                    ? `${workspace.summary.totalDocuments} document${workspace.summary.totalDocuments === 1 ? "" : "s"} already stored locally.`
                    : "No documents uploaded yet. Add your tax forms here and keep going."}
                </p>
                <p>
                  Supported forms can be read automatically. Anything unfamiliar stays available for review so you can continue at your own pace.
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
                      {uploadPending ? "Uploading..." : "Upload documents"}
                    </button>
                    <input
                      ref={uploadInputRef}
                      className="guided-doc-upload-input"
                      type="file"
                      accept="application/pdf,.pdf,image/*"
                      multiple
                      onChange={handleUpload}
                    />
                  </>
                ) : null}
                <button
                  type="button"
                  className="utility-button utility-button-small"
                  onClick={handleContinue}
                  disabled={uploadPending}
                >
                  Continue
                </button>
              </div>
            </div>

            {uploadMessage ? (
              <p
                className={`guided-doc-helper-status guided-doc-helper-status-${uploadMessage.tone}`}
                role={uploadMessage.tone === "error" ? "alert" : "status"}
              >
                {uploadMessage.text}
              </p>
            ) : null}

            <div className="guided-doc-helper-results" aria-live="polite">
              {recentDocuments.length > 0 ? (
                recentDocuments.map((document) => (
                  <div className="guided-doc-helper-result" key={document.id}>
                    <div>
                      <strong>{document.name}</strong>
                      <p className="guided-doc-helper-meta">
                        {document.label}
                        {document.kind !== "unknown" ? ` · ${document.kind.toUpperCase()}` : ""}
                        {document.coverage ? ` · ${document.coverage}` : ""}
                      </p>
                      {document.coverage === "unsupported" ? (
                        <div className="guided-badge-row" style={{ marginTop: "8px" }}>
                          <span className="guided-field-badge-active">
                            {document.notes.includes("Next step:")
                              ? "AI reviewed"
                              : "AI help available"}
                          </span>
                          <span className="guided-doc-helper-meta">
                            {document.notes}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="guided-doc-helper-empty">
                  Your uploaded documents will appear here so you can see what is already attached before answering the interview.
                </p>
              )}
              {workspace.documents.length > recentDocuments.length ? (
                <p className="guided-doc-helper-empty">
                  + {workspace.documents.length - recentDocuments.length} more document{workspace.documents.length - recentDocuments.length === 1 ? "" : "s"} already attached.
                </p>
              ) : null}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="guided-question">
            <p className="guided-prompt">What&apos;s your filing status?</p>
            <p className="guided-hint">This determines your tax brackets and standard deduction amount.</p>
            <div className="guided-option-list" role="radiogroup" aria-label="Filing status">
              {filingStatusOptions.map((option) => (
                <label
                  key={option.value}
                  className={`guided-option-card ${answers.filingStatus === option.value ? "guided-option-card-selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="filing-status"
                    value={option.value}
                    checked={answers.filingStatus === option.value}
                    onChange={() => setFilingStatus(option.value)}
                    className="guided-option-radio"
                  />
                  <span className="guided-option-label">{option.label}</span>
                  <span className="guided-option-description">{option.description}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="guided-question">
            <p className="guided-prompt">What types of income did you receive?</p>
            <p className="guided-hint">Select everything that applies. If none of these fit, continue to the next step.</p>
            <div className="guided-option-list" role="group" aria-label="Income types">
              {incomeTypeOptions.map((option) => (
                <label
                  key={option.value}
                  className={`guided-option-card ${answers.incomeTypes.includes(option.value) ? "guided-option-card-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    value={option.value}
                    checked={answers.incomeTypes.includes(option.value)}
                    onChange={() => toggleIncomeType(option.value)}
                    className="guided-option-checkbox"
                  />
                  <span className="guided-option-label">{option.label}</span>
                  <span className="guided-option-description">{option.hint}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="guided-question">
            <p className="guided-prompt">Did any of these happen this year?</p>
            <p className="guided-hint">These events can change your deductions or credits. Select any that apply, or continue to skip.</p>
            <div className="guided-option-list" role="group" aria-label="Life events">
              {lifeEventOptions.map((option) => (
                <label
                  key={option.value}
                  className={`guided-option-card ${answers.lifeEvents.includes(option.value) ? "guided-option-card-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    value={option.value}
                    checked={answers.lifeEvents.includes(option.value)}
                    onChange={() => toggleLifeEvent(option.value)}
                    className="guided-option-checkbox"
                  />
                  <span className="guided-option-label">{option.label}</span>
                  <span className="guided-option-description">{option.hint}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="guided-question">
            <p className="guided-prompt">What state did you live in?</p>
            <p className="guided-hint">Choose your state to include a state return, or skip it for now and add it later.</p>
            <label className="guided-field">
              <span className="guided-field-label">State of residence</span>
              <select
                aria-label="State of residence"
                className="guided-input"
                name="state-code"
                value={answers.stateCode ?? ""}
                onChange={(event) => {
                  const value = event.target.value as SupportedStateCode | "";
                  setStateCode(value === "" ? null : value);
                }}
              >
                <option value="">Skip for now — federal return only</option>
                {supportedStates.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name} ({state.code})
                  </option>
                ))}
              </select>
              <span className="guided-field-hint">
                {selectedState
                  ? `${selectedState.name} will add a state return section to your guided checklist.`
                  : "Leave this on skip for now to finish your federal return first and add a state later."}
              </span>
            </label>
          </div>
        )}
        </div>

        <div className="guided-nav">
          {step > 0 ? (
            <button className="utility-button" type="button" onClick={handleBack}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button
            className="launch-button"
            type="button"
            onClick={handleContinue}
            disabled={(step === 0 && uploadPending) || (step === 1 && answers.filingStatus === null)}
          >
            {step < 4 ? "Continue" : "Start My Return"}
          </button>
          <span className="guided-nav-hint">Enter to continue · Esc to go back</span>
        </div>
      </RetroShell>
    </div>
  );
}
