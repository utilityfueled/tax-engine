/** Deduction-year deemed absorption. Spec: spec/federal/foreign-tax-deduction-carryover.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { FilingStatus } from '@/models/constants.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { d, min, roundDollar, sum, zeroFloor } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { resolveForeignTaxElection } from './foreign-tax-election.js';
import { calculateForeignTaxOrdinaryAllocation } from './foreign-tax-ordinary-allocation.js';

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
  const allocation=calculateForeignTaxOrdinaryAllocation({context,countries:[...countries].map(([country,row])=>({country,...row})),
    itemizedAllocation:facts.itemizedAllocation,auditForm:'Foreign Deduction Carryover WS'});
  const netForeignTaxableIncome=allocation.netForeignTaxableIncome;const worldwide=allocation.worldwideTaxableIncome;
  audit.merge(allocation.lines);
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
