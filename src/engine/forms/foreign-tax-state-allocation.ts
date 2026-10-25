/** Spec: spec/federal/foreign-tax-multiple-state.yaml. Ordinary Reg1.861-8(e)(6) method. */
import type Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { d, sum, zeroFloor } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';

type Allocation = NonNullable<NonNullable<NonNullable<TaxYearInput['foreignTaxElection']>['deductionYearCarryover']>['itemizedAllocation']>;
interface StateAllocationContext {
  allowedIncomeTaxes: Decimal;
  usTaxableBeforeState: Decimal;
  foreignTaxableBeforeState: Decimal;
  countries: ReadonlyMap<string, Decimal>;
}
function amount(value:string|undefined,label:string):Decimal {
  if(value===undefined||!/^\d+(?:\.\d+)?$/.test(value))throw new Error(`Foreign state allocation requires actual nonnegative ${label}`);
  const parsed=d(value);if(!parsed.isFinite())throw new Error(`Foreign state allocation requires finite ${label}`);return parsed;
}
const normalized=(value:string|undefined)=>value?.trim().toUpperCase();

/** Source amounts stay exact until the caller rounds each final country deduction. */
export function calculateForeignTaxStateAllocation(allocation:Allocation,context:StateAllocationContext):{countryTaxes:Map<string,Decimal>;lines:CalculatedLine[]} {
  const facts=allocation.stateAllocation;
  if(!facts||facts.method!=='ordinary_presumption'||facts.sourceFactsConfirmed!==true||!facts.sourceReference?.trim()
    ||facts.methodHistoryConfirmed!==true||facts.allStateSourcesIncludedConfirmed!==true||facts.nonoverlappingIncomeConfirmed!==true
    ||!facts.noTaxStateIncome||!allocation.stateIncomeTaxes)throw new Error('Foreign state allocation requires its actual ordinary method history and complete nonoverlapping jurisdiction sources');
  for(const value of [context.allowedIncomeTaxes,context.usTaxableBeforeState,context.foreignTaxableBeforeState,...context.countries.values()]){
    if(!value.isFinite()||value.lt(0))throw new Error('Foreign state allocation requires actual nonnegative taxable source context');
  }
  const audit=new AuditTrail(),seen=new Set<string>();
  let exemptBase=d('0'),taxableBase=d('0'),poolTax=d('0'),totalTax=d('0'),noTaxIncome=d('0');
  const countries=new Map<string,Decimal>();
  for(const [country,gross] of context.countries){
    const key=normalized(country);if(!key||countries.has(key))throw new Error('Foreign state allocation requires distinct actual country source identities');
    countries.set(key,gross);
  }
  const countryAmounts=new Map<string,Decimal>();
  const explicitCountrySources=allocation.stateIncomeTaxes.some(row=>row.countryIncome!==undefined||row.countryIncomeConfirmed!==undefined);
  let allCountrySources=true;
  for(const [index,state] of allocation.stateIncomeTaxes.entries()){
    const code=normalized(state.stateCode);
    if(!code||!/^[A-Z]{2}$/.test(code)||seen.has(code)||!state.sourceReference?.trim()||state.foreignIncomeSpecificallyExempt===undefined)throw new Error('Foreign state allocation requires distinct actual state source worksheets');
    seen.add(code);
    const deductible=amount(state.deductibleAmount,'state deductible tax'),taxable=amount(state.stateTaxableIncome,'state taxable income');
    if(taxable.isZero()&&deductible.gt(0))throw new Error('Foreign state tax cannot have an unsupported zero taxable source base');
    totalTax=totalTax.plus(deductible);
    if(state.foreignIncomeSpecificallyExempt)exemptBase=exemptBase.plus(taxable);
    else {taxableBase=taxableBase.plus(taxable);poolTax=poolTax.plus(deductible);}
    if(state.countryIncome===undefined&&state.countryIncomeConfirmed===undefined){allCountrySources=false;continue;}
    if(state.countryIncomeConfirmed!==true||!state.countryIncome)throw new Error('Foreign state allocation requires confirmed actual country source worksheets');
    const countrySeen=new Set<string>();let rowTotal=d('0');
    for(const source of state.countryIncome){
      const country=normalized(source.foreignCountry),gross=country?countries.get(country):undefined;
      if(!country||gross===undefined||countrySeen.has(country)||!source.sourceReference?.trim())throw new Error('Foreign state allocation requires distinct actual state country source identities');
      countrySeen.add(country);const income=amount(source.stateTaxableIncome,'country taxable source income');
      if(income.gt(gross)||(state.foreignIncomeSpecificallyExempt&&income.gt(0)))throw new Error('Foreign state country income contradicts its actual source or exemption');
      rowTotal=rowTotal.plus(income);countryAmounts.set(country,(countryAmounts.get(country)??d('0')).plus(income));
      audit.record('Foreign Deduction Carryover WS',`state-${index+1}:country-${countrySeen.size}:income`,'Actual state-taxed country source income',income,'Completed source worksheet; no proportional gross-income guess');
    }
    if(countrySeen.size!==countries.size||rowTotal.gt(taxable))throw new Error('Foreign state country sources must include every actual country and fit their state taxable base');
  }
  if(!totalTax.eq(context.allowedIncomeTaxes))throw new Error('Foreign state worksheet deductions must equal actual allowed income taxes');
  for(const source of facts.noTaxStateIncome){
    const code=normalized(source.stateCode);
    if(!code||!/^[A-Z]{2}$/.test(code)||seen.has(code)||!source.sourceReference?.trim())throw new Error('Foreign state allocation requires distinct actual no-tax jurisdiction sources');
    seen.add(code);noTaxIncome=noTaxIncome.plus(amount(source.usTaxableIncome,'no-tax state U.S. taxable income'));
  }
  const adjustedUs=context.usTaxableBeforeState.minus(exemptBase).minus(noTaxIncome);
  if(adjustedUs.lt(0)||taxableBase.gt(adjustedUs.plus(context.foreignTaxableBeforeState)))throw new Error('Foreign state income needs its actual supported ordinary taxable source reconciliation');
  const foreignBase=zeroFloor(taxableBase.minus(adjustedUs));
  if(explicitCountrySources||(foreignBase.gt(0)&&countries.size>1)){
    if(!allCountrySources||countryAmounts.size!==countries.size||!sum(...countryAmounts.values()).eq(foreignBase))throw new Error('Foreign state country sources must reconcile every jurisdiction and the aggregate foreign taxable base');
    for(const [country,income] of countryAmounts)if(income.gt(countries.get(country)??d('0')))throw new Error('Foreign state country income overlaps or exceeds its actual foreign source');
  }else if(foreignBase.gt(0)){
    const country=countries.keys().next().value;
    if(!country||foreignBase.gt(countries.get(country)??d('0')))throw new Error('Foreign state taxable income has no matching actual foreign country source');
    countryAmounts.set(country,foreignBase);
  }
  const countryTaxes=new Map<string,Decimal>();let countryIndex=0;
  for(const [country] of countries){
    const income=countryAmounts.get(country);if(income===undefined)continue;
    countryIndex++;countryTaxes.set(country,taxableBase.isZero()?d('0'):poolTax.times(income).div(taxableBase));
    audit.record('Foreign Deduction Carryover WS',`state-country-${countryIndex}:aggregate-income`,'Actual aggregate state-taxed country income',income,'Sum actual nonoverlapping country sources; retain source cents');
  }
  for(const [line,label,value] of [
    ['state-exempt-us-income','U.S. taxable base in foreign-exempt states',exemptBase],
    ['state-no-tax-us-income','Actual U.S. income attributable to no-tax states',noTaxIncome],
    ['state-adjusted-us-taxable','U.S. taxable residual after actual jurisdiction modifications',adjustedUs],
    ['state-aggregate-taxable-base','Aggregate nonexempt state taxable base',taxableBase],
    ['state-aggregate-foreign-base','Foreign portion of aggregate state taxable base',foreignBase],
    ['state-aggregate-deductible-tax','Allowed nonexempt state income-tax pool',poolTax],
  ] as const)audit.record('Foreign Deduction Carryover WS',line,label,value,'Reg1.861-8(e)(6)(ii)(C), with actual Example26/27 modifications');
  return{countryTaxes,lines:audit.getLines()};
}
