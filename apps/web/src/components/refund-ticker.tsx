"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkspaceEnginePreview } from "@tax-engine/contracts";
import { RetroShell } from "@/components/retro-shell";

export interface RefundTickerPreviewData {
  filingStatus: string;
  taxYear: number;
  filingState?: string;
  metrics: WorkspaceEnginePreview["metrics"];
  stateMetrics?: WorkspaceEnginePreview["stateMetrics"];
}

const FILING_STATUS_LABELS: Record<string, string> = {
  single: "Single",
  married_filing_jointly: "Married Filing Jointly",
  married_filing_separately: "Married Filing Separately",
  head_of_household: "Head of Household",
  qualifying_surviving_spouse: "Qualifying Surviving Spouse",
};

export function formatFilingStatus(status: string): string {
  return FILING_STATUS_LABELS[status] ?? status;
}

export function formatTickerCurrency(value: string | number | undefined): string {
  if (value === undefined) return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

export function computeRawTarget(
  preview: RefundTickerPreviewData | null
): number {
  if (!preview) return 0;
  const refund = Number(preview.metrics.refund);
  if (refund > 0) return refund;
  const owed = Number(preview.metrics.amountOwed);
  if (owed > 0) return -owed;
  return 0;
}

export function computeTickerLabel(
  preview: RefundTickerPreviewData
): string {
  const refund = Number(preview.metrics.refund);
  const owed = Number(preview.metrics.amountOwed);
  if (refund > 0) return "Estimated Refund";
  if (owed > 0) return "Estimated Balance Due";
  return "Estimated Result";
}

export function computeTickerClass(animatedValue: number): string {
  if (animatedValue > 0) return "guided-ticker-positive";
  if (animatedValue < 0) return "guided-ticker-negative";
  return "";
}

export function computeTickerDisplayValue(
  animatedValue: number,
  refund: number,
  owed: number
): string {
  const displayAbsolute = Math.abs(animatedValue);
  if (displayAbsolute === 0 && refund === 0 && owed === 0) return "$0";
  return formatTickerCurrency(displayAbsolute);
}

export interface FederalTickerInfo {
  label: string;
  value: string;
  className: string;
}

export function computeFederalTickerInfo(
  metrics: RefundTickerPreviewData["metrics"]
): FederalTickerInfo {
  const refund = Number(metrics.refund);
  const owed = Number(metrics.amountOwed);

  if (refund > 0) {
    return {
      label: "Federal Refund",
      value: formatTickerCurrency(refund),
      className: "guided-ticker-sub guided-ticker-positive",
    };
  }
  if (owed > 0) {
    return {
      label: "Federal Balance Due",
      value: formatTickerCurrency(owed),
      className: "guided-ticker-sub guided-ticker-negative",
    };
  }
  return {
    label: "Federal Result",
    value: "$0",
    className: "guided-ticker-sub",
  };
}

export interface StateTickerInfo {
  stateCode: string;
  label: string;
  value: string;
  className: string;
  rawTarget: number;
}

export function computeStateTickerInfo(
  stateMetrics: NonNullable<RefundTickerPreviewData["stateMetrics"]>
): StateTickerInfo {
  const refund = Number(stateMetrics.refund);
  const owed = Number(stateMetrics.amountOwed);
  const code = stateMetrics.stateCode.toUpperCase();

  if (refund > 0) {
    return {
      stateCode: code,
      label: `${code} Refund`,
      value: formatTickerCurrency(refund),
      className: "guided-ticker-sub guided-ticker-positive",
      rawTarget: refund,
    };
  }
  if (owed > 0) {
    return {
      stateCode: code,
      label: `${code} Balance Due`,
      value: formatTickerCurrency(owed),
      className: "guided-ticker-sub guided-ticker-negative",
      rawTarget: -owed,
    };
  }
  return {
    stateCode: code,
    label: `${code} Result`,
    value: "$0",
    className: "guided-ticker-sub",
    rawTarget: 0,
  };
}

// ── Combined federal + state ticker helpers ──────────────────────────────────

export interface CombinedTickerInput {
  /** Federal refund amount (>= 0) */
  federalRefund: number;
  /** Federal amount owed (>= 0) */
  federalOwed: number;
  /** State refund amount (>= 0), or null if no state */
  stateRefund: number | null;
  /** State amount owed (>= 0), or null if no state */
  stateOwed: number | null;
}

/**
 * Compute the net result across federal and (optionally) state returns.
 * Positive = net refund, negative = net owed.
 */
export function computeNetResult(input: CombinedTickerInput): number {
  const fed = input.federalRefund - input.federalOwed;
  const state =
    input.stateRefund !== null && input.stateOwed !== null
      ? input.stateRefund - input.stateOwed
      : 0;
  return fed + state;
}

/**
 * Compute the hero amount displayed in the ticker.
 * When a state return is present, shows the combined absolute value;
 * otherwise shows the federal-only amount.
 */
export function computeHeroAmount(input: CombinedTickerInput): number {
  const hasState = input.stateRefund !== null && input.stateOwed !== null;
  if (hasState) {
    return Math.abs(computeNetResult(input));
  }
  return input.federalRefund > 0
    ? input.federalRefund
    : input.federalOwed > 0
      ? input.federalOwed
      : 0;
}

/**
 * Compute the ticker label when both federal and state may be present.
 */
export function computeCombinedTickerLabel(input: CombinedTickerInput): string {
  const hasState = input.stateRefund !== null && input.stateOwed !== null;
  if (hasState) {
    const net = computeNetResult(input);
    if (net > 0) return "Total Estimated Refund";
    if (net < 0) return "Total Estimated Balance Due";
    return "Estimated Result";
  }
  if (input.federalRefund > 0) return "Estimated Refund";
  if (input.federalOwed > 0) return "Estimated Balance Due";
  return "Estimated Result";
}

/**
 * Compute the ticker CSS class when both federal and state may be present.
 */
export function computeCombinedTickerClass(input: CombinedTickerInput): string {
  const hasState = input.stateRefund !== null && input.stateOwed !== null;
  if (hasState) {
    const net = computeNetResult(input);
    if (net > 0) return "guided-ticker-positive";
    if (net < 0) return "guided-ticker-negative";
    return "";
  }
  if (input.federalRefund > 0) return "guided-ticker-positive";
  if (input.federalOwed > 0) return "guided-ticker-negative";
  return "";
}

export interface TickerBreakdownRow {
  label: string;
  value: string;
  className?: string;
}

export function computeBreakdownRows(
  metrics: RefundTickerPreviewData["metrics"]
): TickerBreakdownRow[] {
  const refund = Number(metrics.refund);
  const owed = Number(metrics.amountOwed);

  const resultLabel = refund > 0 ? "Refund" : owed > 0 ? "Balance Due" : "Result";
  const resultValue = refund > 0
    ? formatTickerCurrency(metrics.refund)
    : owed > 0
      ? formatTickerCurrency(metrics.amountOwed)
      : "—";
  const resultClass = refund > 0
    ? "guided-ticker-breakdown-refund"
    : owed > 0
      ? "guided-ticker-breakdown-owed"
      : "";

  return [
    { label: "Total Income", value: formatTickerCurrency(metrics.totalIncome) },
    { label: "Adjusted Gross Income", value: formatTickerCurrency(metrics.agi) },
    { label: "Taxable Income", value: formatTickerCurrency(metrics.taxableIncome) },
    { label: "Total Tax", value: formatTickerCurrency(metrics.totalTax), className: "guided-ticker-breakdown-separator" },
    { label: "Total Payments / Withholding", value: formatTickerCurrency(metrics.totalPayments) },
    { label: resultLabel, value: resultValue, className: `guided-ticker-breakdown-result ${resultClass}`.trim() },
  ];
}

export function computeStateBreakdownRows(
  stateMetrics: NonNullable<RefundTickerPreviewData["stateMetrics"]>
): TickerBreakdownRow[] {
  const code = stateMetrics.stateCode.toUpperCase();
  const refund = Number(stateMetrics.refund);
  const owed = Number(stateMetrics.amountOwed);

  const resultLabel = refund > 0 ? "Refund" : owed > 0 ? "Balance Due" : "Result";
  const resultValue = refund > 0
    ? formatTickerCurrency(stateMetrics.refund)
    : owed > 0
      ? formatTickerCurrency(stateMetrics.amountOwed)
      : "—";
  const resultClass = refund > 0
    ? "guided-ticker-breakdown-refund"
    : owed > 0
      ? "guided-ticker-breakdown-owed"
      : "";

  return [
    { label: `${code} State Return`, value: "", className: "guided-ticker-breakdown-state-header guided-ticker-breakdown-separator" },
    { label: "State Tax", value: formatTickerCurrency(stateMetrics.stateTax) },
    { label: "State Payments / Withholding", value: formatTickerCurrency(stateMetrics.totalPayments) },
    { label: resultLabel, value: resultValue, className: `guided-ticker-breakdown-result ${resultClass}`.trim() },
  ];
}

/**
 * Returns a boolean that flips to true for one animation cycle when the
 * watched value changes, driving the CSS ticker-pulse animation.
 */
export function usePulse(value: number): boolean {
  const [pulsing, setPulsing] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      setPulsing(true);
      const timer = setTimeout(() => setPulsing(false), 650);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return pulsing;
}

const DEFAULT_ANIMATION_DURATION_MS = 600;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function formatAnimatedCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Animates a numeric value from its previous value to the target,
 * returning the current display value on each frame.
 * Respects prefers-reduced-motion: jumps instantly when enabled.
 */
export function useAnimatedValue(target: number, duration = DEFAULT_ANIMATION_DURATION_MS): number {
  const [display, setDisplay] = useState(target);
  const prevTarget = useRef(target);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const from = prevTarget.current;
    prevTarget.current = target;

    if (from === target) return;

    // Skip animation when user prefers reduced motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target);
      return;
    }

    const start = performance.now();
    const delta = target - from;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setDisplay(Math.round(from + delta * eased));

      if (progress < 1) {
        rafId.current = requestAnimationFrame(tick);
      }
    }

    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId.current);
  }, [target, duration]);

  return display;
}

