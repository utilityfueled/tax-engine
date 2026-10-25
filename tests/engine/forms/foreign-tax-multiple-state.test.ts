// Spec: spec/federal/foreign-tax-multiple-state.yaml.
import { describe, expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateForeignTaxDeductionCarryover, type ForeignTaxHypotheticalContext } from '@/engine/forms/foreign-tax-deduction-carryover.js';
import { d, sum } from '@/utils/decimal.js';
import { carryFixture } from '../../fixtures/foreign-tax-carryover.js';

const method = () => ({ method: 'ordinary_presumption', sourceFactsConfirmed: true, sourceReference: 'Actual complete jurisdiction worksheet',
  methodHistoryConfirmed: true, allStateSourcesIncludedConfirmed: true, nonoverlappingIncomeConfirmed: true, noTaxStateIncome: [] as Array<{stateCode:string;usTaxableIncome:string;sourceReference:string}> });
const state = (stateCode:string, deductibleAmount:string, stateTaxableIncome:string, foreignIncomeSpecificallyExempt=false) => ({
  stateCode, deductibleAmount, stateTaxableIncome, foreignIncomeSpecificallyExempt, sourceReference: `Actual ${stateCode} taxable source worksheet`,
});
function source(states = [state('NY','55000','550000'),state('CA','10000','200000'),state('NJ','4000','200000')]) {
  const base = carryFixture(), election = base.foreignTaxElection, facts = election?.deductionYearCarryover;
  if (!election || !facts?.incomeSources?.[0]) throw new Error('Missing synthetic source');
  const taxes = sum(...states.map(row => d(row.deductibleAmount)));
  const raw = { ...base, form1099Int: [{ ...base.form1099Int[0], interestIncome: '200000' }],
    foreignTaxElection: { ...election, deductionYearCarryover: { ...facts,
      incomeSources: [{ ...facts.incomeSources[0], reportedIncome:'200000', foreignIncome:'200000' }],
      itemizedAllocation: { sourceFactsConfirmed:true,sourceReference:'Actual allowed source deductions',incomeOrSalesTaxes:taxes.toFixed(),
        homeRealPropertyTaxes:'0',personalPropertyTaxes:'0',stateAllocation:method(),stateIncomeTaxes:states },
    } } };
  // Literal published allocation examples, not an individual SALT-cap fixture.
  const context: ForeignTaxHypotheticalContext = { taxYear:2025,filingStatus:'single',totalIncome:d('1000000'),agi:d('1000000'),
    totalDeductions:taxes,seniorDeduction:d('0'),deductionUsed:'itemized',deductionAmount:taxes,incomeTax:d('150000'),ordinaryIncomeOnly:true,
    scheduleA:{medical:d('0'),incomeOrSalesTaxes:taxes,realPropertyTaxes:d('0'),personalPropertyTaxes:d('0'),saltDeduction:taxes,salesTaxElected:false,
      mortgageInterest:d('0'),investmentInterest:d('0'),charitableContributions:d('0'),otherDeductions:d('0'),itemizedReduction:d('0')} };
  return { raw, context };
}
const compute = ({raw,context}:ReturnType<typeof source>) => calculateForeignTaxDeductionCarryover(TaxYearInputSchema.parse(raw),context);
const line = (result:ReturnType<typeof compute>,id:string) => result.lines.find(row => row.line===id)?.value.toFixed();

