"use client";

import { CurrencyField } from "@/components/guided-interview/currency-field";
import { RetroShell } from "@/components/retro-shell";
import type { GuidedPreviewMetrics } from "@/lib/guided-interview-bridge";
import {
  type OtherTaxesData,
  emptyOtherTaxesData,
} from "@/lib/guided-interview-flow";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCurrency(value: string | undefined) {
  if (!value) return "$0";
  const num = Number(value);
  if (Number.isNaN(num)) return "$0";
  return currencyFormatter.format(num);
}

function InfoCard({
  label,
  amount,
  description,
  acknowledged,
  onAcknowledge,
}: {
  label: string;
  amount: string;
  description: string;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  const numAmount = Number(amount);
  const applies = !Number.isNaN(numAmount) && numAmount > 0;

  return (
    <div className="guided-w2-card">
      <div className="guided-w2-card-header">
        <h3 className="guided-w2-card-title">{label}</h3>
        <span className={`guided-field-badge ${applies ? "guided-field-badge-active" : ""}`}>
          {applies ? formatCurrency(amount) : "N/A"}
        </span>
      </div>
      <p className="guided-hint" style={{ margin: "0.25rem 0 0.5rem" }}>
        {applies ? description : "Based on your entries, this tax does not apply."}
      </p>
      {applies && (
        <label className="guided-checkbox-field">
          <input
            type="checkbox"
            className="guided-option-checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledge(e.target.checked)}
          />
          <span>I understand this tax applies</span>
        </label>
      )}
    </div>
  );
}

export function SectionOtherTaxes({
  data,
  hasSelfEmployment,
  hasInvestments,
  guidedPreview,
  onDataChange,
}: {
  data: OtherTaxesData | undefined;
  hasSelfEmployment: boolean;
  hasInvestments: boolean;
  guidedPreview: GuidedPreviewMetrics | null;
  onDataChange: (data: OtherTaxesData) => void;
}) {
  const current = data ?? emptyOtherTaxesData;

  // Extract SE tax and other tax amounts from the preview.
  // These are computed automatically by the engine from the user's income data.
  const totalTax = Number(guidedPreview?.totalTax ?? "0");
  const totalIncome = Number(guidedPreview?.totalIncome ?? "0");

  // Self-employment tax estimate: ~15.3% of 92.35% of net SE income.
  // We show an approximate indicator — the engine computes the exact amount.
  const seTaxEstimateLabel = hasSelfEmployment && totalTax > 0
    ? "Included in your total tax"
    : "0";

  // Additional Medicare: 0.9% on earned income over $200k (single) / $250k (MFJ)
  const additionalMedicareApplies = totalIncome > 200000;
  const additionalMedicareLabel = additionalMedicareApplies
    ? "Included in your total tax"
    : "0";

  // NIIT: 3.8% on net investment income if MAGI > threshold
  const niitApplies = hasInvestments && totalIncome > 200000;
  const niitLabel = niitApplies ? "Included in your total tax" : "0";

  return (
    <RetroShell title="Other Taxes" eyebrow="OTHER TAXES">
      <div className="guided-question">
        <p className="guided-prompt">
          These taxes are computed automatically from the income you&apos;ve already entered.
        </p>
        <p className="guided-hint">
          Review each item below. The engine calculates the exact amounts — these
          indicators show which taxes apply to your situation.
        </p>

        <fieldset className="guided-fieldset">
          <legend className="sr-only">Automatically computed taxes</legend>
          <div className="guided-w2-stack">
            {hasSelfEmployment && (
              <InfoCard
                label="Self-Employment Tax (Schedule SE)"
                amount={seTaxEstimateLabel}
                description="15.3% of net self-employment earnings (12.4% Social Security + 2.9% Medicare). Half is deductible as an adjustment to income."
                acknowledged={current.acknowledgedSETax}
                onAcknowledge={(v) => onDataChange({ ...current, acknowledgedSETax: v })}
              />
            )}

            <InfoCard
              label="Additional Medicare Tax"
              amount={additionalMedicareLabel}
              description="0.9% surtax on earned income above the threshold ($200,000 single, $250,000 MFJ). Your employer doesn't withhold this automatically."
              acknowledged={current.acknowledgedAdditionalMedicare}
              onAcknowledge={(v) => onDataChange({ ...current, acknowledgedAdditionalMedicare: v })}
            />

            {hasInvestments && (
              <InfoCard
                label="Net Investment Income Tax (NIIT)"
                amount={niitLabel}
                description="3.8% surtax on net investment income when your MAGI exceeds $200,000 (single) or $250,000 (MFJ)."
                acknowledged={current.acknowledgedNIIT}
                onAcknowledge={(v) => onDataChange({ ...current, acknowledgedNIIT: v })}
              />
            )}
          </div>
        </fieldset>

        <details className="guided-expand">
          <summary className="guided-expand-trigger">Household employment tax</summary>
          <div className="guided-expand-body">
            <p className="guided-hint" style={{ marginBottom: "0.75rem" }}>
              If you paid a household employee (nanny, housekeeper, etc.) $2,700 or more
              in 2025, you may owe household employment tax (Schedule H).
            </p>
            <CurrencyField
              label="Total wages paid to household employees"
              hint="Leave blank if you didn't pay any household employees."
              value={current.householdEmploymentWages}
              onChange={(v) => onDataChange({ ...current, householdEmploymentWages: v })}
            />
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
