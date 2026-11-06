"use client";
import type { FilingStatus } from "@/lib/guided-interview-flow";
import type { StandardDeductionData } from "@/lib/guided-standard-deduction-facts";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

export function StandardDeductionSourceDetails({ data, filingStatus, onChange }: { data: StandardDeductionData | undefined; filingStatus: FilingStatus | null; onChange: (data: StandardDeductionData) => void }) {
  const current = data ?? {};
  const update = (next: Partial<StandardDeductionData>) => onChange({ ...current, ...next });
  const spouseFacts = filingStatus === "mfj" || (filingStatus === "mfs" && current.claimSpouseAdditionalDeduction);
  return <fieldset className="guided-fieldset"><legend>Standard deduction eligibility</legend>
    <p className="guided-hint">Age comes from actual birth and death dates. Confirm blindness using the IRS definition and use claimable dependency even if another person chooses not to claim you. <a href="https://www.irs.gov/publications/p501" target="_blank" rel="noreferrer">Review Publication 501</a>.</p>
    <BooleanFact label="Were you blind under the IRS standard-deduction definition?" value={current.primaryBlind} onChange={primaryBlind => update({ primaryBlind })} />
    <BooleanFact label="Could another taxpayer claim you as a dependent for the standard deduction?" value={current.primaryCanBeClaimedAsDependent} onChange={primaryCanBeClaimedAsDependent => update({ primaryCanBeClaimedAsDependent })} />
    <BooleanFact label="Did the primary taxpayer die during this tax year?" value={current.primaryDeceased} onChange={primaryDeceased => update({ primaryDeceased })} />
    {(current.primaryDeceased || current.primaryDeathDate?.trim()) && <TextFact label="Actual primary taxpayer death date" type="date" value={current.primaryDeathDate ?? ""} onChange={primaryDeathDate => update({ primaryDeathDate })} />}
    <BooleanFact label="Were you a dual-status alien during this tax year?" value={current.dualStatusAlien} onChange={dualStatusAlien => update({ dualStatusAlien })} />
    <BooleanFact label="Were you a nonresident alien for the standard-deduction rules?" value={current.nonresidentAlien} onChange={nonresidentAlien => update({ nonresidentAlien })} />
    <BooleanFact label="Is this a short tax year because of an accounting-period change?" value={current.shortTaxYear} onChange={shortTaxYear => update({ shortTaxYear })} />
    {filingStatus === "mfj" && (current.dualStatusAlien || current.nonresidentAlien) && <BooleanFact label="Did you make the qualifying resident joint-return election for the standard deduction?" value={current.residentJointElection} onChange={residentJointElection => update({ residentJointElection })} />}
    {filingStatus === "mfs" && <>
      <BooleanFact label="Does your spouse itemize deductions on their separate return?" value={current.spouseItemizes} onChange={spouseItemizes => update({ spouseItemizes })} />
      <BooleanFact label="Do you elect the additional age/blindness deduction for an eligible spouse on your separate return?" value={current.claimSpouseAdditionalDeduction} onChange={claimSpouseAdditionalDeduction => update({ claimSpouseAdditionalDeduction })} />
    </>}
    {spouseFacts && <>
      <BooleanFact label="Was your spouse blind under the IRS standard-deduction definition?" value={current.spouseBlind} onChange={spouseBlind => update({ spouseBlind })} />
      <BooleanFact label="Could another taxpayer claim your spouse as a dependent?" value={current.spouseCanBeClaimedAsDependent} onChange={spouseCanBeClaimedAsDependent => update({ spouseCanBeClaimedAsDependent })} />
      <BooleanFact label="Did your spouse die during this tax year?" value={current.spouseDeceased} onChange={spouseDeceased => update({ spouseDeceased })} />
      {(current.spouseDeceased || current.spouseDeathDate?.trim()) && <TextFact label="Actual spouse death date" type="date" value={current.spouseDeathDate ?? ""} onChange={spouseDeathDate => update({ spouseDeathDate })} />}
      {filingStatus === "mfs" && <><BooleanFact label="Did your spouse have gross income?" value={current.spouseHasGrossIncome} onChange={spouseHasGrossIncome => update({ spouseHasGrossIncome })} /><BooleanFact label="Does your spouse file their own return?" value={current.spouseFilesReturn} onChange={spouseFilesReturn => update({ spouseFilesReturn })} /></>}
    </>}
    {(current.primaryCanBeClaimedAsDependent || (filingStatus === "mfj" && current.spouseCanBeClaimedAsDependent) || current.dependentEarnedIncome?.trim()) && <CurrencyField allowNegative label="Actual dependent earned-income worksheet amount" hint="Use the Publication 501 worksheet, including taxable scholarships and the applicable net business income and self-employment tax adjustment. A net business loss may produce a negative amount; do not substitute W-2 wages." value={current.dependentEarnedIncome ?? ""} onChange={dependentEarnedIncome => update({ dependentEarnedIncome })} />}
  </fieldset>;
}