export function buildCombinedInputFromPreview(
  preview: RefundTickerPreviewData
): CombinedTickerInput {
  const fedRefund = Number(preview.metrics.refund);
  const fedOwed = Number(preview.metrics.amountOwed);
  if (!preview.stateMetrics) {
    return { federalRefund: fedRefund, federalOwed: fedOwed, stateRefund: null, stateOwed: null };
  }
  return {
    federalRefund: fedRefund,
    federalOwed: fedOwed,
    stateRefund: Number(preview.stateMetrics.refund),
    stateOwed: Number(preview.stateMetrics.amountOwed),
  };
}

export type TickerHeroState = "empty" | "computing" | "ready";

export function computeTickerHeroState(
  enginePreview: RefundTickerPreviewData | null,
  computing: boolean
): TickerHeroState {
  if (computing) return "computing";
  if (!enginePreview) return "empty";
  return "ready";
}

export type WorkspaceStatusHint =
  | "empty"
  | "awaiting-interview"
  | "needs-review"
  | "ready-to-recompute"
  | null;

export function computeTickerHeroText(
  state: TickerHeroState,
  workspaceStatus?: WorkspaceStatusHint
): string | null {
  if (state === "computing") return "Calculating…";
  if (state !== "empty") return null;

  switch (workspaceStatus) {
    case "awaiting-interview":
      return "Answer interview questions to see your estimate";
    case "needs-review":
      return "Review flagged items to see your estimate";
    case "ready-to-recompute":
      return "Preparing your estimate…";
    default:
      return "Upload tax documents to get an estimate";
  }
}

