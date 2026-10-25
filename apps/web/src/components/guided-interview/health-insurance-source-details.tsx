"use client";

import { emptyHealthInsuranceAllocation, emptyHealthInsuranceFacts, emptyHealthInsurancePayment, emptyHealthInsurancePerson, emptyHealthInsurancePlan, type HealthInsuranceData, type HealthInsuranceIncomeDeductionsData, type HealthInsurancePlanData, type HealthInsuranceSourceOption } from "@/lib/guided-health-insurance-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";
import type { MarketplacePolicyOption } from "@/lib/guided-marketplace-health-facts";

function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{value && !choices.some(([id]) => id === value) && <option value={value}>Saved source needs reconciliation</option>}{choices.map(([id, text]) => <option value={id} key={id}>{text}</option>)}</select></label>;
}
const monthChoices = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((name, index) => [String(index + 1), name] as const);

export function HealthInsuranceSourceDetails({ data, sources = [], marketplacePolicies = [], onChange }: { data?: HealthInsuranceData; sources?: HealthInsuranceSourceOption[]; marketplacePolicies?: MarketplacePolicyOption[]; onChange: (data: HealthInsuranceData) => void }) {
  if (!data) return <section><h4>Self-employed health insurance sources</h4><p className="guided-hint">Enter actual policy, payment and monthly eligibility records for a self-employed business or a more-than-two-percent S corporation shareholder. The return's business income determines the allowed deduction.</p><button type="button" onClick={() => onChange({ ...emptyHealthInsuranceFacts, persons: [], plans: [], longTermCareAllocations: [] })}>Add health insurance worksheet</button></section>;
  const update = (patch: Partial<HealthInsuranceData>) => {
    const substantive = !Object.keys(patch).every(key => key === "sourceFactsConfirmed");
    onChange({ ...data, ...patch, ...(substantive ? { sourceFactsConfirmed: null } : {}),
      ...(substantive && !("incomeDeductions" in patch) && data.incomeDeductions ? { incomeDeductions: { ...data.incomeDeductions, sourceFactsConfirmed: null } } : {}) });
  };
  const updateIncome = (patch: Partial<HealthInsuranceIncomeDeductionsData>) => {
    if (!data.incomeDeductions) return;
    update({ incomeDeductions: { ...data.incomeDeductions, ...patch, ...(Object.keys(patch).every(key => key === "sourceFactsConfirmed") ? {} : { sourceFactsConfirmed: null }) } });
  };
  const updatePlan = (index: number, patch: Partial<HealthInsurancePlanData>) => update({ plans: data.plans.map((plan, position) => position === index ? { ...plan, ...patch } : plan) });
  const people = data.persons.filter(person => person.personId.trim()).map(person => [person.personId, person.name || person.personId] as const);
  const sourceChoices = sources.map(source => [source.sourceId, `${source.label} (${source.accountHolder === "primary" ? "you" : "spouse"})`] as const);
  return <section>
    <h4>Self-employed health insurance sources</h4>
    <p className="guided-hint">Use actual paid premiums and monthly eligibility, including explicit zero where records establish none. A month is ineligible if you could participate in subsidized coverage through your, your spouse's, dependent's, or under-27 child's employer at any time in that month. Check medical and long-term-care coverage separately in the <a href="https://www.irs.gov/instructions/i7206" target="_blank" rel="noreferrer">Form 7206 instructions</a>.</p>
    <div className="guided-form-grid">
      <TextFact label="Health insurance source tax year" value={data.sourceTaxYear} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label="Health insurance source reference" value={data.sourceReference} onChange={sourceReference => update({ sourceReference })} />
      <BooleanFact label="All health plans and payments are included" value={data.allPlansIncluded} onChange={allPlansIncluded => update({ allPlansIncluded })} />
    </div>
    {data.persons.map((person, index) => {
      const prefix = `Person ${index + 1}`;
      const set = (patch: Partial<typeof person>) => update({ persons: data.persons.map((current, position) => position === index ? { ...current, ...patch } : current) });
      return <fieldset key={index}><legend>{prefix}</legend><div className="guided-form-grid">
        <TextFact label={`${prefix}: Person label`} value={person.personId} onChange={personId => set({ personId })} />
        <TextFact label={`${prefix}: Actual name`} value={person.name} onChange={name => set({ name })} />
        <Choice label={`${prefix}: Household role`} value={person.householdRole} choices={[["primary", "You"], ["spouse", "Spouse"], ["other", "Other covered person"]]} onChange={householdRole => set({ householdRole: householdRole as typeof person.householdRole })} />
        <TextFact label={`${prefix}: Attained age at year end`} value={person.attainedAgeAtYearEnd} onChange={attainedAgeAtYearEnd => set({ attainedAgeAtYearEnd })} />
      </div><button type="button" onClick={() => update({ persons: data.persons.filter((_, position) => position !== index) })}>{prefix}: Remove person</button></fieldset>;
    })}
    <button type="button" onClick={() => update({ persons: [...data.persons, { ...emptyHealthInsurancePerson }] })}>Add covered person</button>
    {data.plans.map((plan, index) => {
      const prefix = `Plan ${index + 1}`;
      const specified = plan.marketplaceCoverage === true && plan.premiumTaxCreditInvolved === true;
      const set = (patch: Partial<HealthInsurancePlanData>) => updatePlan(index, patch);
      const selectBusiness = (businessSourceId: string) => { const source = sources.find(item => item.sourceId === businessSourceId); set({ businessSourceId, accountHolder: source?.accountHolder ?? "", businessKind: source?.kind ?? "" }); };
      return <fieldset key={index} className="guided-expand-body"><legend>{prefix}</legend>
        <div className="guided-form-grid">
          <TextFact label={`${prefix}: Plan label`} value={plan.planId} onChange={planId => set({ planId })} />
          <TextFact label={`${prefix}: Policy reference`} value={plan.policyReference} onChange={policyReference => set({ policyReference })} />
          <Choice label={`${prefix}: Business or shareholder employer`} value={plan.businessSourceId} choices={sourceChoices} onChange={selectBusiness} />
          <Choice label={`${prefix}: Insurance type`} value={plan.kind} choices={[["medical", "Medical, dental or vision"], ["qualified_ltc", "Qualified long-term-care insurance"]]} onChange={kind => set({ kind: kind as typeof plan.kind })} />
          <Choice label={`${prefix}: Policy is in the name of`} value={plan.policyHolder} choices={[["individual", "Individual"], ["business", "Business"]]} onChange={policyHolder => set({ policyHolder: policyHolder as typeof plan.policyHolder })} />
          <BooleanFact label={`${prefix}: Plan is established under this business`} value={plan.establishedUnderBusiness} onChange={establishedUnderBusiness => set({ establishedUnderBusiness })} />
          <BooleanFact label={`${prefix}: Insurance qualification checked`} value={plan.insuranceQualificationConfirmed} onChange={insuranceQualificationConfirmed => set({ insuranceQualificationConfirmed })} />
          {(plan.businessKind !== "self_employed" || plan.premiumsIncludedInOwnerIncome !== null) && <BooleanFact label={`${prefix}: Business paid premiums are included in the owner's income`} value={plan.premiumsIncludedInOwnerIncome} onChange={premiumsIncludedInOwnerIncome => set({ premiumsIncludedInOwnerIncome })} />}
          {(plan.businessKind === "s_corporation" || plan.moreThanTwoPercentShareholder !== null) && <BooleanFact label={`${prefix}: More than two percent shareholder`} value={plan.moreThanTwoPercentShareholder} onChange={moreThanTwoPercentShareholder => set({ moreThanTwoPercentShareholder })} />}
          <BooleanFact label={`${prefix}: Marketplace coverage`} value={plan.marketplaceCoverage} onChange={marketplaceCoverage => set({ marketplaceCoverage })} />
          <BooleanFact label={`${prefix}: Premium tax credit or advance credit is involved`} value={plan.premiumTaxCreditInvolved} onChange={premiumTaxCreditInvolved => set({ premiumTaxCreditInvolved })} />
          <BooleanFact label={`${prefix}: Clergy special rules apply`} value={plan.clergySpecialRules} onChange={clergySpecialRules => set({ clergySpecialRules })} />
        </div>
        {(specified || plan.marketplacePolicySourceIds?.length || plan.allCoveredPersonsInCoverageFamilyConfirmed !== undefined) && <fieldset><legend>{prefix}: Marketplace policy links</legend>
          <p className="guided-hint">Enter the original Marketplace policies and coverage-family worksheet in Credits, then link those records here. Preserve advances separately from amounts you or the business paid. A mixed coverage family or outside payer needs its separate allocation worksheet.</p>
          {(plan.marketplacePolicySourceIds ?? []).map((sourceId, policyIndex) => <div key={policyIndex} className="guided-form-grid">
            <Choice label={`${prefix} policy ${policyIndex + 1}: Original Marketplace policy`} value={sourceId} choices={marketplacePolicies.map(policy => [policy.sourceId, policy.label] as const)} onChange={value => set({ marketplacePolicySourceIds: (plan.marketplacePolicySourceIds ?? []).map((current, position) => position === policyIndex ? value : current) })} />
            <button type="button" onClick={() => set({ marketplacePolicySourceIds: plan.marketplacePolicySourceIds?.filter((_, position) => position !== policyIndex) })}>{prefix} policy {policyIndex + 1}: Remove link</button>
          </div>)}
          <button type="button" onClick={() => set({ marketplacePolicySourceIds: [...plan.marketplacePolicySourceIds ?? [], ""] })}>{prefix}: Add Marketplace policy link</button>
          <BooleanFact label={`${prefix}: All covered people belong to the actual PTC coverage family`} value={plan.allCoveredPersonsInCoverageFamilyConfirmed} onChange={allCoveredPersonsInCoverageFamilyConfirmed => set({ allCoveredPersonsInCoverageFamilyConfirmed })} />
        </fieldset>}
        {plan.businessKind === "s_corporation" && <p className="guided-hint">Use the actual shareholder W-2 source. Qualifying premiums must be paid or reimbursed by the corporation and included in Box 1. Medicare wages supply a separate business income limit.</p>}
        {plan.coveredPersons.map((person, personIndex) => {
          const label = `${prefix} person ${personIndex + 1}`;
          const setPerson = (patch: Partial<typeof person>) => set({ coveredPersons: plan.coveredPersons.map((current, position) => position === personIndex ? { ...current, ...patch } : current) });
          return <div key={personIndex} className="guided-form-grid">
            <Choice label={`${label}: Covered person`} value={person.personId} choices={people} onChange={personId => setPerson({ personId })} />
            <Choice label={`${label}: Relationship to business owner`} value={person.relationshipToOwner} choices={[["self", "Business owner"], ["spouse", "Owner's spouse"], ["dependent", "Qualifying dependent"], ["child_under_27", "Child under 27 at year end"], ["other", "Other person"]]} onChange={relationshipToOwner => setPerson({ relationshipToOwner: relationshipToOwner as typeof person.relationshipToOwner })} />
            {(person.relationshipToOwner === "dependent" || person.dependencyEligibilityConfirmed !== null) && <BooleanFact label={`${label}: Dependent qualifies under the health insurance rules`} value={person.dependencyEligibilityConfirmed} onChange={dependencyEligibilityConfirmed => setPerson({ dependencyEligibilityConfirmed })} />}
            <button type="button" onClick={() => set({ coveredPersons: plan.coveredPersons.filter((_, position) => position !== personIndex) })}>{label}: Remove covered person</button>
          </div>;
        })}
        <button type="button" onClick={() => set({ coveredPersons: [...plan.coveredPersons, { personId: "", relationshipToOwner: "", dependencyEligibilityConfirmed: null }] })}>{prefix}: Add covered person</button>
        {plan.months.map((month, monthIndex) => {
          const label = `${prefix} month ${monthIndex + 1}`;
          const setMonth = (patch: Partial<typeof month>) => set({ months: plan.months.map((current, position) => position === monthIndex ? { ...current, ...patch } : current) });
          return <div key={monthIndex} className="guided-form-grid"><Choice label={`${label}: Month`} value={month.month} choices={monthChoices} onChange={value => setMonth({ month: value })} /><BooleanFact label={`${label}: Eligible for any subsidized employer coverage in this month`} value={month.employerSubsidizedPlanEligible} onChange={employerSubsidizedPlanEligible => setMonth({ employerSubsidizedPlanEligible })} />
            {((specified && month.employerSubsidizedPlanEligible === true) || month.employerOfferPtcException !== undefined || month.employerCoverageEnrolled !== undefined || month.employerOfferSourceReference !== undefined) && <>
              <Choice label={`${label}: Actual employer-offer PTC exception`} value={month.employerOfferPtcException ?? ""} choices={[["unaffordable", "Offer was unaffordable under PTC rules"], ["does_not_provide_minimum_value", "Offer did not provide minimum value"]]} onChange={employerOfferPtcException => setMonth({ employerOfferPtcException: employerOfferPtcException as typeof month.employerOfferPtcException })} />
              <BooleanFact label={`${label}: Enrolled in employer coverage`} value={month.employerCoverageEnrolled} onChange={employerCoverageEnrolled => setMonth({ employerCoverageEnrolled })} />
              <TextFact label={`${label}: Employer-offer and enrollment source reference`} value={month.employerOfferSourceReference ?? ""} onChange={employerOfferSourceReference => setMonth({ employerOfferSourceReference })} />
            </>}
            <button type="button" onClick={() => set({ months: plan.months.filter((_, position) => position !== monthIndex) })}>{label}: Remove month</button></div>;
        })}
        <button type="button" onClick={() => set({ months: [...plan.months, { month: "", employerSubsidizedPlanEligible: null }] })}>{prefix}: Add coverage month</button>
        {plan.payments.map((payment, paymentIndex) => {
          const label = `${prefix} payment ${paymentIndex + 1}`;
          const setPayment = (patch: Partial<typeof payment>) => set({ payments: plan.payments.map((current, position) => position === paymentIndex ? { ...current, ...patch } : current) });
          return <fieldset key={paymentIndex}><legend>{label}</legend><div className="guided-form-grid">
            <TextFact label={`${label}: Payment source label`} value={payment.sourceId} onChange={sourceId => setPayment({ sourceId })} />
            <TextFact label={`${label}: Actual payment date`} type="date" value={payment.datePaid} onChange={datePaid => setPayment({ datePaid })} />
            <TextFact label={`${label}: Coverage tax year`} value={payment.coverageTaxYear} onChange={coverageTaxYear => setPayment({ coverageTaxYear })} />
            <Choice label={`${label}: Coverage month`} value={payment.coverageMonth} choices={monthChoices} onChange={coverageMonth => setPayment({ coverageMonth })} />
            {([["grossPremium", "Original premium"], ["ownerOrBusinessPaid", "Owner or business paid share"], ["otherPersonPaid", "Other person's paid share"]] as const).map(([field, text]) => <CurrencyField key={field} label={`${label}: ${text}`} value={payment[field]} onChange={value => setPayment({ [field]: value })} />)}
            {(specified || payment.advancePremiumTaxCredit !== undefined) && <CurrencyField label={`${label}: Actual advance premium tax credit`} value={payment.advancePremiumTaxCredit ?? ""} onChange={advancePremiumTaxCredit => setPayment({ advancePremiumTaxCredit })} />}
          </div><p className="guided-hint">Allocate the owner/business paid amount to the actual covered people and payers. A reimbursed amount belongs to the business share once. Funding exclusions below must be separate and cannot exceed the paid share.</p>
            {payment.personAmounts.map((share, shareIndex) => {
              const shareLabel = `${label} share ${shareIndex + 1}`;
              const setShare = (patch: Partial<typeof share>) => setPayment({ personAmounts: payment.personAmounts.map((current, position) => position === shareIndex ? { ...current, ...patch } : current) });
              return <div key={shareIndex} className="guided-form-grid">
                <Choice label={`${shareLabel}: Covered person`} value={share.personId} choices={people} onChange={personId => setShare({ personId })} />
                <Choice label={`${shareLabel}: Actual payer`} value={share.payer} choices={[["owner_after_tax", "Owner personally, after tax, without business reimbursement"], ["business_paid_or_reimbursed", "Business paid or reimbursed the premium"]]} onChange={payer => setShare({ payer: payer as typeof share.payer })} />
                {([["amountPaid", "Paid premium share"], ["excludedPublicSafetyOfficerAmount", "Excluded public-safety-officer payments"], ["otherTaxFreeFunding", "Other separate tax-free funding"]] as const).map(([field, text]) => <CurrencyField key={field} label={`${shareLabel}: ${text}`} value={share[field]} onChange={value => setShare({ [field]: value })} />)}
                {(specified || share.advancePremiumTaxCredit !== undefined) && <CurrencyField label={`${shareLabel}: Actual person advance premium tax credit`} value={share.advancePremiumTaxCredit ?? ""} onChange={advancePremiumTaxCredit => setShare({ advancePremiumTaxCredit })} />}
                <Choice label={`${shareLabel}: Public-safety-officer taxpayer`} value={share.publicSafetyOfficerAccountHolder} choices={[["primary", "You"], ["spouse", "Spouse"]]} onChange={publicSafetyOfficerAccountHolder => setShare({ publicSafetyOfficerAccountHolder: publicSafetyOfficerAccountHolder as typeof share.publicSafetyOfficerAccountHolder })} />
                <button type="button" onClick={() => setPayment({ personAmounts: payment.personAmounts.filter((_, position) => position !== shareIndex) })}>{shareLabel}: Remove share</button>
              </div>;
            })}
            <button type="button" onClick={() => setPayment({ personAmounts: [...payment.personAmounts, { ...emptyHealthInsuranceAllocation }] })}>{label}: Add person and payer share</button>
            <button type="button" onClick={() => set({ payments: plan.payments.filter((_, position) => position !== paymentIndex) })}>{label}: Remove payment</button>
          </fieldset>;
        })}
        <button type="button" onClick={() => set({ payments: [...plan.payments, { ...emptyHealthInsurancePayment, personAmounts: [] }] })}>{prefix}: Add premium payment</button>
        <button type="button" onClick={() => update({ plans: data.plans.filter((_, position) => position !== index) })}>{prefix}: Remove plan</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => update({ plans: [...data.plans, { ...emptyHealthInsurancePlan, coveredPersons: [], months: [], payments: [] }] })}>Add health plan</button>
    <p className="guided-hint">If one person's qualified long-term-care premiums exceed their annual age limit across several businesses, enter the actual allocation of that limit between businesses.</p>
    {data.longTermCareAllocations.map((allocation, index) => {
      const label = `LTC allocation ${index + 1}`;
      const set = (patch: Partial<typeof allocation>) => update({ longTermCareAllocations: data.longTermCareAllocations.map((current, position) => position === index ? { ...current, ...patch } : current) });
      return <div key={index} className="guided-form-grid"><Choice label={`${label}: Covered person`} value={allocation.personId} choices={people} onChange={personId => set({ personId })} /><Choice label={`${label}: Business or shareholder employer`} value={allocation.businessSourceId} choices={sourceChoices} onChange={businessSourceId => { const source = sources.find(item => item.sourceId === businessSourceId); set({ businessSourceId, accountHolder: source?.accountHolder ?? "" }); }} /><CurrencyField label={`${label}: Allowed premium allocation`} value={allocation.allowedPremium} onChange={allowedPremium => set({ allowedPremium })} /><button type="button" onClick={() => update({ longTermCareAllocations: data.longTermCareAllocations.filter((_, position) => position !== index) })}>{label}: Remove allocation</button></div>;
    })}
    <button type="button" onClick={() => update({ longTermCareAllocations: [...data.longTermCareAllocations, { personId: "", accountHolder: "", businessSourceId: "", allowedPremium: "" }] })}>Add long-term-care business allocation</button>
    <p className="guided-hint">When an allowed retirement deduction or foreign income exclusion applies, use its actual worksheet to attribute amounts to the businesses. These amounts must reconcile to the return's calculated deductions. Premiums do not establish business profit or an allocation.</p>
    {data.incomeDeductions ? <fieldset><legend>Business deduction attribution</legend><div className="guided-form-grid">
      <TextFact label="Business deduction attribution source reference" value={data.incomeDeductions.sourceReference} onChange={sourceReference => updateIncome({ sourceReference })} />
      <CurrencyField label="Foreign exclusion not attributable to these businesses" value={data.incomeDeductions.otherForeignExclusion} onChange={otherForeignExclusion => updateIncome({ otherForeignExclusion })} />
    </div>
      {data.incomeDeductions.allocations.map((allocation, index) => {
        const label = `Income allocation ${index + 1}`;
        const set = (patch: Partial<typeof allocation>) => updateIncome({ allocations: data.incomeDeductions!.allocations.map((current, position) => position === index ? { ...current, ...patch } : current) });
        return <div key={index} className="guided-form-grid">
          <Choice label={`${label}: Business or shareholder employer`} value={allocation.businessSourceId} choices={sourceChoices} onChange={businessSourceId => set({ businessSourceId, accountHolder: sources.find(source => source.sourceId === businessSourceId)?.accountHolder ?? "" })} />
          <CurrencyField label={`${label}: Allowed retirement deduction`} value={allocation.retirementDeduction} onChange={retirementDeduction => set({ retirementDeduction })} />
          <CurrencyField label={`${label}: Allowed foreign exclusion`} value={allocation.foreignExclusion} onChange={foreignExclusion => set({ foreignExclusion })} />
          <button type="button" onClick={() => updateIncome({ allocations: data.incomeDeductions!.allocations.filter((_, position) => position !== index) })}>{label}: Remove allocation</button>
        </div>;
      })}
      <button type="button" onClick={() => updateIncome({ allocations: [...data.incomeDeductions!.allocations, { businessSourceId: "", accountHolder: "", retirementDeduction: "", foreignExclusion: "" }] })}>Add business deduction allocation</button>
      <BooleanFact label="Business deduction attribution checked after the last edit" value={data.incomeDeductions.sourceFactsConfirmed} onChange={sourceFactsConfirmed => updateIncome({ sourceFactsConfirmed })} />
      <button type="button" onClick={() => update({ incomeDeductions: undefined })}>Remove business deduction attribution</button>
    </fieldset> : <button type="button" onClick={() => update({ incomeDeductions: { sourceReference: "", sourceFactsConfirmed: null, allocations: [], otherForeignExclusion: "" } })}>Add business deduction attribution</button>}
    <BooleanFact label="Health insurance sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
  </section>;
}
