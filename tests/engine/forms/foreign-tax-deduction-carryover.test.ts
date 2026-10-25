// Spec: spec/federal/foreign-tax-deduction-carryover.yaml.
import { describe, expect, it } from 'vitest';
import { calculateForeignTaxDeductionCarryover, type ForeignTaxHypotheticalContext } from '@/engine/forms/foreign-tax-deduction-carryover.js';
import { d } from '@/utils/decimal.js';
import { resolveForeignTaxElection } from '@/engine/forms/foreign-tax-election.js';

import { carryFacts, carryFixture } from '../../fixtures/foreign-tax-carryover.js';
export function hypothetical(changes:Partial<ForeignTaxHypotheticalContext>={}):ForeignTaxHypotheticalContext {
  return {taxYear:2025,filingStatus:'single',totalIncome:d('50000'),agi:d('50000'),totalDeductions:d('0'),seniorDeduction:d('0'),
    deductionUsed:'standard',deductionAmount:d('0'),incomeTax:d('7000'),ordinaryIncomeOnly:true,
    scheduleA:{medical:d('0'),incomeOrSalesTaxes:d('0'),realPropertyTaxes:d('0'),personalPropertyTaxes:d('0'),saltDeduction:d('0'),salesTaxElected:false,
      mortgageInterest:d('0'),investmentInterest:d('0'),charitableContributions:d('0'),otherDeductions:d('0'),itemizedReduction:d('0')},...changes};
}
const compute=(input=carryFixture(),context=hypothetical())=>calculateForeignTaxDeductionCarryover(input,context);
describe('Foreign tax deduction-year carryover',()=>{
  it('preserves unknown carryover facts and rejects stale source records',()=>{
    const blank=carryFixture({foreignTaxElection:{...carryFixture().foreignTaxElection,deductionYearCarryover:{}}});
    expect(blank.foreignTaxElection?.deductionYearCarryover?.sourceFactsConfirmed).toBeUndefined();
    expect(()=>compute(blank)).toThrow(/actual|confirm|source/i);
    for(const change of [{payerName:'Changed bank'},{payerTin:'998887777'},{accountReference:'Replacement account'},{owner:'spouse'},{reportedIncome:'5001'},{foreignIncome:'5001'},{foreignIncome:undefined}]) {
      const input=carryFixture({foreignTaxElection:{...carryFixture().foreignTaxElection,deductionYearCarryover:{...carryFacts(),incomeSources:[{...carryFacts().incomeSources[0],...change}]}}});
      expect(()=>compute(input)).toThrow();
    }
  });
  it('reproduces the IRS deduction-year carryover example',()=>{
    // Pub514 gives current600, prior200, hypothetical limit700. The same ordinary
    // ratio here is5000/50000=.1 and hypothetical regular tax7000 =>limit700.
    const input=carryFixture();const before=JSON.stringify(input);const result=compute(input);
    expect(result.hypotheticalLimitation.toFixed()).toBe('700');
    expect(result.currentQualifiedForeignTaxes.toFixed()).toBe('600');
    expect(result.absorbed.toFixed()).toBe('100');expect(result.carryforward.toFixed()).toBe('100');
    expect(result.expired.isZero()).toBe(true);expect(result.carryforwardByCategory.passive?.[0]).toMatchObject({taxYear:2024});
    expect(JSON.stringify(input)).toBe(before);
  });
  it('computes the prescribed ordinary-income allocation without a heuristic',()=>{
    const input=carryFixture();const facts=input.foreignTaxElection?.deductionYearCarryover;if(!facts?.incomeSources?.[0])throw new Error('Missing facts');
    facts.incomeSources[0].foreignIncome='2500';
    const result=compute(input,hypothetical({totalDeductions:d('10000'),deductionAmount:d('10000'),incomeTax:d('7000')}));
    // Only actual2500 of statement5000 is foreign; 2500/50000=.05; allocated500.
    // Netforeign2000 / worldwide40000=.05 =>350, so no prior carry is absorbed.
    expect(result.netForeignTaxableIncome.toFixed()).toBe('2000');expect(result.hypotheticalLimitation.toFixed()).toBe('350');
    expect(result.absorbed.isZero()).toBe(true);expect(result.carryforward.toFixed()).toBe('200');
  });
  it('absorbs oldest balances and expires the unused tenth-year remainder',()=>{
    const input=carryFixture({foreignTaxElection:{...carryFixture().foreignTaxElection,deductionYearCarryover:{...carryFacts(),carryovers:[
      {originTaxYear:2024,category:'passive',amount:'200',sourceReference:'Actual2024balance'},
      {originTaxYear:2015,category:'passive',amount:'150',sourceReference:'Actual2015balance'}]}}});
    const result=compute(input);expect(result.absorbed.toFixed()).toBe('100');expect(result.expired.toFixed()).toBe('50');
    expect(result.carryforward.toFixed()).toBe('200');expect(result.carryforwardByCategory.passive?.map(row=>row.taxYear)).toEqual([2024]);
    expect(result.details[0]).toMatchObject({originTaxYear:2015});
  });
  it('preserves categories and creates no new carry from current-year excess',()=>{
    const input=carryFixture({foreignTaxElection:{...carryFixture().foreignTaxElection,deductionYearCarryover:{...carryFacts(),carryovers:[
      ...carryFacts().carryovers,{originTaxYear:2023,category:'general',amount:'80',sourceReference:'Actual general balance'}]}}});
    const result=compute(input,hypothetical({incomeTax:d('1000')}));
    expect(result.absorbed.isZero()).toBe(true);expect(result.carryforward.toFixed()).toBe('280');
    expect(result.carryforwardByCategory.general?.[0]?.amount.toFixed()).toBe('80');
    expect(result.details.every(row=>row.originTaxYear<2025)).toBe(true);
    for(const row of result.details)expect(row.amount.eq(row.absorbed.plus(row.expired).plus(row.remaining))).toBe(true);
  });
  it('allocates ordinary itemized costs using actual state income and home sources',()=>{
    const input=carryFixture();input.form1099Int[0].interestIncome='25000';
    const facts=input.foreignTaxElection?.deductionYearCarryover;if(!facts?.incomeSources?.[0])throw new Error('Missing facts');
    facts.incomeSources[0].reportedIncome='25000';facts.incomeSources[0].foreignIncome='25000';
    facts.itemizedAllocation={sourceFactsConfirmed:true,sourceReference:'Actual completed source allocation',incomeOrSalesTaxes:'6000',homeRealPropertyTaxes:'1000',personalPropertyTaxes:'200',
      allRealPropertyTaxesForPersonalResidenceConfirmed:true,noTreatyCharitableDeductionConfirmed:true,mortgageInterestMethod:'gross_income',
      stateIncomeTaxes:[{stateCode:'NY',deductibleAmount:'6000',stateTaxableIncome:'80000',foreignIncomeSpecificallyExempt:false,sourceReference:'Actual state income worksheet'}]};
    const context=hypothetical({totalIncome:d('100000'),agi:d('100000'),totalDeductions:d('21200'),deductionAmount:d('21200'),deductionUsed:'itemized',incomeTax:d('15000'),
      scheduleA:{medical:d('1000'),incomeOrSalesTaxes:d('6000'),realPropertyTaxes:d('1000'),personalPropertyTaxes:d('200'),saltDeduction:d('7200'),salesTaxElected:false,
        mortgageInterest:d('12000'),investmentInterest:d('0'),charitableContributions:d('1000'),otherDeductions:d('0'),itemizedReduction:d('0')}});
    // Other foreign deductions2200*.25=550 and mortgage12000*.25=3000.
    // Pre-state worldwide100000-21200+6000=84800; foreign21450; U.S.63350.
    // State foreign share(80000-63350)/80000*6000=1248.75=>1249.
    // Foreign net25000-550-3000-1249=20201; round4(20201/78800)=.2564.
    const result=compute(input,context);expect(result.netForeignTaxableIncome.toFixed()).toBe('20201');expect(result.hypotheticalLimitation.toFixed()).toBe('3846');
    expect(result.lines.find(row=>row.line==='state-us-taxable-before-deduction')?.value.toFixed()).toBe('63350');
    expect(result.absorbed.toFixed()).toBe('200');expect(result.carryforward.isZero()).toBe(true);
  });
  it('rejects contradictory state exemption and gross-income facts',()=>{
    const input=carryFixture();const facts=input.foreignTaxElection?.deductionYearCarryover;if(!facts)throw new Error('Missing facts');
    facts.itemizedAllocation={sourceFactsConfirmed:true,sourceReference:'Actual allocation',incomeOrSalesTaxes:'1000',homeRealPropertyTaxes:'0',personalPropertyTaxes:'0',
      stateIncomeTaxes:[{stateCode:'NY',deductibleAmount:'1000',stateTaxableIncome:'50000',foreignIncomeSpecificallyExempt:true,sourceReference:'Contradictory state income'}]};
    const context=hypothetical({deductionUsed:'itemized',deductionAmount:d('1000'),totalDeductions:d('1000'),scheduleA:{...hypothetical().scheduleA,incomeOrSalesTaxes:d('1000'),saltDeduction:d('1000')}});
    expect(()=>compute(input,context)).toThrow(/state.*source|state.*income/i);
  });
  it('combines signed country columns before limiting the credit',()=>{
    const input=carryFixture();const election=input.foreignTaxElection;const facts=election?.deductionYearCarryover;
    if(!election||!facts?.incomeSources?.[0])throw new Error('Missing facts');
    input.form1099Int=[{...input.form1099Int[0],interestIncome:'1.49',foreignTaxPaid:'0'},
      {...input.form1099Int[0],interestIncome:'10',foreignTaxPaid:'0',foreignCountry:'France',accountReference:'Actual second account'}];
    election.sources=[];facts.incomeSources=[{...facts.incomeSources[0],reportedIncome:'1.49',foreignIncome:'1.49'},
      {...facts.incomeSources[0],sourceId:'form1099Int:1',reportedIncome:'10',foreignIncome:'10',foreignCountry:'France',accountReference:'Actual second account'}];
    facts.itemizedAllocation={sourceFactsConfirmed:true,sourceReference:'Actual allowed costs',incomeOrSalesTaxes:'0',homeRealPropertyTaxes:'0',personalPropertyTaxes:'0',mortgageInterestMethod:'gross_income'};
    const result=compute(input,hypothetical({totalIncome:d('100'),agi:d('100'),totalDeductions:d('80'),deductionAmount:d('80'),deductionUsed:'itemized',incomeTax:d('100'),
      scheduleA:{...hypothetical().scheduleA,medical:d('40'),mortgageInterest:d('40')}}));
    // CountryA: round1.49=1 minus round40*.0149=1 twice =>-1.
    // CountryB:10-4-4=2. Official total7 is1, not2;1/20*.100=5.
    expect(result.netForeignTaxableIncome.toFixed()).toBe('1');expect(result.hypotheticalLimitation.toFixed()).toBe('5');
    expect(result.lines.find(row=>row.line==='country-1:net-income')?.value.toFixed()).toBe('-1');
  });
  it('rejects unprovided state country attribution',()=>{
    const input=carryFixture();const facts=input.foreignTaxElection?.deductionYearCarryover;if(!facts?.incomeSources?.[0])throw new Error('Missing facts');
    input.form1099Int.push({...input.form1099Int[0],foreignCountry:'France',foreignTaxPaid:'0',accountReference:'Actual second account'});
    facts.incomeSources.push({...facts.incomeSources[0],sourceId:'form1099Int:1',foreignCountry:'France',accountReference:'Actual second account'});
    facts.itemizedAllocation={sourceFactsConfirmed:true,sourceReference:'Actual allocated costs',incomeOrSalesTaxes:'1000',homeRealPropertyTaxes:'0',personalPropertyTaxes:'0',
      stateIncomeTaxes:[{stateCode:'NY',deductibleAmount:'1000',stateTaxableIncome:'50000',foreignIncomeSpecificallyExempt:false,sourceReference:'Actual state total only'}]};
    expect(()=>compute(input,hypothetical({deductionUsed:'itemized',deductionAmount:d('1000'),totalDeductions:d('1000'),scheduleA:{...hypothetical().scheduleA,incomeOrSalesTaxes:d('1000'),saltDeduction:d('1000')}}))).toThrow(/country.*attribution|state.*country/i);
  });
  it('rejects a saved deduction-year ledger on a credit election',()=>{
    const input=carryFixture();if(!input.foreignTaxElection)throw new Error('Missing facts');
    input.foreignTaxElection.election='credit';input.foreignTaxElection.sources=undefined;
    expect(()=>resolveForeignTaxElection(input)).toThrow(/carryover.*credit|credit.*carryover/i);
  });
  it('rejects inconsistent history unsupported methods and carry aliases',()=>{
    for(const change of [{filingHistory:'continuous_joint_same_spouse'},{filingHistoryConfirmed:false},{noOtherForeignIncomeConfirmed:false},
      {noForeignOrDomesticLossAccountsConfirmed:false},{allCurrentTaxesCreditEligibleConfirmed:false},{adjustedThroughTaxYear:2023},
      {carryovers:[{originTaxYear:2025,category:'passive',amount:'200',sourceReference:'Future'}]},
      {carryovers:[{originTaxYear:2014,category:'passive',amount:'200',sourceReference:'Already expired'}]},
      {carryovers:[...carryFacts().carryovers,...carryFacts().carryovers]}]) {
      expect(()=>compute(carryFixture({foreignTaxElection:{...carryFixture().foreignTaxElection,deductionYearCarryover:{...carryFacts(),...change}}}))).toThrow();
    }
    expect(()=>compute(carryFixture({priorYear:{foreignTaxCreditCarryforward:'201'}}))).toThrow(/carry|balance/i);
    expect(()=>compute(carryFixture(),hypothetical({ordinaryIncomeOnly:false}))).toThrow(/ordinary|method/i);
  });
});
