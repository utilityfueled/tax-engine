"use client";

import { ForeignIncomeDetails } from "./foreign-income-details";
import { NetOperatingLossDetails } from "./net-operating-loss-details";
import { CurrentLossOriginDetails } from "./current-loss-origin-details";
import { CodNolDetails } from "./cod-nol-details";
import { CodPrincipalResidenceDetails } from "./cod-principal-residence-details";
import { K1LossSourceDetails } from "./k1-loss-source-details";
import { Form6198PartIIDetails } from "./form-6198-part-ii-details";
import { ReitPtpLossDetails } from "./reit-ptp-loss-details";
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
import { MovingExpenseDetails } from './moving-expense-details';
import type { EducationDistributionData } from "@/lib/guided-education-distributions";
import { AdjustmentSourceDetails } from "./adjustment-source-details";
import type { InvestmentData } from "@/lib/guided-investment-facts";

export function SectionAdjustments({
  data,
  hasSelfEmployment,
  hasStudentLoans,
  hasHsa,
  filingStatus,
  taxYear,
  educationDistributions,
  foreignIncomeSources,
  healthInsuranceSources,
  marketplacePolicies,
  hasHealthInsurance,
  hasMovingExpenses,
  hasK1LossSources,
  hasSpouse = false,
  investments,
  onClearReitPtpLossSelection,
  onDataChange,
}: {
  data: AdjustmentData | undefined;
  hasSelfEmployment: boolean;
  hasStudentLoans: boolean;
  hasHsa: boolean;
  filingStatus?: FilingStatus | null;
  taxYear?: number | null;
  educationDistributions?: EducationDistributionData;
  foreignIncomeSources?: { sourceId: string; label: string }[];
  healthInsuranceSources?: HealthInsuranceSourceOption[];
  marketplacePolicies?: MarketplacePolicyOption[];
  hasHealthInsurance?: boolean;
  hasMovingExpenses?: boolean;
  hasK1LossSources?: boolean;
  hasSpouse?: boolean;
  investments?: InvestmentData;
  onClearReitPtpLossSelection?: () => void;
  onDataChange: (data: AdjustmentData) => void;
}) {
  // Older or source-only saved sections may omit the legacy aggregate inputs.
  // Keep those amounts unknown (blank) while preserving every actual source.
  const current = { ...emptyAdjustmentData, ...data };

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

        <ForeignIncomeDetails data={current.foreignIncome} sources={foreignIncomeSources} onChange={foreignIncome => onDataChange({ ...current, foreignIncome })} />
        <NetOperatingLossDetails data={current.netOperatingLossSources} onChange={netOperatingLossSources => onDataChange({ ...(data ?? emptyAdjustmentData), netOperatingLossSources })} />
        <ReitPtpLossDetails data={current.reitPtpLossSource} taxYear={taxYear} onClearSelection={onClearReitPtpLossSelection}
          onChange={reitPtpLossSource => onDataChange({ ...current, reitPtpLossSource })} />
        <K1LossSourceDetails data={current.k1LossSources} nol={current.netOperatingLossSources} onChange={k1LossSources => onDataChange({ ...current, k1LossSources })} />
        {((taxYear === 2026 && hasK1LossSources) || current.form6198PartII !== undefined) && <Form6198PartIIDetails
          data={current.form6198PartII} taxYear={taxYear} spouseEligible={filingStatus === 'mfj' && hasSpouse}
          onChange={form6198PartII => onDataChange({ ...current, form6198PartII })} />}
        <CodNolDetails data={current.codNolSources} onChange={codNolSources => onDataChange({ ...current, codNolSources })} />
        <CodPrincipalResidenceDetails data={current.codPrincipalResidenceSources} taxYear={taxYear} onChange={codPrincipalResidenceSources => onDataChange({ ...current, codPrincipalResidenceSources })} />
        <CurrentLossOriginDetails data={current.currentLossOrigin} investments={investments} k1Sources={current.k1LossSources?.activities?.map((source, index) => [`scheduleK1:${index}`, `K-1 ${index + 1}: ${source.entityName?.trim() || "Original entity name required"}`])} onChange={currentLossOrigin => onDataChange({ ...(data ?? emptyAdjustmentData), currentLossOrigin })} />

        <EducatorSourceDetails sources={current.educatorExpenseSources} taxYear={taxYear} onChange={educatorExpenseSources => onDataChange({ ...current, educatorExpenseSources })} />

        {(hasMovingExpenses || current.movingExpenses !== undefined || current.movingExpensesNotApplicable) && (
          <MovingExpenseDetails
            data={current.movingExpenses}
            removed={current.movingExpensesNotApplicable === true}
            taxYear={taxYear}
            filingStatus={filingStatus}
            hasSpouse={hasSpouse}
            onChange={movingExpenses => onDataChange({
              ...current,
              movingExpenses,
              movingExpensesNotApplicable: movingExpenses === undefined ? true : undefined,
            })}
          />
        )}

        {(hasHsa || current.hsaAccounts?.length || current.hsaDeduction.trim()) && <HsaSourceDetails data={current} filingStatus={filingStatus} taxYear={taxYear} onChange={onDataChange} />}

        <details className="guided-expand">
          <summary className="guided-expand-trigger">More adjustments</summary>
          <div className="guided-expand-body">
            <AdjustmentSourceDetails data={current} filingStatus={filingStatus} taxYear={taxYear} onChange={onDataChange} />
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
