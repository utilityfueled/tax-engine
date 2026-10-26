"use client";

import { useState } from "react";
import type { FilingStatus, PersonalInfoData } from "@/lib/guided-interview-flow";
import type { MarketplacePolicyData, PremiumTaxCreditData } from "@/lib/guided-premium-tax-credit-facts";
import { captureSharedPolicySources, deriveSharedPolicyMonths, type SharedPolicyAgreementData } from "@/lib/guided-shared-policy";
import { BooleanFact, TextFact } from "./fact-fields";

function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value} onChange={event => onChange(event.target.value)}><option value="">Confirm from actual records</option>{choices.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>;
}
export function SharedPolicyOriginalDetails({ policy, prefix, onChange }: { policy: MarketplacePolicyData; prefix: string; onChange: (patch: Partial<MarketplacePolicyData>) => void }) {
  return <fieldset style={{ gridColumn: "1 / -1" }}><legend>{prefix}: Original recipient and covered people</legend>
    <p className="guided-hint">Copy the recipient and every covered person from the original Form 1095-A, including people claimed on the other return.</p>
    <div className="guided-form-grid">
      <TextFact label={`${prefix}: Original recipient name`} value={policy.recipientName ?? ""} onChange={recipientName => onChange({ recipientName })} />
      <TextFact label={`${prefix}: Original recipient SSN`} value={policy.recipientSsn ?? ""} onChange={recipientSsn => onChange({ recipientSsn })} />
    </div>
    {(policy.coveredIndividuals ?? []).map((person, index) => {
      const label = `${prefix}: Covered person ${index + 1}`;
      const set = (patch: Partial<typeof person>) => onChange({ coveredIndividuals: policy.coveredIndividuals!.map((current, i) => i === index ? { ...current, ...patch } : current) });
      return <fieldset key={index}><legend>{label}</legend><div className="guided-form-grid">
        <TextFact label={`${label} name`} value={person.name} onChange={name => set({ name })} />
        <TextFact label={`${label} SSN`} value={person.ssn} onChange={ssn => set({ ssn })} />
        <TextFact label={`${label} first month (1–12)`} value={person.firstMonth} onChange={firstMonth => set({ firstMonth })} />
        <TextFact label={`${label} last month (1–12)`} value={person.lastMonth} onChange={lastMonth => set({ lastMonth })} />
      </div><button type="button" onClick={() => onChange({ coveredIndividuals: policy.coveredIndividuals!.filter((_, i) => i !== index) })}>{label}: Remove covered person</button></fieldset>;
    })}
    <button type="button" onClick={() => onChange({ coveredIndividuals: [...(policy.coveredIndividuals ?? []), { name: "", ssn: "", firstMonth: "", lastMonth: "" }] })}>{prefix}: Add original covered person</button>
  </fieldset>;
}
export function SharedPolicySourceDetails({ data, personal, filingStatus, taxYear, onChange }: {
  data: PremiumTaxCreditData; personal?: PersonalInfoData; filingStatus?: FilingStatus | null; taxYear?: number | null;
  onChange: (patch: Partial<PremiumTaxCreditData>) => void;
}) {
  const [error, setError] = useState<string>();
  const packet = data.sharedPolicyAllocations;
  function perform(action: () => void) { try { action(); setError(undefined); } catch (caught) { setError(caught instanceof Error ? caught.message : "Check the actual shared-policy sources."); } }
  return <section><h5>Shared policy allocation</h5>
    <p className="guided-hint">For two tax families with advance credits, enter the actual agreement or confirm that no agreement was reached. Without an agreement, the allocation comes from the original enrollment and each covered person&apos;s tax family. Marriage, divorce, overlapping policies and self-employed health coordination require their separate methods.</p>
    <button type="button" onClick={() => perform(() => onChange({ sharedPolicyAllocations: captureSharedPolicySources(data, personal, filingStatus) }))}>Copy original policies and household</button>
    <p className="guided-hint">Copy again after replacing an original policy or changing the return household. Copying clears the previous agreement answers.</p>
    {error && <p role="alert">{error}</p>}
    {packet && <>
      <p className="guided-hint">Copied {packet.policies.length} original {packet.policies.length === 1 ? "policy" : "policies"} for source year {packet.sourceTaxYear}. Original monthly amounts remain unchanged.</p>
      <div className="guided-form-grid">
        <TextFact label="Allocation worksheet reference" value={packet.sourceReference} onChange={sourceReference => onChange({ sharedPolicyAllocations: { ...packet, sourceReference } })} />
        <BooleanFact label="All shared policies are included" value={packet.allSharedPoliciesIncluded} onChange={allSharedPoliciesIncluded => onChange({ sharedPolicyAllocations: { ...packet, allSharedPoliciesIncluded } })} />
      </div>
      {packet.policies.map((policy, index) => {
        const prefix = `Allocation policy ${index + 1}`;
        const set = (patch: Partial<SharedPolicyAgreementData>) => onChange({ sharedPolicyAllocations: { ...packet, policies: packet.policies.map((current, i) => i === index ? { ...current, ...patch } : current) } });
        return <fieldset key={index}><legend>{prefix}</legend><div className="guided-form-grid">
          <TextFact label={`${prefix}: Other taxpayer name`} value={policy.otherTaxpayerName} onChange={otherTaxpayerName => set({ otherTaxpayerName })} />
          <TextFact label={`${prefix}: Other taxpayer SSN`} value={policy.otherTaxpayerSsn} onChange={otherTaxpayerSsn => set({ otherTaxpayerSsn })} />
          <Choice label={`${prefix}: Allocation situation`} value={policy.situation} choices={[["other_two_tax_families", "Two tax families — other shared-policy situation"], ["divorce_during_year", "Divorce during this year"], ["married_separate", "Married filing separately"], ["no_advance_credit", "No advance credit paid"]]} onChange={situation => set({ situation: situation as SharedPolicyAgreementData["situation"] })} />
          {([["noCurrentYearMarriageOrDivorceConfirmed", "No marriage or divorce occurred this year"], ["twoTaxFamiliesConfirmed", "Exactly two tax families share this policy"], ["allCoveredPeopleAssignedConfirmed", "Every covered person is assigned"], ["originalSlcspCorrectConfirmed", "Original SLCSP amounts are correct"]] as const).map(([field, label]) => <BooleanFact key={field} label={`${prefix}: ${label}`} value={policy[field]} onChange={value => set({ [field]: value })} />)}
          <BooleanFact label={`${prefix}: Both taxpayers agreed to these fractions`} value={policy.agreementConfirmed} onChange={agreementConfirmed => set({ agreementConfirmed,
            ...(agreementConfirmed === true ? { defaultAllocation: undefined } : agreementConfirmed === false ? { agreementReference: "", monthlyAllocations: policy.monthlyAllocations.map(row => ({ ...row, fraction: "" })),
              defaultAllocation: policy.defaultAllocation ?? { sourceReference: "", enrollingTaxpayerSsn: "", allCoveredPeopleEnrolledByTaxpayerConfirmed: null } } : {}) })} />
          {policy.agreementConfirmed === true && <TextFact label={`${prefix}: Agreement reference`} value={policy.agreementReference} onChange={agreementReference => set({ agreementReference })} />}
          {policy.agreementConfirmed === false && <>
            <TextFact label={`${prefix}: Enrollment source reference`} value={policy.defaultAllocation?.sourceReference ?? ""} onChange={sourceReference => set({ defaultAllocation: { sourceReference, enrollingTaxpayerSsn: policy.defaultAllocation?.enrollingTaxpayerSsn ?? "", allCoveredPeopleEnrolledByTaxpayerConfirmed: policy.defaultAllocation?.allCoveredPeopleEnrolledByTaxpayerConfirmed ?? null } })} />
            <TextFact label={`${prefix}: Enrolling taxpayer SSN`} value={policy.defaultAllocation?.enrollingTaxpayerSsn ?? ""} onChange={enrollingTaxpayerSsn => set({ defaultAllocation: { sourceReference: policy.defaultAllocation?.sourceReference ?? "", enrollingTaxpayerSsn, allCoveredPeopleEnrolledByTaxpayerConfirmed: policy.defaultAllocation?.allCoveredPeopleEnrolledByTaxpayerConfirmed ?? null } })} />
            <BooleanFact label={`${prefix}: This taxpayer enrolled every original covered person`} value={policy.defaultAllocation?.allCoveredPeopleEnrolledByTaxpayerConfirmed ?? null} onChange={allCoveredPeopleEnrolledByTaxpayerConfirmed => set({ defaultAllocation: { sourceReference: policy.defaultAllocation?.sourceReference ?? "", enrollingTaxpayerSsn: policy.defaultAllocation?.enrollingTaxpayerSsn ?? "", allCoveredPeopleEnrolledByTaxpayerConfirmed } })} />
          </>}
        </div>
          {policy.coveredFamilyAssignments.map((person, personIndex) => <Choice key={personIndex} label={`${prefix}: Covered person ${personIndex + 1} tax family`} value={person.family} choices={[["this_return", "This return's tax family"], ["other_return", "Other taxpayer's tax family"]]} onChange={family => set({ coveredFamilyAssignments: policy.coveredFamilyAssignments.map((current, i) => i === personIndex ? { ...current, family: family as typeof person.family } : current) })} />)}
          {policy.agreementConfirmed === true ? <>
            <p className="guided-hint">Use the covered-person order on the copied original. Enter a fraction from 0 to 1, with at most two decimal places: for example, 0.50 for 50%. The same agreed fraction applies to all three monthly amounts.</p>
            <div className="guided-form-grid">{policy.monthlyAllocations.map((row, rowIndex) => <TextFact key={rowIndex} label={`${prefix}: Month ${row.month} agreed fraction`} value={row.fraction} onChange={fraction => set({ monthlyAllocations: policy.monthlyAllocations.map((current, i) => i === rowIndex ? { ...current, fraction } : current) })} />)}</div>
          </> : policy.agreementConfirmed === false && <p className="guided-hint">Use the covered-person order on the copied original. The enrolling taxpayer is the person who expected to claim these people when enrolling them. The default share uses their actual coverage months and tax-family assignments; the enrolling taxpayer keeps the remaining share.</p>}
        </fieldset>;
      })}
      <BooleanFact label="Allocation sources checked after the last edit" value={packet.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ sharedPolicyAllocations: { ...packet, sourceFactsConfirmed } })} />
      <button type="button" onClick={() => perform(() => onChange({ monthlyReconciliation: deriveSharedPolicyMonths(data, taxYear, filingStatus, personal) }))}>{packet.policies.some(policy => policy.agreementConfirmed === false) ? "Calculate household amounts from allocation" : "Calculate household amounts from agreement"}</button>
      <p className="guided-hint">After calculation, check the household monthly amounts and confirm the sources below. Each month's coverage eligibility remains your separate source answer.</p>
      <button type="button" onClick={() => onChange({ sharedPolicyAllocations: undefined })}>Remove allocation worksheet</button>
    </>}
  </section>;
}
