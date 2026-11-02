/** Spec: spec/state/guided-investment-source-year-oh-oid.yaml. Source-first literals. */
import {expect,it} from 'vitest';
import {Form1099IntSchema,Form1099DivSchema,Form1099BSchema} from '@/models/inputs.js';
import {investmentFactErrors,isStartedInvestment} from '@/lib/guided-investment-facts';
import {buildInterestInputs,buildDividendInputs,buildBrokerageInputs,buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {emptyInterestEntry,emptyDividendEntry,emptyBrokerageEntry} from '@/lib/guided-interview-flow';
import {startCompleteInterview} from './complete-facts';
import {actualInvestmentYearData} from '../fixtures/investment-source-year-oh-oid';
it('actual investment source year is required for each started original',()=>{
 for(const year of [undefined,'','2024','2026','2025.1','unknown']){
  const data=actualInvestmentYearData(year);const errors=investmentFactErrors(data,'single',2025);
  for(const kind of ['interest','dividend','brokerage'])expect(errors,`${kind}/${String(year)}`).toHaveProperty(`${kind}-0-year`);
 }
 const explicit=actualInvestmentYearData('2025');expect(investmentFactErrors(explicit,'single',2025)).toEqual({});expect(investmentFactErrors(explicit,'single',undefined)).not.toEqual({});
 expect(investmentFactErrors(actualInvestmentYearData('2026'),'single',2026)).toEqual({});
});
it('actual investment years survive bridge and canonical validation without source defaults',()=>{
 for(const year of ['2025','2026']){
  const data=actualInvestmentYearData(year);const actual=[Form1099IntSchema.parse(buildInterestInputs(data.interestEntries,Number(year))[0]),Form1099DivSchema.parse(buildDividendInputs(data.dividendEntries,Number(year))[0]),Form1099BSchema.parse(buildBrokerageInputs(data.brokerageEntries)[0])];
  for(const form of actual)expect(Reflect.get(form,'taxYear')).toBe(Number(year));
 }
 const missing=actualInvestmentYearData(undefined);for(const form of [...buildInterestInputs(missing.interestEntries,2025),...buildDividendInputs(missing.dividendEntries,2025),...buildBrokerageInputs(missing.brokerageEntries)])expect(Reflect.get(form,'taxYear')).toBeUndefined();
 expect(Form1099IntSchema.parse({payer:'Legacy source',interestIncome:'1'})).not.toHaveProperty('taxYear');expect(Form1099DivSchema.parse({payer:'Legacy source',ordinaryDividends:'1'})).not.toHaveProperty('taxYear');
});
it('unknown actual investment year blocks complete guided originals without mutating source money',()=>{
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['investments'],lifeEvents:[],stateCode:null});const data=actualInvestmentYearData(undefined);data.interestEntries[0].interestIncome='9007199254740993.01';state.sectionData['income-investments']=data;const before=structuredClone(data);
 expect(buildTaxInputFromGuidedData(state)).toBeNull();expect(data).toEqual(before);Reflect.set(data.interestEntries[0],'sourceTaxYear','2025');Reflect.set(data.dividendEntries[0],'sourceTaxYear','2025');Reflect.set(data.brokerageEntries[0],'sourceTaxYear','2025');
 expect(buildTaxInputFromGuidedData(state)?.form1099Int[0]?.interestIncome).toBe('9007199254740993.01');
});
it('empty original investment drafts remain unknown instead of inheriting return year',()=>{
 const drafts=[structuredClone(emptyInterestEntry),structuredClone(emptyDividendEntry),structuredClone(emptyBrokerageEntry)];
 for(const row of drafts){expect(Reflect.get(row,'sourceTaxYear')).toBeUndefined();expect(isStartedInvestment(row)).toBe(false);}
 expect(investmentFactErrors({interestEntries:[drafts[0] as typeof emptyInterestEntry],dividendEntries:[drafts[1] as typeof emptyDividendEntry],brokerageEntries:[drafts[2] as typeof emptyBrokerageEntry]},'single',2025)).toEqual({});
});
