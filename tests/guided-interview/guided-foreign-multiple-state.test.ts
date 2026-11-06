// Spec: spec/federal/foreign-tax-multiple-state.yaml.
import { expect, it } from 'vitest';
import { buildGuidedForeignTaxCarryover, type ForeignCarryoverData } from '@/lib/guided-foreign-tax-carryover';
import { guidedCarryoverFixture } from '../fixtures/guided-foreign-tax-carryover';
import { stateAllocationFacts } from '../fixtures/foreign-tax-carryover';

it('collects actual aggregate state sources without assuming an empty no-tax ledger',()=>{
  const {facts,investment}=guidedCarryoverFixture();
  const source:ForeignCarryoverData={...facts.deductionYearCarryover,itemizedAllocation:{
    sourceReference:'Actual allowed itemized deductions',sourceFactsConfirmed:true,incomeOrSalesTaxes:'6,000.00',homeRealPropertyTaxes:'0',personalPropertyTaxes:'0',
    stateAllocation:{...stateAllocationFacts(),noTaxStateIncome:[{stateCode:'tx',usTaxableIncome:'1,000.01',sourceReference:'Actual completed U.S.taxable attribution'}]},
    stateIncomeTaxes:[
      {stateCode:'ny',deductibleAmount:'4,000',stateTaxableIncome:'40,000',foreignIncomeSpecificallyExempt:false,sourceReference:'Actual NY source'},
      {stateCode:'nj',deductibleAmount:'2,000',stateTaxableIncome:'50,000',foreignIncomeSpecificallyExempt:false,sourceReference:'Actual NJ source'},
    ],
  }};
  const before=JSON.stringify(source),result=buildGuidedForeignTaxCarryover(source,investment,2025,'single');
  expect(result?.itemizedAllocation?.stateIncomeTaxes?.map(row=>row.stateCode)).toEqual(['NY','NJ']);
  expect(result?.itemizedAllocation?.stateAllocation?.noTaxStateIncome).toEqual([{stateCode:'TX',usTaxableIncome:'1000.01',sourceReference:'Actual completed U.S.taxable attribution'}]);
  expect(JSON.stringify(source)).toBe(before);
  for(const patch of [undefined,{...stateAllocationFacts(),noTaxStateIncome:undefined},{...stateAllocationFacts(),methodHistoryConfirmed:false},
    {...stateAllocationFacts(),method:'existing_safe_harbor_or_other'}, {...stateAllocationFacts(),sourceFactsConfirmed:undefined},
    {...stateAllocationFacts(),noTaxStateIncome:[{stateCode:'NY',usTaxableIncome:'0',sourceReference:'Duplicate taxing state'}]},
    {...stateAllocationFacts(),noTaxStateIncome:[{stateCode:'TX',usTaxableIncome:undefined,sourceReference:'Missing actual amount'}]},
  ]){
    const changed=structuredClone(source);if(!changed.itemizedAllocation)throw new Error('Missing source');
    Object.assign(changed.itemizedAllocation,{stateAllocation:patch});
    expect(()=>buildGuidedForeignTaxCarryover(changed,investment,2025,'single')).toThrow(/state|jurisdiction|method|source|income/i);
  }
  const none=structuredClone(source);if(!none.itemizedAllocation)throw new Error('Missing source');
  none.itemizedAllocation.stateAllocation=stateAllocationFacts();
  expect(buildGuidedForeignTaxCarryover(none,investment,2025,'single')?.itemizedAllocation?.stateAllocation?.noTaxStateIncome).toEqual([]);
  none.itemizedAllocation.stateIncomeTaxes=[{...none.itemizedAllocation.stateIncomeTaxes?.[0]}, {...none.itemizedAllocation.stateIncomeTaxes?.[0]}];
  expect(()=>buildGuidedForeignTaxCarryover(none,investment,2025,'single')).toThrow(/distinct|duplicate|jurisdiction/i);
});
