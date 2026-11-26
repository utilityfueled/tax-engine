"use client";
import { MortgageInsurancePrepaidFields } from './mortgage-insurance-prepaid-fields';
import { invalidateMortgagePrepaid } from '@/lib/guided-mortgage-insurance-prepaid';

import { type DeductionData, type DonationEntryData, type MortgageEntryData, type FilingStatus, emptyDonationEntry, emptyMortgageEntry } from "@/lib/guided-interview-flow";
import { parseGuidedDisplayAmount, sumGuidedDisplayAmounts } from "@/lib/guided-currency";
import { sumSourceMoney } from "@/utils/sum-source-money";
import { CurrencyField } from "./currency-field";
import { MortgageSourceFields } from "./mortgage-source-fields";
import { MortgageWorksheetDetails } from "./mortgage-worksheet-details";
import { isEnteredMortgageStatement } from "@/lib/guided-mortgage-facts";
import { guidedSourceValuesChanged } from "@/lib/guided-source-confirmation";
import { amountError, guidedAmountChanged, requiresGuidedTangiblePropertyUse } from "@/lib/guided-required-facts";

function TextFact({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "date" }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input type={type} className="guided-input" value={value} onChange={(event) => onChange(event.target.value)} aria-required="true" /></label>;
}

function BooleanFact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from your records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}

const newMortgageStatement: MortgageEntryData = { ...emptyMortgageEntry, mortgageAcquisitionDate: "" };

