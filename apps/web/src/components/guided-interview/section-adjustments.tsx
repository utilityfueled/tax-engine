"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type AdjustmentData,
  type FilingStatus,
  emptyAdjustmentData,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { HsaSourceDetails } from "./hsa-source-details";
import { EducatorSourceDetails } from "./educator-source-details";
import { AdjustmentSourceDetails } from "./adjustment-source-details";

export function SectionAdjustments({
  data,
  hasSelfEmployment,
  hasStudentLoans,
  hasHsa,
  filingStatus,
  taxYear,
  onDataChange,
}: {
  data: AdjustmentData | undefined;
  hasSelfEmployment: boolean;
  hasStudentLoans: boolean;
  hasHsa: boolean;
  filingStatus?: FilingStatus | null;
  taxYear?: number | null;
  onDataChange: (data: AdjustmentData) => void;
}) {
  const current = data ?? emptyAdjustmentData;

  function update(field: keyof AdjustmentData, value: string) {
    onDataChange({ ...current, [field]: value });
  }

  return (
    <RetroShell title="Adjustments to Income" eyebrow="ADJUSTMENTS">
      <div className="guided-question">
        <p className="guided-prompt">These reduce your taxable income before deductions.</p>
        <p className="guided-hint">
          Also called &quot;above-the-line&quot; deductions, these lower your AGI which can
          unlock other tax benefits. Only fill in the ones that apply to you.
        </p>

        <div className="guided-form-grid">


          {hasStudentLoans && (
            <CurrencyField
              label="Student loan interest"
              hint="Up to $2,500. From Form 1098-E Box 1."
              value={current.studentLoanInterest}
              onChange={(v) => update("studentLoanInterest", v)}
            />
          )}

          {hasSelfEmployment && (
            <CurrencyField
              label="Self-employed health insurance"
              hint="Premiums you paid for yourself, spouse, and dependents."
              value={current.selfEmployedHealthInsurance}
              onChange={(v) => update("selfEmployedHealthInsurance", v)}
            />
          )}

          {current.educatorExpenses.trim() && <CurrencyField
            label="Saved educator net-expense amount"
            hint="Retained from the earlier interview. Reconcile this amount with actual net source expenses below. It does not establish an educator's eligibility."
            value={current.educatorExpenses}
            onChange={(v) => update("educatorExpenses", v)}
          />}
        </div>

        <EducatorSourceDetails sources={current.educatorExpenseSources} taxYear={taxYear} onChange={educatorExpenseSources => onDataChange({ ...current, educatorExpenseSources })} />

        {(hasHsa || current.hsaAccounts?.length || current.hsaDeduction.trim()) && <HsaSourceDetails data={current} filingStatus={filingStatus} taxYear={taxYear} onChange={onDataChange} />}

        <details className="guided-expand">
          <summary className="guided-expand-trigger">More adjustments</summary>
          <div className="guided-expand-body">
            <AdjustmentSourceDetails data={current} filingStatus={filingStatus} onChange={onDataChange} />
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
