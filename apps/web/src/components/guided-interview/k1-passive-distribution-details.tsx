"use client";
import type { K1PassiveDistributionData } from '@/lib/guided-k1-passive-distribution';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

type Choices = readonly (readonly [string, string])[];
type Field = readonly [string, string, 'text' | 'money' | 'signed' | 'boolean' | Choices];
function Fields<T extends object>({ prefix, data, fields, onChange }: { prefix: string; data: T; fields: readonly Field[]; onChange: (patch: Partial<T>) => void }) {
  const record = data as Record<string, unknown>;
  return <div className="guided-form-grid">{fields.map(([key, name, kind]) => {
    const label = `${prefix} ${name}`, value = record[key], change = (next: unknown) => onChange({ [key]: next } as Partial<T>);
    if (kind === 'boolean') return <BooleanFact key={key} label={label} value={typeof value === 'boolean' ? value : undefined} onChange={change} />;
    if (kind === 'money' || kind === 'signed') return <CurrencyField key={key} label={label} value={typeof value === 'string' ? value : ''} allowNegative={kind === 'signed'} onChange={change} />;
    if (kind === 'text') return <TextFact key={key} label={label} value={typeof value === 'string' ? value : ''} onChange={change} />;
    return <label className="guided-field" key={key}><span className="guided-field-label">{label}</span><select className="guided-input" value={typeof value === 'string' ? value : ''} onChange={event => change(event.target.value)}>
      <option value="">Choose from actual records</option>
      {typeof value === 'string' && value && !kind.some(([code]) => code === value) && <option value={value}>Saved source: {value}</option>}
      {kind.map(([code, text]) => <option key={code} value={code}>{text}</option>)}
    </select></label>;
  })}</div>;
}
const activity: readonly Field[] = [
  ['sourceTaxYear', 'source year', 'text'], ['sourceReference', 'original report reference', 'text'], ['sourceFactsConfirmed', 'checked after the last edit', 'boolean'],
  ['activityName', 'actual activity name', 'text'], ['allActivitiesAndAssetsIncludedConfirmed', 'every entity activity and asset is included', 'boolean'],
  ['continuingActivityConfirmed', 'ownership in this activity continued', 'boolean'], ['noMaterialParticipationTestMetConfirmed', 'no material participation test was met', 'boolean'],
  ['combinedParticipationHours', 'actual combined participation hours', 'text'], ['noTieredOrSpecialAllocationConfirmed', 'no tiered ownership or special allocation applies', 'boolean'],
  ['entitySelectedValuationDate', 'entity selected valuation date', [['year_start', 'Beginning of the entity year'], ['distribution_date', 'Distribution date']]],
  ['valuationDate', 'actual report valuation date', 'text'], ['allPreDistributionEventsIncludedConfirmed', 'every preceding event is included in the annual totals', 'boolean'],
  ['beginningHolderInterestValue', 'owner interest value at the beginning of the year', 'money'],
  ['appreciatedContributionsFmv', 'appreciated contributions during the year at fair market value', 'money'],
  ['depreciatedContributionsBasis', 'depreciated contributions during the year at adjusted basis', 'money'],
];
const annual: readonly Field[] = [
  ['sourceId', 'original source ID', 'text'], ['sourceReference', 'original annual report reference', 'text'], ['activityName', 'actual activity name', 'text'],
  ['beginningActivityValue', 'activity value at the beginning of the year', 'money'], ['activityInterestDisposedValue', 'activity interest disposed value', 'money'],
  ['beginningPropertyValue', 'property value at the beginning of the year', 'money'], ['propertyDisposedValue', 'property disposed value', 'money'],
];
const asset: readonly Field[] = [
  ['sourceId', 'original source ID', 'text'], ['sourceReference', 'original valuation reference', 'text'],
  ['character', 'actual property character', [['ordinary_business_property', 'Ordinary business property'], ['business_cash', 'Noninvestment business cash'],
    ['portfolio', 'Portfolio investment — separate method'], ['rental', 'Rental property — separate method'], ['oil_gas', 'Oil or gas — separate method'],
    ['licensed_intangible', 'Licensed intangible — separate method'], ['other', 'Other property — separate method']]],
  ['fairMarketValue', 'owner share of fair market value', 'money'], ['adjustedBasis', 'owner share of adjusted asset basis', 'money'],
  ['ownerBasisAdjustment', 'owner basis adjustment', 'signed'], ['acquiredDate', 'acquired date', 'text'],
  ['continuousPassiveUseConfirmed', 'continuously used in this passive activity', 'boolean'],
  ['noNonpassiveRecharacterizationConfirmed', 'no nonpassive recharacterization applies', 'boolean'],
  ['noRecaptureOrSpecialCapitalGainConfirmed', 'no recapture or special capital gain applies', 'boolean'],
];
export function K1PassiveDistributionDetails({ prefix, data, onChange }: {
  prefix: string; data?: K1PassiveDistributionData; onChange: (next: K1PassiveDistributionData | undefined) => void;
}) {
  if (data === undefined) return <button type="button" className="utility-button" onClick={() => onChange({})}>Add {prefix} passive activity report</button>;
  const label = `${prefix} passive valuation`, change = (patch: Partial<K1PassiveDistributionData>) => onChange({ ...data, ...patch });
  return <fieldset className="panel-stack"><legend>{prefix} passive activity report</legend>
    <p className="guided-hint">Use the entity’s complete activity and asset valuation report. This method covers one continuing ordinary passive business. Link the same original K-1 to its actual prior passive and qualified-loss histories in adjustments.</p>
    <p className="guided-hint">Record the entity’s actual date choice and report date as YYYY-MM-DD. Annual event totals can require the day before the distribution. Asset amounts are the owner’s allocated shares in the report; enter any separate Section 743(b) adjustment without changing the underlying basis share.</p>
    <Fields prefix={label} data={data} fields={activity} onChange={change} />
    <p className="guided-hint">Record one complete annual row per actual activity, including its known zero dispositions. Keep the activity’s original name and source ID.</p>
    {data.activityEvents === undefined && <p role="status">The annual activity list is unknown.</p>}
    {data.activityEvents?.length === 0 && <p>Recorded: no annual activity rows. The original activity report is still required for this method.</p>}
    {data.activityEvents?.map((row, index) => <fieldset className="guided-w2-card" key={index}><legend>{label} annual activity {index + 1}</legend>
      <Fields prefix={`${label} annual activity ${index + 1}`} data={row} fields={annual} onChange={patch => change({ activityEvents: data.activityEvents?.map((value, i) => i === index ? { ...value, ...patch } : value) })} />
      <button type="button" className="utility-button" onClick={() => change({ activityEvents: data.activityEvents?.filter((_, i) => i !== index) })}>Remove {label} annual activity {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => change({ activityEvents: [...(data.activityEvents ?? []), {}] })}>Add {label} annual activity</button>
    {data.assets === undefined && <p role="status">The underlying asset list is unknown.</p>}
    {data.assets?.length === 0 && <p>Recorded: no underlying assets. The original valuation report is still required for this method.</p>}
    {data.assets?.map((row, index) => <fieldset className="guided-w2-card" key={index}><legend>{label} asset {index + 1}</legend>
      <Fields prefix={`${label} asset ${index + 1}`} data={row} fields={asset} onChange={patch => change({ assets: data.assets?.map((value, i) => i === index ? { ...value, ...patch } : value) })} />
      <button type="button" className="utility-button" onClick={() => change({ assets: data.assets?.filter((_, i) => i !== index) })}>Remove {label} asset {index + 1}</button>
    </fieldset>)}
    <button type="button" className="utility-button" onClick={() => change({ assets: [...(data.assets ?? []), {}] })}>Add {label} asset</button>
    <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove {prefix} passive activity report</button>
  </fieldset>;
}
