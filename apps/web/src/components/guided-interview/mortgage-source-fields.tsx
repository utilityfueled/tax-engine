"use client";

import type { MortgageEntryData } from "@/lib/guided-interview-flow";
import { mortgagePointFacts } from "@/lib/guided-mortgage-facts";
import { parseGuidedDisplayAmount } from "@/lib/guided-currency";
import { CurrencyField } from "./currency-field";

function Fact({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (value: boolean | null) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value == null ? "" : String(value)} onChange={event => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Confirm from actual records</option><option value="true">Yes</option><option value="false">No</option></select></label>;
}
function Text({ label, value, onChange, type = "text" }: { label: string; value: string | undefined; onChange: (value: string) => void; type?: "text" | "date" }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" type={type} value={value ?? ""} onChange={event => onChange(event.target.value)} /></label>;
}

export function MortgageSourceFields({ entry, onChange }: { entry: MortgageEntryData; onChange: (change: Partial<MortgageEntryData>) => void }) {
  return <>
    <Text label="Mortgage statement tax year" value={entry.sourceTaxYear} onChange={sourceTaxYear => onChange({ sourceTaxYear })} />
    <Text label="Loan account reference (last four digits or local statement label)" value={entry.accountReference} onChange={accountReference => onChange({ accountReference })} />
    <label className="guided-field"><span className="guided-field-label">Borrowers whose payments this return claims</span><select className="guided-input" value={entry.accountHolder ?? ""} onChange={event => onChange({ accountHolder: event.target.value as MortgageEntryData["accountHolder"] })}><option value="">Choose actual borrower</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse</option><option value="joint">Both spouses on this joint return</option></select></label>
    <Text label="Address or description of the home securing the loan" value={entry.propertyAddress} onChange={propertyAddress => onChange({ propertyAddress })} />
    <label className="guided-field"><span className="guided-field-label">Actual home use</span><select className="guided-input" value={entry.propertyUse ?? ""} onChange={event => onChange({ propertyUse: event.target.value as MortgageEntryData["propertyUse"] })}><option value="">Choose actual use</option><option value="main-home">Main home</option><option value="second-home">Qualified second home</option><option value="other">Other or changing use</option></select></label>
    <label className="guided-field"><span className="guided-field-label">Actual loan type</span><select className="guided-input" value={entry.loanType ?? ""} onChange={event => onChange({ loanType: event.target.value as MortgageEntryData["loanType"] })}><option value="">Choose actual loan</option><option value="original">Original purchase or improvement loan</option><option value="refinance">Refinanced debt</option><option value="heloc">Home-equity loan or line of credit</option><option value="reverse">Reverse mortgage</option><option value="other">Other loan</option></select></label>
    <label className="guided-field"><span className="guided-field-label">Actual use of all loan proceeds</span><select className="guided-input" value={entry.proceedsUse ?? ""} onChange={event => onChange({ proceedsUse: event.target.value as MortgageEntryData["proceedsUse"] })}><option value="">Choose actual use</option><option value="acquisition">Buy, build or substantially improve this securing home</option><option value="mixed">Mixed qualifying and other uses</option><option value="other">Other use</option></select></label>
    <CurrencyField label="Maximum actual loan balance at any time during the tax year" hint="Use the complete balance history. Box 2 alone is not the annual maximum or average balance." value={entry.maximumBalanceDuringYear ?? ""} onChange={maximumBalanceDuringYear => onChange({ maximumBalanceDuringYear })} required />
    <Fact label="Is the debt legally secured by this qualified home?" value={entry.securedDebt} onChange={securedDebt => onChange({ securedDebt })} />
    <Fact label="Do the borrowers claiming the deduction have an ownership interest in this home?" value={entry.ownershipInterest} onChange={ownershipInterest => onChange({ ownershipInterest })} />
    <Fact label="Do borrower and lender intend and require repayment?" value={entry.obligationToRepay} onChange={obligationToRepay => onChange({ obligationToRepay })} />
    <Fact label="Was all claimed interest paid by taxpayers on this return, with no outside payer or subsidy?" value={entry.interestPaidByReturn} onChange={interestPaidByReturn => onChange({ interestPaidByReturn })} />
    <Fact label="Does the interest exclude prepaid amounts allocable to a later year?" value={entry.currentYearInterestOnly} onChange={currentYearInterestOnly => onChange({ currentYearInterestOnly })} />
    <Fact label="Was any part of this home or debt used for rental or business purposes?" value={entry.rentalOrBusinessUse} onChange={rentalOrBusinessUse => onChange({ rentalOrBusinessUse })} />
    <Fact label="Do you have a mortgage credit certificate for this loan?" value={entry.mortgageCreditCertificate} onChange={mortgageCreditCertificate => onChange({ mortgageCreditCertificate })} />
    <Fact label="Do cooperative, construction, ground-rent, changing-home or other special mortgage rules apply?" value={entry.specialCircumstances} onChange={specialCircumstances => onChange({ specialCircumstances })} />
    <CurrencyField label="Prior-year interest refund (Box 4)" hint="Keep the actual refund. A positive amount requires a separate tax-benefit recovery worksheet." value={entry.refundOfOverpaidInterest ?? ""} onChange={refundOfOverpaidInterest => onChange({ refundOfOverpaidInterest })} required />
    <CurrencyField label="Mortgage insurance premiums reported (Box 5)" hint="This source amount may differ from premiums allocated to this year." value={entry.mortgageInsurancePremiums ?? ""} onChange={mortgageInsurancePremiums => onChange({ mortgageInsurancePremiums })} required />
    <CurrencyField label="Purchase points reported (Box 6)" value={entry.pointsPaid ?? ""} onChange={pointsPaid => onChange({ pointsPaid })} required />
    {parseGuidedDisplayAmount(entry.pointsPaid).gt(0) && <fieldset className="guided-fieldset"><legend>Current-year purchase points</legend><p className="guided-hint">All conditions must be met for the full current-year deduction. Other points require their actual amortization and allocation history.</p>{Object.entries(mortgagePointFacts).map(([field, label]) => <Fact key={field} label={label} value={entry[field as keyof typeof mortgagePointFacts]} onChange={value => onChange({ [field]: value })} />)}</fieldset>}
    <CurrencyField label="Qualified real estate taxes actually disbursed by this mortgage account" hint="Exclude escrow deposits, fees and assessments. Do not enter these taxes again in the additional real estate tax field." value={entry.propertyTaxPaid ?? ""} onChange={propertyTaxPaid => onChange({ propertyTaxPaid })} required />
    {parseGuidedDisplayAmount(entry.propertyTaxPaid).gt(0) && <Fact label="Are these actual qualified tax disbursements, with no escrow deposits or duplicate deductions?" value={entry.propertyTaxDisbursementConfirmed} onChange={propertyTaxDisbursementConfirmed => onChange({ propertyTaxDisbursementConfirmed })} />}
    {entry.sourceTaxYear === "2026" && <>
      <Fact label="Do current or prepaid mortgage insurance premiums need evaluation for this year?" value={entry.hasMortgageInsuranceAllocation} onChange={hasMortgageInsuranceAllocation => onChange({ hasMortgageInsuranceAllocation })} />
      {entry.hasMortgageInsuranceAllocation === true && <fieldset className="guided-fieldset"><legend>Actual mortgage insurance allocation</legend>
        <Text label="Mortgage insurance contract issue date" type="date" value={entry.insuranceContractIssueDate} onChange={insuranceContractIssueDate => onChange({ insuranceContractIssueDate })} />
        <Text label="Mortgage insurance allocation tax year" value={entry.insuranceAllocationTaxYear} onChange={insuranceAllocationTaxYear => onChange({ insuranceAllocationTaxYear })} />
        <Fact label="Is the insurance provided by VA, FHA, RHS or qualifying private mortgage insurance?" value={entry.insuranceQualifiedProvider} onChange={insuranceQualifiedProvider => onChange({ insuranceQualifiedProvider })} />
        <Fact label="Is the insurance for qualifying acquisition debt?" value={entry.insuranceAcquisitionDebt} onChange={insuranceAcquisitionDebt => onChange({ insuranceAcquisitionDebt })} />
        <Fact label="Is the insured debt on a qualified residence?" value={entry.insuranceQualifiedResidence} onChange={insuranceQualifiedResidence => onChange({ insuranceQualifiedResidence })} />
        <CurrencyField label="Actual insurance premiums allocable to this tax year" hint="Use the actual prepaid-premium allocation. Do not copy Box 5 unless records establish the same annual amount." value={entry.insurancePremiumsAllocableToYear ?? ""} onChange={insurancePremiumsAllocableToYear => onChange({ insurancePremiumsAllocableToYear })} required />
      </fieldset>}
    </>}
    <Fact label="Have you checked all mortgage source and qualification facts after the last edit?" value={entry.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ sourceFactsConfirmed })} />
    <p className="guided-hint">Refinancing, home-equity or reverse loans, mixed use, refunds, outside payment allocations and debt-limit worksheets remain saved for review. This ordinary path cannot calculate those cases yet.</p>
  </>;
}
