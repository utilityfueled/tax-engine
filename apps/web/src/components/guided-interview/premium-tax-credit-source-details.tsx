"use client";
import type { HealthInsuranceData } from "@/lib/guided-health-insurance-facts";

import { emptyMarketplaceCoverageMonth, emptyMarketplaceMonth, emptyPremiumTaxCreditFacts, type PremiumTaxCreditData } from "@/lib/guided-premium-tax-credit-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";
import type { FilingStatus, PersonalInfoData } from "@/lib/guided-interview-flow";
import { guidedSourceValuesChanged } from "@/lib/guided-source-confirmation";
import { SharedPolicyOriginalDetails, SharedPolicySourceDetails } from "./shared-policy-source-details";
import { MarriagePolicySourceDetails } from "./marriage-policy-source-details";
import { invalidateSharedPolicySources } from "@/lib/guided-shared-policy";
import { invalidateMarriageSources } from "@/lib/guided-marriage-policy";

function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{choices.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((name, index) => [String(index + 1), name] as const);
const coverageFlags = [
  ["allocationRequired", "Shared policy allocation is required"], ["alternativeMarriageCalculationElected", "Alternative marriage calculation elected"],
  ["selfEmployedHealthInsuranceCoordinationRequired", "Self-employed health insurance coordination is required"], ["qsehraAffected", "QSEHRA affects this coverage"],
  ["lawfulPresenceReconciliationRequired", "Lawful-presence premium allocation is required"], ["coverageFactsConfirmed", "Monthly coverage worksheet checked"],
] as const;
export function PremiumTaxCreditSourceDetails({ data, personal, filingStatus, taxYear, healthInsurance, onChange }: { healthInsurance?: HealthInsuranceData; data?: PremiumTaxCreditData; personal?: PersonalInfoData; filingStatus?: FilingStatus | null; taxYear?: number | null; onChange: (data: PremiumTaxCreditData | undefined) => void }) {
  if (!data) return <section><h4>Marketplace coverage and premium tax credit</h4><p className="guided-hint">Use your original Forms1095-A and the actual household coverage worksheet. Advance credits must be reconciled even when no additional credit is allowed.</p><button type="button" onClick={() => onChange({ ...emptyPremiumTaxCreditFacts, policies: [], monthlyReconciliation: [] })}>Add Marketplace coverage worksheet</button></section>;
  const update = (patch: Partial<PremiumTaxCreditData>) => {
    const next = { ...data, ...patch };
    if (guidedSourceValuesChanged(data, next)) {
      next.sourceFactsConfirmed = null;
      if (next.marriageSources) next.marriageSources = invalidateMarriageSources(next.marriageSources);
      if (next.sharedPolicyAllocations) next.sharedPolicyAllocations = invalidateSharedPolicySources(next.sharedPolicyAllocations);
    }
    onChange(next);
  };
  return <section><h4>Marketplace coverage and premium tax credit</h4>
    <p className="guided-hint">Enter actual source amounts, including zero when established. Keep the statement's original benchmark separate from the corrected household benchmark. Use the <a href="https://www.irs.gov/instructions/i8962" target="_blank" rel="noreferrer">Form8962 instructions</a> for coverage-family eligibility, exceptions and required-filing dependent income. The return calculates your modified AGI.</p>
    <div className="guided-form-grid">
      <TextFact label="Marketplace worksheet tax year" value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label="Marketplace worksheet reference" value={data.sourceReference} onChange={sourceReference => update({ sourceReference })} />
      <BooleanFact label="All original Marketplace policies are included" value={data.allPoliciesIncluded} onChange={allPoliciesIncluded => update({ allPoliciesIncluded })} />
      <TextFact label="Actual tax family size" value={data.taxFamilySize} onChange={taxFamilySize => update({ taxFamilySize })} />
      <Choice label="Poverty guideline region" value={data.fplRegion} choices={[["contiguous", "48 states and District of Columbia"], ["alaska", "Alaska"], ["hawaii", "Hawaii"]]} onChange={fplRegion => update({ fplRegion: fplRegion as PremiumTaxCreditData["fplRegion"] })} />
      <CurrencyField allowNegative label="Required-filing dependents' modified AGI" value={data.requiredFilingDependentsModifiedAGI} onChange={requiredFilingDependentsModifiedAGI => update({ requiredFilingDependentsModifiedAGI })} />
      <BooleanFact label="You or your joint-return spouse can be claimed as a dependent" value={data.canBeClaimedAsDependent} onChange={canBeClaimedAsDependent => update({ canBeClaimedAsDependent })} />
      <BooleanFact label="Married-filing-separately exception established" value={data.marriedFilingSeparatelyExceptionConfirmed} onChange={marriedFilingSeparatelyExceptionConfirmed => update({ marriedFilingSeparatelyExceptionConfirmed })} />
      <Choice label="Below-poverty exception" value={data.belowPovertyException} choices={[["none", "No exception"], ["marketplace_estimate", "Marketplace income-estimate exception"], ["lawfully_present_ineligible_medicaid", "Lawfully present and ineligible for Medicaid (2025 rule)"]]} onChange={belowPovertyException => update({ belowPovertyException: belowPovertyException as PremiumTaxCreditData["belowPovertyException"] })} />
      {(data.belowPovertyException === "marketplace_estimate" || data.marketplaceEstimatedIncomeWithinEligibilityRange != null) && <BooleanFact label="Marketplace estimated income met the eligibility range" value={data.marketplaceEstimatedIncomeWithinEligibilityRange} onChange={marketplaceEstimatedIncomeWithinEligibilityRange => update({ marketplaceEstimatedIncomeWithinEligibilityRange })} />}
      {(data.belowPovertyException === "marketplace_estimate" || data.marketplaceInformationAccurate != null) && <BooleanFact label="Marketplace information was accurate" value={data.marketplaceInformationAccurate} onChange={marketplaceInformationAccurate => update({ marketplaceInformationAccurate })} />}
      <BooleanFact label="Household eligibility worksheet checked" value={data.householdFactsConfirmed} onChange={householdFactsConfirmed => update({ householdFactsConfirmed })} />
      {coverageFlags.map(([field, label]) => <BooleanFact key={field} label={label} value={data[field]} onChange={value => update({ [field]: value })} />)}
    </div>
    <p className="guided-hint">Shared-policy allocations have their own source worksheet below. The marriage-year alternative has its own source worksheet below. Other allocation combinations and lawful-presence allocation retain their separate calculation requirements.</p>
    {data.policies.map((policy, policyIndex) => {
      const prefix = `Policy ${policyIndex + 1}`;
      const set = (patch: Partial<typeof policy>) => update({ policies: data.policies.map((current, index) => index === policyIndex ? { ...current, ...patch } : current) });
      return <fieldset key={policyIndex}><legend>{prefix}: Original Form1095-A</legend><div className="guided-form-grid">
        <TextFact label={`${prefix}: Statement tax year`} value={policy.taxYear} onChange={taxYear => set({ taxYear })} />
        <TextFact label={`${prefix}: Marketplace name`} value={policy.marketplace} onChange={marketplace => set({ marketplace })} />
        <TextFact label={`${prefix}: Policy number`} value={policy.policyNumber} onChange={policyNumber => set({ policyNumber })} />
      </div>
        {(data.allocationRequired === true || data.alternativeMarriageCalculationElected === true || data.selfEmployedHealthInsuranceCoordinationRequired === true || policy.recipientName !== undefined || policy.recipientSsn !== undefined || policy.coveredIndividuals !== undefined) && <SharedPolicyOriginalDetails policy={policy} prefix={prefix} onChange={set} />}
        {policy.monthlyPremiums.map((row, rowIndex) => {
          const label = `${prefix} month ${rowIndex + 1}`;
          const setRow = (patch: Partial<typeof row>) => set({ monthlyPremiums: policy.monthlyPremiums.map((current, index) => index === rowIndex ? { ...current, ...patch } : current) });
          return <div className="guided-form-grid" key={rowIndex}><Choice label={`${label}: Month`} value={row.month} choices={months} onChange={month => setRow({ month })} />
            {([["enrolleePremium", "Original enrollment premium"], ["slcsp", "Original SLCSP premium"], ["advancePremiumTaxCredit", "Original advance credit"]] as const).filter(([field]) => field !== "slcsp" || row.slcspReportedBlank !== true).map(([field, text]) => <CurrencyField key={field} label={`${label}: ${text}`} value={row[field]} onChange={value => setRow({ [field]: value })} />)}
            {(data.allocationRequired === true || data.selfEmployedHealthInsuranceCoordinationRequired === true || row.slcspReportedBlank !== undefined) && <BooleanFact label={`${label}: Original SLCSP box is printed blank`} value={row.slcspReportedBlank} onChange={slcspReportedBlank => setRow({ slcspReportedBlank, ...(slcspReportedBlank === true ? { slcsp: "" } : {}) })} />}
            <button type="button" onClick={() => set({ monthlyPremiums: policy.monthlyPremiums.filter((_, index) => index !== rowIndex) })}>{label}: Remove original month</button>
          </div>;
        })}
        <button type="button" onClick={() => set({ monthlyPremiums: [...policy.monthlyPremiums, { ...emptyMarketplaceMonth }] })}>{prefix}: Add original month</button>
        <button type="button" onClick={() => update({ policies: data.policies.filter((_, index) => index !== policyIndex) })}>{prefix}: Remove policy</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => update({ policies: [...data.policies, { taxYear: "", marketplace: "", policyNumber: "", monthlyPremiums: [] }] })}>Add original Marketplace policy</button>
    {(data.allocationRequired === true || data.sharedPolicyAllocations !== undefined) && <SharedPolicySourceDetails healthInsurance={healthInsurance} data={data} personal={personal} filingStatus={filingStatus} taxYear={taxYear} onChange={update} />}
    {(data.alternativeMarriageCalculationElected === true || data.marriageSources !== undefined) && <MarriagePolicySourceDetails healthInsurance={healthInsurance} data={data} personal={personal} filingStatus={filingStatus} onChange={update} />}
    <h5>Actual household monthly reconciliation</h5><p className="guided-hint">Use one actual household row for each source month. Do not add duplicate benchmark amounts from several policies. Confirm minimum essential coverage, employer offers, paid premiums and other eligibility facts before answering.</p>
    {data.monthlyReconciliation.map((row, rowIndex) => {
      const prefix = `Coverage month ${rowIndex + 1}`;
      const set = (patch: Partial<typeof row>) => update({ monthlyReconciliation: data.monthlyReconciliation.map((current, index) => index === rowIndex ? { ...current, ...patch } : current) });
      return <fieldset key={rowIndex}><legend>{prefix}</legend><div className="guided-form-grid">
        <Choice label={`${prefix}: Month`} value={row.month} choices={months} onChange={month => set({ month })} />
        {([["enrolleePremium", "Eligible enrollment premium"], ["slcsp", "Corrected household SLCSP premium"], ["advancePremiumTaxCredit", "Reconciled advance credit"]] as const).map(([field, label]) => <CurrencyField key={field} label={`${prefix}: ${label}`} value={row[field]} onChange={value => set({ [field]: value })} />)}
        <BooleanFact label={`${prefix}: Coverage is eligible for the credit`} value={row.coverageEligible} onChange={coverageEligible => set({ coverageEligible })} />
        <BooleanFact label={`${prefix}: Income-based special enrollment applies`} value={row.incomeBasedSepEnrollment} onChange={incomeBasedSepEnrollment => set({ incomeBasedSepEnrollment })} />
        {(data.qsehraAffected === true || row.qsehraAffordable != null || row.qsehraMonthlyPermittedBenefit !== undefined) && <>
          <BooleanFact label={`${prefix}: QSEHRA is affordable`} value={row.qsehraAffordable} onChange={qsehraAffordable => set({ qsehraAffordable })} />
          <CurrencyField label={`${prefix}: QSEHRA permitted benefit`} value={row.qsehraMonthlyPermittedBenefit ?? ""} onChange={qsehraMonthlyPermittedBenefit => set({ qsehraMonthlyPermittedBenefit })} />
        </>}
      </div><button type="button" onClick={() => update({ monthlyReconciliation: data.monthlyReconciliation.filter((_, index) => index !== rowIndex) })}>{prefix}: Remove month</button></fieldset>;
    })}
    <button type="button" onClick={() => update({ monthlyReconciliation: [...data.monthlyReconciliation, { ...emptyMarketplaceCoverageMonth }] })}>Add household coverage month</button>
    <BooleanFact label="Marketplace sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
    <button type="button" onClick={() => onChange(undefined)}>Remove Marketplace coverage worksheet</button>
  </section>;
}
