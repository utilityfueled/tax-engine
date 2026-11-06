'use client';
import { captureInvestmentInterestChildren, updateInvestmentInterestWorksheet, type InvestmentInterestChildPartition, type InvestmentInterestSourceData, type InvestmentInterestWorksheetData } from '@/lib/guided-investment-interest';
import type { ChildElectionData } from '@/lib/guided-child-election-facts';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

const amountFields = [
  ['investmentInterestExpense', 'current investment interest expense', false],
  ['priorYearDisallowed', 'prior disallowed investment interest', false],
  ['grossInvestmentIncome', 'gross investment income', true],
  ['qualifiedDividendsIncluded', 'qualified dividends included in gross income', false],
  ['netGainFromInvestmentProperty', 'net investment-property gain', true],
  ['netCapitalGainFromInvestmentProperty', 'net long-term gain less net short-term loss', true],
  ['electedPreferentialIncome', 'preferential income elected as investment income', false],
  ['investmentExpenses', 'deductible investment expenses', false],
] as const;
const parentFields = [
  ['parentGrossInvestmentIncome', 'gross investment income', true],
  ['parentQualifiedDividends', 'qualified dividends', false],
  ['parentNetInvestmentGain', 'net investment-property gain', true],
  ['parentNetLongTermGain', 'net long-term investment gain', true],
  ['parentNetShortTermGain', 'net short-term investment gain', true],
] as const;

function Worksheet({ label, data, childEntries, onChange }: { label: 'Regular' | 'AMT'; data: InvestmentInterestWorksheetData; childEntries?: ChildElectionData[]; onChange: (data: InvestmentInterestWorksheetData) => void }) {
  const update = (patch: Partial<InvestmentInterestWorksheetData>) => onChange(updateInvestmentInterestWorksheet(data, patch));
  const partition = data.childIncomeSources;
  const updatePartition = (patch: Partial<InvestmentInterestChildPartition>) => update({ childIncomeSources: { ...partition, ...patch } });
  const lower = label === 'Regular' ? 'regular' : 'AMT';
  return <fieldset className="guided-fieldset"><legend>{label} investment-interest worksheet</legend>
    <div className="guided-form-grid">
      <TextFact label={`${label} investment worksheet tax year`} value={data.sourceTaxYear ?? ''} onChange={sourceTaxYear => update({ sourceTaxYear })} />
      <TextFact label={`${label} investment worksheet source reference`} value={data.sourceReference ?? ''} onChange={sourceReference => update({ sourceReference })} />
      {amountFields.map(([key, description, signed]) => <CurrencyField key={key} allowNegative={signed} label={`${label} ${description}`} value={data[key] ?? ''} onChange={value => update({ [key]: value })} />)}
      <TextFact label={`${label} prior carryforward source year`} value={data.priorYearSourceTaxYear ?? ''} onChange={priorYearSourceTaxYear => update({ priorYearSourceTaxYear })} />
      <BooleanFact label={`${label} investment expenses are deductible on this return`} value={data.investmentExpensesDeductibleConfirmed} onChange={investmentExpensesDeductibleConfirmed => update({ investmentExpensesDeductibleConfirmed })} />
    </div>
    <p className="guided-hint">Use the original current-year source amounts, including known zeros. Gross investment income includes qualified dividends and excludes disposition gains. Enter signed gain and loss totals before the form applies its limits. Line 5 excludes investment interest and nondeductible fees. Positive prior disallowed interest needs its immediately preceding year source.</p>
    <label className="guided-field"><span className="guided-field-label">{label} preferential-income election allocation</span><select className="guided-input" value={data.capitalGainElectionMethod ?? ''} onChange={event => update({ capitalGainElectionMethod: event.target.value as InvestmentInterestWorksheetData['capitalGainElectionMethod'] })}>
      <option value="">Choose if making a positive election</option><option value="capital_first">Apply the IRS capital-gain-first allocation</option><option value="explicit">Use the actual Elec. capital-gain allocation</option>
    </select></label>
    {(data.capitalGainElectionMethod === 'explicit' || data.electedNetCapitalGain !== undefined) && <CurrencyField label={`${label} explicit elected net capital gain`} value={data.electedNetCapitalGain ?? ''} onChange={electedNetCapitalGain => update({ electedNetCapitalGain })} hint="This actual allocation is part of the election above. It is not additional income. A saved amount must be reconciled before changing methods." />}
    {!partition ? <button type="button" className="utility-button" onClick={() => update({ childIncomeSources: {} })}>Add {lower} parent and child partition</button> : <fieldset className="guided-fieldset"><legend>{label} parent and child sources</legend>
      <p className="guided-hint">Required when reporting any child income on Form 8814. Enter parent totals excluding every elected child; the calculation adds each child's actual character once and checks the combined worksheet above. AMT uses its separate child private-activity-bond sources.</p>
      <div className="guided-form-grid">
        <TextFact label={`${label} child partition tax year`} value={partition.sourceTaxYear ?? ''} onChange={sourceTaxYear => updatePartition({ sourceTaxYear })} />
        <TextFact label={`${label} child partition source reference`} value={partition.sourceReference ?? ''} onChange={sourceReference => updatePartition({ sourceReference })} />
        {parentFields.map(([key, description, signed]) => <CurrencyField key={key} allowNegative={signed} label={`${label} parent ${description} excluding children`} value={partition[key] ?? ''} onChange={value => updatePartition({ [key]: value })} />)}
      </div>
      <button type="button" className="utility-button" onClick={() => updatePartition({ children: captureInvestmentInterestChildren(childEntries) })}>Copy actual child identities into {lower} partition</button>
      <p className="guided-hint">This copies only the child records already entered. It does not fill parent amounts or confirm the worksheet. Missing original identity or source facts remain unanswered.</p>
      {partition.children?.map((child, index) => <fieldset key={index}><legend>{label} child source {index + 1}</legend><div className="guided-form-grid">
        {([['sourceId', 'source ID'], ['sourceTaxYear', 'original year'], ['sourceReference', 'original source reference'], ['firstName', 'first name'], ['lastName', 'last name'], ['dateOfBirth', 'date of birth'], ['ssnLast4', 'taxpayer ID last four digits']] as const).map(([key, description]) => <TextFact key={key} type={key === 'dateOfBirth' ? 'date' : 'text'} label={`${label} child ${index + 1} ${description}`} value={child[key] ?? ''} onChange={value => updatePartition({ children: partition.children?.map((row, i) => i === index ? { ...row, [key]: value } : row) })} />)}
      </div></fieldset>)}
      <BooleanFact label={`${label} parent sources exclude all elected children`} value={partition.parentSourcesExcludeAllChildrenConfirmed} onChange={parentSourcesExcludeAllChildrenConfirmed => updatePartition({ parentSourcesExcludeAllChildrenConfirmed })} />
      <BooleanFact label={`${label} child partition checked after the last edit`} value={partition.sourceFactsConfirmed} onChange={sourceFactsConfirmed => updatePartition({ sourceFactsConfirmed })} />
      <button type="button" className="utility-button utility-button-small" onClick={() => update({ childIncomeSources: undefined })}>Remove {lower} parent and child partition</button>
    </fieldset>}
    <BooleanFact label={`${label} investment worksheet checked after the last edit`} value={data.sourceFactsConfirmed} onChange={sourceFactsConfirmed => update({ sourceFactsConfirmed })} />
  </fieldset>;
}

