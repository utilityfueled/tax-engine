"use client";

import { marketplacePolicyOptions } from "@/lib/guided-marketplace-health-facts";

import { healthInsuranceSourceOptions } from "@/lib/guided-health-insurance-facts";
import { guidedCareBenefitSources } from "@/lib/guided-dependent-care-benefits";
import Decimal from "decimal.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import {
  formatTickerCurrency,
  formatAnimatedCurrency,
  computeBreakdownRows,
  computeHeroAmount,
  computeCombinedTickerLabel,
  computeCombinedTickerClass,
  useAnimatedValue,
  usePulse,
  type CombinedTickerInput,
} from "@/components/refund-ticker";
import { RetroShell } from "@/components/retro-shell";
import {
  type GuidedPreviewMetrics,
  type StatePreviewMetrics,
  buildGuidedFactAnswers,
  buildGuidedSyntheticDocuments,
} from "@/lib/guided-interview-bridge";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { collectW2Suggestions } from "@/lib/workspace-assistant";
import {
  type AdjustmentData,
  type BrokerageEntryData,
  type CreditsData,
  type DeductionData,
  type DividendEntryData,
  type GuidedFlowState,
  type InterestEntryData,
  type InterviewSectionId,
  type OtherTaxesData,
  type PaymentData,
  type PersonalInfoData,
  type FlowCompletionSummary,
  type RentalPropertyEntryData,
  type RetirementEntryData,
  type SegmentationAnswers,
  type SocialSecurityData,
  type StateReturnData,
  type SupportedStateCode,
  type UnemploymentData,
  type W2EntryData,
  canGoBack,
  canGoForward,
  clearGuidedFlowState,
  computeFlowProgress,
  shouldPromptBeforeAdvance,
  emptyBrokerageEntry,
  emptyDividendEntry,
  emptyInterestEntry,
  emptyNecEntry,
  emptyRentalPropertyEntry,
  emptyRetirementEntry,
  emptyScheduleCExpenses,
  emptyW2Entry,
  getSectionData,
  getVisitedSectionStatus,
  goToNextSection,
  goToPreviousSection,
  initialFlowState,
  jumpToSection,
  loadGuidedFlowState,
  resumeInterviewAtSection,
  saveGuidedFlowState,
  startInterview,
  summarizeFlowCompletion,
  updateSectionData,
} from "@/lib/guided-interview-flow";
import { getBrowserStorage } from "@/lib/browser-storage";
import { SegmentationScreen } from "./segmentation-screen";
import { SectionPersonalInfo } from "./section-personal-info";
import { SectionW2Income } from "./section-w2-income";
import { SectionSelfEmployment } from "./section-self-employment";
import { SectionInvestmentIncome } from "./section-investment-income";
import { SectionRentalIncome } from "./section-rental-income";
import { SectionRetirementIncome } from "./section-retirement-income";
import { SectionSocialSecurity } from "./section-social-security";
import { SectionUnemployment } from "./section-unemployment";
import { SectionAdditionalDeductions } from "./section-additional-deductions";
import { SectionDeductions } from "./section-deductions";
import { SectionAdjustments } from "./section-adjustments";
import { SectionCredits } from "./section-credits";
import { SectionOtherTaxes } from "./section-other-taxes";
import { SectionPayments } from "./section-payments";
import { SectionReview } from "./section-review";
import { SectionStateReturn } from "./section-state-return";
import { ReturnHelpDock } from "../return-help-dock";

