/** Deduction-year deemed absorption. Spec: spec/federal/foreign-tax-deduction-carryover.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { FilingStatus } from '@/models/constants.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { d, min, roundDollar, sum, zeroFloor } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { resolveForeignTaxElection } from './foreign-tax-election.js';

/** Only the canonical private credit-election recomputation may supply this context. */
export interface ForeignTaxHypotheticalContext {
  taxYear: number; filingStatus: FilingStatus;
  totalIncome: Decimal; agi: Decimal; totalDeductions: Decimal; seniorDeduction: Decimal;
  deductionUsed: 'standard'|'itemized'; deductionAmount: Decimal; incomeTax: Decimal;
  ordinaryIncomeOnly: boolean;
  scheduleA: { medical:Decimal; incomeOrSalesTaxes:Decimal; realPropertyTaxes:Decimal; personalPropertyTaxes:Decimal; saltDeduction:Decimal; salesTaxElected:boolean;
    mortgageInterest:Decimal; investmentInterest:Decimal; charitableContributions:Decimal; otherDeductions:Decimal; itemizedReduction:Decimal };
}
export interface ForeignTaxCarryoverDetail {
  originTaxYear:number; category:'passive'|'general'; amount:Decimal; absorbed:Decimal; expired:Decimal; remaining:Decimal;
}
export interface ForeignTaxDeductionCarryoverResult {
  hypotheticalLimitation:Decimal; netForeignTaxableIncome:Decimal; currentQualifiedForeignTaxes:Decimal;
  absorbed:Decimal; expired:Decimal; carryforward:Decimal;
  carryforwardByCategory:Partial<Record<'passive'|'general',Array<{taxYear:number;amount:Decimal}>>>;
  details:ForeignTaxCarryoverDetail[]; lines:CalculatedLine[];
}
function amount(value:string|undefined,label:string):Decimal {
  if(value===undefined||!/^\d+(?:\.\d+)?$/.test(value))throw new Error(`Foreign carryover requires actual nonnegative ${label}`);
  const valueDecimal=d(value);if(!valueDecimal.isFinite())throw new Error(`Foreign carryover requires finite ${label}`);return valueDecimal;
}
const normal=(value:string|undefined)=>value?.trim().toUpperCase();
const tin=(value:string|undefined)=>value?.replace(/-/g,'').trim();
const ratio=(numerator:Decimal,denominator:Decimal)=>denominator.lte(0)?d('0'):min(d('1'),numerator.div(denominator).toDecimalPlaces(4,Decimal.ROUND_HALF_UP));

