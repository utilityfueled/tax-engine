"use client";

import type { AdjustmentData, FilingStatus } from "@/lib/guided-interview-flow";
import { emptyHsaAccount, type HsaAccountData, type HsaCoverageFact } from "@/lib/guided-hsa-facts";
import { CurrencyField } from "./currency-field";
import { BooleanFact, TextFact } from "./fact-fields";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const moneyFields = [
  ["contributionsMade", "Personal HSA contributions paid for this tax year", "Exclude payroll cafeteria-plan amounts, rollovers, IRA funding and returned contributions."],
  ["employerW2Contributions", "Current W-2 code W total for this owner", "Use the actual matching owner W-2 sources, including known zero."],
  ["employerPriorYearContributions", "Code W amounts designated for the prior year", "Part of the current W-2 total that belongs to the prior contribution year."],
  ["employerFollowingYearContributions", "Following-year employer amounts designated for this year", "Actual amounts contributed by the deadline for this tax year; exclude future plans."],
  ["archerMsaContributions", "Archer MSA contributions for the HSA limitation", "Actual Form 8853 amounts, including applicable spouse amounts. Positive MSA sources need their separate coordinated worksheet."],
  ["qualifiedFundingDistribution", "Qualified IRA-to-HSA funding distributions", "Actual current-year funding. Positive amounts need the coordinated IRA and HSA source worksheets."],
  ["priorYearExcessContributions", "Prior-year HSA excess contributions", "Actual prior Form 5329 line 48, before the current-year source worksheet applies its rules."],
  ["priorYearAdditionalTax", "Prior-year HSA additional tax", "Actual prior Form 5329 line 49, including known zero. Do not infer it from the prior excess."],
  ["yearEndFairMarketValue", "Year-end fair market value of this owner's HSAs", "Actual value used for any excess-contribution tax, including known zero."],
] as const;