describe('Actual aggregate foreign state-tax allocation',()=>{
  it('preserves unknown method facts and rejects incomplete source jurisdiction records',()=>{
    const input=source(), allocation=input.raw.foreignTaxElection.deductionYearCarryover.itemizedAllocation;
    const unknown=TaxYearInputSchema.parse({...input.raw,foreignTaxElection:{...input.raw.foreignTaxElection,deductionYearCarryover:{...input.raw.foreignTaxElection.deductionYearCarryover,
      itemizedAllocation:{...allocation,stateAllocation:{}}}}});
    expect(unknown.foreignTaxElection?.deductionYearCarryover?.itemizedAllocation?.stateAllocation).toEqual({});
    for(const patch of [undefined,{method:undefined}, {method:'existing_safe_harbor_or_other'}, {sourceFactsConfirmed:false}, {methodHistoryConfirmed:undefined},
      {allStateSourcesIncludedConfirmed:false},{nonoverlappingIncomeConfirmed:undefined},{noTaxStateIncome:undefined},{sourceReference:''}]){
      const changed=structuredClone(input.raw);
      Object.assign(changed.foreignTaxElection.deductionYearCarryover.itemizedAllocation,{stateAllocation:patch===undefined?undefined:{...method(),...patch}});
      expect(()=>compute({...input,raw:changed})).toThrow(/state|jurisdiction|method/i);
    }
    for(const records of [
      [state('NY','55000','550000'),state('ny','14000','400000')],
      [state('NY','69000','1000001')], [state('NY','69000','0')],
      [state('NY','69000','800001',true)],
    ])expect(()=>compute(source(records))).toThrow(/state|source|income/i);
  });
  it('reproduces the aggregate and exempt-state regulation examples',()=>{
    const input=source(), before=JSON.stringify(input.raw), ordinary=compute(input);
    // Reg1.861-8(g)Ex25: pooled69000*(950000-800000)/950000=10894.7368...
    expect(line(ordinary,'state-aggregate-taxable-base')).toBe('950000');
    expect(line(ordinary,'state-aggregate-foreign-base')).toBe('150000');
    expect(line(ordinary,'country-1:state-tax')).toBe('10895');
    input.raw.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes[0].foreignIncomeSpecificallyExempt=true;
    const exempt=compute(input);
    // Ex26:550000exemptAisU.S.only; remaining14000*(400000-250000)/400000=5250.
    expect(line(exempt,'state-aggregate-taxable-base')).toBe('400000');
    expect(line(exempt,'state-adjusted-us-taxable')).toBe('250000');
    expect(line(exempt,'country-1:state-tax')).toBe('5250');
    input.raw.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes[0].foreignIncomeSpecificallyExempt=false;
    expect(JSON.stringify(input.raw)).toBe(before);
  });
  it('applies actual no-tax-state income once without allocating its nonexistent tax',()=>{
    const input=source([state('CA','10000','200000'),state('NJ','4000','200000')]);
    const methodFacts=input.raw.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateAllocation;
    methodFacts.noTaxStateIncome=[{stateCode:'TX',usTaxableIncome:'550000',sourceReference:'Actual completed reasonable U.S.attribution'}];
    const result=compute(input);
    expect(line(result,'state-no-tax-us-income')).toBe('550000');
    expect(line(result,'state-adjusted-us-taxable')).toBe('250000');
    expect(line(result,'country-1:state-tax')).toBe('5250');
    for(const rows of [
      [{stateCode:'TX',usTaxableIncome:'800000.01',sourceReference:'Actual source'}],
      [{stateCode:'CA',usTaxableIncome:'100',sourceReference:'Conflicting taxing jurisdiction'}],
      [{stateCode:'TX',usTaxableIncome:'100',sourceReference:''}],
      [methodFacts.noTaxStateIncome[0],methodFacts.noTaxStateIncome[0]],
    ]){
      const changed=structuredClone(input.raw);changed.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateAllocation.noTaxStateIncome=rows;
      expect(()=>compute({...input,raw:changed})).toThrow(/state|source|income|jurisdiction/i);
    }
  });
  it('conserves actual country amounts across states and preserves source cents',()=>{
    const input=source(), facts=input.raw.foreignTaxElection.deductionYearCarryover;
    input.raw.form1099Int=[{...input.raw.form1099Int[0],interestIncome:'120000'},
      {...input.raw.form1099Int[0],interestIncome:'80000',foreignTaxPaid:'0',foreignCountry:'France',accountReference:'Actual second account'}];
    facts.incomeSources=[{...facts.incomeSources[0],reportedIncome:'120000',foreignIncome:'120000'},
      {...facts.incomeSources[0],sourceId:'form1099Int:1',reportedIncome:'80000',foreignIncome:'80000',foreignCountry:'France',accountReference:'Actual second account'}];
    facts.itemizedAllocation.stateIncomeTaxes.forEach((row,index)=>Object.assign(row,{countryIncomeConfirmed:true,countryIncome:[
      {foreignCountry:'Canada',stateTaxableIncome:['40000.01','30000','20000'][index],sourceReference:'Actual Canadian state source'},
      {foreignCountry:'France',stateTaxableIncome:['19999.99','20000','20000'][index],sourceReference:'Actual French state source'},
    ]}));
    const before=JSON.stringify(input.raw),result=compute(input);
    // Pool69000 once: country90000.01/950000=6536.8428=>6537;
    // country59999.99/950000=4357.8940=>4358. Never round each state's tax share.
    expect(line(result,'country-1:state-tax')).toBe('6537');expect(line(result,'country-2:state-tax')).toBe('4358');
    expect(line(result,'state-country-1:aggregate-income')).toBe('90000.01');
    expect(line(result,'state-country-2:aggregate-income')).toBe('59999.99');
    expect(JSON.stringify(result.lines)).not.toMatch(/Actual Canadian|Actual French|Canada|France/);
    expect(JSON.stringify(input.raw)).toBe(before);
    const changed=structuredClone(input.raw);
    Object.assign(changed.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes[0],{countryIncomeConfirmed:false});
    expect(()=>compute({...input,raw:changed})).toThrow(/country|source/i);
    for(const countryRows of [
      [{foreignCountry:'Canada',stateTaxableIncome:'40000.02',sourceReference:'Changed source'}, {foreignCountry:'France',stateTaxableIncome:'19999.99',sourceReference:'Actual source'}],
      [{foreignCountry:'Canada',stateTaxableIncome:'80000.01',sourceReference:'Overlapping Canada'}, {foreignCountry:'France',stateTaxableIncome:'0',sourceReference:'Actual zero'}],
      [{foreignCountry:'Canada',stateTaxableIncome:'40000.01',sourceReference:'Incomplete country ledger'}],
    ]){
      const incomplete=structuredClone(input.raw);
      Object.assign(incomplete.foreignTaxElection.deductionYearCarryover.itemizedAllocation.stateIncomeTaxes[0],{countryIncome:countryRows});
      expect(()=>compute({...input,raw:incomplete})).toThrow(/country|source|income/i);
    }
  });
});
