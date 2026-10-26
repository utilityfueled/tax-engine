"use client";

import { updateCryptoDonation, type CryptoDonationData } from '@/lib/guided-crypto-donations';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

const categories = [
  ['fifty-percent', 'Public charity or other 50% limit organization'],
  ['private-nonoperating', 'Private nonoperating foundation'],
  ['other-thirty-percent', 'Other qualified 30% limit organization'],
] as const;

export function CryptoDonationDetails({ data, onChange }: {
  data?: CryptoDonationData[];
  onChange: (next: CryptoDonationData[]) => void;
}) {
  const rows = data ?? [];
  const change = (index: number, patch: Partial<CryptoDonationData>) =>
    onChange(rows.map((row, i) => i === index ? updateCryptoDonation(row, patch) : row));
  return <details className="guided-expand">
    <summary className="guided-expand-trigger">Digital assets donated to charity</summary>
    <div className="guided-expand-body">
      <p className="guided-hint">Enter each original gift once here. Keep it out of the other donation entries and digital-asset sales. Use the donated property&apos;s value and original basis, excluding fees paid to transfer the gift.</p>
      <p className="guided-hint">Check appraisal and receipt requirements using all similar-property gifts during the year, including gifts to different charities. An exchange price alone does not replace a required qualified appraisal. Keep any required Form 8283 and appraisal with your tax records.</p>
      {rows.map((row, index) => {
        const prefix = `Digital-asset gift ${index + 1}`;
        return <fieldset className="guided-fieldset" key={index}>
          <legend>{prefix}</legend>
          <div className="guided-form-grid">
            <TextFact label={`${prefix} asset`} value={row.asset ?? ''} onChange={asset => change(index, { asset })} />
            <TextFact label={`${prefix} exact quantity`} value={row.quantity ?? ''} onChange={quantity => change(index, { quantity })} />
            <TextFact label={`${prefix} original acquisition date`} type="date" value={row.dateAcquired ?? ''} onChange={dateAcquired => change(index, { dateAcquired })} />
            <TextFact label={`${prefix} donation date`} type="date" value={row.dateDonated ?? ''} onChange={dateDonated => change(index, { dateDonated })} />
            <CurrencyField label={`${prefix} total fair market value at donation`} value={row.fairMarketValueAtDonation ?? ''} onChange={fairMarketValueAtDonation => change(index, { fairMarketValueAtDonation })} />
            <CurrencyField label={`${prefix} original cost basis`} value={row.costBasis ?? ''} onChange={costBasis => change(index, { costBasis })} />
            <TextFact label={`${prefix} recipient name`} value={row.charityName ?? ''} onChange={charityName => change(index, { charityName })} />
            <TextFact label={`${prefix} recipient EIN, if available`} value={row.charityEIN ?? ''} onChange={charityEIN => change(index, { charityEIN })} />
            <BooleanFact label={`${prefix} recipient is a qualified charitable organization`} value={row.isQualifiedOrganization} onChange={isQualifiedOrganization => change(index, { isQualifiedOrganization })} />
            <label className="guided-field"><span className="guided-field-label">{prefix} recipient tax category</span>
              <select className="guided-input" value={row.recipientCategory ?? ''} onChange={event => {
                const value = event.target.value;
                change(index, { recipientCategory: value === 'fifty-percent' || value === 'private-nonoperating' || value === 'other-thirty-percent' ? value : undefined });
              }}>
                <option value="">Choose from actual records</option>
                {row.recipientCategory === 'other-qualified' && <option value="other-qualified">Saved category needs clarification</option>}
                {categories.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
              </select>
            </label>
            {([
              ['capitalAsset', 'property was a capital asset'],
              ['fullOwnershipInterestDonated', 'entire ownership interest was donated'],
              ['noGoodsOrServicesReceived', 'no goods or services were received in exchange'],
              ['substantiationRequirementsMet', 'required receipts and substantiation are complete'],
              ['appraisalRequired', 'qualified appraisal is required after reviewing all similar-property gifts'],
              ['qualifiedAppraisalObtained', 'required qualified appraisal was obtained'],
            ] as const).map(([key, label]) => <BooleanFact key={key} label={`${prefix} ${label}`} value={row[key]} onChange={value => change(index, { [key]: value })} />)}
            <BooleanFact label={`${prefix} checked after the last edit`} value={row.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change(index, { sourceFactsConfirmed })} />
          </div>
          <button className="utility-button" type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remove {prefix.toLowerCase()}</button>
        </fieldset>;
      })}
      <button className="utility-button" type="button" onClick={() => onChange([...rows, {}])}>Add digital-asset gift</button>
    </div>
  </details>;
}
