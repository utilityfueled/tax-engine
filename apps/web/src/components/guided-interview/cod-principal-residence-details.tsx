'use client';
import { updateGuidedCodPrincipalResidence, type CodPrincipalResidenceData, type CodPrincipalResidenceDebtData } from '@/lib/guided-cod-principal-residence';
import { BooleanFact,TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

function Choice({label,value,options,onChange}:{label:string;value?:string;options:[string,string][];onChange:(value:string)=>void}) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value??''} onChange={event=>onChange(event.target.value)}>
    <option value="">Choose from actual records</option>{value&&!options.some(([key])=>key===value)&&<option value={value}>Unmatched original record: {value}</option>}
    {options.map(([key,text])=><option key={key} value={key}>{text}</option>)}
  </select></label>;
}
export function CodPrincipalResidenceDetails({data,taxYear,onChange}:{data?:CodPrincipalResidenceData;taxYear?:number|null;onChange:(data:CodPrincipalResidenceData|undefined)=>void}) {
  const change=(patch:Partial<CodPrincipalResidenceData>)=>onChange(updateGuidedCodPrincipalResidence(data??{},patch));
  const debt=(patch:Partial<CodPrincipalResidenceDebtData>)=>change({debt:{...data?.debt,...patch}});
  const acquisition=(patch:Partial<NonNullable<CodPrincipalResidenceData['acquisition']>>)=>change({acquisition:{...data?.acquisition,...patch}});
  const basis=(patch:Partial<NonNullable<CodPrincipalResidenceData['basis']>>)=>change({basis:{...data?.basis,...patch}});
  const reason=(patch:Partial<NonNullable<CodPrincipalResidenceData['reason']>>)=>change({reason:{...data?.reason,...patch}});
  const arrangement=(patch:Partial<NonNullable<CodPrincipalResidenceData['arrangement']>>)=>change({arrangement:{...data?.arrangement,...patch}});
  return <details className="guided-expand"><summary className="guided-expand-trigger">Canceled mortgage on a retained main home</summary><div className="guided-expand-body">
    <p className="guided-hint">Use one cancellation method. This covers one original mortgage used entirely to buy, build or substantially improve a main home you still own. Use the original lender, purchase and basis records. Refinancing, a sale, rental use or another exclusion needs its own method.</p>
    {!data?<button type="button" className="guided-add-btn" onClick={()=>onChange({})}>Add retained-home cancellation records</button>:<>
      <div className="guided-form-grid">
        <TextFact label="Residence cancellation tax year" value={data.sourceTaxYear??''} onChange={sourceTaxYear=>change({sourceTaxYear})}/>
        <TextFact label="Residence cancellation original packet reference" value={data.sourceReference??''} onChange={sourceReference=>change({sourceReference})}/>
        {([
          ['allDischargesIncluded','All canceled debts for this year are included'],['allResidenceSecuredLoansIncluded','This is the only loan secured by the residence'],
          ['regularAndAlternativeExclusionSameConfirmed','Regular and AMT treatment of this cancellation is the same'],
          ['communityPropertyApplies','Community property rules apply'],['title11Case','This cancellation occurred in a title 11 bankruptcy case'],
          ['electInsolvencyInstead','Claim insolvency instead of the residence exclusion'],['otherExclusionsOrExceptionsApply','Another debt exception or exclusion applies'],
          ['solelyPrimaryOwnedConfirmed','The primary taxpayer alone owns the home and owes this loan'],['retainedResidenceConfirmed','You still own the home after cancellation'],
          ['noPropertyTransferConfirmed','There was no sale, foreclosure, abandonment or property transfer'],['neverBusinessOrRentalUseConfirmed','This home has never had business or rental use'],
        ] as const).map(([key,label])=><BooleanFact key={key} label={label} value={data[key]} onChange={value=>change({[key]:value})}/>)}
      </div>
      <fieldset><legend>Original mortgage cancellation statement</legend><div className="guided-form-grid">
        {([
          ['statementId','Mortgage original statement ID'],['sourceTaxYear','Mortgage original statement tax year'],['sourceReference','Mortgage statement record reference'],
          ['debtorName','Mortgage debtor name'],['debtorSsnLast4','Mortgage debtor SSN last four'],['creditor','Mortgage creditor name'],
          ['creditorTin','Mortgage creditor TIN'],['accountReference','Mortgage original account reference'],['debtDescription','Mortgage Box4 debt description'],
        ] as const).map(([key,label])=><TextFact key={key} label={label} value={data.debt?.[key]??''} onChange={value=>debt({[key]:value})}/>)}
        <Choice label="Mortgage statement owner" value={data.debt?.accountHolder} options={[["primary","Primary taxpayer"],["spouse","Spouse — separate method"]]} onChange={value=>debt({accountHolder:value==='primary'||value==='spouse'?value:undefined})}/>
        <TextFact label="Mortgage Box1 discharge date" type="date" value={data.debt?.dischargeDate??''} onChange={dischargeDate=>debt({dischargeDate})}/>
        {([
          ['amountDischarged','Mortgage Box2 canceled amount'],['interestIncluded','Mortgage Box3 interest included'],['fmvOfProperty','Mortgage Box7 property value'],
          ['actualDischargedPrincipal','Mortgage actual canceled principal'],['actualDischargedInterest','Mortgage actual discharged interest'],
        ] as const).map(([key,label])=><CurrencyField key={key} label={label} value={data.debt?.[key]??''} onChange={value=>debt({[key]:value})}/>)}
        <Choice label="Mortgage Box6 event code" value={data.debt?.identifiableEventCode} options={[["F","F — Agreement"],["G","G — Decision to discontinue collection"]]} onChange={identifiableEventCode=>debt({identifiableEventCode:identifiableEventCode||undefined})}/>
        {([
          ['personallyLiable','Mortgage Box5 personally liable'],['completePrincipalCancellationConfirmed','Complete actual principal cancellation is recorded'],
          ['noDeductibleInterestDischargedConfirmed','No deductible interest was canceled'],['sourceFactsConfirmed','Mortgage statement checked after the last edit'],
        ] as const).map(([key,label])=><BooleanFact key={key} label={label} value={data.debt?.[key]} onChange={value=>debt({[key]:value})}/>)}
      </div></fieldset>
      <fieldset><legend>Original acquisition loan</legend><div className="guided-form-grid">
        <TextFact label="Original acquisition loan record reference" value={data.acquisition?.sourceReference??''} onChange={sourceReference=>acquisition({sourceReference})}/>
        <TextFact label="Original mortgage loan date" type="date" value={data.acquisition?.originationDate??''} onChange={originationDate=>acquisition({originationDate})}/>
        <TextFact label="Mortgage balance snapshot date" type="date" value={data.acquisition?.balanceAsOfDate??''} onChange={balanceAsOfDate=>acquisition({balanceAsOfDate})}/>
        <CurrencyField label="Mortgage principal immediately before cancellation" value={data.acquisition?.outstandingPrincipal??''} onChange={outstandingPrincipal=>acquisition({outstandingPrincipal})}/>
        <CurrencyField label="Original acquisition borrowing" value={data.acquisition?.originalAcquisitionPrincipal??''} onChange={originalAcquisitionPrincipal=>acquisition({originalAcquisitionPrincipal})}/>
        <Choice label="Original mortgage proceeds use" value={data.acquisition?.acquisitionUse} options={[["buy_build_substantially_improve","Buy, build or substantially improve this main home"],["other","Other or mixed use — separate method"]]} onChange={value=>acquisition({acquisitionUse:value==='buy_build_substantially_improve'||value==='other'?value:undefined})}/>
        {(['street','apt','city','state','zip'] as const).map(key=><TextFact key={key} label={`Mortgage residence ${key==='apt'?'unit (when present)':key}`} value={data.acquisition?.residenceAddress?.[key]??''} onChange={value=>acquisition({residenceAddress:{...data.acquisition?.residenceAddress,[key]:value}})}/>)}
        {([
          ['mainHomeConfirmed','This is your current main home'],['securedByResidenceConfirmed','The original loan is secured by this home'],
          ['originalLoanNotRefinancedConfirmed','This original loan has never been refinanced'],['allProceedsAcquisitionUseConfirmed','All loan proceeds were used for this acquisition or improvement'],
          ['immediatelyBeforeDischargeConfirmed','The balance is from immediately before cancellation'],['noCapitalizedInterestOrAddedPrincipalConfirmed','No capitalized interest or other principal was added to this loan'],
          ['sourceFactsConfirmed','Original acquisition loan checked after the last edit'],
        ] as const).map(([key,label])=><BooleanFact key={key} label={label} value={data.acquisition?.[key]} onChange={value=>acquisition({[key]:value})}/>)}
      </div></fieldset>
      <fieldset><legend>Actual cancellation reason</legend><div className="guided-form-grid">
        <TextFact label="Mortgage cancellation reason record reference" value={data.reason?.sourceReference??''} onChange={sourceReference=>reason({sourceReference})}/>
        <Choice label="Reason the lender canceled debt" value={data.reason?.reason} options={[["decline_in_residence_value","Decline in home value"],["taxpayer_financial_condition","Your financial condition"],["other","Other — separate method"]]} onChange={value=>reason({reason:value==='decline_in_residence_value'||value==='taxpayer_financial_condition'||value==='other'?value:undefined})}/>
        <BooleanFact label="Cancellation was not payment for services to the lender" value={data.reason?.noLenderServicesConsiderationConfirmed} onChange={noLenderServicesConsiderationConfirmed=>reason({noLenderServicesConsiderationConfirmed})}/>
        <BooleanFact label="Cancellation reason checked after the last edit" value={data.reason?.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>reason({sourceFactsConfirmed})}/>
      </div></fieldset>
      <fieldset><legend>Complete residence basis history</legend><div className="guided-form-grid">
        <TextFact label="Residence basis original history reference" value={data.basis?.sourceReference??''} onChange={sourceReference=>basis({sourceReference})}/>
        <TextFact label="Residence basis record date" type="date" value={data.basis?.asOfDate??''} onChange={asOfDate=>basis({asOfDate})}/>
        {([['purchaseCost','Residence original purchase cost'],['acquisitionCosts','Residence basis acquisition costs'],['capitalImprovements','Residence capital improvements'],['previousBasisReductions','Residence previous basis reductions']] as const).map(([key,label])=><CurrencyField key={key} label={label} value={data.basis?.[key]??''} onChange={value=>basis({[key]:value})}/>)}
        <BooleanFact label="All residence basis changes through cancellation are included" value={data.basis?.allBasisChangesIncluded} onChange={allBasisChangesIncluded=>basis({allBasisChangesIncluded})}/>
        <BooleanFact label="Residence basis history checked after the last edit" value={data.basis?.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>basis({sourceFactsConfirmed})}/>
      </div></fieldset>
      {(taxYear===2026||data.arrangement)&&<fieldset><legend>Written arrangement before 2026</legend><p className="guided-hint">A 2026 cancellation needs the actual arrangement entered into and evidenced in writing before January 1, 2026. These dates do not open the complete 2026 calculation or filing gates.</p><div className="guided-form-grid">
        <TextFact label="Pre2026 written arrangement record reference" value={data.arrangement?.sourceReference??''} onChange={sourceReference=>arrangement({sourceReference})}/>
        <TextFact label="Arrangement entered date" type="date" value={data.arrangement?.enteredDate??''} onChange={enteredDate=>arrangement({enteredDate})}/>
        <TextFact label="Arrangement evidenced in writing date" type="date" value={data.arrangement?.evidencedInWritingDate??''} onChange={evidencedInWritingDate=>arrangement({evidencedInWritingDate})}/>
        <BooleanFact label="This discharge is subject to that written arrangement" value={data.arrangement?.dischargeSubjectToArrangementConfirmed} onChange={dischargeSubjectToArrangementConfirmed=>arrangement({dischargeSubjectToArrangementConfirmed})}/>
        <BooleanFact label="Written arrangement checked after the last edit" value={data.arrangement?.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>arrangement({sourceFactsConfirmed})}/>
      </div></fieldset>}
      <BooleanFact label="Residence cancellation packet checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed=>change({sourceFactsConfirmed})}/>
      <button type="button" className="guided-remove-btn" onClick={()=>onChange(undefined)}>Remove retained-home cancellation records</button>
    </>}
  </div></details>;
}
