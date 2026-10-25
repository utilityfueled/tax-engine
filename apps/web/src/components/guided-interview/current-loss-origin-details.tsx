"use client";

import { updateCurrentLossOrigin, type CurrentLossOriginData, type CurrentLossBusinessData, type CurrentLossAlternativeData } from '@/lib/guided-current-loss-origin';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrentCapitalOriginDetails } from './current-capital-origin-details';
import type { InvestmentData } from '@/lib/guided-investment-facts';

function Choice({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={value ?? ''} onChange={event => onChange(event.target.value)}>
    <option value="">Choose from actual records</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select></label>;
}

export function CurrentLossOriginDetails({ data, investments, onChange }: { data?: CurrentLossOriginData; investments?: InvestmentData; onChange: (next: CurrentLossOriginData | undefined) => void }) {
  const change = (patch: Partial<CurrentLossOriginData>) => onChange(updateCurrentLossOrigin(data ?? {}, patch));
  const changeBusiness = (index: number, patch: Partial<CurrentLossBusinessData>) => change({ businessSources: data?.businessSources?.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const alternative = data?.alternativeTax;
  const changeAlternative = (patch: Partial<CurrentLossAlternativeData>) => change({ alternativeTax: { ...alternative, ...patch } });
  return <details className="guided-expand"><summary className="guided-expand-trigger">Current-year net operating loss sources</summary><div className="guided-expand-body">
    <p className="guided-hint">Use actual current income, deduction and business records. Form 172 calculates the regular and alternative minimum tax losses separately. Complete the prior carry sources above too, including explicit empty histories when there are none.</p>
    <p className="guided-hint">The supported business method covers an active Schedule C with all investment at risk. Supported itemized costs include actual medical, property or general sales tax, verified main-home interest and points, and separate regular and AMT investment-interest worksheets. Ordinary investment capital records and supported stock exclusions use the capital packet below. Farming, cancelled debt, estates, other businesses and unresolved deduction allocations require additional methods.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add current-year loss sources</button> : <>
      <div className="guided-form-grid">
        <TextFact label="Current loss source tax year" value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => change({ sourceTaxYear })} />
        <TextFact label="Current loss packet reference" value={data.sourceReference ?? ''} onChange={sourceReference => change({ sourceReference })} />
        {([
          ['allCurrentYearSourcesIncluded', 'All actual current-year income and deduction sources included'],
          ['farmingLossIncluded', 'Current sources include a farming loss'],
          ['cancelledDebtIncluded', 'Current sources include cancelled debt'],
          ['estateOrTrustLossIncluded', 'Current sources include an estate or trust loss'],
        ] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={data[key]} onChange={value => change({ [key]: value })} />)}
      </div>
      <fieldset><legend>Current business sources</legend>
        {data.businessSources === undefined && <p role="status">The current business source list is unknown.</p>}
        {data.businessSources?.length === 0 && <p>Explicitly recorded: no current business sources.</p>}
        {(data.businessSources ?? []).map((business, index) => {
          const prefix = `Current business ${index + 1}`;
          return <div className="guided-w2-card" key={index}><h4>{prefix}</h4><div className="guided-form-grid">
            <Choice label={`${prefix} source`} value={business.sourceId} options={[
              ['scheduleC', 'Schedule C from the self-employment section'],
            ]} onChange={sourceId => changeBusiness(index, { sourceId })} />
            <Choice label={`${prefix} owner`} value={business.accountHolder} options={[
              ['primary', 'Primary taxpayer'], ['spouse', 'Spouse on the actual joint return'],
            ]} onChange={value => changeBusiness(index, { accountHolder: value as CurrentLossBusinessData['accountHolder'] })} />
            <TextFact label={`${prefix} actual business name`} value={business.businessName ?? ''} onChange={businessName => changeBusiness(index, { businessName })} />
            <TextFact label={`${prefix} source reference`} value={business.sourceReference ?? ''} onChange={sourceReference => changeBusiness(index, { sourceReference })} />
            {([
              ['materiallyParticipated', 'owner materially participated'], ['allInvestmentAtRisk', 'all investment is at risk'],
              ['financialTradingBusiness', 'is a financial trading business'],
            ] as const).map(([key, label]) => <BooleanFact key={key} label={`${prefix} ${label}`} value={business[key]} onChange={value => changeBusiness(index, { [key]: value })} />)}
          </div><BooleanFact label={`${prefix} sources checked after the last edit`} value={business.sourceFactsConfirmed} onChange={sourceFactsConfirmed => changeBusiness(index, { sourceFactsConfirmed })} />
            <button type="button" className="utility-button" onClick={() => change({ businessSources: data.businessSources?.filter((_, i) => i !== index) })}>Remove current business {index + 1}</button>
          </div>;
        })}
        <button type="button" className="utility-button" onClick={() => change({ businessSources: [...(data.businessSources ?? []), {}] })}>Add current business source</button>
        <button type="button" className="utility-button" onClick={() => change({ businessSources: [] })}>Record no current business sources</button>
      </fieldset>
      {!alternative ? <button type="button" className="utility-button" onClick={() => change({ alternativeTax: {} })}>Add independent current AMT comparison</button> : <fieldset><legend>Independent current AMT comparison</legend>
        <p className="guided-hint">Check the actual alternative minimum tax records independently. A known difference needs its own source calculation; it cannot be replaced with a regular-tax answer.</p>
        <div className="guided-form-grid">
          <TextFact label="Current AMT comparison source reference" value={alternative.sourceReference ?? ''} onChange={sourceReference => changeAlternative({ sourceReference })} />
          {([
            ['currentYearAdjustmentsCompleteConfirmed', 'All current AMT adjustments and preferences included'],
            ['regularBasisAndLossLimitsSameAsAlternativeConfirmed', 'Current regular and AMT bases and loss limits are the same'],
            ['regularDepreciationSameAsAlternativeConfirmed', 'Current regular and AMT depreciation are the same'],
          ] as const).map(([key, label]) => <BooleanFact key={key} label={label} value={alternative[key]} onChange={value => changeAlternative({ [key]: value })} />)}
        </div><BooleanFact label="Current AMT comparison checked after the last edit" value={alternative.sourceFactsConfirmed} onChange={sourceFactsConfirmed => changeAlternative({ sourceFactsConfirmed })} />
        <button type="button" className="utility-button" onClick={() => change({ alternativeTax: undefined })}>Remove current AMT comparison</button>
      </fieldset>}
      <CurrentCapitalOriginDetails data={data.capitalSources} investments={investments} onChange={capitalSources => change({ capitalSources })} />
      <BooleanFact label="Current loss sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => change({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove current-year loss sources</button>
    </>}
  </div></details>;
}
