"use client";

import { HealthInsuranceSourceDetails } from "./health-insurance-source-details";
import type { HealthInsuranceSourceOption } from "@/lib/guided-health-insurance-facts";
import type { MarketplacePolicyOption } from "@/lib/guided-marketplace-health-facts";
import { RetroShell } from "@/components/retro-shell";
import {
  type AdjustmentData,
  type FilingStatus,
  emptyAdjustmentData,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { HsaSourceDetails } from "./hsa-source-details";
import { EducatorSourceDetails } from "./educator-source-details";
import { StudentLoanSourceDetails } from "./student-loan-source-details";
import type { EducationDistributionData } from "@/lib/guided-education-distributions";
import { AdjustmentSourceDetails } from "./adjustment-source-details";

export function SectionAdjustments({
  data,
  hasSelfEmployment,
  hasStudentLoans,
  hasHsa,
  filingStatus,
  taxYear,
  educationDistributions,
  healthInsuranceSources,
  marketplacePolicies,
  hasHealthInsurance,
  onDataChange,
}: {
  data: AdjustmentData | undefined;
  hasSelfEmployment: boolean;
  hasStudentLoans: boolean;
  hasHsa: boolean;
  filingStatus?: FilingStatus | null;
  taxYear?: number | null;
  educationDistributions?: EducationDistributionData;
  healthInsuranceSources?: HealthInsuranceSourceOption[];
  marketplacePolicies?: MarketplacePolicyOption[];
  hasHealthInsurance?: boolean;
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


          {current.studentLoanInterest.trim() && (
            <CurrencyField
              label="Saved student-loan gross interest"
              hint="Reconcile this saved total with actual source records below. Eligibility and income limits determine the allowed deduction."
              value={current.studentLoanInterest}
              onChange={(v) => update("studentLoanInterest", v)}
            />
          )}

          {current.selfEmployedHealthInsurance.trim() && (
            <CurrencyField
              label="Saved health insurance premiums"
              hint="Reconcile this saved amount with actual owner and business paid premium shares below. It does not establish the allowed deduction."
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

        {(hasStudentLoans || current.studentLoanFacts || current.studentLoanInterest.trim()) && <StudentLoanSourceDetails data={current.studentLoanFacts} filingStatus={filingStatus} educationDistributions={educationDistributions} onChange={studentLoanFacts => onDataChange({ ...current, studentLoanFacts })} />}

        {(hasHealthInsurance || hasSelfEmployment || healthInsuranceSources?.length || current.healthInsuranceFacts || current.selfEmployedHealthInsurance.trim()) && <HealthInsuranceSourceDetails data={current.healthInsuranceFacts} sources={healthInsuranceSources} marketplacePolicies={marketplacePolicies} onChange={healthInsuranceFacts => onDataChange({ ...current, healthInsuranceFacts })} />}

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
