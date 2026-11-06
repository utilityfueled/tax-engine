// Spec: spec/federal/foreign-tax-deduction-carryover.yaml.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/models/constants.js', async importOriginal => {
  const original = await importOriginal<typeof import('@/models/constants.js')>();
  const { FEDERAL_2026_CONSTANTS } = await import('@/models/federal-2026-indexed.js');
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { carryFixture, stateAllocationFacts } from '../fixtures/foreign-tax-carryover.js';

function ordinary(year=2025,stateTaxes='0') {
  const base=carryFixture();const election=base.foreignTaxElection;
  if(!election?.sources||!election.deductionYearCarryover)throw new Error('Missing source fixture');
  return TaxYearInputSchema.parse({...base,taxpayer:{...base.taxpayer,taxYear:year},
    w2s:[{...base.w2s[0],wages:'95000',stateWages:'95000',stateTaxWithheld:stateTaxes}],scheduleA:undefined,
    foreignTaxElection:{...election,taxYear:year,sources:election.sources.map(row=>({...row,payments:[{date:`${year}-03-15`,amountUsd:'600'}]})),
      deductionYearCarryover:{...election.deductionYearCarryover,sourceTaxYear:year,adjustedThroughTaxYear:year-1,
        carryovers:[{originTaxYear:year-1,category:'passive',amount:'200',sourceReference:'Actual prior adjusted balance'}]}}});
}
const line=(result:ReturnType<typeof calculateFederalTax>,id:string)=>result.allLines.find(row=>row.form==='Foreign Deduction Carryover WS'&&row.line===id)?.value.toFixed();
describe('Canonical deduction-year foreign carryover',()=>{
  it('absorbs actual prior carry in both supported years without granting a credit',()=>{
    for(const [year,tax,limit,used,left] of [[2025,'13455','673','73','127'],[2026,'13170','659','59','141']] as const){
      const input=ordinary(year);const before=JSON.stringify(input);const result=calculateFederalTax(input);
      // 2025 TaxTable84250–84300 single13455. 2026:1240+4560+33500*.22=13170.
      // Foreign ratio .05 after prescribed deduction rounding; multiply and round once.
      expect(result.totalTaxBeforeCredits.toFixed()).toBe(tax);expect(result.foreignTaxCredit.isZero()).toBe(true);
      expect(line(result,'21')).toBe(limit);expect(line(result,'absorbed')).toBe(used);
      expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe(left);
      expect(result.carryforwards.foreignTaxCreditCarryforwardByCategory.passive?.map(row=>[row.taxYear,row.amount.toFixed()])).toEqual([[year-1,left]]);
      expect(result.allLines.filter(row=>row.form==='Foreign Tax Election WS'&&row.line==='deduction')).toHaveLength(1);
      expect(JSON.stringify(input)).toBe(before);
    }
  });
  it('recomputes deduction selection without changing the actual election',()=>{
    const input=ordinary(2025,'15500');const before=JSON.stringify(input);const result=calculateFederalTax(input);
    // Actual15500+600=16100 itemized. Hypothetical credit uses15750 standard.
    // Actual83900–83950 TaxTable single13378; hypothetical84250–84300 is13455.
    expect(result.deductionUsed).toBe('itemized');expect(result.deductionAmount.toFixed()).toBe('16100');
    expect(result.totalTaxBeforeCredits.toFixed()).toBe('13378');
    expect(line(result,'18')).toBe('84250');expect(line(result,'20')).toBe('13455');
    expect(line(result,'absorbed')).toBe('73');expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('127');
    expect(result.foreignTaxCredit.isZero()).toBe(true);expect(result.scheduleA.foreignIncomeTaxDeduction.toFixed()).toBe('600');
    expect(JSON.stringify(input)).toBe(before);
  });
  it('uses actual itemized state allocation in the hypothetical return',()=>{
    const input=ordinary(2025,'20000');const facts=input.foreignTaxElection?.deductionYearCarryover;if(!facts)throw new Error('Missing source fixture');
    facts.itemizedAllocation={sourceFactsConfirmed:true,sourceReference:'Actual state allocation',incomeOrSalesTaxes:'20000',homeRealPropertyTaxes:'0',personalPropertyTaxes:'0',
      stateAllocation:stateAllocationFacts(),stateIncomeTaxes:[{stateCode:'NY',deductibleAmount:'20000',stateTaxableIncome:'100000',foreignIncomeSpecificallyExempt:false,sourceReference:'Actual state taxable income'}]};
    const result=calculateFederalTax(input);
    // Actual source20000 state tax*(100000-95000)/100000=1000 foreign allocation.
    // 5000-1000=4000; hypothetical80000–80050 TaxTable12520*.05=626.
    expect(line(result,'18')).toBe('80000');expect(line(result,'20')).toBe('12520');expect(line(result,'21')).toBe('626');
    expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('174');
    expect(result.scheduleA.foreignIncomeTaxDeduction.toFixed()).toBe('600');
  });
  it('uses the aggregate state method once in the canonical hypothetical return',()=>{
    const input=ordinary(2025,'20000'),facts=input.foreignTaxElection?.deductionYearCarryover;
    if(!facts)throw new Error('Missing source fixture');
    facts.itemizedAllocation={sourceFactsConfirmed:true,sourceReference:'Actual complete allowed state deductions',incomeOrSalesTaxes:'20000',homeRealPropertyTaxes:'0',personalPropertyTaxes:'0',
      stateAllocation:stateAllocationFacts(),stateIncomeTaxes:[
        {stateCode:'NY',deductibleAmount:'12000',stateTaxableIncome:'60000',foreignIncomeSpecificallyExempt:false,sourceReference:'Actual NY nonoverlapping source'},
        {stateCode:'NJ',deductibleAmount:'8000',stateTaxableIncome:'40000',foreignIncomeSpecificallyExempt:false,sourceReference:'Actual NJ nonoverlapping source'},
      ]};
    const before=JSON.stringify(input),result=calculateFederalTax(input);
    // Pre-stateworld100000, U.S.95000; pooled20000*(60000+40000-95000)/100000=1000.
    // Hypothetical foreign4000/world80000=.05; TaxTable12520*.05=626.
    expect(line(result,'state-aggregate-taxable-base')).toBe('100000');
    expect(line(result,'state-aggregate-deductible-tax')).toBe('20000');
    expect(line(result,'country-1:state-tax')).toBe('1000');expect(line(result,'21')).toBe('626');
    expect(result.allLines.filter(row=>row.form==='Foreign Deduction Carryover WS'&&row.line==='state-aggregate-taxable-base')).toHaveLength(1);
    expect(result.foreignTaxCredit.isZero()).toBe(true);expect(result.carryforwards.foreignTaxCreditCarryforward.toFixed()).toBe('174');
    expect(result.scheduleA.foreignIncomeTaxDeduction.toFixed()).toBe('600');expect(JSON.stringify(input)).toBe(before);
  });
  it('preserves unsupported facts and rejects an ordinary-method substitution',()=>{
    const base=ordinary();
    for(const delta of [{form1099Div:[{payer:'Actual fund',ordinaryDividends:'100',qualifiedDividends:'100'}]},
      {form8962:{sourceFactsConfirmed:true}},{priorYear:{nolCarryforward:'100'}}]){
      const input=TaxYearInputSchema.parse({...base,...delta});const before=JSON.stringify(input);
      expect(()=>calculateFederalTax(input)).toThrow(/foreign.*ordinary|foreign.*method/i);expect(JSON.stringify(input)).toBe(before);
    }
  });
});
