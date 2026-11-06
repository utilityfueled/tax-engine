"use client";

import { updateVehicleRefinancing, type VehicleRefinancingData, type OriginalVehicleLoanData, type VehicleRefinanceLoanData } from '@/lib/guided-vehicle-refinancing';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

type CommonLoan = OriginalVehicleLoanData | VehicleRefinanceLoanData;
function LoanFields({ label, row, onChange }: { label: string; row: CommonLoan; onChange: (patch: Partial<CommonLoan>) => void }) {
  return <>
    {([
      ['sourceId', 'Source ID'], ['sourceReference', 'Source reference'], ['lenderName', 'Lender'], ['loanAccountReference', 'Loan account reference'],
    ] as const).map(([key, text]) => <TextFact key={key} label={`${label}: ${text}`} value={row[key] ?? ''} onChange={value => onChange({ [key]: value })} />)}
    <TextFact label={`${label}: Loan date`} type="date" value={row.originationDate ?? ''} onChange={originationDate => onChange({ originationDate })} />
    {([
      ['principal', 'Original principal of this loan'], ['interestPaid', 'Current-year interest paid'],
      ['interestDeductedElsewhere', 'Qualifying interest deducted elsewhere'], ['otherExcludedInterest', 'Other excluded qualifying interest'],
    ] as const).map(([key, text]) => <CurrencyField key={key} label={`${label}: ${text}`} value={row[key] ?? ''} onChange={value => onChange({ [key]: value })} />)}
    <BooleanFact label={`${label}: First lien`} value={row.firstLien} onChange={firstLien => onChange({ firstLien })} />
    <BooleanFact label={`${label}: Related-party lender`} value={row.relatedParty} onChange={relatedParty => onChange({ relatedParty })} />
  </>;
}

export function VehicleRefinancingDetails({ label, data, onChange }: { label: string; data?: VehicleRefinancingData; onChange: (next: VehicleRefinancingData | undefined) => void }) {
  const change = (patch: Partial<VehicleRefinancingData>) => onChange(updateVehicleRefinancing(data ?? {}, patch));
  const original = (patch: Partial<OriginalVehicleLoanData>) => change({ originalLoan: { ...data?.originalLoan, ...patch } });
  const refinance = (index: number, patch: Partial<VehicleRefinanceLoanData>) => change({ refinancings: data?.refinancings?.map((row, i) => i === index ? { ...row, ...patch } : row) });
  return <details className="guided-expand"><summary className="guided-expand-trigger">{label}: Original and refinancing records</summary><div className="guided-expand-body">
    <p className="guided-hint">Use the original purchase documents and every refinancing statement in order. The vehicle loan date above is the original purchase-loan date. The lender, account and lien answers above refer to the latest loan. Keep the interest totals above equal to these current-year records.</p>
    <p className="guided-hint">Qualified purchase costs include eligible vehicle costs, sales taxes and fees under the vehicle-interest rules. Keep other costs, such as debt from a traded-in vehicle, separate. Enter interest deducted elsewhere only for the qualifying vehicle portion; do not count the same exclusion twice. Enter known zero amounts explicitly.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>{label}: Add original and refinancing records</button> : <>
      <div className="guided-form-grid">
        <TextFact label={`${label}: Source tax year`} value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => change({ sourceTaxYear })} />
        <TextFact label={`${label}: VIN`} value={data.vin ?? ''} onChange={vin => change({ vin })} />
        <TextFact label={`${label}: Packet reference`} value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
        <BooleanFact label={`${label}: All original and refinancing loans are included`} value={data.allLoansIncluded} onChange={allLoansIncluded => change({ allLoansIncluded })} />
        <BooleanFact label={`${label}: Same original borrower throughout`} value={data.sameOriginalBorrowerConfirmed} onChange={sameOriginalBorrowerConfirmed => change({ sameOriginalBorrowerConfirmed })} />
        <BooleanFact label={`${label}: Principal payments were proportional with no later advances or capitalized interest`} value={data.ordinaryPrincipalMethodConfirmed} onChange={ordinaryPrincipalMethodConfirmed => change({ ordinaryPrincipalMethodConfirmed })} />
      </div>
      <p className="guided-hint">A changed borrower, additional advances, capitalized interest or unusual payment timing needs its separate method. This worksheet uses current-year interest actually paid on each loan; loans paid off before this year have zero here.</p>
      {!data.originalLoan ? <button type="button" className="utility-button" onClick={() => change({ originalLoan: {} })}>{label}: Add original purchase loan</button> : <fieldset className="guided-w2-card"><legend>Original purchase loan</legend><div className="guided-form-grid">
        <LoanFields label={`${label} original`} row={data.originalLoan} onChange={original} />
        {([
          ['qualifiedPurchaseCosts', 'Qualified purchase costs'], ['otherPurchaseCosts', 'Other purchase costs'], ['downPayment', 'Down payment'],
        ] as const).map(([key, text]) => <CurrencyField key={key} label={`${label} original: ${text}`} value={data.originalLoan?.[key] ?? ''} onChange={value => original({ [key]: value })} />)}
      </div><button type="button" className="utility-button" onClick={() => change({ originalLoan: undefined })}>{label}: Remove original purchase loan</button></fieldset>}
      {(data.refinancings ?? []).map((row, index) => <fieldset className="guided-w2-card" key={index}><legend>Refinancing {index + 1}</legend><div className="guided-form-grid">
        <LoanFields label={`${label} refinance ${index + 1}`} row={row} onChange={patch => refinance(index, patch)} />
        <TextFact label={`${label} refinance ${index + 1}: Previous loan source ID`} value={row.previousLoanSourceId ?? ''} onChange={previousLoanSourceId => refinance(index, { previousLoanSourceId })} />
        <CurrencyField label={`${label} refinance ${index + 1}: Previous outstanding principal`} value={row.previousOutstandingPrincipal ?? ''} onChange={previousOutstandingPrincipal => refinance(index, { previousOutstandingPrincipal })} />
      </div><button type="button" className="utility-button" onClick={() => change({ refinancings: data.refinancings?.filter((_, i) => i !== index) })}>{label}: Remove refinancing loan {index + 1}</button></fieldset>)}
      <button type="button" className="utility-button" onClick={() => change({ refinancings: [...(data.refinancings ?? []), {}] })}>{label}: Add refinancing loan</button>
      <BooleanFact label={`${label}: Sources checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>{label}: Remove original and refinancing records</button>
    </>}
  </div></details>;
}
