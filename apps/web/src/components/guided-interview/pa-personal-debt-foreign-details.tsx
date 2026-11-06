"use client";
import {useState} from 'react';
import type {TaxYearInput} from '@/models/inputs';
import type {PAResidencySources} from '@/models/pa-residency';
import type {PAPersonalDebtDischargeSource, PAForeignBankTaxSource} from '@/models/pa-personal-debt-foreign-sources';
import {
  startGuidedPAPersonalDebtForeignSources, emptyGuidedPAPersonalDebtSource, emptyGuidedPAForeignBankTaxSource,
  updateGuidedPAPersonalDebtForeignSources, confirmGuidedPAPersonalDebtForeignSources,
  type GuidedPAPersonalDebtForeignSources,
} from '@/lib/guided-pa-personal-debt-foreign-sources';
import {BooleanFact, TextFact} from './fact-fields';

function YearFact({label, value, onChange}: {label: string; value: number | null; onChange: (value: number | null) => void}) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><input className="guided-input" type="number" step="1" value={value ?? ''}
    onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} /></label>;
}

const proofReferences = [
  ['useSourceReference', 'personal use source reference'], ['legalSourceReference', 'legal source reference'],
  ['deductionSourceReference', 'current and prior PA deduction source reference'], ['relationshipSourceReference', 'employment and service relationship source reference'],
  ['propertySourceReference', 'property and collateral source reference'],
] as const;
const proofAnswers = [
  ['legallyDischargedConfirmed', 'legal discharge established'], ['noResidualGuarantyPaymentConfirmed', 'no future guaranty payment established'],
  ['allCancelledChargesIncludedConfirmed', 'all cancelled principal interest and fees included'], ['purelyPersonalLivingUseConfirmed', 'proceeds used purely for personal living expenses'],
  ['noBusinessRentalInvestmentUseOrSecurityConfirmed', 'no business rental or investment use or security'],
  ['noCurrentOrPriorPADeductionOffsetOrBasisConfirmed', 'no current or prior PA deduction offset or basis'],
  ['noEmploymentOrServiceConsiderationConfirmed', 'no employment or service consideration'], ['noPropertyTransferConfirmed', 'no property transferred'],
  ['noCashPropertyOrNewBorrowingAtDischargeConfirmed', 'no cash property or new borrowing received at discharge'],
  ['noCollateralOfAnyKindConfirmed', 'actual records establish no collateral of any kind'],
] as const;

