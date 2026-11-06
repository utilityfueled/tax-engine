"use client";

import {copyPARoyaltyOriginals, paRoyaltyExpenseFacts, paRoyaltyPropertyFacts,
  type PARoyaltyTreatmentData, type RoyaltyPropertyData} from '@/lib/guided-royalty-sources';
import {BooleanFact, TextFact} from './fact-fields';

export function PARoyaltySourceDetails({property, index, sourceTaxYear, onChange}: {
  property: RoyaltyPropertyData;
  index: number;
  sourceTaxYear?: string;
  onChange: (value: PARoyaltyTreatmentData | undefined) => void;
}) {
  const source = property.paTreatment;
  const prefix = `Property ${index + 1} PA`;
  const patch = (value: Partial<PARoyaltyTreatmentData>) => onChange({...source, ...value});
  if (!source) return <button type="button" className="utility-button" onClick={() => onChange({})}>
    Add property {index + 1} PA classification
  </button>;

  return <fieldset className="panel-stack">
    <legend>{prefix} classification</legend>
    <p className="guided-hint">Pennsylvania uses its own property and expense rules. Check this owner's residency and the actual state classifications. For mineral rights, surface expenses are excluded from the royalty deduction.</p>
    <button type="button" className="utility-button" onClick={() => onChange(copyPARoyaltyOriginals(property, sourceTaxYear))}>
      Copy property {index + 1} PA originals
    </button>
    <p className="guided-hint">Copied property: year {source.sourceTaxYear || 'unknown'}, owner {source.accountHolder || 'unknown'}, classification {source.propertyType || 'unknown'}. Copy again after changing the original property or receipts. This does not confirm their state treatment.</p>
    <TextFact label={`${prefix} classification source reference`} value={source.sourceReference ?? ''}
      onChange={sourceReference => patch({sourceReference})}/>
    <label className="guided-field">
      <span className="guided-field-label">{prefix} actual income class</span>
      <select className="guided-input" value={source.paIncomeClass ?? ''}
        onChange={event => patch({paIncomeClass: event.target.value as PARoyaltyTreatmentData['paIncomeClass']})}>
        <option value="">Not answered</option>
        <option value="royalties-copyrights-patents">Nonbusiness royalties, copyrights or patents</option>
        <option value="business">Business income requiring its own source method</option>
        <option value="capital-disposition">Disposition of rights requiring its own source method</option>
      </select>
    </label>
    {Object.entries(paRoyaltyPropertyFacts).map(([key, label]) => <BooleanFact key={key}
      label={`${prefix} ${label}`} value={source[key as keyof typeof paRoyaltyPropertyFacts]}
      onChange={value => patch({[key]: value})}/>)}
    <p className="guided-hint">{source.expenses === undefined ? 'PA receipt ledger not copied.'
      : source.expenses.length === 0 ? 'The copied actual property expense ledger is empty.'
        : `${source.expenses.length} original receipts copied for state classification.`}</p>
    {source.expenses?.map((receipt, receiptIndex) => {
      const label = `${prefix} expense ${receiptIndex + 1}`;
      return <fieldset className="panel-stack" key={receiptIndex}>
        <legend>{label}</legend>
        <p className="guided-hint">Original receipt {receipt.sourceId || 'unknown'}, paid {receipt.paidDate || 'unknown'}, category {receipt.category || 'unknown'}, amount {receipt.amountPaid || 'unknown'}.</p>
        {Object.entries(paRoyaltyExpenseFacts).map(([key, question]) => <BooleanFact key={key}
          label={`${label} ${question}`} value={receipt[key as keyof typeof paRoyaltyExpenseFacts]}
          onChange={value => patch({expenses: source.expenses?.map((row, i) => i === receiptIndex ? {...row, [key]: value} : row)})}/>)}
      </fieldset>;
    })}
    <button type="button" className="utility-button utility-button-small" onClick={() => patch({expenses: undefined})}>
      Mark property {index + 1} PA receipt ledger unknown
    </button>
    <BooleanFact label={`${prefix} classification checked after the last edit`} value={source.sourceFactsConfirmed}
      onChange={sourceFactsConfirmed => patch({sourceFactsConfirmed})}/>
    <button type="button" className="utility-button utility-button-small" onClick={() => onChange(undefined)}>
      Remove property {index + 1} PA classification
    </button>
  </fieldset>;
}
