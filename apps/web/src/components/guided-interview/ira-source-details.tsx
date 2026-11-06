"use client";

import type { AdjustmentData, FilingStatus } from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

export function IraSourceDetails({ data, filingStatus, onChange }: { data: AdjustmentData; filingStatus?: FilingStatus | null; onChange: (data: AdjustmentData) => void }) {
  const ira = data.iraContributions;
  const update = (change: Partial<NonNullable<AdjustmentData["iraContributions"]>>) => {
    if (ira) onChange({ ...data, iraContributions: { ...ira, sourceFactsConfirmed: null, ...change } });
  };
  const married = filingStatus === "mfj" || filingStatus === "mfs";
  const spouseAmounts = filingStatus === "mfj" || [ira?.spouseContributions, ira?.spouseCompensation, ira?.spouseRothContributions, ira?.spouseSection501c18Contributions].some(value => value?.trim());
  return <>
    <h4>Traditional IRA contributions</h4>
    {data.iraDeduction.trim() && <p className="guided-hint">Saved IRA deduction estimate: {data.iraDeduction}. Enter the actual source facts below; the deduction is calculated from them.</p>}
    {!ira ? <button type="button" className="utility-button" onClick={() => onChange({ ...data, iraContributions: { primaryContributions: "", primaryIsActiveParticipant: null, spouseContributions: "", spouseIsActiveParticipant: null } })}>Add IRA contribution facts</button> : <div className="guided-form-grid">
      <p className="guided-hint">Eligible compensation is the actual Publication 590-A amount after each person's deductible self-employment tax and retirement-plan contributions, before any lower-earner spousal allocation. Wages are reduced by nonqualified-plan amounts; self-employment losses do not reduce wages. Pension, interest and rental income generally are not compensation. Use the actual completed compensation worksheet.</p>
      <TextFact label="Actual tax year designated for these IRA contributions" value={ira.contributionTaxYear ?? ""} onChange={contributionTaxYear => update({ contributionTaxYear })} />
      <CurrencyField label="Taxpayer traditional IRA contributions for this tax year" hint="Actual paid current-year contributions, excluding rollovers and amounts still needing return or recharacterization treatment." value={ira.primaryContributions} onChange={primaryContributions => update({ primaryContributions })} required />
      <CurrencyField label="Taxpayer actual eligible IRA compensation" value={ira.primaryCompensation ?? ""} onChange={primaryCompensation => update({ primaryCompensation })} required />
      <CurrencyField label="Taxpayer Roth IRA contributions for this tax year" value={ira.primaryRothContributions ?? ""} onChange={primaryRothContributions => update({ primaryRothContributions })} required />
      <CurrencyField label="Taxpayer section 501(c)(18) contributions" value={ira.primarySection501c18Contributions ?? ""} onChange={primarySection501c18Contributions => update({ primarySection501c18Contributions })} required />
      <BooleanFact label="Taxpayer covered by an employer retirement plan at any time during this tax year" value={ira.primaryIsActiveParticipant} onChange={primaryIsActiveParticipant => update({ primaryIsActiveParticipant })} />
      {married && <BooleanFact label="Spouse covered by an employer retirement plan at any time during this tax year" value={ira.spouseIsActiveParticipant} onChange={spouseIsActiveParticipant => update({ spouseIsActiveParticipant })} />}
      {spouseAmounts && <>
        <CurrencyField label="Spouse traditional IRA contributions for this tax year" value={ira.spouseContributions} onChange={spouseContributions => update({ spouseContributions })} required />
        <CurrencyField label="Spouse actual eligible IRA compensation" value={ira.spouseCompensation ?? ""} onChange={spouseCompensation => update({ spouseCompensation })} required />
        <CurrencyField label="Spouse Roth IRA contributions for this tax year" value={ira.spouseRothContributions ?? ""} onChange={spouseRothContributions => update({ spouseRothContributions })} required />
        <CurrencyField label="Spouse section 501(c)(18) contributions" value={ira.spouseSection501c18Contributions ?? ""} onChange={spouseSection501c18Contributions => update({ spouseSection501c18Contributions })} required />
      </>}
      <BooleanFact label="Were these actual contributions timely made for the designated tax year?" value={ira.contributionTimingConfirmed} onChange={contributionTimingConfirmed => update({ contributionTimingConfirmed })} />
      <BooleanFact label="Do rollover, recharacterization, returned or excess contributions still need a separate source worksheet?" value={ira.specialContributionRulesRequired} onChange={specialContributionRulesRequired => update({ specialContributionRulesRequired })} />
      <BooleanFact label="Have you checked all IRA compensation and contribution sources after the last edit?" value={ira.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
      <p className="guided-hint">Blank remains unknown. Confirm actual zero amounts, including both spouses' source amounts on a joint return. Unresolved special contribution treatment stays saved and blocks the ordinary worksheet.</p>
      <button type="button" className="utility-button" onClick={() => onChange({ ...data, iraContributions: undefined, iraDeduction: "" })}>Remove IRA contribution facts</button>
    </div>}
  </>;
}
