"use client";

import { HouseholdSourceDetails } from "./household-source-details";
import { NiitSourceDetails } from "./niit-source-details";
import { RetroShell } from "@/components/retro-shell";
import { formatGuidedCurrency, parseGuidedDisplayAmount } from "@/lib/guided-currency";
import type { GuidedPreviewMetrics } from "@/lib/guided-interview-bridge";
import {
  type OtherTaxesData,
  type RetirementEntryData,
  emptyOtherTaxesData,
} from "@/lib/guided-interview-flow";

function InfoCard({
  label,
  amount,
  description,
  acknowledged,
  onAcknowledge,
}: {
  label: string;
  amount: string | undefined;
  description: string;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  const known = amount !== undefined && parseGuidedDisplayAmount(amount).isFinite();
  const applies = known && parseGuidedDisplayAmount(amount).gt(0);

  return (
    <div className="guided-w2-card">
      <div className="guided-w2-card-header">
        <h3 className="guided-w2-card-title">{label}</h3>
        <span className={`guided-field-badge ${applies ? "guided-field-badge-active" : ""}`}>
          {known ? formatGuidedCurrency(amount) : "Awaiting calculation"}
        </span>
      </div>
      <p className="guided-hint" style={{ margin: "0.25rem 0 0.5rem" }}>
        {!known ? "Complete the required facts to calculate this tax." : applies ? description : "The current engine result for this tax is zero."}
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
  retirementEntries,
  onDataChange,
}: {
  data: OtherTaxesData | undefined;
  hasSelfEmployment: boolean;
  hasInvestments: boolean;
  guidedPreview: GuidedPreviewMetrics | null;
  retirementEntries?: RetirementEntryData[];
  onDataChange: (data: OtherTaxesData) => void;
}) {
  const current = data ?? emptyOtherTaxesData;

  return (
    <RetroShell title="Other Taxes" eyebrow="OTHER TAXES">
      <div className="guided-question">
        <p className="guided-prompt">
          Review additional taxes and complete any source worksheets that apply.
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
                amount={guidedPreview?.selfEmploymentTax}
                description="15.3% of net self-employment earnings (12.4% Social Security + 2.9% Medicare). Half is deductible as an adjustment to income."
                acknowledged={current.acknowledgedSETax}
                onAcknowledge={(v) => onDataChange({ ...current, acknowledgedSETax: v })}
              />
            )}

            <InfoCard
              label="Additional Medicare Tax"
              amount={guidedPreview?.additionalMedicareTax}
              description="Additional Medicare Tax on earned income above the threshold for your filing status. Employer withholding is reconciled separately."
              acknowledged={current.acknowledgedAdditionalMedicare}
              onAcknowledge={(v) => onDataChange({ ...current, acknowledgedAdditionalMedicare: v })}
            />

            {hasInvestments && (
              <InfoCard
                label="Net Investment Income Tax (NIIT)"
                amount={guidedPreview?.netInvestmentIncomeTax}
                description="3.8% surtax on net investment income when your MAGI exceeds $200,000 (single) or $250,000 (MFJ)."
                acknowledged={current.acknowledgedNIIT}
                onAcknowledge={(v) => onDataChange({ ...current, acknowledgedNIIT: v })}
              />
            )}
          </div>
        </fieldset>

        <NiitSourceDetails data={current.niitSources} entries={retirementEntries} onChange={niitSources => onDataChange({ ...current, niitSources })} />

        <details className="guided-expand">
          <summary className="guided-expand-trigger">Household employment tax</summary>
          <div className="guided-expand-body">
            <p className="guided-hint" style={{ marginBottom: "0.75rem" }}>
              Household employment tax depends on each employee&apos;s wages and
              the applicable tax-year rules. Supply complete employee facts for Schedule H.
            </p>
            <HouseholdSourceDetails data={current} onChange={onDataChange} />
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