export function RefundTicker({
  enginePreview,
  fallbackPreview = null,
  computing = false,
  workspaceStatus,
}: {
  enginePreview: WorkspaceEnginePreview | null;
  fallbackPreview?: RefundTickerPreviewData | null;
  computing?: boolean;
  workspaceStatus?: WorkspaceStatusHint;
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const preview = enginePreview ?? fallbackPreview;
  const combinedInput = preview ? buildCombinedInputFromPreview(preview) : null;
  const hasState = combinedInput !== null && combinedInput.stateRefund !== null;
  const rawTarget = hasState
    ? computeNetResult(combinedInput)
    : computeRawTarget(preview);
  const animatedValue = useAnimatedValue(rawTarget);
  const pulsing = usePulse(rawTarget);

  const heroState = computeTickerHeroState(preview, computing);
  const heroText = computeTickerHeroText(heroState, workspaceStatus);
  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      if (next) {
        setBreakdownOpen(false);
      }
      return next;
    });
  };

  if (heroText !== null) {
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
              className={`guided-ticker-item guided-ticker-item-hero${heroState === "computing" ? " guided-ticker-computing" : ""}`}
              role="status"
              aria-live="polite"
            >
              <span className="guided-ticker-label">Estimated Result</span>
              <strong className="guided-ticker-value guided-ticker-value-hero">
                {heroState === "computing" && (
                  <span className="guided-ticker-spinner" aria-hidden="true" />
                )}
                {heroText}
              </strong>
            </div>
            {collapsed ? (
              <>
                <div className="guided-ticker-item guided-ticker-item-compact">
                  <span className="guided-ticker-label">Return</span>
                  <strong className="guided-ticker-value">Waiting on data</strong>
                </div>
                <div className="guided-ticker-item guided-ticker-item-compact">
                  <span className="guided-ticker-label">Next Step</span>
                  <strong className="guided-ticker-value">Upload or answer</strong>
                </div>
              </>
            ) : null}
          </div>
        </RetroShell>
      </div>
    );
  }

  // After the early return above, preview is guaranteed non-null
  // (computeTickerHeroState returns "empty" when preview is null, which
  // produces a non-null heroText that triggers the early return).
  const activePreview = preview as RefundTickerPreviewData;
  const { metrics } = activePreview;

  const tickerLabel = hasState
    ? computeCombinedTickerLabel(combinedInput as CombinedTickerInput)
    : computeTickerLabel(activePreview);
  const tickerValue = formatTickerCurrency(Math.abs(animatedValue));
  const tickerClass = hasState
    ? computeCombinedTickerClass(combinedInput as CombinedTickerInput)
    : computeTickerClass(animatedValue);

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
            onClick={!collapsed ? () => setBreakdownOpen((open) => !open) : undefined}
            role={!collapsed ? "button" : undefined}
            tabIndex={!collapsed ? 0 : undefined}
            aria-expanded={!collapsed ? breakdownOpen : undefined}
            aria-controls={!collapsed ? "standalone-ticker-breakdown" : undefined}
            onKeyDown={(e) => {
              if (!collapsed && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                setBreakdownOpen((open) => !open);
              }
              if (e.key === "Escape" && breakdownOpen) {
                e.preventDefault();
                setBreakdownOpen(false);
              }
            }}
          >
            <span className="guided-ticker-label">{tickerLabel}</span>
            <strong className="guided-ticker-value guided-ticker-value-hero" aria-live="polite">
              {tickerValue}
            </strong>
            {!collapsed ? (
              <span className="guided-ticker-expand-hint">
                {breakdownOpen ? "Collapse" : "View breakdown"}
              </span>
            ) : null}
          </div>
          {collapsed ? (
            <>
              <div className="guided-ticker-item guided-ticker-item-compact">
                <span className="guided-ticker-label">Filing Status</span>
                <strong className="guided-ticker-value">{formatFilingStatus(activePreview.filingStatus)}</strong>
              </div>
              <div className="guided-ticker-item guided-ticker-item-compact">
                <span className="guided-ticker-label">Tax Year</span>
                <strong className="guided-ticker-value">{activePreview.taxYear}</strong>
              </div>
              <div className="guided-ticker-item guided-ticker-item-compact">
                <span className="guided-ticker-label">{activePreview.filingState ? "State" : "Total Income"}</span>
                <strong className="guided-ticker-value">
                  {activePreview.filingState ? activePreview.filingState : formatTickerCurrency(metrics.totalIncome)}
                </strong>
              </div>
            </>
          ) : (
            <>
              <div className="guided-ticker-item">
                <span className="guided-ticker-label">Filing Status</span>
                <strong className="guided-ticker-value">{formatFilingStatus(activePreview.filingStatus)}</strong>
              </div>
              <div className="guided-ticker-item">
                <span className="guided-ticker-label">Tax Year</span>
                <strong className="guided-ticker-value">{activePreview.taxYear}</strong>
              </div>
              {activePreview.filingState ? (
                <div className="guided-ticker-item">
                  <span className="guided-ticker-label">State</span>
                  <strong className="guided-ticker-value">{activePreview.filingState}</strong>
                </div>
              ) : null}
              <div className="guided-ticker-item">
                <span className="guided-ticker-label">Total Income</span>
                <strong className="guided-ticker-value">
                  {formatTickerCurrency(metrics.totalIncome)}
                </strong>
              </div>
              {hasState ? (() => {
                const fedInfo = computeFederalTickerInfo(metrics);
                return (
                  <div className={`guided-ticker-item ${fedInfo.className}`}>
                    <span className="guided-ticker-label">{fedInfo.label}</span>
                    <strong className="guided-ticker-value">{fedInfo.value}</strong>
                  </div>
                );
              })() : null}
              {activePreview.stateMetrics ? (() => {
                const stateInfo = computeStateTickerInfo(activePreview.stateMetrics);
                return (
                  <div className={`guided-ticker-item ${stateInfo.className}`}>
                    <span className="guided-ticker-label">{stateInfo.label}</span>
                    <strong className="guided-ticker-value">{stateInfo.value}</strong>
                  </div>
                );
              })() : null}
            </>
          )}
        </div>
        {!collapsed && breakdownOpen ? (
          <div id="standalone-ticker-breakdown" className="guided-ticker-breakdown" role="region" aria-label="Tax breakdown details" aria-live="polite">
            {activePreview.stateMetrics ? (
              <div className="guided-ticker-breakdown-row guided-ticker-breakdown-state-header">
                <span className="guided-ticker-breakdown-label">Federal</span>
                <span className="guided-ticker-breakdown-value"></span>
              </div>
            ) : null}
            {computeBreakdownRows(metrics).map((row) => (
              <div
                key={row.label}
                className={`guided-ticker-breakdown-row ${row.className ?? ""}`}
              >
                <span className="guided-ticker-breakdown-label">{row.label}</span>
                <span className="guided-ticker-breakdown-value">{row.value}</span>
              </div>
            ))}
            {activePreview.stateMetrics
              ? computeStateBreakdownRows(activePreview.stateMetrics).map((row) => (
                  <div
                    key={row.label}
                    className={`guided-ticker-breakdown-row ${row.className ?? ""}`}
                  >
                    <span className="guided-ticker-breakdown-label">{row.label}</span>
                    <span className="guided-ticker-breakdown-value">{row.value}</span>
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </RetroShell>
    </div>
  );
}
