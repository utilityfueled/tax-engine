"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type DeductionData,
  type DeductionMethod,
  type FilingStatus,
  computeDeductionComparison,
  emptyDeductionData,
  getStandardDeductionAmount,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { DeductionSourceDetails } from "./deduction-source-details";
import { formatGuidedCurrency, parseGuidedDisplayAmount } from "@/lib/guided-currency";

const formatUsd = formatGuidedCurrency;

export function SectionDeductions({
  data,
  filingStatus,
  taxYear,
  onDataChange,
}: {
  data: DeductionData | undefined;
  filingStatus: FilingStatus | null;
  taxYear?: number | null;
  onDataChange: (data: DeductionData) => void;
}) {
  const current = data ?? emptyDeductionData;
  const standardAmount = getStandardDeductionAmount(filingStatus, taxYear);
  let comparison: ReturnType<typeof computeDeductionComparison> | null = null;
  try { comparison = computeDeductionComparison(filingStatus, current, taxYear); }
  catch { /* Incomplete edits stay visible and are validated before calculation. */ }

  function setMethod(method: DeductionMethod) {
    onDataChange({ ...current, method });
  }

  function update(field: keyof DeductionData, value: string) {
    onDataChange({ ...current, [field]: value });
  }

  return (
    <RetroShell title="Deductions" eyebrow="DEDUCTIONS">
      <div className="guided-question">
        <p className="guided-prompt">Standard or itemized deduction?</p>
        <p className="guided-hint">
          Most filers take the standard deduction. Itemizing makes sense if your total
          deductible expenses (mortgage interest, state taxes, charity, etc.) exceed the
          standard amount. We&apos;ll help you compare.
        </p>

        {standardAmount > 0 && (
          <div className="guided-deduction-standard-callout">
            Base standard deduction before age, blindness or dependent adjustments: <strong>{formatUsd(standardAmount)}</strong> based on your filing status.
          </div>
        )}

        <fieldset className="guided-fieldset" role="radiogroup" aria-label="Deduction method">
          <div className="guided-option-list">
            <label
              className={`guided-option-card ${current.method === "standard" ? "guided-option-card-selected" : ""}`}
            >
              <input
                type="radio"
                name="deduction-method"
                value="standard"
                checked={current.method === "standard"}
                onChange={() => setMethod("standard")}
                className="guided-option-radio"
              />
              <span className="guided-option-label">
                Standard deduction{standardAmount > 0 ? ` (${formatUsd(standardAmount)})` : ""}
              </span>
              <span className="guided-option-description">
                The IRS sets a flat amount based on your filing status. No receipts needed.
              </span>
            </label>
            <label
              className={`guided-option-card ${current.method === "itemized" ? "guided-option-card-selected" : ""}`}
            >
              <input
                type="radio"
                name="deduction-method"
                value="itemized"
                checked={current.method === "itemized"}
                onChange={() => setMethod("itemized")}
                className="guided-option-radio"
              />
              <span className="guided-option-label">Itemize deductions</span>
              <span className="guided-option-description">
                List specific expenses on Schedule A. Choose this if your total exceeds the standard deduction.
              </span>
            </label>
          </div>
        </fieldset>

        {current.method === "standard" && taxYear === 2026 && <DeductionSourceDetails data={current} onChange={onDataChange} includeMortgages={false} />}

        <CurrencyField label="Gambling winnings not already reported on an entered W-2G" hint="Enter actual winnings regardless of deduction method. Enter 0 only when known to be zero." value={current.gamblingWinnings ?? ""} onChange={(value) => update("gamblingWinnings", value)} />
        <CurrencyField label="Non-W-2 withholding already deducted on other schedules" hint="Enter the actual part of state or local withholding from your entered non-W-2 forms that is already deducted on Schedule C, E or F. Enter 0 only after checking. The source withholding is counted separately; do not add it again to additional income taxes." value={current.nonW2IncomeTaxesDeductedElsewhere ?? ""} onChange={value => update("nonW2IncomeTaxesDeductedElsewhere", value)} />

        {current.method === "itemized" && (
          <div className="guided-w2-card" style={{ marginTop: "16px" }}>
            <div className="guided-w2-card-header">
              <h3 className="guided-w2-card-title">Schedule A &mdash; Itemized Deductions</h3>
            </div>

            <CurrencyField
              label="Medical and dental expenses"
              hint="Only the amount exceeding 7.5% of your AGI is deductible."
              value={current.medicalExpenses}
              onChange={(v) => update("medicalExpenses", v)}
            />

            <div className="guided-form-grid">
              <CurrencyField
                label="Additional state and local income taxes paid"
                hint="Only amounts paid during this tax year, excluding withholding and estimates already entered elsewhere."
                value={current.stateLocalTaxes}
                onChange={(v) => update("stateLocalTaxes", v)}
              />
              <CurrencyField
                label="Real estate taxes"
                hint="Qualified real estate taxes paid this year, excluding amounts already reported on an entered Form 1098."
                value={current.realEstateTaxes}
                onChange={(v) => update("realEstateTaxes", v)}
              />
              <CurrencyField label="Personal property taxes" hint="Only the annual tax based on property value, such as the value-based part of vehicle registration." value={current.personalPropertyTaxes ?? ""} onChange={(value) => update("personalPropertyTaxes", value)} />
            </div>

            <DeductionSourceDetails data={current} onChange={onDataChange} />

            <details className="guided-expand">
              <summary className="guided-expand-trigger">Less common itemized deductions</summary>
              <div className="guided-expand-body">
                <fieldset className="guided-fieldset">
                  <legend className="sr-only">Less common itemized deductions</legend>
                  <CurrencyField
                    label="Casualty and theft losses"
                    hint="A saved total is insufficient. Calculation requires the specific Form 4684 event, property and reimbursement facts; this guided branch is not yet supported."
                    value={current.casualtyLosses}
                    onChange={(v) => update("casualtyLosses", v)}
                  />
                  <CurrencyField label="Investment interest expense" hint="Interest on money borrowed for taxable investments. The engine applies the Form 4952 investment-income limit." value={current.investmentInterestExpense ?? ""} onChange={(value) => update("investmentInterestExpense", value)} />
                  <CurrencyField label="Wagering losses" hint="Enter actual losses supported by records. The engine applies the year's deduction limit against winnings." value={current.gamblingLosses ?? ""} onChange={(value) => update("gamblingLosses", value)} />
                  {current.otherItemized.trim() && <CurrencyField label="Saved other-deduction total to reconcile" hint="Classify this total in the investment-interest and wagering-loss fields. Other deductions require their specific supporting forms." value={current.otherItemized} onChange={(value) => update("otherItemized", value)} />}
                </fieldset>
              </div>
            </details>

            {!comparison && <p className="guided-hint" role="status">Correct incomplete amounts to compare your expenses.</p>}
            {comparison && parseGuidedDisplayAmount(comparison.itemizedTotal).gt(0) && (
              <div className="guided-deduction-comparison" style={{ marginTop: "16px" }} role="status" aria-live="polite">
                <div className="guided-ticker-grid">
                  <div className="guided-ticker-item">
                    <span className="guided-ticker-label">Expenses entered</span>
                    <strong className="guided-ticker-value">
                      {formatUsd(comparison.itemizedTotal)}
                    </strong>
                  </div>
                  {standardAmount > 0 && (
                    <div className="guided-ticker-item">
                      <span className="guided-ticker-label">Standard Deduction</span>
                      <strong className="guided-ticker-value">
                        {formatUsd(standardAmount)}
                      </strong>
                    </div>
                  )}
                </div>

                <p className="guided-hint">These are reported amounts before payment allocations, tax limits and income-based adjustments. The calculation determines the deductible amount after all required facts are confirmed.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </RetroShell>
  );
}
