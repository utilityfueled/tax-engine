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

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatUsd(amount: number): string {
  return currencyFormatter.format(amount);
}

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
  const comparison = computeDeductionComparison(filingStatus, current, taxYear);

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
                label="State and local income taxes"
                hint="W-2 Box 17 amounts are already included from your W-2 entries."
                value={current.stateLocalTaxes}
                onChange={(v) => update("stateLocalTaxes", v)}
              />
              <CurrencyField
                label="Real estate taxes"
                value={current.realEstateTaxes}
                onChange={(v) => update("realEstateTaxes", v)}
              />
            </div>

            <DeductionSourceDetails data={current} onChange={onDataChange} />

            <details className="guided-expand">
              <summary className="guided-expand-trigger">Less common itemized deductions</summary>
              <div className="guided-expand-body">
                <fieldset className="guided-fieldset">
                  <legend className="sr-only">Less common itemized deductions</legend>
                  <CurrencyField
                    label="Casualty and theft losses"
                    hint="Only federally declared disaster losses are deductible."
                    value={current.casualtyLosses}
                    onChange={(v) => update("casualtyLosses", v)}
                  />
                  <CurrencyField
                    label="Other itemized deductions"
                    hint="Gambling losses (up to winnings), investment interest, etc."
                    value={current.otherItemized}
                    onChange={(v) => update("otherItemized", v)}
                  />
                </fieldset>
              </div>
            </details>

            {comparison.itemizedTotal > 0 && (
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

                <p className="guided-hint">These are expenses before tax limits and income-based adjustments. The calculation determines the deductible amount after all required facts are confirmed.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </RetroShell>
  );
}