export function PAPersonalDebtForeignDetails({originalInput, residencySources, onChange}: {
  originalInput: TaxYearInput | null; residencySources: PAResidencySources; onChange: (data: PAResidencySources) => void;
}) {
  const [error, setError] = useState('');
  const active = residencySources.personalDebtDischarges !== undefined || residencySources.foreignBankTaxSources !== undefined;
  const draft: GuidedPAPersonalDebtForeignSources = {
    ...(residencySources.personalDebtDischarges === undefined ? {} : {personalDebtDischarges: residencySources.personalDebtDischarges}),
    ...(residencySources.foreignBankTaxSources === undefined ? {} : {foreignBankTaxSources: residencySources.foreignBankTaxSources}),
  };
  const save = (data: GuidedPAPersonalDebtForeignSources) => {
    setError(''); onChange({...residencySources, ...data, sourceFactsConfirmed: null});
  };
  const edit = (patch: Partial<GuidedPAPersonalDebtForeignSources>) => save(updateGuidedPAPersonalDebtForeignSources(draft, patch));
  const debtEdit = (index: number, patch: Partial<PAPersonalDebtDischargeSource>) => edit({
    personalDebtDischarges: (draft.personalDebtDischarges ?? []).map((row, i) => i === index ? {...row, ...patch} : row),
  });
  const bankEdit = (index: number, patch: Partial<PAForeignBankTaxSource>) => edit({
    foreignBankTaxSources: (draft.foreignBankTaxSources ?? []).map((row, i) => i === index ? {...row, ...patch} : row),
  });
  const ownerField = (label: string, owner: PAPersonalDebtDischargeSource['owner'], change: (owner: PAPersonalDebtDischargeSource['owner']) => void) => {
    const primary = originalInput?.taxpayer.primary;
    const selected = primary && owner.firstName === primary.firstName && owner.lastName === primary.lastName && owner.ssn === primary.ssn ? 'primary' : '';
    return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={selected} onChange={event => {
      change(event.target.value === 'primary' && primary ? {firstName: primary.firstName, lastName: primary.lastName, ssn: primary.ssn} : {firstName: '', lastName: '', ssn: ''});
    }}><option value="">Choose actual original owner</option>{primary && <option value="primary">Primary taxpayer: {primary.firstName} {primary.lastName}</option>}</select></label>;
  };
  return <section className="panel-stack" aria-label="Actual Pennsylvania personal debt and foreign bank tax records">
    <h3 className="guided-section-subheading">Actual Pennsylvania personal debt and foreign bank tax records</h3>
    <p className="guided-hint">Use original creditor statements, personal-use and prior Pennsylvania expense records, and foreign bank tax receipts. This method supports a primary taxpayer's purely personal unsecured cancellation and ordinary bank interest for full-year, part-year and nonresident returns. Actual dated interest and residency records are still required. Other owners, collateral, business, service or property transactions need their separate source method. Federal insolvency alone does not establish the Pennsylvania treatment.</p>
    {!active ? <button type="button" onClick={() => save(startGuidedPAPersonalDebtForeignSources())}>Add actual PA personal debt and foreign tax sources</button> : <>
      {(draft.personalDebtDischarges ?? []).map((row, index) => {
        const label = `PA debt ${index + 1}`, patch = (value: Partial<PAPersonalDebtDischargeSource>) => debtEdit(index, value);
        return <fieldset key={index}><legend>{label}: actual personal debt original</legend>
          <label className="guided-field"><span className="guided-field-label">{label} entered original</span><select className="guided-input" value={row.originalIndex ?? ''} onChange={event => patch({originalIndex: event.target.value === '' ? null : Number(event.target.value)})}>
            <option value="">Choose actual original</option>{(originalInput?.form1099C ?? []).map((form, i) => <option key={i} value={i}>Original {i + 1}: {form.creditor}</option>)}
          </select></label>
          <YearFact label={`${label} source tax year`} value={row.sourceTaxYear} onChange={sourceTaxYear => patch({sourceTaxYear})} />
          <TextFact label={`${label} original source reference`} value={row.sourceReference} onChange={sourceReference => patch({sourceReference})} />
          {ownerField(`${label} actual owner`, row.owner, owner => patch({owner}))}
          <YearFact label={`${label} original tax year`} value={row.statement.originalTaxYear} onChange={originalTaxYear => patch({statement: {...row.statement, originalTaxYear}})} />
          {([['statementId', 'statement ID'], ['creditorTin', 'creditor TIN'], ['accountReference', 'account reference'], ['sourceReference', 'dated discharge statement reference'], ['principalCancelled', 'cancelled principal'], ['interestCancelled', 'cancelled included interest'], ['feesCancelled', 'cancelled fees penalties and other charges']] as const).map(([key, title]) => <TextFact key={key} label={`${label} ${title}`} value={row.statement[key]} onChange={value => patch({statement: {...row.statement, [key]: value}})} />)}
          <TextFact label={`${label} actual discharge date`} type="date" value={row.statement.dischargedOn} onChange={dischargedOn => patch({statement: {...row.statement, dischargedOn}})} />
          <label className="guided-field"><span className="guided-field-label">{label} actual identifiable event code</span><select className="guided-input" value={row.statement.eventCode} onChange={event => patch({statement: {...row.statement, eventCode: event.target.value}})}><option value="">Choose original event</option>{['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(code => <option key={code} value={code}>{code}</option>)}</select></label>
          {proofReferences.map(([key, title]) => <TextFact key={key} label={`${label} ${title}`} value={row.qualification[key]} onChange={value => patch({qualification: {...row.qualification, [key]: value}})} />)}
          {proofAnswers.map(([key, title]) => <BooleanFact key={key} label={`${label} ${title}`} value={row.qualification[key]} onChange={value => patch({qualification: {...row.qualification, [key]: value}})} />)}
          <button type="button" onClick={() => edit({personalDebtDischarges: (draft.personalDebtDischarges ?? []).filter((_, i) => i !== index)})}>Remove {label} source records</button>
        </fieldset>;
      })}
      <button type="button" onClick={() => edit({personalDebtDischarges: [...(draft.personalDebtDischarges ?? []), emptyGuidedPAPersonalDebtSource()]})}>Add actual PA personal debt original</button>
      {(draft.foreignBankTaxSources ?? []).map((row, index) => {
        const label = `PA foreign bank ${index + 1}`, patch = (value: Partial<PAForeignBankTaxSource>) => bankEdit(index, value);
        return <fieldset key={index}><legend>{label}: actual original tax receipts</legend>
          <label className="guided-field"><span className="guided-field-label">{label} entered original interest statement</span><select className="guided-input" value={row.originalIndex ?? ''} onChange={event => patch({originalIndex: event.target.value === '' ? null : Number(event.target.value)})}><option value="">Choose actual original</option>{(originalInput?.form1099Int ?? []).map((form, i) => <option key={i} value={i}>Original {i + 1}: {form.payer}</option>)}</select></label>
          <YearFact label={`${label} source tax year`} value={row.sourceTaxYear} onChange={sourceTaxYear => patch({sourceTaxYear})} />
          <YearFact label={`${label} original tax year`} value={row.originalTaxYear} onChange={originalTaxYear => patch({originalTaxYear})} />
          <TextFact label={`${label} original source reference`} value={row.sourceReference} onChange={sourceReference => patch({sourceReference})} />
          {ownerField(`${label} actual owner`, row.owner, owner => patch({owner}))}
          <TextFact label={`${label} actual foreign country`} value={row.foreignCountry} onChange={foreignCountry => patch({foreignCountry})} />
          <label className="guided-field"><span className="guided-field-label">{label} actual taxing jurisdiction</span><select className="guided-input" value={row.jurisdictionKind} onChange={event => patch({jurisdictionKind: event.target.value === 'foreign_country' ? 'foreign_country' : ''})}><option value="">Choose actual jurisdiction</option><option value="foreign_country">Foreign country</option></select></label>
          <BooleanFact label={`${label} ordinary personal bank interest established`} value={row.ordinaryPersonalInterestOnlyConfirmed} onChange={ordinaryPersonalInterestOnlyConfirmed => patch({ordinaryPersonalInterestOnlyConfirmed})} />
          <BooleanFact label={`${label} all foreign tax receipts included`} value={row.allForeignTaxReceiptsIncludedConfirmed} onChange={allForeignTaxReceiptsIncludedConfirmed => patch({allForeignTaxReceiptsIncludedConfirmed})} />
          {row.payments.map((payment, paymentIndex) => {
            const receiptLabel = `${label} receipt ${paymentIndex + 1}`, receipt = (value: Partial<typeof payment>) => patch({payments: row.payments.map((p, i) => i === paymentIndex ? {...p, ...value} : p)});
            return <fieldset key={paymentIndex}><legend>{receiptLabel}</legend>
              <TextFact label={`${receiptLabel} source reference`} value={payment.sourceReference} onChange={sourceReference => receipt({sourceReference})} />
              <TextFact label={`${receiptLabel} actual receipt number`} value={payment.receiptNumber} onChange={receiptNumber => receipt({receiptNumber})} />
              <TextFact label={`${receiptLabel} actual payment date`} type="date" value={payment.paidOn} onChange={paidOn => receipt({paidOn})} />
              <label className="guided-field"><span className="guided-field-label">{receiptLabel} actual currency</span><select className="guided-input" value={payment.currency} onChange={event => receipt({currency: event.target.value === 'USD' ? 'USD' : ''})}><option value="">Choose actual receipt currency</option><option value="USD">USD</option></select></label>
              <TextFact label={`${receiptLabel} actual USD amount`} value={payment.amount} onChange={amount => receipt({amount})} />
              <TextFact label={`${receiptLabel} actual country`} value={payment.country} onChange={country => receipt({country})} />
              <button type="button" onClick={() => patch({payments: row.payments.filter((_, i) => i !== paymentIndex)})}>Remove {receiptLabel}</button>
            </fieldset>;
          })}
          <button type="button" onClick={() => patch({payments: [...row.payments, {sourceReference: '', receiptNumber: '', paidOn: '', currency: '', amount: '', country: ''}]})}>Add {label} actual tax receipt</button>
          <button type="button" onClick={() => edit({foreignBankTaxSources: (draft.foreignBankTaxSources ?? []).filter((_, i) => i !== index)})}>Remove {label} source records</button>
        </fieldset>;
      })}
      <button type="button" onClick={() => edit({foreignBankTaxSources: [...(draft.foreignBankTaxSources ?? []), emptyGuidedPAForeignBankTaxSource()]})}>Add actual PA foreign bank tax original</button>
      <button type="button" onClick={() => {
        try {
          if (!originalInput) throw new Error('Current original taxpayer, creditor and bank records are required.');
          save(confirmGuidedPAPersonalDebtForeignSources(originalInput, draft));
        } catch (value) { setError(value instanceof Error ? value.message : 'Reconcile the actual PA debt and foreign bank source records.'); }
      }}>Confirm actual PA debt and foreign tax records after the last edit</button>
      <p className="guided-hint">Only explicit successful confirmation retains current original copies. After every edit, reconcile these sources and confirm the containing Pennsylvania residency and return records. Foreign-country tax receipts do not reduce gross bank interest or provide a Pennsylvania resident credit.</p>
      <button type="button" onClick={() => onChange({...residencySources, personalDebtDischarges: undefined, foreignBankTaxSources: undefined, sourceFactsConfirmed: null})}>Remove PA personal debt and foreign tax records</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