export function HsaSourceDetails({ data, filingStatus, taxYear, onChange }: { data: AdjustmentData; filingStatus?: FilingStatus | null; taxYear?: number | null; onChange: (data: AdjustmentData) => void }) {
  const accounts = data.hsaAccounts ?? [];
  const update = (index: number, change: Partial<HsaAccountData>) => onChange({ ...data, hsaAccounts: accounts.map((account, position) => position === index ? { ...account, sourceFactsConfirmed: null, ...change } : account) });
  return <section aria-label="Actual HSA sources">
    <h4>Health Savings Accounts</h4>
    <p className="guided-hint">Enter a separate worksheet for each actual owner. These facts calculate the deduction; an estimated deduction is not a contribution record. {taxYear ? `This return is for ${taxYear}.` : "Select the return year before calculating."}</p>
    {data.hsaDeduction.trim() && <p className="guided-hint">Saved HSA deduction estimate: {data.hsaDeduction}. It will not be used as an actual contribution. <button type="button" className="utility-button" onClick={() => onChange({ ...data, hsaDeduction: "" })}>Clear saved HSA deduction estimate</button></p>}
    {accounts.map((account, index) => {
      const label = (text: string) => `HSA ${index + 1}: ${text}`;
      const history = account.testingPeriod;
      const updateHistory = (change: Partial<NonNullable<HsaAccountData["testingPeriod"]>>) => update(index, { testingPeriod: { failureDate: "", rule: "", deathOrDisabilityException: null, ...history, ...change } });
      const firstMonthKnown = !!account.coverageByMonth[0] && typeof account.medicareByMonth[0] === "boolean" && typeof account.otherDisqualifyingCoverageByMonth[0] === "boolean";
      return <fieldset key={account.id} className="guided-expand-body"><legend>HSA owner worksheet {index + 1}</legend>
        <div className="guided-form-grid">
          <label className="guided-field"><span className="guided-field-label">{label("Account owner")}</span><select className="guided-select" value={account.accountOwner} onChange={event => update(index, { accountOwner: event.target.value as HsaAccountData["accountOwner"] })}><option value="">Actual owner</option><option value="primary">Taxpayer</option><option value="spouse">Spouse</option></select></label>
          <TextFact label={label("Actual contribution tax year")} value={account.contributionTaxYear} onChange={contributionTaxYear => update(index, { contributionTaxYear })} />
          <TextFact label={label("Actual prior excess-source tax year")} value={account.priorYearSourceTaxYear} onChange={priorYearSourceTaxYear => update(index, { priorYearSourceTaxYear })} />
          <BooleanFact label={label("Can someone else claim this owner as a dependent?")} value={account.canBeClaimedAsDependent} onChange={canBeClaimedAsDependent => update(index, { canBeClaimedAsDependent })} />
        </div>
        <p className="guided-hint">Use the first day of each month. Confirm that the plan qualifies as an HDHP under the rules for this tax year. If both spouses are eligible and either has family coverage, use family coverage for both. Include retroactive Medicare and disqualifying FSA/HRA or other coverage; permitted coverage is excluded from the disqualifying answer.</p>
        <div className="guided-form-grid">
          {months.map((month, position) => <fieldset key={month}><legend>{month}</legend>
            <label className="guided-field"><span className="guided-field-label">{label(`${month} HDHP coverage`)}</span><select className="guided-select" value={account.coverageByMonth[position] ?? ""} onChange={event => update(index, { coverageByMonth: Array.from({ length: 12 }, (_, i) => i === position ? event.target.value as HsaCoverageFact : account.coverageByMonth[i] ?? "") })}><option value="">Unknown</option><option value="none">No qualifying HDHP</option><option value="self_only">Self-only</option><option value="family">Family</option></select></label>
            <BooleanFact label={label(`${month} Medicare enrollment`)} value={account.medicareByMonth[position]} onChange={value => update(index, { medicareByMonth: Array.from({ length: 12 }, (_, i) => i === position ? value : account.medicareByMonth[i] ?? null) })} />
            <BooleanFact label={label(`${month} other disqualifying coverage`)} value={account.otherDisqualifyingCoverageByMonth[position]} onChange={value => update(index, { otherDisqualifyingCoverageByMonth: Array.from({ length: 12 }, (_, i) => i === position ? value : account.otherDisqualifyingCoverageByMonth[i] ?? null) })} />
          </fieldset>)}
        </div>
        <button type="button" className="utility-button" disabled={!firstMonthKnown} onClick={() => update(index, { coverageByMonth: Array(12).fill(account.coverageByMonth[0]), medicareByMonth: Array(12).fill(account.medicareByMonth[0]), otherDisqualifyingCoverageByMonth: Array(12).fill(account.otherDisqualifyingCoverageByMonth[0]) })}>{label("Apply January answers to all months")}</button>
        <p className="guided-hint">Apply the same answers only if the actual coverage was unchanged throughout the year. Then review all twelve months.</p>
        <div className="guided-form-grid">
          <BooleanFact label={label("Monthly eligibility checked against actual coverage records")} value={account.monthlyEligibilityConfirmed} onChange={monthlyEligibilityConfirmed => update(index, { monthlyEligibilityConfirmed })} />
          {moneyFields.map(([field, text, hint]) => <CurrencyField key={field} label={label(text)} hint={hint} value={account[field]} onChange={value => update(index, { [field]: value })} required />)}
          <BooleanFact label={label("Personal contributions were timely paid for the designated year")} value={account.contributionTimingConfirmed} onChange={contributionTimingConfirmed => update(index, { contributionTimingConfirmed })} />
          <CurrencyField label={label("Excess employer HSA contributions already included in wages")} hint="For actual employer contributions, check payroll records and enter the amount already included in Box 1, including known zero. Do not infer this from code W." value={account.excessEmployerContributionsAlreadyInWages ?? ""} onChange={excessEmployerContributionsAlreadyInWages => update(index, { excessEmployerContributionsAlreadyInWages })} />
          <BooleanFact label={label("Employer contribution worksheet checked against payroll and custodian records")} value={account.employerWorksheetConfirmed} onChange={employerWorksheetConfirmed => update(index, { employerWorksheetConfirmed })} />
          <BooleanFact label={label("Both spouses have separate HSAs")} value={account.bothSpousesHaveHsas} onChange={bothSpousesHaveHsas => update(index, { bothSpousesHaveHsas })} />
          {account.bothSpousesHaveHsas === true && <>
            <CurrencyField label={label("This owner's agreed family-limit share before catch-up")} value={account.spouseAllocatedLimit} onChange={spouseAllocatedLimit => update(index, { spouseAllocatedLimit })} />
            <CurrencyField label={label("Other spouse's agreed family-limit share before catch-up")} value={account.otherSpouseAllocatedLimit} onChange={otherSpouseAllocatedLimit => update(index, { otherSpouseAllocatedLimit })} />
            <BooleanFact label={label("Both actual allocation shares checked and agreed")} value={account.allocationWorksheetConfirmed} onChange={allocationWorksheetConfirmed => update(index, { allocationWorksheetConfirmed })} />
            <p className="guided-hint">A joint return needs both owner worksheets. Mixed family/self-only or Medicare periods need the complete allocation worksheet before this ordinary flow can calculate.</p>
          </>}
          <BooleanFact label={label("Use the last-month rule instead of only monthly eligibility")} value={account.useLastMonthRule} onChange={useLastMonthRule => update(index, { useLastMonthRule })} />
          {account.useLastMonthRule === true && <BooleanFact label={label("I understand the last-month-rule testing period through December of the following year")} value={account.lastMonthRuleAcknowledged} onChange={lastMonthRuleAcknowledged => update(index, { lastMonthRuleAcknowledged })} />}
          <BooleanFact label={label("Any HSA distributions during this year")} value={account.hasDistributions} onChange={hasDistributions => update(index, { hasDistributions })} />
          <BooleanFact label={label("Any returned contributions or correction relief requiring a worksheet")} value={account.correctionsRequired} onChange={correctionsRequired => update(index, { correctionsRequired })} />
          <BooleanFact label={label("A last-month-rule or IRA-funding testing period failed during this year")} value={account.testingPeriodFailure} onChange={testingPeriodFailure => update(index, { testingPeriodFailure })} />
          {account.testingPeriodFailure === true && <>
            <TextFact label={label("Actual testing-period failure date")} type="date" value={history?.failureDate ?? ""} onChange={failureDate => updateHistory({ failureDate })} />
            <label className="guided-field"><span className="guided-field-label">{label("Actual failed testing rule")}</span><select className="guided-select" value={history?.rule ?? ""} onChange={event => updateHistory({ rule: event.target.value as NonNullable<HsaAccountData["testingPeriod"]>["rule"] })}><option value="">Unknown</option><option value="last_month_rule">Prior last-month rule</option><option value="qualified_funding">Qualified IRA funding</option><option value="both">Both</option></select></label>
            <BooleanFact label={label("Failure was caused by death or disability")} value={history?.deathOrDisabilityException} onChange={deathOrDisabilityException => updateHistory({ deathOrDisabilityException })} />
            {(history?.rule === "last_month_rule" || history?.rule === "both") && <>
              <TextFact label={label("Actual prior last-month contribution year")} value={history.contributionTaxYear ?? ""} onChange={contributionTaxYear => updateHistory({ contributionTaxYear })} />
              <CurrencyField label={label("Actual contributions under that prior last-month rule")} value={history.lastMonthRuleContributions ?? ""} onChange={lastMonthRuleContributions => updateHistory({ lastMonthRuleContributions })} />
              <CurrencyField label={label("Actual redetermined prior-year limit without the last-month rule")} value={history.redeterminedLimit ?? ""} onChange={redeterminedLimit => updateHistory({ redeterminedLimit })} />
            </>}
            {(history?.rule === "qualified_funding" || history?.rule === "both") && <>
              <TextFact label={label("Actual IRA-to-HSA funding date")} type="date" value={history.fundingDistributionDate ?? ""} onChange={fundingDistributionDate => updateHistory({ fundingDistributionDate })} />
              <CurrencyField label={label("Actual qualified funding distribution subject to recapture")} value={history.fundingDistributionAmount ?? ""} onChange={fundingDistributionAmount => updateHistory({ fundingDistributionAmount })} />
            </>}
          </>}
          {history && account.testingPeriodFailure !== true && <p className="guided-hint">Saved testing-period history remains for reconciliation. <button type="button" className="utility-button" onClick={() => update(index, { testingPeriod: undefined })}>{label("Clear saved testing-period history")}</button></p>}
          <BooleanFact label={label("All HSA source facts checked after the last edit")} value={account.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update(index, { sourceFactsConfirmed })} />
        </div>
        {account.accountOwner === "spouse" && filingStatus !== "mfj" && <p className="guided-hint">The saved spouse worksheet requires a joint return and remains saved for reconciliation.</p>}
        <button type="button" className="utility-button" onClick={() => onChange({ ...data, hsaAccounts: accounts.filter((_, position) => position !== index) })}>{label("Remove this owner worksheet")}</button>
      </fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => onChange({ ...data, hsaAccounts: [...accounts, emptyHsaAccount(crypto.randomUUID())] })}>Add HSA owner worksheet</button>
  </section>;
}