export function calculateForeignTaxDeductionCarryover(input:TaxYearInput,context:ForeignTaxHypotheticalContext):ForeignTaxDeductionCarryoverResult {
  const election=input.foreignTaxElection;const facts=election?.deductionYearCarryover;const year=input.taxpayer.taxYear;
  if(election?.election!=='deduction'||election.noUnusedCreditCarryoversConfirmed!==false||!facts||facts.sourceTaxYear!==year
    ||facts.sourceFactsConfirmed!==true||!facts.sourceReference?.trim()||facts.method!=='ordinary_passive')throw new Error('Foreign carryover requires its actual confirmed deduction-year source worksheet');
  if(![2025,2026].includes(year)||context.taxYear!==year||context.filingStatus!==input.taxpayer.filingStatus||!context.ordinaryIncomeOnly)throw new Error('Foreign carryover requires the supported actual ordinary-income hypothetical method');
  for(const [label,value] of Object.entries(context))if(Decimal.isDecimal(value)&&(!value.isFinite()||value.lt(0)))throw new Error(`Foreign carryover hypothetical ${label} must be finite and nonnegative`);
  for(const [label,value] of Object.entries(context.scheduleA))if(Decimal.isDecimal(value)&&(!value.isFinite()||value.lt(0)))throw new Error(`Foreign carryover hypothetical ScheduleA ${label} must be finite and nonnegative`);
  if(facts.filingHistoryConfirmed!==true||facts.filingHistory!==(input.taxpayer.filingStatus==='married_filing_jointly'?'continuous_joint_same_spouse':'continuous_individual'))throw new Error('Foreign carryover requires actual continuous filing history; mixed joint/separate years need their allocation method');
  if(facts.adjustedThroughTaxYear!==year-1||facts.noCarrybackOrRedeterminationAdjustmentsConfirmed!==true||facts.noForeignOrDomesticLossAccountsConfirmed!==true
    ||facts.noOtherForeignIncomeConfirmed!==true||facts.allCurrentTaxesCreditEligibleConfirmed!==true||facts.passiveCategoryConfirmed!==true)throw new Error('Foreign carryover requires actual adjusted source balances, ordinary passive classification, credit eligibility and absence of special loss accounts');
  if(!facts.incomeSources||!facts.carryovers)throw new Error('Foreign carryover requires actual income and carryover source records');
  const annual=resolveForeignTaxElection(input);
  if(!annual.sourceFactsVerified)throw new Error('Foreign carryover requires the actual current paid-tax sources');
  const audit=new AuditTrail();const seen=new Set<string>();
  const countries=new Map<string,{gross:Decimal;tax:Decimal}>();
  for(const source of facts.incomeSources){
    const id=source.sourceId;const match=/^(form1099Int|form1099Div):(0|[1-9]\d*)$/.exec(id??'');
    if(!id||!match||seen.has(id)||!Number.isSafeInteger(Number(match[2])))throw new Error('Foreign carryover income source is missing or duplicate');seen.add(id);
    const actual=match[1]==='form1099Int'?input.form1099Int[Number(match[2])]:input.form1099Div[Number(match[2])];
    if(!actual||!source.sourceReference?.trim()||!actual.accountHolder||source.owner!==actual.accountHolder
      ||(source.owner==='spouse'&&input.taxpayer.filingStatus!=='married_filing_jointly')||!actual.payer.trim()||normal(source.payerName)!==normal(actual.payer)
      ||!/^\d{9}$/.test(tin(actual.payerTin)??'')||tin(source.payerTin)!==tin(actual.payerTin)||!actual.accountReference?.trim()||source.accountReference?.trim()!==actual.accountReference.trim()
      ||!normal(actual.foreignCountry)||normal(source.foreignCountry)!==normal(actual.foreignCountry))throw new Error('Foreign carryover income must bind its actual owner payer account and country');
    const reported='interestIncome' in actual?amount(actual.interestIncome,'reported interest'):amount(actual.ordinaryDividends,'reported dividends');
    if(!amount(source.reportedIncome,'source reported income').eq(reported))throw new Error('Foreign carryover income must reconcile with actual statement income');
    const gross=amount(source.foreignIncome,'foreign ordinary income');if(gross.gt(reported))throw new Error('Foreign carryover income exceeds its actual source statement');
    const country=normal(source.foreignCountry);if(!country)throw new Error('Foreign carryover country is unknown');
    const group=countries.get(country)??{gross:d('0'),tax:d('0')};group.gross=group.gross.plus(gross);
    const taxSource=election.sources?.find(row=>row.sourceId===id);
    if(taxSource)group.tax=group.tax.plus(amount(taxSource.reportedTaxAmount,'actual paid tax').minus(amount(taxSource.taxOnExcludedIncome,'excluded-income tax')));
    countries.set(country,group);
    audit.record('Foreign Deduction Carryover WS',`${id}:foreign-income`,'Actual foreign ordinary income',gross,'Actual source amount; never all statement income by inference');
  }
  if((election.sources??[]).some(source=>source.sourceId&&!seen.has(source.sourceId)))throw new Error('Foreign carryover requires an actual income record for every paid-tax source');
  const grossForeign=sum(...[...countries.values()].map(row=>row.gross));
  if(grossForeign.gt(context.totalIncome))throw new Error('Foreign carryover gross income exceeds actual worldwide income');
  const currentQualifiedForeignTaxes=sum(...[...countries.values()].map(row=>roundDollar(row.tax)));
  if(!sum(...[...countries.values()].map(row=>row.tax)).eq(annual.scheduleAForeignIncomeTaxes))throw new Error('Foreign carryover current tax sources do not reconcile');
  const sa=context.scheduleA;let nondirect=context.deductionAmount;let mortgage=d('0');
  const stateTaxByCountry=new Map<string,Decimal>();
  if(context.deductionUsed==='itemized'){
    const allocation=facts.itemizedAllocation;
    if(!allocation||allocation.sourceFactsConfirmed!==true||!allocation.sourceReference?.trim())throw new Error('Foreign carryover itemizing requires actual deduction source allocation');
    if(sa.investmentInterest.gt(0)||sa.otherDeductions.gt(0)||sa.itemizedReduction.gt(0))throw new Error('Foreign carryover special itemized deductions require their separate actual allocation method');
    const taxes=amount(allocation.incomeOrSalesTaxes,'allowed income or sales tax');const home=amount(allocation.homeRealPropertyTaxes,'allowed home real estate tax');const personal=amount(allocation.personalPropertyTaxes,'allowed personal property tax');
    if(taxes.gt(sa.incomeOrSalesTaxes)||home.gt(sa.realPropertyTaxes)||personal.gt(sa.personalPropertyTaxes)||!roundDollar(sum(taxes,home,personal)).eq(sa.saltDeduction))throw new Error('Foreign carryover tax allocations must reconcile with actual allowed ScheduleA taxes');
    if(home.gt(0)&&allocation.allRealPropertyTaxesForPersonalResidenceConfirmed!==true)throw new Error('Foreign carryover requires actual personal residence tax use');
    if(sa.charitableContributions.gt(0)&&allocation.noTreatyCharitableDeductionConfirmed!==true)throw new Error('Foreign carryover charitable deductions require actual treaty classification');
    nondirect=sa.medical.plus(home).plus(personal).plus(sa.salesTaxElected?taxes:d('0'));
    if(sa.mortgageInterest.gt(0)){
      if(allocation.mortgageInterestMethod==='us_source_small_foreign_income'){
        if(grossForeign.gt(5000))throw new Error('Foreign carryover small-income interest election exceeds5000');
      }else if(allocation.mortgageInterestMethod==='gross_income')mortgage=sa.mortgageInterest;
      else throw new Error('Foreign carryover requires the actual mortgage-interest allocation method');
    }
    if(!sum(sa.medical,sa.saltDeduction,sa.mortgageInterest,sa.charitableContributions).eq(context.deductionAmount))throw new Error('Foreign carryover ordinary itemized sources must equal actual hypothetical deduction');
    if((allocation.stateIncomeTaxes?.length??0)>1)throw new Error('Foreign carryover multiple-state income taxes require their separate actual income attribution method');
    if(sa.salesTaxElected&&allocation.stateIncomeTaxes?.length)throw new Error('Foreign carryover state income-tax allocation conflicts with the actual sales-tax election');
    if(!sa.salesTaxElected&&(taxes.gt(0)||allocation.stateIncomeTaxes!==undefined)){
      if(!allocation.stateIncomeTaxes)throw new Error('Foreign carryover requires actual state income-tax allocation worksheets');
      // Reg1.861-8(e)(6)(ii)(C) compares TAXABLE source income before state tax.
      // Preserve every other deduction's existing source allocation. In this
      // ordinary cohort, section151 amounts are excluded under(e)(11), and
      // non-treaty charity is entirely U.S.-source under(e)(12).
      const foreignBeforeState=sum(...[...countries.values()].map(group=>{
        const countryRatio=ratio(group.gross,context.totalIncome);
        return roundDollar(group.gross).minus(roundDollar(nondirect.times(countryRatio))).minus(roundDollar(mortgage.times(countryRatio)));
      }));
      const worldwideBeforeState=context.agi.minus(context.totalDeductions).plus(context.seniorDeduction).plus(roundDollar(taxes));
      const usBeforeState=worldwideBeforeState.minus(foreignBeforeState);
      if(foreignBeforeState.lt(0)||usBeforeState.lt(0))throw new Error('Foreign carryover state income requires its actual foreign or domestic loss source method');
      audit.record('Foreign Deduction Carryover WS','state-worldwide-before-deduction','Worldwide taxable income before state income tax',worldwideBeforeState,
        'Hypothetical AGI less deductions, plus section151 amount and allowed state income tax');
      audit.record('Foreign Deduction Carryover WS','state-foreign-taxable-before-deduction','Foreign taxable income before state income tax',foreignBeforeState,
        'Actual foreign income less prescribed nonstate deductions');
      audit.record('Foreign Deduction Carryover WS','state-us-taxable-before-deduction','U.S. taxable income before state income tax',usBeforeState,
        'Worldwide pre-state taxable income less foreign pre-state taxable income');
      const states=new Set<string>();let stateTotal=d('0');
      for(const state of allocation.stateIncomeTaxes){
        const code=state.stateCode?.trim().toUpperCase();
        if(!code||!/^[A-Z]{2}$/.test(code)||states.has(code)||!state.sourceReference?.trim()||state.foreignIncomeSpecificallyExempt===undefined)throw new Error('Foreign carryover requires distinct actual state source worksheets');states.add(code);
        const deductible=amount(state.deductibleAmount,'state tax deductible amount');const taxable=amount(state.stateTaxableIncome,'actual state taxable income');
        if(taxable.gt(worldwideBeforeState)||(taxable.isZero()&&deductible.gt(0))||(state.foreignIncomeSpecificallyExempt&&taxable.gt(usBeforeState)))throw new Error('Foreign carryover state income needs its actual supported ordinary source reconciliation');
        const taxedForeign=state.foreignIncomeSpecificallyExempt?d('0'):zeroFloor(taxable.minus(usBeforeState));
        const needsCountrySources=state.countryIncome!==undefined||state.countryIncomeConfirmed!==undefined
          ||(taxedForeign.gt(0)&&countries.size>1);
        if(needsCountrySources){
          if(state.countryIncomeConfirmed!==true||!state.countryIncome)throw new Error('Foreign carryover requires confirmed actual state country income sources');
          const countrySeen=new Set<string>();let countryTotal=d('0');
          for(const source of state.countryIncome){
            const country=normal(source.foreignCountry);const original=country?countries.get(country):undefined;
            if(!country||!original||countrySeen.has(country)||!source.sourceReference?.trim())throw new Error('Foreign carryover requires distinct actual state country source identities');
            countrySeen.add(country);const income=amount(source.stateTaxableIncome,'state country taxable income');
            if(income.gt(original.gross))throw new Error('Foreign carryover state country income exceeds its actual foreign source');
            countryTotal=countryTotal.plus(income);
            stateTaxByCountry.set(country,taxable.isZero()?d('0'):deductible.times(income).div(taxable));
            audit.record('Foreign Deduction Carryover WS',`state-country-${countrySeen.size}:income`,'Actual foreign income taxed by state',income,
              'Completed country source worksheet; not a relative-gross-income assumption');
          }
          if(countrySeen.size!==countries.size||!countryTotal.eq(taxedForeign))throw new Error('Foreign carryover state country income must reconcile every country and the supported foreign state-tax base');
        }else if(taxedForeign.gt(0)){
          const country=countries.keys().next().value;
          if(!country)throw new Error('Foreign carryover state country income has no actual foreign source');
          stateTaxByCountry.set(country,deductible.times(taxedForeign).div(taxable));
        }
        stateTotal=stateTotal.plus(deductible);
      }
      if(!stateTotal.eq(taxes))throw new Error('Foreign carryover state worksheet deductions must equal actual allowed income taxes');
    }
  }
  let netForeignTaxableIncome=d('0');let countryIndex=0;
  for(const [country,group] of countries){
    const countryRatio=ratio(group.gross,context.totalIncome);
    const apportioned=roundDollar(nondirect.times(countryRatio));const interest=roundDollar(mortgage.times(countryRatio));
    const direct=roundDollar(stateTaxByCountry.get(country)??d('0'));
    const net=roundDollar(group.gross).minus(sum(apportioned,interest,direct));netForeignTaxableIncome=netForeignTaxableIncome.plus(net);
    countryIndex++;
    if(stateTaxByCountry.has(country))audit.record('Foreign Deduction Carryover WS',`country-${countryIndex}:state-tax`,'State income tax allocated to foreign country',direct,
      'round(actual allowed state tax * actual state-taxed country income / actual state taxable income)');
    audit.record('Foreign Deduction Carryover WS',`country-${countryIndex}:net-income`,'Hypothetical net ordinary foreign income',net,'Country gross less prescribed allowed direct and proportional deductions',{gross:group.gross,ratio:countryRatio,apportioned,interest,direct});
  }
  if(netForeignTaxableIncome.lt(0))throw new Error('Foreign carryover current overall foreign loss requires its separate actual loss-account method');
  const worldwide=zeroFloor(context.agi.minus(context.totalDeductions).plus(context.seniorDeduction));
  const limitRatio=ratio(netForeignTaxableIncome,worldwide);const hypotheticalLimitation=roundDollar(context.incomeTax.times(limitRatio));
  let capacity=zeroFloor(hypotheticalLimitation.minus(currentQualifiedForeignTaxes));
  const keys=new Set<string>();const details:ForeignTaxCarryoverDetail[]=facts.carryovers.map(row=>{
    const origin=row.originTaxYear;const category=row.category;
    if(origin===undefined||!Number.isInteger(origin)||origin>=year||origin<year-10||!category||!row.sourceReference?.trim())throw new Error('Foreign carryover requires actual unexpired prior origin year and category');
    const key=`${category}:${origin}`;if(keys.has(key))throw new Error('Foreign carryover duplicate origin/category balance');keys.add(key);
    return{originTaxYear:origin,category,amount:amount(row.amount,'adjusted prior balance'),absorbed:d('0'),expired:d('0'),remaining:d('0')};
  }).sort((a,b)=>a.originTaxYear-b.originTaxYear||a.category.localeCompare(b.category));
  const suppliedTotal=sum(...details.map(row=>row.amount));const prior=input.priorYear;
  if(d(prior?.foreignTaxCreditCarryforward).gt(0)&&!d(prior?.foreignTaxCreditCarryforward).eq(suppliedTotal))throw new Error('Foreign carryover actual ledger disagrees with saved aggregate balance');
  for(const [name,rows] of [['by-year',prior?.foreignTaxCreditCarryforwardByYear],['passive',prior?.foreignTaxCreditCarryforwardByCategory?.passive],['general',prior?.foreignTaxCreditCarryforwardByCategory?.general]] as const){
    if(!rows?.length)continue;
    const expected=new Map<number,Decimal>();for(const row of details.filter(row=>name==='by-year'||row.category===name))expected.set(row.originTaxYear,(expected.get(row.originTaxYear)??d('0')).plus(row.amount));
    const actual=new Map<number,Decimal>();for(const row of rows)actual.set(row.taxYear,(actual.get(row.taxYear)??d('0')).plus(amount(row.amount,'saved carry balance')));
    if([...new Set([...actual.keys(),...expected.keys()])].some(key=>!(actual.get(key)??d('0')).eq(expected.get(key)??d('0'))))throw new Error('Foreign carryover actual ledger disagrees with saved origin/category balances');
  }
  const carryforwardByCategory:ForeignTaxDeductionCarryoverResult['carryforwardByCategory']={};
  for(const row of details){
    row.absorbed=row.category==='passive'?min(row.amount,capacity):d('0');if(row.category==='passive')capacity=capacity.minus(row.absorbed);
    const unused=row.amount.minus(row.absorbed);row.expired=row.originTaxYear===year-10?unused:d('0');row.remaining=unused.minus(row.expired);
    if(row.remaining.gt(0))(carryforwardByCategory[row.category]??=[]).push({taxYear:row.originTaxYear,amount:row.remaining});
    audit.record('Foreign Deduction Carryover WS',`${row.category}:${row.originTaxYear}:remaining`,'Actual prior foreign tax remaining',row.remaining,'Prior balance less deemed absorption and end-of-tenth-year expiration',{available:row.amount,absorbed:row.absorbed,expired:row.expired});
  }
  const absorbed=sum(...details.map(row=>row.absorbed));const expired=sum(...details.map(row=>row.expired));const carryforward=sum(...details.map(row=>row.remaining));
  for(const [line,label,value] of [['18','Hypothetical worldwide taxable income',worldwide],['19','Actual foreign limitation ratio',limitRatio],['20','Hypothetical regular income tax',context.incomeTax],['21','Hypothetical credit limitation',hypotheticalLimitation],['current-tax','Actual current qualified foreign taxes',currentQualifiedForeignTaxes],['absorbed','Prior carry deemed absorbed without tax benefit',absorbed],['expired','Unused tenth-year carry expired',expired],['carryforward','Actual remaining prior carry',carryforward]] as const) audit.record('Foreign Deduction Carryover WS',line,label,value,'Actual deduction-year hypothetical credit method; no current credit or carryover deduction');
  return{hypotheticalLimitation,netForeignTaxableIncome,currentQualifiedForeignTaxes,absorbed,expired,carryforward,carryforwardByCategory,details,lines:audit.getLines()};
}