export function DeductionSourceDetails({ data, onChange, includeMortgages = true, includeDonations = true, taxYear, filingStatus }: { taxYear?:number|null;filingStatus?:FilingStatus|null;data: DeductionData; onChange: (data: DeductionData) => void; includeMortgages?: boolean; includeDonations?: boolean }) {
  // An old aggregate is preserved as the amount needing source details. No other
  // fact is inferred, and merely rendering does not rewrite the saved workspace.
  const mortgages = data.mortgageEntries ?? (data.mortgageInterest.trim() ? [{ ...newMortgageStatement, mortgageInterest: data.mortgageInterest }] : []);
  const donations = data.donationEntries ?? (data.charitableContributions.trim() ? [{ ...emptyDonationEntry, amount: data.charitableContributions }] : []);
  function setMortgages(entries: MortgageEntryData[]) {
    const entered = entries.filter(isEnteredMortgageStatement);
    const known = entered.length > 0 && entered.every(entry => !amountError(entry.mortgageInterest, "mortgage interest"));
    const changed = guidedSourceValuesChanged(data.mortgageEntries, entries);
    onChange({ ...data, mortgageEntries: changed ? entries.map(entry=>entry.insurancePrepaid?{...entry,sourceFactsConfirmed:null,insurancePrepaid:invalidateMortgagePrepaid(entry.insurancePrepaid)}:entry) : entries, mortgageInterest: known ? sumGuidedDisplayAmounts(entered.map(entry => entry.mortgageInterest)).toFixed() : "",
      ...(changed && data.mortgageWorksheet ? { mortgageWorksheet: { ...data.mortgageWorksheet, sourceFactsConfirmed: null, distinctMortgageLoansConfirmation: undefined } } : {}) });
  }
  function setDonations(entries: DonationEntryData[]) {
    const amountsChanged = entries.length !== donations.length || entries.some((entry, index) => guidedAmountChanged(donations[index]?.amount, entry.amount));
    let total = data.charitableContributions;
    if (amountsChanged) {
      const amounts = entries.map(entry => parseGuidedDisplayAmount(entry.amount));
      if (amounts.every(amount => amount.isFinite())) total = sumSourceMoney(...amounts).toFixed();
    }
    const changed = guidedSourceValuesChanged(data.donationEntries, entries);
    onChange({ ...data, donationEntries: entries, charitableContributions: total,
      ...(changed && data.charitableCarryoverSources ? { charitableCarryoverSources: { ...data.charitableCarryoverSources, sourceFactsConfirmed: null } } : {}) });
  }
  return <>
    {includeMortgages && <>
    <h4>Mortgage interest — Form 1098</h4>
    <p className="guided-hint">Copy each lender&apos;s actual amounts and dates. If the original statement leaves Box 11 blank, record that separately.</p>
    <MortgageWorksheetDetails data={data.mortgageWorksheet} entries={mortgages.filter(isEnteredMortgageStatement)} onChange={mortgageWorksheet => {
      const changed=guidedSourceValuesChanged(data.mortgageWorksheet,mortgageWorksheet);
      onChange({...data,mortgageWorksheet,...(changed?{mortgageEntries:data.mortgageEntries?.map(entry=>entry.insurancePrepaid?{...entry,sourceFactsConfirmed:null,insurancePrepaid:invalidateMortgagePrepaid(entry.insurancePrepaid)}:entry)}:{})});
    }} />
    {mortgages.map((entry, index) => {
      const update = (change: Partial<MortgageEntryData>) => setMortgages(mortgages.map((item, i) => {
        if(i!==index)return item;
        const next={...item,...change};
        if (!guidedSourceValuesChanged(item,next)) return next;
        return {...next,sourceFactsConfirmed:('sourceFactsConfirmed' in change ? change.sourceFactsConfirmed : null),...(next.insurancePrepaid ? {insurancePrepaid:invalidateMortgagePrepaid(next.insurancePrepaid)} : {})};
      }));
      return <fieldset className="guided-fieldset" key={index}><legend>Mortgage #{index + 1}</legend><div className="guided-form-grid">
        <TextFact label="Mortgage lender" value={entry.lender} onChange={(lender) => update({ lender })} />
        <CurrencyField label="Home mortgage interest" value={entry.mortgageInterest} onChange={(mortgageInterest) => update({ mortgageInterest })} required />
        <CurrencyField label="Outstanding mortgage principal (Box 2)" value={entry.outstandingPrincipal} onChange={(outstandingPrincipal) => update({ outstandingPrincipal })} required />
        <TextFact label="Mortgage origination date (Box 3)" value={entry.originationDate} type="date" onChange={(originationDate) => update({ originationDate })} />
        <MortgageSourceFields entry={entry} onChange={update} />
        {entry.insuranceAllocationMethod === 'current-original-prepaid' && <MortgageInsurancePrepaidFields data={data} index={index} taxYear={taxYear} filingStatus={filingStatus} onChange={insurancePrepaid=>update({insurancePrepaid})}/>}
      </div><button type="button" className="utility-button" onClick={() => setMortgages(mortgages.filter((_, i) => i !== index))}>Remove mortgage #{index + 1}</button></fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => setMortgages([...mortgages, { ...newMortgageStatement }])}>Add mortgage</button>
    </>}
    {includeDonations && <><h4>Charitable contributions</h4>
    {donations.map((entry, index) => {
      const update = (change: Partial<DonationEntryData>) => {
        const changesProperty = entry.tangiblePropertyUse !== undefined && (
          (Object.hasOwn(change, "amount") && guidedAmountChanged(entry.amount, change.amount))
          || (Object.hasOwn(change, "costBasis") && guidedAmountChanged(entry.costBasis, change.costBasis))
          || (["organization", "type", "date", "qualifiedOrganization", "recipientCategory", "isLongTermCapitalGain"] as const)
            .some(field => Object.hasOwn(change, field) && change[field] !== entry[field])
        );
        setDonations(donations.map((item, i) => i === index
          ? { ...item, ...change, ...(changesProperty ? { tangiblePropertyUse: undefined } : {}) } : item));
      };
      const clearBenefit = { cashBenefitValue: undefined, cashExcessGiftIntended: undefined };
      const clearCashBasis = { cashAmountBasis: null, ...clearBenefit };
      const isGross = entry.type === "cash" && entry.cashAmountBasis === "gross-payment";
      const benefit = parseGuidedDisplayAmount(entry.cashBenefitValue);
      const confirmExcess = isGross && benefit.gt(0) && parseGuidedDisplayAmount(entry.amount).gt(benefit);
      const amountLabel = entry.type !== "cash" ? "Donation amount / fair market value"
        : isGross ? "Gross cash payment" : entry.cashAmountBasis === "net-contribution" ? "Net charitable contribution" : "Cash amount";
      const updateRecipient = (organization: string) => {
        if (organization.trim() === entry.organization.trim()) {
          update({ organization });
          return;
        }
        update({
          organization,
          isPrivateFoundation: null,
          recipientCategory: null,
          qualifiedOrganization: null,
          supportingOrganization: null,
          donorAdvisedFund: null,
          qualifiedAppreciatedStock: null,
          ...(entry.type === "cash" ? clearCashBasis : {}),
        });
      };
      return <fieldset className="guided-fieldset" key={index}><legend>Donation #{index + 1}</legend><div className="guided-form-grid">
        <TextFact label="Donation recipient" value={entry.organization} onChange={updateRecipient} />
        <label className="guided-field"><span className="guided-field-label">Donation type</span><select className="guided-input" value={entry.type} onChange={(event) => {
          const type = event.target.value as DonationEntryData["type"];
          update({ type, ...(type !== entry.type && (type === "cash" || entry.type === "cash") ? clearCashBasis : {}) });
        }}><option value="">Choose the actual type</option><option value="cash">Cash</option><option value="appreciated_stock">Appreciated stock</option><option value="property">Property</option><option value="other">Other noncash property</option></select></label>
        {entry.type === "cash" && <label className="guided-field"><span className="guided-field-label">Cash amount basis</span><select className="guided-input" value={entry.cashAmountBasis ?? ""} onChange={event => {
          const cashAmountBasis = (event.target.value || null) as DonationEntryData["cashAmountBasis"];
          update({ cashAmountBasis, ...(cashAmountBasis !== entry.cashAmountBasis ? clearBenefit : {}) });
        }}><option value="">Confirm from your records</option><option value="net-contribution">Net charitable contribution on the acknowledgment</option><option value="gross-payment">Gross payment before subtracting benefits</option></select></label>}
        <CurrencyField label={amountLabel} value={entry.amount} onChange={amount => update({ amount,
          ...(isGross && guidedAmountChanged(entry.amount, amount) ? { cashExcessGiftIntended: undefined } : {}),
        })} required />
        <TextFact label="Donation date" value={entry.date} type="date" onChange={date => update({ date,
          ...(isGross && date !== entry.date ? clearBenefit : {}),
        })} />
        {isGross && <CurrencyField label="Fair market value of goods or services" value={entry.cashBenefitValue ?? ""}
          hint="Include goods or services you received or expected. Enter zero only when there were none. Use the net amount on the acknowledgment if an exception applies."
          onChange={cashBenefitValue => update({ cashBenefitValue,
            ...(guidedAmountChanged(entry.cashBenefitValue, cashBenefitValue) ? { cashExcessGiftIntended: undefined } : {}),
          })} required />}
        {confirmExcess && <BooleanFact label="Did you intend to contribute the excess as a gift?" value={entry.cashExcessGiftIntended} onChange={cashExcessGiftIntended => update({ cashExcessGiftIntended })} />}
        <label className="guided-field"><span className="guided-field-label">Recipient tax category</span><select className="guided-input"
          value={entry.recipientCategory === undefined && entry.isPrivateFoundation === false ? "legacy-public" : entry.recipientCategory ?? ""}
          onChange={(event) => update({ recipientCategory: event.target.value === "" ? null : event.target.value as DonationEntryData["recipientCategory"] })}>
          <option value="">Confirm from the recipient&apos;s records</option>
          {entry.recipientCategory === undefined && entry.isPrivateFoundation === false && <option value="legacy-public" disabled>Saved public / 50% limit classification</option>}
          <option value="fifty-percent">Public charity or qualifying 50% limit foundation</option>
          <option value="private-nonoperating">Private nonoperating foundation outside the 50% limit category</option>
          <option value="other-thirty-percent">Other qualified 30% limit organization</option>
        </select></label>
        {entry.isPrivateFoundation === true && entry.recipientCategory == null && <p className="guided-hint">The saved foundation / second-category answer is retained. Confirm the actual tax category; qualifying operating foundations can use the public-charity category.</p>}
        <BooleanFact label="Recipient qualifies for a charitable contribution deduction" value={entry.qualifiedOrganization} onChange={(qualifiedOrganization) => update({ qualifiedOrganization })} />
        <BooleanFact label="Recipient is a supporting organization" value={entry.supportingOrganization} onChange={(supportingOrganization) => update({ supportingOrganization })} />
        <BooleanFact label="Gift was to a donor-advised fund" value={entry.donorAdvisedFund} onChange={(donorAdvisedFund) => update({ donorAdvisedFund })} />
        {entry.type && entry.type !== "cash" && <>
          <CurrencyField label="Donated property's cost basis" value={entry.costBasis} onChange={(costBasis) => update({ costBasis })} required />
          <BooleanFact label="Long-term capital gain property" value={entry.isLongTermCapitalGain} onChange={(isLongTermCapitalGain) => update({ isLongTermCapitalGain })} />
          {entry.recipientCategory === "private-nonoperating" && entry.isLongTermCapitalGain && <BooleanFact label="Gift is qualified appreciated stock" value={entry.qualifiedAppreciatedStock} onChange={(qualifiedAppreciatedStock) => update({ qualifiedAppreciatedStock })} />}
          {requiresGuidedTangiblePropertyUse(entry) && entry.recipientCategory === "fifty-percent" && <TangiblePropertyUseFields
            value={entry.tangiblePropertyUse ?? {}}
            onChange={tangiblePropertyUse => update({ tangiblePropertyUse })} />}
        </>}
      </div><button type="button" className="utility-button" onClick={() => setDonations(donations.filter((_, i) => i !== index))}>Remove donation #{index + 1}</button></fieldset>;
    })}
    <button type="button" className="utility-button" onClick={() => setDonations([...donations, { ...emptyDonationEntry }])}>Add donation</button>
    </>}
  </>;
}

type TangiblePropertyUseData = NonNullable<DonationEntryData["tangiblePropertyUse"]>;

function TangiblePropertyUseFields({ value, onChange }: { value: TangiblePropertyUseData; onChange: (data: TangiblePropertyUseData) => void }) {
  return <>
    <TextFact label="Donee-use record reference" value={value.sourceReference ?? ""}
      onChange={sourceReference => onChange({ sourceReference })} />
    <label className="guided-field"><span className="guided-field-label">Documented use by the organization</span>
      <select className="guided-input" value={value.doneeUse ?? ""} onChange={event => {
        const doneeUse = (event.target.value || null) as TangiblePropertyUseData["doneeUse"];
        onChange({ ...value, doneeUse, noAdditionalValuationRuleConfirmed: null });
      }}><option value="">Choose the documented use</option><option value="related">Used for its exempt purpose</option>
        <option value="unrelated">Unrelated use, such as sale to raise funds</option></select>
    </label>
    <BooleanFact label="I gave my entire interest in ordinary tangible personal property" value={value.ordinaryWholeInterestConfirmed}
      onChange={ordinaryWholeInterestConfirmed => onChange({ ...value, ordinaryWholeInterestConfirmed })} />
    <BooleanFact label="No other special valuation or recapture rule applies" value={value.noAdditionalValuationRuleConfirmed}
      onChange={noAdditionalValuationRuleConfirmed => onChange({ ...value, noAdditionalValuationRuleConfirmed })} />
  </>;
}