export function InvestmentInterestSourceDetails({ data, childEntries, onChange }: { data?: InvestmentInterestSourceData; childEntries?: ChildElectionData[]; onChange: (data: InvestmentInterestSourceData | undefined) => void }) {
  return <details className="guided-expand"><summary className="guided-expand-trigger">Investment interest source worksheets (Form 4952)</summary><div className="guided-expand-body">
    <p className="guided-hint">Use actual regular-tax and AMT sources for investment interest and its carryforward. The calculation determines the allowed deduction; an expense total alone does not establish the income limit. The separate AMT worksheet is not copied from regular tax.</p>
    {!data ? <button type="button" className="utility-button" onClick={() => onChange({})}>Add investment-interest source worksheets</button> : <>
      {(['regular', 'amt'] as const).map(key => {
        const label = key === 'regular' ? 'Regular' : 'AMT', worksheet = data[key];
        return <div key={key}>{worksheet ? <><Worksheet label={label} data={worksheet} childEntries={childEntries} onChange={next => onChange({ ...data, [key]: next })} /><button type="button" className="utility-button utility-button-small" onClick={() => onChange({ ...data, [key]: undefined })}>Remove {key === 'regular' ? 'regular' : 'AMT'} worksheet</button></> : <button type="button" className="utility-button" onClick={() => onChange({ ...data, [key]: {} })}>Add {key === 'regular' ? 'regular' : 'AMT'} worksheet</button>}</div>;
      })}
      <button type="button" className="utility-button utility-button-small" onClick={() => onChange(undefined)}>Remove investment-interest source worksheets</button>
    </>}
  </div></details>;
}
