"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type AdjustmentData,
  emptyAdjustmentData,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";

export function SectionAdjustments({
  data,
  hasSelfEmployment,
  hasStudentLoans,
  hasHsa,
  onDataChange,
}: {
  data: AdjustmentData | undefined;
  hasSelfEmployment: boolean;
  hasStudentLoans: boolean;
  hasHsa: boolean;
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
          {hasHsa && (
            <CurrencyField
              label="HSA deduction"
              hint="Your contributions to a Health Savings Account (not employer contributions)."
              value={current.hsaDeduction}
              onChange={(v) => update("hsaDeduction", v)}
            />
          )}

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

          <CurrencyField
            label="Educator expenses"
            hint="Up to $300 ($600 MFJ if both are educators). Books, supplies, etc."
            value={current.educatorExpenses}
            onChange={(v) => update("educatorExpenses", v)}
          />
        </div>

        <details className="guided-expand">
          <summary className="guided-expand-trigger">More adjustments</summary>
          <div className="guided-expand-body">
            <div className="guided-form-grid">
              <CurrencyField
                label="IRA deduction"
                hint="Deductible traditional IRA contributions."
                value={current.iraDeduction}
                onChange={(v) => update("iraDeduction", v)}
              />
              <CurrencyField
                label="Alimony paid"
                hint="Only for divorce agreements finalized before 2019."
                value={current.alimonyPaid}
                onChange={(v) => update("alimonyPaid", v)}
              />
            </div>
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
