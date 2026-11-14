'use client';
import { enteredInterestSources } from '@/lib/guided-interest-originals';
import { confirmCoverdellBankInterest, conversionBooleanFields, conversionMoneyFields, invalidateCoverdellBankInterest, type CoverdellBankInterestData, type EducationOriginalContext } from '@/lib/guided-coverdell-bank-interest';
import type { EducationStatementDraft } from '@/lib/guided-education-distributions';
import type { FilingStatus } from '@/lib/guided-interview-flow';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

export function CoverdellBankInterestDetails({ statement, originalContext, taxYear, filingStatus, onChange }: {
  statement: EducationStatementDraft; originalContext?: EducationOriginalContext; taxYear?: number | null; filingStatus?: FilingStatus | null;
  onChange: (data: CoverdellBankInterestData | undefined) => void;
}) {
  const data = statement.bankInterestConversion;
  if (!data) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add actual January 1 bank conversion</button>;
  const update = (next: Partial<CoverdellBankInterestData>) => onChange(invalidateCoverdellBankInterest({ ...data, ...next }));
  const originals = enteredInterestSources(originalContext?.interestEntries);
  return <fieldset className="guided-fieldset"><legend>Actual January 1 domestic bank conversion</legend>
    <p className="guided-hint">Use only an actual January 1 cash conversion into your own ordinary domestic deposit, with no retained trust. Enter its complete custodian and full-year cash records. Enter the separate original 1099-INT under Investment Income, including actual zero boxes, zero bond adjustments and the explicit PA allocation. Interest is reported there once. Other activity, losses and partial original allocations remain unsupported.</p>
    <TextFact label="Full-year bank and custody source reference" value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
    <TextFact label="Actual custodian conversion date" type="date" value={data.custodianConversionDate ?? ''} onChange={custodianConversionDate => update({ custodianConversionDate })} />
    <TextFact label="Actual custodian conversion record reference" value={data.custodianConversionReference ?? ''} onChange={custodianConversionReference => update({ custodianConversionReference })} />
    {conversionBooleanFields.map(([key, label]) => <BooleanFact key={key} label={label} value={data[key]} onChange={value => update({ [key]: value })} />)}
    {conversionMoneyFields.map(([key, label]) => <CurrencyField key={key} label={label} value={data[key] ?? ''} onChange={value => update({ [key]: value })} />)}
    <label className="guided-field"><span className="guided-field-label">Actual original bank 1099-INT already entered</span><select className="guided-input" value={data.originalIntIndex ?? ''} onChange={event => update({ originalIntIndex: event.target.value })}>
      <option value="">Choose an actual original</option>{originals.map((original, index) => <option key={index} value={String(index)}>{original.payer} — {original.accountReference || 'Account reference required'}</option>)}
    </select></label>
    <BooleanFact label="Bank conversion and original INT sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={value => onChange(value === true ? confirmCoverdellBankInterest(statement, originalContext, taxYear, filingStatus) : { ...data, sourceFactsConfirmed: value, confirmedOriginalValues: undefined })} />
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove bank conversion sources</button>
  </fieldset>;
}