function SectionProgressBar({
  state,
  onJump,
}: {
  state: GuidedFlowState;
  onJump: (sectionId: InterviewSectionId) => void;
}) {
  const progress = computeFlowProgress(state);
  const stepsRef = useRef<HTMLDivElement | null>(null);
  const stepRefs = useRef<Record<InterviewSectionId, HTMLButtonElement | null>>({} as Record<
    InterviewSectionId,
    HTMLButtonElement | null
  >);
  const [overflowState, setOverflowState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const syncOverflowState = useCallback(() => {
    const stepsNode = stepsRef.current;
    if (!stepsNode) return;

    const maxScrollLeft = Math.max(stepsNode.scrollWidth - stepsNode.clientWidth, 0);
    const hasOverflow = maxScrollLeft > 4;

    setOverflowState({
      hasOverflow,
      canScrollLeft: stepsNode.scrollLeft > 4,
      canScrollRight: stepsNode.scrollLeft < maxScrollLeft - 4,
    });
  }, []);

  useEffect(() => {
    syncOverflowState();

    const stepsNode = stepsRef.current;
    if (!stepsNode) return;

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncOverflowState);
    resizeObserver?.observe(stepsNode);
    window.addEventListener("resize", syncOverflowState);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncOverflowState);
    };
  }, [progress.sections.length, syncOverflowState]);

  useEffect(() => {
    const stepsNode = stepsRef.current;
    const currentSection = progress.sections[progress.currentSectionIndex];
    const currentStep = currentSection ? stepRefs.current[currentSection.id] : null;
    if (!stepsNode || !currentStep) return;

    const prefersReducedMotion =
      typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const targetLeft = Math.max(
      currentStep.offsetLeft - (stepsNode.clientWidth - currentStep.offsetWidth) / 2,
      0
    );

    stepsNode.scrollTo({
      left: targetLeft,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });

    window.requestAnimationFrame(syncOverflowState);
  }, [progress.currentSectionIndex, progress.sections, syncOverflowState]);

  return (
    <div
      className="guided-progress-bar"
      role="progressbar"
      aria-valuenow={progress.percentComplete}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="guided-progress-track">
        <div
          className="guided-progress-fill"
          style={{ width: `${progress.percentComplete}%` }}
        />
      </div>
      <div
        className={`guided-progress-steps-shell${overflowState.canScrollLeft ? " guided-progress-steps-shell-left" : ""}${overflowState.canScrollRight ? " guided-progress-steps-shell-right" : ""}`}
      >
        <div
          ref={stepsRef}
          className="guided-progress-steps"
          onScroll={syncOverflowState}
        >
          {progress.sections.map((section, index) => {
            const sectionStatus = getVisitedSectionStatus(state, section.id);
            const isDone = sectionStatus === "complete";
            const isSkipped = sectionStatus === "skipped";
            const needsReview = sectionStatus === "needs-review";
            const isCurrent = index === progress.currentSectionIndex;
            const isReachable = state.completedSections.includes(section.id) || isCurrent;
            const sectionTitle = needsReview
              ? `${section.label} — needs review`
              : isSkipped
                ? `${section.label} — skipped`
                : section.label;

            return (
              <button
                key={section.id}
                ref={(node) => {
                  stepRefs.current[section.id] = node;
                }}
                type="button"
                className={`guided-progress-step ${isCurrent ? "guided-progress-step-active" : ""} ${isDone ? "guided-progress-step-done" : ""} ${isSkipped ? "guided-progress-step-skipped" : ""} ${needsReview ? "guided-progress-step-needs-review" : ""}`}
                onClick={() => {
                  if (isReachable) onJump(section.id);
                }}
                disabled={!isReachable}
                title={sectionTitle}
                aria-current={isCurrent ? "step" : undefined}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>
      {overflowState.hasOverflow ? (
        <p className="guided-progress-scroll-hint">Swipe to see every section.</p>
      ) : null}
    </div>
  );
}

function SectionPlaceholder({
  section,
}: {
  section: { id: string; label: string; eyebrow: string; description: string };
}) {
  return (
    <RetroShell title={section.label} eyebrow={section.eyebrow}>
      <div className="guided-question">
        <p className="guided-prompt">{section.description}</p>
        <p className="guided-hint">
          This section is coming soon. Click Continue to move to the next section,
          or switch to advanced mode for direct data entry.
        </p>
      </div>
    </RetroShell>
  );
}

function RefundTicker({
  guidedPreview,
  workspace: _workspace,
  progress,
}: {
  guidedPreview: GuidedPreviewMetrics | null;
  workspace: ReturnWorkspaceRecord;
  progress: ReturnType<typeof computeFlowProgress>;
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  // A missing guided preview can mean missing facts, an unsupported year or a
  // workspace-year mismatch. An older workspace estimate cannot satisfy that gate.
  const metrics = guidedPreview;
  const hasMetrics = metrics !== null;
  const refund = new Decimal(hasMetrics ? metrics.refund : "0");
  const owed = new Decimal(hasMetrics ? metrics.amountOwed : "0");

  // State metrics — only available from the guided preview, not the workspace engine preview
  const stateMetrics: StatePreviewMetrics | null = guidedPreview?.state ?? null;
  const stateRefund = new Decimal(stateMetrics ? stateMetrics.stateRefund : "0");
  const stateOwed = new Decimal(stateMetrics ? stateMetrics.stateAmountOwed : "0");
  const stateRawAmount = stateRefund.gt(0) ? stateRefund : stateOwed.gt(0) ? stateOwed : 0;

  const hasBothFederalAndState = hasMetrics && stateMetrics !== null;

  const combinedInput: CombinedTickerInput = {
    federalRefund: refund,
    federalOwed: owed,
    stateRefund: hasBothFederalAndState ? stateRefund : null,
    stateOwed: hasBothFederalAndState ? stateOwed : null,
  };

  const heroAmount = computeHeroAmount(combinedInput);
  const animatedAmount = useAnimatedValue(heroAmount);
  const animatedStateAmount = useAnimatedValue(stateRawAmount);
  const pulsing = usePulse(heroAmount);

  const tickerLabel = !hasMetrics
    ? "Estimated Result"
    : computeCombinedTickerLabel(combinedInput);

  const tickerClass = computeCombinedTickerClass(combinedInput);
  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      if (next) {
        setBreakdownOpen(false);
      }
      return next;
    });
  };

  return (
    <div className="guided-refund-ticker-sticky">
      <RetroShell title="Live Ticker" eyebrow="ESTIMATE">
        <div className="guided-ticker-toolbar">
          <p className="guided-ticker-toolbar-copy">
            Keep the estimate nearby without letting it take over the page.
          </p>
          <button
            type="button"
            className="utility-button utility-button-small guided-ticker-toggle"
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            {collapsed ? "Expand Ticker" : "Minimize Ticker"}
          </button>
        </div>
        <div className={`guided-ticker-grid${collapsed ? " guided-ticker-grid-collapsed" : ""}`}>
          <div
            className={`guided-ticker-item guided-ticker-item-hero ${tickerClass}${collapsed ? "" : " guided-ticker-clickable"}${pulsing ? " ticker-pulse" : ""}`}
            onClick={!collapsed && hasMetrics ? () => setBreakdownOpen(!breakdownOpen) : undefined}
            role={!collapsed && hasMetrics ? "button" : undefined}
            tabIndex={!collapsed && hasMetrics ? 0 : undefined}
            onKeyDown={(e) => {
              if (!collapsed && hasMetrics && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                setBreakdownOpen(!breakdownOpen);
              }
              if (e.key === "Escape" && breakdownOpen) {
                e.preventDefault();
                setBreakdownOpen(false);
              }
            }}
            aria-expanded={!collapsed && hasMetrics ? breakdownOpen : undefined}
          >
            <span className="guided-ticker-label">{tickerLabel}</span>
            <strong className="guided-ticker-value guided-ticker-value-hero">
              {hasMetrics
                ? formatAnimatedCurrency(animatedAmount)
                : "Enter more info for an estimate"}
            </strong>
            {hasMetrics && !collapsed && (
              <span className="guided-ticker-expand-hint">
                {breakdownOpen ? "Hide details" : "Show details"}
              </span>
            )}
          </div>
          {collapsed ? (
            <>
              <div className="guided-ticker-item guided-ticker-item-compact">
                <span className="guided-ticker-label">Section</span>
                <strong className="guided-ticker-value">
                  {progress.currentSectionIndex + 1} / {progress.totalSections}
                </strong>
              </div>
              <div className="guided-ticker-item guided-ticker-item-compact">
                <span className="guided-ticker-label">Progress</span>
                <strong className="guided-ticker-value">{progress.percentComplete}%</strong>
              </div>
              <div className="guided-ticker-item guided-ticker-item-compact">
                <span className="guided-ticker-label">
                  {hasMetrics ? "Total Income" : "Estimate"}
                </span>
                <strong className="guided-ticker-value">
                  {hasMetrics ? formatTickerCurrency(metrics.totalIncome) : "Updates as you answer"}
                </strong>
              </div>
            </>
          ) : (
            <>
              {hasBothFederalAndState && (
                <div className={`guided-ticker-item guided-ticker-sub ${refund.gt(0) ? "guided-ticker-positive" : owed.gt(0) ? "guided-ticker-negative" : ""}`}>
                  <span className="guided-ticker-label">Federal</span>
                  <strong className="guided-ticker-value">
                    {refund.gt(0) ? "+" : owed.gt(0) ? "-" : ""}{formatTickerCurrency(refund.gt(0) ? metrics.refund : metrics.amountOwed)}
                  </strong>
                </div>
              )}
              {hasBothFederalAndState && stateMetrics && (
                <div className={`guided-ticker-item guided-ticker-sub ${stateRefund.gt(0) ? "guided-ticker-positive" : stateOwed.gt(0) ? "guided-ticker-negative" : ""}`}>
                  <span className="guided-ticker-label">{stateMetrics.stateCode}</span>
                  <strong className="guided-ticker-value">
                    {stateRefund.gt(0) ? "+" : stateOwed.gt(0) ? "-" : ""}{formatAnimatedCurrency(animatedStateAmount)}
                  </strong>
                </div>
              )}
              <div className="guided-ticker-item">
                <span className="guided-ticker-label">Section</span>
                <strong className="guided-ticker-value">
                  {progress.currentSectionIndex + 1} / {progress.totalSections}
                </strong>
              </div>
              <div className="guided-ticker-item">
                <span className="guided-ticker-label">Progress</span>
                <strong className="guided-ticker-value">{progress.percentComplete}%</strong>
              </div>
              {hasMetrics && (
                <div className="guided-ticker-item">
                  <span className="guided-ticker-label">Total Income</span>
                  <strong className="guided-ticker-value">
                    {formatTickerCurrency(metrics.totalIncome)}
                  </strong>
                </div>
              )}
            </>
          )}
        </div>

        {hasMetrics && !collapsed && breakdownOpen && (
          <div className="guided-ticker-breakdown">
            {computeBreakdownRows(metrics).map((row, i, arr) => {
              const isResultRow = i === arr.length - 1;
              const label = isResultRow && hasBothFederalAndState
                ? `Federal ${row.label}`
                : row.label;
              return (
                <div
                  key={row.label}
                  className={`guided-ticker-breakdown-row ${row.className ?? ""}`}
                >
                  <span className="guided-ticker-breakdown-label">{label}</span>
                  <span className="guided-ticker-breakdown-value">{row.value}</span>
                </div>
              );
            })}
            {stateMetrics && (
              <>
                <div className="guided-ticker-breakdown-row guided-ticker-breakdown-separator guided-ticker-breakdown-state-header">
                  <span className="guided-ticker-breakdown-label">{stateMetrics.stateName} ({stateMetrics.stateCode})</span>
                  <span className="guided-ticker-breakdown-value" />
                </div>
                <div className="guided-ticker-breakdown-row">
                  <span className="guided-ticker-breakdown-label">State Tax</span>
                  <span className="guided-ticker-breakdown-value">{formatTickerCurrency(stateMetrics.stateTax)}</span>
                </div>
                <div className="guided-ticker-breakdown-row">
                  <span className="guided-ticker-breakdown-label">State Payments</span>
                  <span className="guided-ticker-breakdown-value">{formatTickerCurrency(stateMetrics.stateWithholding)}</span>
                </div>
                <div className={`guided-ticker-breakdown-row guided-ticker-breakdown-result ${stateRefund.gt(0) ? "guided-ticker-breakdown-refund" : stateOwed.gt(0) ? "guided-ticker-breakdown-owed" : ""}`}>
                  <span className="guided-ticker-breakdown-label">
                    State {stateRefund.gt(0) ? "Refund" : stateOwed.gt(0) ? "Balance Due" : "Result"}
                  </span>
                  <span className="guided-ticker-breakdown-value">
                    {stateRefund.gt(0) ? formatTickerCurrency(stateMetrics.stateRefund) : stateOwed.gt(0) ? formatTickerCurrency(stateMetrics.stateAmountOwed) : "—"}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </RetroShell>
    </div>
  );
}

function SectionContent({
  sectionId,
  state,
  workspace,
  onUploadDocuments,
  onStateChange,
  guidedPreview,
  onJumpToSection,
  section,
}: {
  sectionId: InterviewSectionId;
  state: GuidedFlowState;
  workspace: ReturnWorkspaceRecord;
  onUploadDocuments?: (files: File[]) => Promise<string>;
  onStateChange: (next: GuidedFlowState) => void;
  guidedPreview: GuidedPreviewMetrics | null;
  onJumpToSection: (sectionId: InterviewSectionId) => void;
  section: { id: string; label: string; eyebrow: string; description: string };
}) {
  switch (sectionId) {
    case "personal-info":
      return (
        <SectionPersonalInfo
          data={getSectionData(state, "personal-info")}
          filingStatus={state.segmentation.filingStatus}
          onDataChange={(data: PersonalInfoData) =>
            onStateChange(updateSectionData(state, "personal-info", data))
          }
        />
      );
    case "income-w2": {
      const w2Data = getSectionData(state, "income-w2");
      const entries = w2Data?.entries ?? [emptyW2Entry];
      return (
        <SectionW2Income
          entries={entries}
          workspace={workspace}
          onUploadDocuments={onUploadDocuments}
          onEntriesChange={(next: W2EntryData[]) =>
            onStateChange(updateSectionData(state, "income-w2", { entries: next }))
          }
        />
      );
    }
    case "income-self-employment": {
      const seData = getSectionData(state, "income-self-employment");
      const necEntries = seData?.necEntries ?? [emptyNecEntry];
      const manualGrossReceipts = seData?.manualGrossReceipts ?? "";
      const expenses = seData?.expenses ?? emptyScheduleCExpenses;
      const bankStatementAnalyses = seData?.bankStatementAnalyses ?? [];
      const incomeDocumentAnalyses = seData?.incomeDocumentAnalyses ?? [];
      return (
        <SectionSelfEmployment
          workspace={workspace}
          necEntries={necEntries}
          manualGrossReceipts={manualGrossReceipts}
          expenses={expenses}
          bankStatementAnalyses={bankStatementAnalyses}
          incomeDocumentAnalyses={incomeDocumentAnalyses}
          qbiMateriallyParticipated={seData?.qbiMateriallyParticipated}
          businessFacts={seData?.businessFacts}
          onSectionChange={(next) =>
            onStateChange(updateSectionData(state, "income-self-employment", next))
          }
        />
      );
    }
    case "income-investments": {
      const investData = getSectionData(state, "income-investments");
      const interestEntries = investData?.interestEntries ?? [emptyInterestEntry];
      const dividendEntries = investData?.dividendEntries ?? [emptyDividendEntry];
      const brokerageEntries = investData?.brokerageEntries ?? [emptyBrokerageEntry];
      const oidEntries = investData?.oidEntries ?? [];
      return (
        <SectionInvestmentIncome
          interestEntries={interestEntries}
          dividendEntries={dividendEntries}
          brokerageEntries={brokerageEntries}
          oidEntries={oidEntries}
          stateCode={state.segmentation.stateCode}
          onOidEntriesChange={next => onStateChange(updateSectionData(state, "income-investments", { interestEntries, dividendEntries, brokerageEntries, oidEntries: next }))}
          onInterestEntriesChange={(next: InterestEntryData[]) =>
            onStateChange(updateSectionData(state, "income-investments", { interestEntries: next, dividendEntries, brokerageEntries, oidEntries }))
          }
          onDividendEntriesChange={(next: DividendEntryData[]) =>
            onStateChange(updateSectionData(state, "income-investments", { interestEntries, dividendEntries: next, brokerageEntries, oidEntries }))
          }
          onBrokerageEntriesChange={(next: BrokerageEntryData[]) =>
            onStateChange(updateSectionData(state, "income-investments", { interestEntries, dividendEntries, brokerageEntries: next, oidEntries }))
          }
        />
      );
    }
    case "income-retirement": {
      const retData = getSectionData(state, "income-retirement");
      const entries = retData?.entries ?? [emptyRetirementEntry];
      return (
        <SectionRetirementIncome
          entries={entries}
          onEntriesChange={(next: RetirementEntryData[]) =>
            onStateChange(updateSectionData(state, "income-retirement", { entries: next }))
          }
        />
      );
    }
    case "income-rental": {
      const rentalData = getSectionData(state, "income-rental");
      const rentalEntries = rentalData?.entries ?? [emptyRentalPropertyEntry];
      return (
        <SectionRentalIncome
          entries={rentalEntries}
          stateCode={state.segmentation.stateCode}
          onEntriesChange={(next: RentalPropertyEntryData[]) =>
            onStateChange(updateSectionData(state, "income-rental", { entries: next }))
          }
        />
      );
    }
    case "income-social-security":
      return (
        <SectionSocialSecurity
          data={getSectionData(state, "income-social-security")}
          onDataChange={(data: SocialSecurityData) =>
            onStateChange(updateSectionData(state, "income-social-security", data))
          }
        />
      );
    case "income-unemployment":
      return (
        <SectionUnemployment
          data={getSectionData(state, "income-unemployment")}
          onDataChange={(data: UnemploymentData) =>
            onStateChange(updateSectionData(state, "income-unemployment", data))
          }
        />
      );
    case "additional-deductions":
      return <SectionAdditionalDeductions state={state} data={getSectionData(state, "additional-deductions")} w2Entries={getSectionData(state, "income-w2")?.entries} onChange={data => onStateChange(updateSectionData(state, "additional-deductions", data))} />;
    case "deductions":
      return (
        <SectionDeductions
          taxYear={state.taxYear}
          data={getSectionData(state, "deductions")}
          filingStatus={state.segmentation.filingStatus}
          onDataChange={(data: DeductionData) =>
            onStateChange(updateSectionData(state, "deductions", data))
          }
        />
      );
    case "adjustments":
      return (
        <SectionAdjustments
          taxYear={state.taxYear}
          data={getSectionData(state, "adjustments")}
          hasSelfEmployment={state.segmentation.incomeTypes.includes("self-employment")}
          hasStudentLoans={state.segmentation.lifeEvents.includes("student-loans")}
          hasHsa={state.segmentation.lifeEvents.includes("hsa-contributions")}
          hasHealthInsurance={state.segmentation.lifeEvents.includes("self-employed-health-insurance")}
          filingStatus={state.segmentation.filingStatus}
          educationDistributions={getSectionData(state, "credits")?.educationDistributions}
          healthInsuranceSources={healthInsuranceSourceOptions(getSectionData(state, "income-self-employment"), getSectionData(state, "income-w2")?.entries)}
          marketplacePolicies={marketplacePolicyOptions(getSectionData(state, "credits")?.premiumTaxCredit?.policies)}
          onDataChange={(data: AdjustmentData) =>
            onStateChange(updateSectionData(state, "adjustments", data))
          }
        />
      );
    case "credits": {
      const personalData = getSectionData(state, "personal-info");
      const depCount = Number(personalData?.dependentCount ?? "0");
      return (
        <SectionCredits
          careBenefitSources={guidedCareBenefitSources(getSectionData(state, "income-w2")?.entries, getSectionData(state, "income-self-employment")?.businessFacts, getSectionData(state, "income-self-employment")?.expenses)}
          taxYear={state.taxYear}
          data={getSectionData(state, "credits")}
          hasDependents={depCount > 0}
          filingStatus={state.segmentation.filingStatus}
          onDataChange={(data: CreditsData) =>
            onStateChange(updateSectionData(state, "credits", data))
          }
        />
      );
    }
    case "other-taxes":
      return (
        <SectionOtherTaxes
          data={getSectionData(state, "other-taxes")}
          hasSelfEmployment={state.segmentation.incomeTypes.includes("self-employment")}
          hasInvestments={state.segmentation.incomeTypes.some(type => ["investments", "retirement", "rental"].includes(type))}
          retirementEntries={getSectionData(state, "income-retirement")?.entries}
          investment={getSectionData(state, "income-investments")}
          guidedPreview={guidedPreview}
          onDataChange={(data: OtherTaxesData) =>
            onStateChange(updateSectionData(state, "other-taxes", data))
          }
        />
      );
    case "payments":
      return (
        <SectionPayments
          data={getSectionData(state, "payments")}
          onDataChange={(data: PaymentData) =>
            onStateChange(updateSectionData(state, "payments", data))
          }
        />
      );
    case "review":
      return (
        <SectionReview
          state={state}
          preview={guidedPreview}
          onJumpToSection={onJumpToSection}
        />
      );
    case "state-return":
      return (
        <SectionStateReturn
          stateCode={state.segmentation.stateCode as SupportedStateCode}
          data={getSectionData(state, "state-return")}
          guidedPreview={guidedPreview}
          onDataChange={(data: StateReturnData) =>
            onStateChange(updateSectionData(state, "state-return", data))
          }
        />
      );
    case "final-review": {
      const completion = summarizeFlowCompletion(state);
      const followUpSections = completion.skippedSections + completion.needsReviewSections;
      const requiresFollowUp = followUpSections > 0;

      return (
        <CompletionSummaryContent
          guidedPreview={guidedPreview}
          workspace={workspace}
          completion={completion}
          requiresFollowUp={requiresFollowUp}
          followUpSections={followUpSections}
        />
      );
    }
    default:
      return <SectionPlaceholder section={section} />;
  }
}

function InterviewPhase({
  state,
  guidedPreview,
  onStateChange,
  workspace,
  onUploadDocuments,
  onFinish,
}: {
  state: GuidedFlowState;
  guidedPreview: GuidedPreviewMetrics | null;
  onStateChange: (next: GuidedFlowState) => void;
  workspace: ReturnWorkspaceRecord;
  onUploadDocuments?: (files: File[]) => Promise<string>;
  onFinish: () => void;
}) {
  const progress = computeFlowProgress(state);
  const currentSection = progress.currentSection;
  const sectionRef = useRef<HTMLDivElement>(null);
  const prevSectionIndex = useRef(state.currentSectionIndex);
  const [skipPromptOpen, setSkipPromptOpen] = useState(false);
  const skipPrompt = skipPromptOpen ? shouldPromptBeforeAdvance(state) : null;
  const skipPromptDisplay = useMemo(() => {
    if (!skipPrompt) {
      return null;
    }

    const defaultPrimaryActionLabel =
      skipPrompt.allowSkip === false ? "Review highlighted values" : "Go back and fill it in";

    if (
      currentSection?.id !== "income-w2"
      || skipPrompt.allowSkip === false
      || skipPrompt.status !== "empty"
    ) {
      return {
        prompt: skipPrompt,
        primaryActionLabel: defaultPrimaryActionLabel,
      };
    }

    const suggestions = collectW2Suggestions(workspace.documents, workspace.structuredFacts);
    if (suggestions.length === 0) {
      return {
        prompt: skipPrompt,
        primaryActionLabel: defaultPrimaryActionLabel,
      };
    }

    const detailMessage = suggestions.length === 1
      ? `${suggestions[0].documentLabel} already has detected values on this return. Use the W-2 suggestion card to copy those boxes into W-2 #1, or type the amounts manually instead.`
      : `${suggestions.length} W-2 documents already have detected values on this return. Use the W-2 suggestion cards to copy any boxes you want to keep, or type the amounts manually instead.`;

    return {
      prompt: {
        ...skipPrompt,
        message: "Detected W-2 values are ready to review before this section will count toward your return.",
        fieldErrors: {
          ...skipPrompt.fieldErrors,
          pendingDetectedW2Values: detailMessage,
        },
      },
      primaryActionLabel: "Review detected W-2 values",
    };
  }, [currentSection?.id, skipPrompt, workspace.documents, workspace.structuredFacts]);

  // Scroll to top and trigger fade-in animation on section change
  useEffect(() => {
    if (prevSectionIndex.current !== state.currentSectionIndex) {
      prevSectionIndex.current = state.currentSectionIndex;
      setSkipPromptOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [state.currentSectionIndex]);

  useEffect(() => {
    if (skipPromptOpen && !skipPrompt) {
      setSkipPromptOpen(false);
    }
  }, [skipPromptOpen, skipPrompt]);

  function handleAdvance() {
    if (currentSection?.id === "final-review") {
      setSkipPromptOpen(false);
      onFinish();
      return;
    }

    const validation = shouldPromptBeforeAdvance(state);
    if (validation) {
      setSkipPromptOpen(true);
      return;
    }
    setSkipPromptOpen(false);
    onStateChange(goToNextSection(state));
  }

  // Keyboard shortcuts: Enter = continue, Escape = back / dismiss skip prompt
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // A focused control may already have handled this key (for example the ticker).
      if (e.defaultPrevented) return;
      // Don't intercept when user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        // Let interactive elements receive their own native Enter activation.
        if (e.target instanceof Element && e.target.closest('button, a[href], [role="button"], [contenteditable="true"]')) return;
        e.preventDefault();
        handleAdvance();
      } else if (e.key === "Escape") {
        if (skipPrompt) {
          e.preventDefault();
          setSkipPromptOpen(false);
        } else if (canGoBack(state)) {
          e.preventDefault();
          onStateChange(goToPreviousSection(state));
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, onStateChange, skipPrompt]);

  function handleJump(sectionId: InterviewSectionId) {
    setSkipPromptOpen(false);
    onStateChange(jumpToSection(state, sectionId));
  }

  return (
    <div className="guided-interview-phase" ref={sectionRef}>
      <SectionProgressBar state={state} onJump={handleJump} />

      <RefundTicker guidedPreview={guidedPreview} workspace={workspace} progress={progress} />

      <div key={currentSection?.id} className="guided-section-transition">
        {currentSection ? (
          <SectionContent
            sectionId={currentSection.id as InterviewSectionId}
            state={state}
            workspace={workspace}
            onUploadDocuments={onUploadDocuments}
            onStateChange={onStateChange}
            guidedPreview={guidedPreview}
            onJumpToSection={handleJump}
            section={currentSection}
          />
        ) : (
          <RetroShell title="No Section" eyebrow="ERROR">
            <p className="guided-prompt">Something went wrong — no current section found.</p>
          </RetroShell>
        )}
      </div>

      {skipPromptDisplay && (
        <div className="guided-skip-prompt" role="alert">
          <p className="guided-skip-prompt-message">{skipPromptDisplay.prompt.message}</p>
          {Object.keys(skipPromptDisplay.prompt.fieldErrors).length > 0 && (
            <ul className="guided-skip-prompt-errors">
              {Object.entries(skipPromptDisplay.prompt.fieldErrors).map(([fieldKey, error]) => (
                <li key={fieldKey}>{error}</li>
              ))}
            </ul>
          )}
          <div className="guided-skip-prompt-actions">
            <button
              className="utility-button utility-button-small"
              type="button"
              onClick={() => setSkipPromptOpen(false)}
            >
              {skipPromptDisplay.primaryActionLabel}
            </button>
            {skipPromptDisplay.prompt.allowSkip === false ? null : (
              <button
                className="utility-button utility-button-small"
                type="button"
                onClick={() => {
                  setSkipPromptOpen(false);
                  onStateChange(goToNextSection(state));
                }}
              >
                Skip this section
              </button>
            )}
          </div>
        </div>
      )}

      <div className="guided-nav">
        <button
          className="utility-button"
          type="button"
          onClick={() => {
            setSkipPromptOpen(false);
            onStateChange(goToPreviousSection(state));
          }}
          disabled={!canGoBack(state)}
        >
          Back
        </button>
        <button
          className="launch-button"
          type="button"
          onClick={handleAdvance}
        >
          {currentSection?.id === "final-review"
            ? "Open Full Return"
            : canGoForward(state)
              ? "Continue"
              : "Finish Review"}
        </button>
        <span className="guided-nav-hint">
          {currentSection?.id === "final-review"
            ? "Enter to open full return · Esc to go back"
            : "Enter to continue · Esc to go back"}
        </span>
      </div>
    </div>
  );
}

function CompletionScreen({
  guidedPreview,
  workspace,
  state,
  onBack,
  onResumeSection,
  onRestart,
  onContinueToWorkspace,
}: {
  guidedPreview: GuidedPreviewMetrics | null;
  workspace: ReturnWorkspaceRecord;
  state: GuidedFlowState;
  onBack: () => void;
  onResumeSection: (sectionId: InterviewSectionId) => void;
  onRestart: () => void;
  onContinueToWorkspace: () => void;
}) {
  const completion = summarizeFlowCompletion(state);
  const requiresFollowUp = completion.skippedSections > 0 || completion.needsReviewSections > 0;
  const followUpSections = completion.skippedSections + completion.needsReviewSections;
  const progress = computeFlowProgress(state);

  return (
    <div className="guided-completion">
      <SectionProgressBar state={state} onJump={onResumeSection} />

      <RefundTicker guidedPreview={guidedPreview} workspace={workspace} progress={progress} />

      <CompletionSummaryContent
        guidedPreview={guidedPreview}
        workspace={workspace}
        requiresFollowUp={requiresFollowUp}
        followUpSections={followUpSections}
        completion={completion}
      />

      <div className="guided-nav">
        <button className="utility-button" type="button" onClick={onBack}>
          Back
        </button>
        <button className="utility-button" type="button" onClick={onRestart}>
          Start Again
        </button>
        <button className="launch-button" type="button" onClick={onContinueToWorkspace}>
          Open Full Return
        </button>
        <span className="guided-nav-hint">
          Jump to any completed section above, or go back to revise the previous step.
        </span>
      </div>
    </div>
  );
}

function CompletionSummaryContent({
  guidedPreview,
  workspace: _workspace,
  requiresFollowUp,
  followUpSections,
  completion,
}: {
  guidedPreview: GuidedPreviewMetrics | null;
  workspace: ReturnWorkspaceRecord;
  requiresFollowUp: boolean;
  followUpSections: number;
  completion: FlowCompletionSummary;
}) {
  const metrics = guidedPreview;
  const hasMetrics = metrics !== null;
  const refund = new Decimal(hasMetrics ? metrics.refund : "0");
  const owed = new Decimal(hasMetrics ? metrics.amountOwed : "0");
  const stateMetrics: StatePreviewMetrics | null = guidedPreview?.state ?? null;
  const stateRefund = new Decimal(stateMetrics ? stateMetrics.stateRefund : "0");
  const stateOwed = new Decimal(stateMetrics ? stateMetrics.stateAmountOwed : "0");
  const netResult = refund.minus(owed).plus(stateRefund).minus(stateOwed);

  return (
    <>
      <section className="hero">
        <p className="hero-kicker">{requiresFollowUp ? "REVIEW MISSING ANSWERS" : "REVIEW"}</p>
        <h1>{requiresFollowUp ? "Some guided sections still need review." : "Your return is ready to review."}</h1>
        <p className="hero-copy">
          {requiresFollowUp
            ? `You finished the guided questions, but ${describeCompletionState(completion, followUpSections)}. Double-check the summary below before you open the full return.`
            : "You've finished the guided questions. Review the summary below, then open your full return."}
        </p>
      </section>

      <RetroShell title="Summary" eyebrow="REVIEW">
        <div className="guided-ticker-grid">
          {hasMetrics && (
            <div className={`guided-ticker-item guided-ticker-item-hero ${stateMetrics ? (netResult.gt(0) ? "guided-ticker-positive" : netResult.lt(0) ? "guided-ticker-negative" : "") : (refund.gt(0) ? "guided-ticker-positive" : owed.gt(0) ? "guided-ticker-negative" : "")}`}>
              <span className="guided-ticker-label">
                {stateMetrics
                  ? netResult.gt(0) ? "Total Refund" : netResult.lt(0) ? "Total Balance Due" : "Result"
                  : refund.gt(0) ? "Your Refund" : owed.gt(0) ? "Balance Due" : "Result"}
              </span>
              <strong className="guided-ticker-value guided-ticker-value-hero">
                {stateMetrics
                  ? formatTickerCurrency(netResult.abs().toFixed())
                  : refund.gt(0)
                    ? formatTickerCurrency(metrics.refund)
                    : owed.gt(0)
                      ? formatTickerCurrency(metrics.amountOwed)
                      : "—"}
              </strong>
            </div>
          )}
          {hasMetrics && stateMetrics && (
            <div className={`guided-ticker-item guided-ticker-sub ${refund.gt(0) ? "guided-ticker-positive" : owed.gt(0) ? "guided-ticker-negative" : ""}`}>
              <span className="guided-ticker-label">Federal</span>
              <strong className="guided-ticker-value">
                {refund.gt(0) ? formatTickerCurrency(metrics.refund) : owed.gt(0) ? formatTickerCurrency(metrics.amountOwed) : "—"}
              </strong>
            </div>
          )}
          {hasMetrics && stateMetrics && (
            <div className={`guided-ticker-item guided-ticker-sub ${stateRefund.gt(0) ? "guided-ticker-positive" : stateOwed.gt(0) ? "guided-ticker-negative" : ""}`}>
              <span className="guided-ticker-label">{stateMetrics.stateCode}</span>
              <strong className="guided-ticker-value">
                {stateRefund.gt(0) ? formatTickerCurrency(stateMetrics.stateRefund) : stateOwed.gt(0) ? formatTickerCurrency(stateMetrics.stateAmountOwed) : "—"}
              </strong>
            </div>
          )}
          {hasMetrics && (
            <div className="guided-ticker-item">
              <span className="guided-ticker-label">Total Income</span>
              <strong className="guided-ticker-value">
                {formatTickerCurrency(metrics.totalIncome)}
              </strong>
            </div>
          )}
          {hasMetrics && (
            <div className="guided-ticker-item">
              <span className="guided-ticker-label">Total Tax</span>
              <strong className="guided-ticker-value">
                {formatTickerCurrency(metrics.totalTax)}
              </strong>
            </div>
          )}
          <div className="guided-ticker-item">
            <span className="guided-ticker-label">Sections Complete</span>
            <strong className="guided-ticker-value">
              {completion.completedSections}
            </strong>
          </div>
          {completion.skippedSections > 0 && (
            <div className="guided-ticker-item">
              <span className="guided-ticker-label">Sections Skipped</span>
              <strong className="guided-ticker-value">
                {completion.skippedSections}
              </strong>
            </div>
          )}
          {completion.needsReviewSections > 0 && (
            <div className="guided-ticker-item">
              <span className="guided-ticker-label">Needs Review</span>
              <strong className="guided-ticker-value">
                {completion.needsReviewSections}
              </strong>
            </div>
          )}
        </div>
      </RetroShell>
    </>
  );
}

function describeCompletionState(completion: FlowCompletionSummary, followUpSections: number): string {
  if (completion.skippedSections > 0 && completion.needsReviewSections > 0) {
    return `${followUpSections} section${followUpSections === 1 ? "" : "s"} were skipped or still need review`;
  }

  if (completion.skippedSections > 0) {
    return `${followUpSections} section${followUpSections === 1 ? " was" : "s were"} skipped`;
  }

  return `${followUpSections} section${followUpSections === 1 ? " still needs" : "s still need"} review`;
}

export function GuidedInterviewShell({
  workspace,
  onExitGuided,
  onUploadDocuments,
  onSyncToWorkspace,
  resumeSectionId,
}: {
  workspace: ReturnWorkspaceRecord;
  onExitGuided: () => void;
  onUploadDocuments?: (files: File[]) => Promise<string>;
  /** Called when the user wants to sync guided data into the workspace and switch to advanced mode */
  onSyncToWorkspace?: (
    syntheticDocuments: ReturnType<typeof buildGuidedSyntheticDocuments>,
    factAnswers: ReturnType<typeof buildGuidedFactAnswers>,
    flowState: GuidedFlowState
  ) => void;
  resumeSectionId?: InterviewSectionId | null;
}) {
  const [flowState, setFlowState] = useState<GuidedFlowState>(() => {
    const browserStorage = getBrowserStorage();
    return browserStorage ? loadGuidedFlowState(browserStorage, workspace.id) ?? { ...initialFlowState, taxYear: workspace.returnSummary.targetTaxYear } : { ...initialFlowState, taxYear: workspace.returnSummary.targetTaxYear };
  });

  useEffect(() => {
    const browserStorage = getBrowserStorage();
    setFlowState(browserStorage ? loadGuidedFlowState(browserStorage, workspace.id) ?? { ...initialFlowState, taxYear: workspace.returnSummary.targetTaxYear } : { ...initialFlowState, taxYear: workspace.returnSummary.targetTaxYear });
  }, [workspace.id, workspace.returnSummary.targetTaxYear]);

  useEffect(() => {
    if (!resumeSectionId) {
      return;
    }

    setFlowState((current) => resumeInterviewAtSection(current, resumeSectionId));
  }, [resumeSectionId]);

  // Persist state on every change
  const handleFlowStateChange = useCallback((next: GuidedFlowState) => {
    setFlowState(next);
    const browserStorage = getBrowserStorage();

    if (browserStorage) {
      saveGuidedFlowState(browserStorage, workspace.id, next);
    }
  }, [workspace.id]);

  // Compute live preview from the guided interview data. This runs the
  // tax engine on every state change so the refund ticker updates in
  // real time as the user enters data.
  const guidedPreview = useMemo(
    () => workspace.returnSummary.targetTaxYear != null && flowState.taxYear !== workspace.returnSummary.targetTaxYear ? null : computeGuidedPreview(flowState),
    [flowState, workspace.returnSummary.targetTaxYear],
  );
  const currentSection = flowState.phase === "interview"
    ? computeFlowProgress(flowState).currentSection
    : null;

  function handleSegmentationComplete(answers: SegmentationAnswers) {
    handleFlowStateChange(startInterview(answers, flowState.taxYear ?? null));
  }

  function handleRestart() {
    const browserStorage = getBrowserStorage();

    if (browserStorage) {
      clearGuidedFlowState(browserStorage, workspace.id);
    }
    setFlowState({ ...initialFlowState, taxYear: workspace.returnSummary.targetTaxYear });
  }

  const handleSyncAndExit = useCallback(() => {
    if (onSyncToWorkspace) {
      const syntheticDocs = buildGuidedSyntheticDocuments(flowState);
      const factAnswers = buildGuidedFactAnswers(flowState);
      onSyncToWorkspace(syntheticDocs, factAnswers, flowState);
    } else {
      onExitGuided();
    }
  }, [flowState, onSyncToWorkspace, onExitGuided]);

  return (
    <div className="guided-interview-shell">
      <div className="guided-mode-toggle">
        <button className="utility-button utility-button-small" type="button" onClick={handleSyncAndExit}>
          Switch to advanced mode
        </button>
      </div>

      <label className="guided-field">
        <span className="guided-field-label">Tax year for this interview</span>
        <select className="guided-input" value={flowState.taxYear ?? ""} onChange={(event) => handleFlowStateChange({ ...flowState, taxYear: event.target.value ? Number(event.target.value) : null })}>
          <option value="">Confirm the tax year</option>
          <option value="2025">2025 — filed in 2026</option>
          <option value="2026">2026 — calculation not yet available</option>
        </select>
      </label>
      {flowState.taxYear == null && <p role="status">This saved interview has no confirmed year. Confirm it before calculating.</p>}
      {workspace.returnSummary.targetTaxYear != null && flowState.taxYear != null && flowState.taxYear !== workspace.returnSummary.targetTaxYear && (
        <p role="alert">The interview year differs from this workspace's {workspace.returnSummary.targetTaxYear} return. Calculation and PDF download are unavailable until the years agree.</p>
      )}
      {flowState.taxYear === 2026 && <p role="status">You can save 2026 facts. The 2026 rules and filing forms are not yet qualified.</p>}

      <ReturnHelpDock
        workspace={workspace}
        mode="guided"
        deploymentMode={workspace.storageMode === "hosted-postgres" ? "hosted" : "self-host"}
        currentSectionId={currentSection?.id ?? null}
        currentSectionLabel={currentSection?.label ?? (flowState.phase === "segmentation" ? "guided setup" : null)}
        onUploadDocuments={onUploadDocuments}
      />

      {flowState.phase === "segmentation" && (
        <SegmentationScreen
          onComplete={handleSegmentationComplete}
          workspace={workspace}
          onUploadDocuments={onUploadDocuments}
        />
      )}

      {flowState.phase === "interview" && (
        <InterviewPhase
          state={flowState}
          guidedPreview={guidedPreview}
          onStateChange={handleFlowStateChange}
          workspace={workspace}
          onUploadDocuments={onUploadDocuments}
          onFinish={handleSyncAndExit}
        />
      )}

      {flowState.phase === "complete" && (
        <CompletionScreen
          guidedPreview={guidedPreview}
          workspace={workspace}
          state={flowState}
          onBack={() => {
            handleFlowStateChange({
              ...goToPreviousSection(flowState),
              phase: "interview",
            });
          }}
          onResumeSection={(sectionId) => {
            handleFlowStateChange(resumeInterviewAtSection(flowState, sectionId));
          }}
          onRestart={handleRestart}
          onContinueToWorkspace={handleSyncAndExit}
        />
      )}
    </div>
  );
}
