"use client";
import { buildHealthInsuranceInput, type HealthInsuranceData } from "@/lib/guided-health-insurance-facts";
import { NoAdvanceCoverageFamilyDetails } from "./no-advance-coverage-family-details";
import { NoAdvanceBenchmarkSourceDetails } from "./no-advance-benchmark-source-details";
import { OverlappingBenchmarkSourceDetails } from "./overlapping-benchmark-source-details";

import { useState } from "react";
import type { FilingStatus, PersonalInfoData } from "@/lib/guided-interview-flow";
import type { MarketplacePolicyData, PremiumTaxCreditData } from "@/lib/guided-premium-tax-credit-facts";
import { captureSharedPolicySources, captureNoAdvanceBenchmarkSources, captureOverlappingBenchmarkSources, captureNoAdvanceCoverageFamilies, deriveSharedPolicyMonths, type SharedPolicyAgreementData } from "@/lib/guided-shared-policy";
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
export function SharedPolicySourceDetails({ data, personal, filingStatus, taxYear, healthInsurance, onChange }: {
  healthInsurance?: HealthInsuranceData; data: PremiumTaxCreditData; personal?: PersonalInfoData; filingStatus?: FilingStatus | null; taxYear?: number | null;
  onChange: (patch: Partial<PremiumTaxCreditData>) => void;
}) {
  const [error, setError] = useState<string>();
  const packet = data.sharedPolicyAllocations;
  const unsharedOverlap = packet?.policies.some(policy => policy.situation === "not_shared" && policy.original?.monthlyPremiums.some(month => {
    const active = packet.policies.filter(source => source.original?.monthlyPremiums.some(row => Number(row.month) === Number(month.month)));
    return active.filter(source => source.situation === "not_shared").length > 1 && !active.some(source => source.situation === "no_advance_credit");
  }));
  function perform(action: () => void) { try { action(); setError(undefined); } catch (caught) { setError(caught instanceof Error ? caught.message : "Check the actual shared-policy sources."); } }
  return <section><h5>Shared policy allocation</h5>
    <p className="guided-hint">For two tax families with advance credits, enter the actual agreement or original enrollment facts when there is no agreement. If no advance credit was paid, use both families&apos; actual benchmark premiums. Identify policies covering only this return&apos;s family from their actual enrollment records. Overlapping unshared policies need the coverage-group sources below. Overlapping no-advance policies use complete monthly coverage families below. A marriage election also needs the independent marriage worksheet and the other taxpayer&apos;s relationship history. Health insurance needs its actual payment records.</p>
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
        const unshared = policy.situation === "not_shared";
        const changeSituation = (value: string) => {
          const situation = value as SharedPolicyAgreementData["situation"];
          if (situation === "not_shared") {
            set({ situation, otherTaxpayerName: "", otherTaxpayerSsn: "", noCurrentYearMarriageOrDivorceConfirmed: null,
              otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed: null, otherTaxpayerRelationshipSourceReference: '',
              twoTaxFamiliesConfirmed: null, allCoveredPeopleAssignedConfirmed: null, originalSlcspCorrectConfirmed: null,
              agreementConfirmed: null, agreementReference: "", defaultAllocation: undefined, noAdvanceAllocation: undefined,
              coveredFamilyAssignments: [], monthlyAllocations: [], unsharedSourceReference: "", allCoveredPeopleInThisTaxFamilyConfirmed: null });
            return;
          }
          set({ situation, unsharedSourceReference: "", allCoveredPeopleInThisTaxFamilyConfirmed: null,
            ...(unshared ? { coveredFamilyAssignments: (policy.original?.coveredIndividuals ?? []).map(person => ({ ssn: person.ssn, family: "" as const })),
              monthlyAllocations: (policy.original?.monthlyPremiums ?? []).map(row => ({ month: row.month, fraction: "" })) } : {}),
            ...(situation === "no_advance_credit" ? { agreementConfirmed: null, agreementReference: "", defaultAllocation: undefined,
              monthlyAllocations: (policy.original?.monthlyPremiums ?? []).map(row => ({ month: row.month, fraction: "" })) } : { noAdvanceAllocation: undefined }) });
        };
        return <fieldset key={index}><legend>{prefix}</legend><div className="guided-form-grid">
          {!unshared && <><TextFact label={`${prefix}: Other taxpayer name`} value={policy.otherTaxpayerName} onChange={otherTaxpayerName => set({ otherTaxpayerName })} />
          <TextFact label={`${prefix}: Other taxpayer SSN`} value={policy.otherTaxpayerSsn} onChange={otherTaxpayerSsn => set({ otherTaxpayerSsn })} /></>}
          <Choice label={`${prefix}: Allocation situation`} value={policy.situation} choices={[["other_two_tax_families", "Two tax families — other shared-policy situation"], ["divorce_during_year", "Divorce during this year"], ["married_separate", "Married filing separately"], ["no_advance_credit", "No advance credit paid"], ["not_shared", "This policy covers only this return's tax family"]]} onChange={changeSituation} />
          {unshared ? <>
            <TextFact label={`${prefix}: Unshared coverage source reference`} value={policy.unsharedSourceReference ?? ""} onChange={unsharedSourceReference => set({ unsharedSourceReference })} />
            <BooleanFact label={`${prefix}: All covered people belong to this tax family`} value={policy.allCoveredPeopleInThisTaxFamilyConfirmed ?? null} onChange={allCoveredPeopleInThisTaxFamilyConfirmed => set({ allCoveredPeopleInThisTaxFamilyConfirmed })} />
            <BooleanFact label={`${prefix}: Original SLCSP amounts are correct`} value={policy.originalSlcspCorrectConfirmed} onChange={originalSlcspCorrectConfirmed => set({ originalSlcspCorrectConfirmed })} />
          </> : ([["noCurrentYearMarriageOrDivorceConfirmed", "No marriage or divorce occurred this year"], ["twoTaxFamiliesConfirmed", "Exactly two tax families share this policy"], ["allCoveredPeopleAssignedConfirmed", "Every covered person is assigned"], ["originalSlcspCorrectConfirmed", "Original SLCSP amounts are correct"]] as const).filter(([field]) => (field !== "originalSlcspCorrectConfirmed" || policy.situation !== "no_advance_credit") && (field !== "noCurrentYearMarriageOrDivorceConfirmed" || data.alternativeMarriageCalculationElected !== true)).map(([field, label]) => <BooleanFact key={field} label={`${prefix}: ${label}`} value={policy[field]} onChange={value => set({ [field]: value })} />)}
          {!unshared && data.alternativeMarriageCalculationElected === true && <>
            <BooleanFact label={`${prefix}: Other taxpayer was not married to either filer during this year`} value={policy.otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed ?? null}
              onChange={otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed => set({ otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed, noCurrentYearMarriageOrDivorceConfirmed: null })} />
            <TextFact label={`${prefix}: Other taxpayer relationship source reference`} value={policy.otherTaxpayerRelationshipSourceReference ?? ''} onChange={otherTaxpayerRelationshipSourceReference => set({ otherTaxpayerRelationshipSourceReference })} />
          </>}
          {!unshared && policy.situation !== "no_advance_credit" && <><BooleanFact label={`${prefix}: Both taxpayers agreed to these fractions`} value={policy.agreementConfirmed} onChange={agreementConfirmed => set({ agreementConfirmed,
            ...(agreementConfirmed === true ? { defaultAllocation: undefined } : agreementConfirmed === false ? { agreementReference: "", monthlyAllocations: policy.monthlyAllocations.map(row => ({ ...row, fraction: "" })),
              defaultAllocation: policy.defaultAllocation ?? { sourceReference: "", enrollingTaxpayerSsn: "", allCoveredPeopleEnrolledByTaxpayerConfirmed: null } } : {}) })} />
          {policy.agreementConfirmed === true && <TextFact label={`${prefix}: Agreement reference`} value={policy.agreementReference} onChange={agreementReference => set({ agreementReference })} />}
          {policy.agreementConfirmed === false && <>
            <TextFact label={`${prefix}: Enrollment source reference`} value={policy.defaultAllocation?.sourceReference ?? ""} onChange={sourceReference => set({ defaultAllocation: { sourceReference, enrollingTaxpayerSsn: policy.defaultAllocation?.enrollingTaxpayerSsn ?? "", allCoveredPeopleEnrolledByTaxpayerConfirmed: policy.defaultAllocation?.allCoveredPeopleEnrolledByTaxpayerConfirmed ?? null } })} />
            <TextFact label={`${prefix}: Enrolling taxpayer SSN`} value={policy.defaultAllocation?.enrollingTaxpayerSsn ?? ""} onChange={enrollingTaxpayerSsn => set({ defaultAllocation: { sourceReference: policy.defaultAllocation?.sourceReference ?? "", enrollingTaxpayerSsn, allCoveredPeopleEnrolledByTaxpayerConfirmed: policy.defaultAllocation?.allCoveredPeopleEnrolledByTaxpayerConfirmed ?? null } })} />
            <BooleanFact label={`${prefix}: This taxpayer enrolled every original covered person`} value={policy.defaultAllocation?.allCoveredPeopleEnrolledByTaxpayerConfirmed ?? null} onChange={allCoveredPeopleEnrolledByTaxpayerConfirmed => set({ defaultAllocation: { sourceReference: policy.defaultAllocation?.sourceReference ?? "", enrollingTaxpayerSsn: policy.defaultAllocation?.enrollingTaxpayerSsn ?? "", allCoveredPeopleEnrolledByTaxpayerConfirmed } })} />
          </>}</>}
        </div>
          {!unshared && policy.coveredFamilyAssignments.map((person, personIndex) => <Choice key={personIndex} label={`${prefix}: Covered person ${personIndex + 1} tax family`} value={person.family} choices={[["this_return", "This return's tax family"], ["other_return", "Other taxpayer's tax family"]]} onChange={family => set({ coveredFamilyAssignments: policy.coveredFamilyAssignments.map((current, i) => i === personIndex ? { ...current, family: family as typeof person.family } : current) })} />)}
          {policy.situation === "no_advance_credit" && <NoAdvanceBenchmarkSourceDetails prefix={prefix} value={policy.noAdvanceAllocation} onCapture={() => perform(() => set({ noAdvanceAllocation: captureNoAdvanceBenchmarkSources(policy, packet) }))} onChange={noAdvanceAllocation => set({ noAdvanceAllocation })} />}
          {!unshared && policy.situation !== "no_advance_credit" && policy.agreementConfirmed === true ? <>
            <p className="guided-hint">Use the covered-person order on the copied original. Enter a fraction from 0 to 1, with at most two decimal places: for example, 0.50 for 50%. The same agreed fraction applies to all three monthly amounts.</p>
            <div className="guided-form-grid">{policy.monthlyAllocations.map((row, rowIndex) => <TextFact key={rowIndex} label={`${prefix}: Month ${row.month} agreed fraction`} value={row.fraction} onChange={fraction => set({ monthlyAllocations: policy.monthlyAllocations.map((current, i) => i === rowIndex ? { ...current, fraction } : current) })} />)}</div>
          </> : !unshared && policy.situation !== "no_advance_credit" && policy.agreementConfirmed === false && <p className="guided-hint">Use the covered-person order on the copied original. The enrolling taxpayer is the person who expected to claim these people when enrolling them. The default share uses their actual coverage months and tax-family assignments; the enrolling taxpayer keeps the remaining share.</p>}
        </fieldset>;
      })}
      {(packet.noAdvanceCoverageFamilies || (packet.policies.length > 1 && packet.policies.some(policy => policy.situation === "no_advance_credit"))) && <NoAdvanceCoverageFamilyDetails value={packet.noAdvanceCoverageFamilies}
        onCapture={() => perform(() => onChange({ sharedPolicyAllocations: { ...packet, noAdvanceCoverageFamilies: captureNoAdvanceCoverageFamilies(packet) } }))}
        onChange={noAdvanceCoverageFamilies => onChange({ sharedPolicyAllocations: { ...packet, noAdvanceCoverageFamilies } })} />}
      {(packet.overlappingCoverage || unsharedOverlap) && <OverlappingBenchmarkSourceDetails packet={packet}
        onCapture={() => perform(() => onChange({ sharedPolicyAllocations: { ...packet, overlappingCoverage: captureOverlappingBenchmarkSources(packet) } }))}
        onChange={overlappingCoverage => onChange({ sharedPolicyAllocations: { ...packet, overlappingCoverage } })} onError={perform} />}
      <BooleanFact label="Allocation sources checked after the last edit" value={packet.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ sharedPolicyAllocations: { ...packet, sourceFactsConfirmed } })} />
      <button type="button" onClick={() => perform(() => onChange({ monthlyReconciliation: deriveSharedPolicyMonths(data, taxYear, filingStatus, personal, healthInsurance?.plans.some(plan => plan.coverageFamilySources) ? buildHealthInsuranceInput(healthInsurance, filingStatus, taxYear) : undefined) }))}>{packet.policies.some(policy => policy.agreementConfirmed === false || policy.situation === "no_advance_credit" || policy.situation === "not_shared") ? "Calculate household amounts from allocation" : "Calculate household amounts from agreement"}</button>
      <p className="guided-hint">After calculation, check the household monthly amounts and confirm the sources below. Each month's coverage eligibility remains your separate source answer.</p>
      <button type="button" onClick={() => onChange({ sharedPolicyAllocations: undefined })}>Remove allocation worksheet</button>
    </>}
  </section>;
}
