"use client";

import type { GuidedForm6198PartIIData } from '@/lib/guided-form-6198-part-ii';
import { CurrencyField } from './currency-field';

const textFields = [
  ['sourceTaxYear', 'Original Schedule K-1 tax year'],
  ['activityName', 'Original partnership activity name'],
  ['entityEin', 'Partnership EIN on original K-1'],
  ['recipientName', 'Recipient name on original K-1'],
  ['recipientTaxpayerIdLast4', 'Recipient taxpayer ID last four digits'],
  ['originalK1Reference', 'Original Schedule K-1 reference'],
  ['openingBasisReference', 'Opening outside-basis workpaper reference'],
  ['changeWorksheetReference', 'Current Part II workpaper reference'],
] as const;

const amountFields = [
  ['box1Loss', 'Original Schedule K-1 Box 1 loss'],
  ['openingAdjustedBasis', 'Form 6198 line 6 opening adjusted basis'],
  ['increases', 'Form 6198 line 7 increases'],
  ['decreases', 'Form 6198 line 9 decreases'],
  ['section199AQBI', 'Original Section 199A qualified business income'],
  ['selfEmploymentEarnings', 'Original Schedule K-1 Box 14 Code A amount'],
  ['selfEmploymentNetEarningsAfterAdjustments', 'Adjusted partner self-employment earnings'],
] as const;

const confirmationFields = [
  ['oneDomesticNonPtpPartnershipConfirmed', 'This is the only original K-1 and it is from a continuing domestic non-publicly-traded partnership'],
  ['allOtherAmountsZeroConfirmed', 'The original K-1 and its statements establish zero other amounts'],
  ['noPriorBasisOrPassiveLossConfirmed', 'The activity has no prior suspended basis or passive losses'],
  ['ordinaryNonpassivePartIIConfirmed', 'One ordinary nonpassive activity qualifies for Form 6198 Part II'],
  ['noPriorAtRiskLossOrRecaptureConfirmed', 'The activity has no prior suspended at-risk loss or at-risk recapture'],
  ['noQbiOrSelfEmploymentAmountsConfirmed', 'The activity has no Section 199A or self-employment amounts'],
  ['sourceFactsConfirmed', 'I checked these entries against the original K-1 and workpapers'],
] as const;

export function Form6198PartIIDetails({ data, taxYear, spouseEligible, onChange }: {
  data?: GuidedForm6198PartIIData;
  taxYear?: number | null;
  spouseEligible: boolean;
  onChange: (data: GuidedForm6198PartIIData | undefined) => void;
}) {
  const update = (patch: Partial<GuidedForm6198PartIIData>) => onChange({ ...data, ...patch });
  return <details className="guided-expand">
    <summary className="guided-expand-trigger">Ordinary Form 6198 Part II</summary>
    <div className="guided-expand-body">
      {taxYear !== 2026 && <p role="status">These saved Form 6198 records require a 2026 return.</p>}
      {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add ordinary Form 6198 Part II records</button> : <>
        <p className="guided-hint">Use the original K-1, opening outside-basis record and current at-risk workpaper. Enter zero only when the records establish it.</p>
        <div className="guided-form-grid">
          <label className="guided-field">
            <span className="guided-field-label">Owner on original K-1</span>
            <select className="guided-input" aria-required="true" value={data.accountHolder ?? ''} onChange={event => update({ accountHolder: event.target.value as GuidedForm6198PartIIData['accountHolder'] })}>
              <option value="">Choose the owner</option>
              <option value="primary">Primary taxpayer</option>
              {(spouseEligible || data.accountHolder === 'spouse') && <option value="spouse">Spouse</option>}
            </select>
          </label>
          {textFields.map(([key, label]) => <label className="guided-field" key={key}>
            <span className="guided-field-label">{label}</span>
            <input className="guided-input" type="text" aria-required="true" value={data[key] ?? ''} onChange={event => update({ [key]: event.target.value })} />
          </label>)}
          {amountFields.map(([key, label]) => <CurrencyField key={key} label={label} value={data[key] ?? ''}
            required allowNegative={key === 'box1Loss'} onChange={value => update({ [key]: value })} />)}
          <label className="guided-field">
            <span className="guided-field-label">Farm or nonfarm classification</span>
            <select className="guided-input" aria-required="true" value={data.selfEmploymentIncomeType ?? ''} onChange={event => update({ selfEmploymentIncomeType: event.target.value as GuidedForm6198PartIIData['selfEmploymentIncomeType'] })}>
              <option value="">Choose the actual classification</option>
              <option value="farm">Farm</option>
              <option value="nonfarm">Nonfarm</option>
            </select>
          </label>
          {confirmationFields.map(([key, label]) => <label className="guided-field" key={key}>
            <span className="guided-field-label">{label}</span>
            <select className="guided-input" aria-required="true" value={data[key] == null ? '' : data[key] ? 'yes' : 'no'}
              onChange={event => update({ [key]: event.target.value === '' ? null : event.target.value === 'yes' })}>
              <option value="">Choose an answer</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>)}
        </div>
        {data.currentOutsideBasis ? <fieldset className="guided-form-grid">
          <legend>Current outside-basis workpaper</legend>
          <label className="guided-field">
            <span className="guided-field-label">Current outside-basis workpaper reference</span>
            <input className="guided-input" type="text" aria-required="true" value={data.currentOutsideBasis.reference ?? ''}
              onChange={event => update({ currentOutsideBasis: { ...data.currentOutsideBasis, reference: event.target.value } })} />
          </label>
          <CurrencyField label="Current adjusted outside basis available for losses" value={data.currentOutsideBasis.availableForLosses ?? ''} required
            onChange={availableForLosses => update({ currentOutsideBasis: { ...data.currentOutsideBasis, availableForLosses } })} />
          <button type="button" className="utility-button" onClick={() => update({ currentOutsideBasis: undefined })}>Remove current outside-basis workpaper</button>
        </fieldset> : <div>
          <p className="guided-hint">Add the current outside-basis workpaper if outside basis limits the Box 1 loss.</p>
          <button type="button" className="utility-button" onClick={() => update({ currentOutsideBasis: {} })}>Add current outside-basis workpaper</button>
        </div>}
        <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove ordinary Form 6198 Part II records</button>
      </>}
    </div>
  </details>;
}
