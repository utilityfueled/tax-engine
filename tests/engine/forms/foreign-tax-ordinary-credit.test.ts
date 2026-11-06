// Literal formulas from spec/federal/foreign-tax-ordinary-credit.yaml.
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateForeignTaxOrdinaryCredit, type ForeignTaxOrdinaryCreditInput } from '@/engine/forms/foreign-tax-ordinary-credit.js';
const d=(v:string)=>new Decimal(v);
function fixture():ForeignTaxOrdinaryCreditInput {
  return { taxYear:2025, filingStatus:'single', sourceFactsConfirmed:true,
    context:{taxYear:2025,filingStatus:'single',totalIncome:d('100000'),agi:d('100000'),totalDeductions:d('15750'),seniorDeduction:d('0'),deductionUsed:'standard',deductionAmount:d('15750'),incomeTax:d('13455'),ordinaryIncomeOnly:true,
      scheduleA:{medical:d('0'),incomeOrSalesTaxes:d('0'),realPropertyTaxes:d('0'),personalPropertyTaxes:d('0'),saltDeduction:d('0'),salesTaxElected:false,mortgageInterest:d('0'),investmentInterest:d('0'),charitableContributions:d('0'),otherDeductions:d('0'),itemizedReduction:d('0')}},
    countries:[{country:'CA',gross:d('10000'),tax:d('900')}],
    passiveGroup:'withholding_under_15', noCfcOrQbuIncomeConfirmed:true,
    regularCarryovers:[{originTaxYear:2015,category:'passive',amount:d('500')}],amtCarryovers:[],
    amt:{amti:d('100000'),taxBeforeCredit:d('3094'),grossIncome:d('100000'),taxableExcess:d('11900'),rate26Limit:d('239100'),foreignAmountsSameAsRegularConfirmed:true,
      firstPost1997CreditClaimTaxYear:2024,simplifiedElectionMadeInFirstClaimYear:false,noRevocationConfirmed:true},
    regularCarryback:undefined,
    amtCarryback:{taxYear:2024,election:'form1116_credit',sourceFactsConfirmed:true,sourceReference:'Private prior AMT return',limitation:d('500'),currentTaxes:d('300'),priorCarryoversUsed:d('100'),allPriorUseIncludedConfirmed:true},
  };
}
function prior(input:ForeignTaxOrdinaryCreditInput){
  if(!input.amtCarryback)throw new Error('Missing actual synthetic prior return');
  return input.amtCarryback;
}
describe('Ordinary source Form1116 regular and AMT arithmetic',()=>{
  it('computes regular and separate AMT income from actual deduction rules',()=>{
    const result=calculateForeignTaxOrdinaryCredit(fixture());
    expect(result.regular.netForeignTaxableIncome.toString()).toBe('8425');
    expect(result.regular.worldwideTaxableIncome.toString()).toBe('84250');
    expect(result.regular.limitation.toString()).toBe('1346');
    expect(result.amt.netForeignTaxableIncome.toString()).toBe('10000');
    expect(result.amt.worldwideTaxableIncome.toString()).toBe('100000');
    expect(result.amt.limitation.toString()).toBe('309');
    const input=fixture();input.context={...input.context,totalIncome:d('250000'),agi:d('250000'),totalDeductions:d('41000'),deductionAmount:d('41000'),deductionUsed:'itemized',incomeTax:d('40000'),scheduleA:{...input.context.scheduleA,medical:d('1000'),incomeOrSalesTaxes:d('10000'),saltDeduction:d('10000'),salesTaxElected:true,mortgageInterest:d('20000'),charitableContributions:d('10000')}};
    input.countries=[{country:'CA',gross:d('50000'),tax:d('6000')}];input.regularCarryovers=[];input.amt={...input.amt,amti:d('219000'),grossIncome:d('250000'),taxBeforeCredit:d('34000')};
    input.itemizedAllocation={sourceReference:'Private actual allocation',sourceFactsConfirmed:true,incomeOrSalesTaxes:'10000',homeRealPropertyTaxes:'0',personalPropertyTaxes:'0',noTreatyCharitableDeductionConfirmed:true,mortgageInterestMethod:'gross_income'};
    const itemized=calculateForeignTaxOrdinaryCredit(input);
    expect(itemized.regular.netForeignTaxableIncome.toString()).toBe('43800');
    expect(itemized.regular.limitation.toString()).toBe('8384');
    expect(itemized.amt.netForeignTaxableIncome.toString()).toBe('45800');
    expect(itemized.amt.limitation.toString()).toBe('7109');
  });
  it('honors actual AMT first claim election and independent taxable income',()=>{
    const input=fixture();input.amt.simplifiedElectionMadeInFirstClaimYear=true;
    let result=calculateForeignTaxOrdinaryCredit(input);
    expect(result.amt.netForeignTaxableIncome.toString()).toBe('8425');
    expect(result.amt.limitation.toString()).toBe('261');
    input.amt.firstPost1997CreditClaimTaxYear=2000;result=calculateForeignTaxOrdinaryCredit(input);
    expect(result.amt.limitation.toString()).toBe('261');
    input.amt.firstPost1997CreditClaimTaxYear=2026;expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/first|history/i);
    input.amt.firstPost1997CreditClaimTaxYear=2025;input.amt.simplifiedElectionMadeInFirstClaimYear=undefined;
    expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/election/i);
  });
  it('reconciles the first AMT claim against actual prior allowed credit',()=>{
    const input=fixture();input.amt.firstPost1997CreditClaimTaxYear=2025;
    expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/first.*claim|history/i);
    input.amtCarryback={...prior(input),limitation:d('0'),currentTaxes:d('0'),priorCarryoversUsed:d('0')};
    expect(calculateForeignTaxOrdinaryCredit(input).amt.currentCarryforward.toFixed()).toBe('591');
  });
  it('checks the actual passive grouping independently for regular and AMT',()=>{
    const input=fixture();input.passiveGroup='withholding_15_or_more';input.countries[0].tax=d('2600');input.regularCarryback={...prior(input),election:'direct_credit_election'};
    expect(calculateForeignTaxOrdinaryCredit(input).amt.creditAllowed.toString()).toBe('309');
    input.countries[0].tax=d('2600.01');expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/AMT.*high.tax/i);
    input.countries[0].tax=d('3117.26');expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/regular.*high.tax/i);
    input.countries[0].tax=d('900');input.passiveGroup=undefined;expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/group/i);
    input.passiveGroup='withholding_under_15';input.noCfcOrQbuIncomeConfirmed=false;expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/CFC|QBU|group/i);
  });
  it('uses the actual AMT taxable excess at and above its indexed rate breakpoint',()=>{
    const input=fixture();
    input.context={...input.context,totalIncome:d('400000'),agi:d('400000'),incomeTax:d('103047')};
    input.countries[0].tax=d('2700');input.passiveGroup='withholding_15_or_more';
    input.regularCarryovers=[];input.regularCarryback={...prior(input),election:'direct_credit_election'};
    input.amt={...input.amt,amti:d('400000'),grossIncome:d('400000'),taxableExcess:d('239100'),taxBeforeCredit:d('62166')};
    expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/AMT.*high.tax/i);
    input.amt.taxableExcess=d('239101');input.amt.taxBeforeCredit=d('62166');
    expect(calculateForeignTaxOrdinaryCredit(input).amt.creditAllowed.gt(0)).toBe(true);
    input.countries[0].tax=d('2800');expect(()=>calculateForeignTaxOrdinaryCredit(input)).not.toThrow();
    input.countries[0].tax=d('2800.01');expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/AMT.*high.tax/i);
    for(const change of [
      {taxableExcess:d('400001')},{taxableExcess:d('-1')},{taxableExcess:d('NaN')},{rate26Limit:d('0')},
    ])expect(()=>calculateForeignTaxOrdinaryCredit({...input,amt:{...input.amt,...change}})).toThrow(/AMT|actual/i);
  });
  it('retains actual AMT high tax classification when electing the simplified limitation',()=>{
    const input=fixture();input.amt.simplifiedElectionMadeInFirstClaimYear=true;
    input.countries[0].tax=d('2400');input.passiveGroup='withholding_15_or_more';
    input.regularCarryback={...prior(input),election:'direct_credit_election'};
    // Actual AMT net10000*.26=2600; elected regular numerator8425 applies only
    // to the limitation. It must not misclassify2400 as above8425*.26=2190.50.
    const result=calculateForeignTaxOrdinaryCredit(input);
    expect(result.amt.netForeignTaxableIncome.toFixed()).toBe('8425');
    expect(result.amt.creditAllowed.toFixed()).toBe('261');
    expect(result.amt.lines.find(row=>row.line==='high-tax-net-income')?.value.toFixed()).toBe('10000');
  });
  it('uses current tax then oldest prior credits and expires only the unused tenth year',()=>{
    const input=fixture();input.regularCarryovers=[{originTaxYear:2024,category:'passive',amount:d('50.25')},{originTaxYear:2015,category:'passive',amount:d('500')},{originTaxYear:2015,category:'general',amount:d('10.75')}];
    const result=calculateForeignTaxOrdinaryCredit(input).regular;
    expect(result.creditAllowed.toString()).toBe('1346');
    expect(result.priorUsed.toString()).toBe('446');
    expect(result.expired.toString()).toBe('64.75');
    expect(result.carryforward.toString()).toBe('50.25');
    for(const row of result.details)expect(row.used.plus(row.expired).plus(row.remaining).eq(row.amount)).toBe(true);
    input.regularCarryovers=[{originTaxYear:2024,category:'passive',amount:d('100.6')}];
    const fractional=calculateForeignTaxOrdinaryCredit(input).regular;
    expect(fractional.creditAllowed.toString()).toBe('1001');expect(fractional.priorUsed.toString()).toBe('100.6');expect(fractional.carryforward.isZero()).toBe(true);
  });
  it('requires and conserves actual prior return carryback records separately for AMT',()=>{
    let input=fixture();let result=calculateForeignTaxOrdinaryCredit(input).amt;
    expect(result.currentTaxExcess.toString()).toBe('591');expect(result.carryback.toString()).toBe('100');expect(result.currentCarryforward.toString()).toBe('491');
    input.amtCarryback=undefined;expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/AMT.*carryback/i);
    input=fixture();input.amtCarryback={...prior(input),election:'direct_credit_election',limitation:undefined,currentTaxes:undefined,priorCarryoversUsed:undefined};
    result=calculateForeignTaxOrdinaryCredit(input).amt;expect(result.carryback.isZero()).toBe(true);expect(result.currentCarryforward.toString()).toBe('591');
    input=fixture();prior(input).priorCarryoversUsed=d('201');expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/prior.*capacity|reconcile/i);
    input=fixture();prior(input).election='deduction';expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow(/deduction.*method/i);
  });
  it('rejects missing contradictory or unsafe source arithmetic',()=>{
    const edits:Array<(i:ForeignTaxOrdinaryCreditInput)=>void>=[
      i=>{i.sourceFactsConfirmed=false;},i=>{i.context.ordinaryIncomeOnly=false;},i=>{i.context.totalIncome=d('Infinity');},
      i=>{i.amt.amti=d('99999');},i=>{i.amt.foreignAmountsSameAsRegularConfirmed=false;},i=>{i.amt.noRevocationConfirmed=false;},
      i=>{i.countries[0].tax=d('-1');},i=>{i.countries.push({...i.countries[0]});},
      i=>{i.regularCarryovers.push({...i.regularCarryovers[0]});},i=>{i.regularCarryovers[0].originTaxYear=2025;},
      i=>{i.regularCarryovers[0].amount=d('NaN');},i=>{prior(i).sourceFactsConfirmed=false;},
    ];
    for(const edit of edits){const input=fixture();edit(input);expect(()=>calculateForeignTaxOrdinaryCredit(input)).toThrow();}
  });
});
