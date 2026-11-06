/** Deduction-year deemed absorption. Spec: spec/federal/foreign-tax-deduction-carryover.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { FilingStatus } from '@/models/constants.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { d, min, roundDollar, sum, zeroFloor } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { resolveForeignTaxElection } from './foreign-tax-election.js';
import { calculateForeignTaxOrdinaryAllocation } from './foreign-tax-ordinary-allocation.js';
import { sumSourceMoney } from '@/utils/sum-source-money.js';

/** Only the canonical private credit-election recomputation may supply this context. */
export interface ForeignTaxHypotheticalContext {
  taxYear: number; filingStatus: FilingStatus;
  totalIncome: Decimal; agi: Decimal; totalDeductions: Decimal; seniorDeduction: Decimal;
  deductionUsed: 'standard'|'itemized'|'nonitemized'; deductionAmount: Decimal; incomeTax: Decimal;
  ordinaryIncomeOnly: boolean;
  /** Canonical pre-credit6251 amounts; not entered foreign-tax limits. */
  amt?: { amti: Decimal; grossIncome: Decimal; taxBeforeCredit: Decimal; taxableExcess: Decimal; rate26Limit: Decimal };
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
  amt?: ForeignTaxDeductionAmtCarryoverResult;
}
export interface ForeignTaxDeductionAmtCarryoverResult {
  method: 'complete_empty_inventory' | 'ordinary_hypothetical';
  hypotheticalLimitation?: Decimal; netForeignTaxableIncome?: Decimal; worldwideTaxableIncome?: Decimal;
  currentQualifiedForeignTaxes: Decimal; absorbed: Decimal; expired: Decimal; carryforward: Decimal;
  carryforwardByCategory: ForeignTaxDeductionCarryoverResult['carryforwardByCategory'];
  details: ForeignTaxCarryoverDetail[]; lines: CalculatedLine[];
}
function amount(value:string|undefined,label:string):Decimal {
  if(value===undefined||!/^\d+(?:\.\d+)?$/.test(value))throw new Error(`Foreign carryover requires actual nonnegative ${label}`);
  const valueDecimal=d(value);if(!valueDecimal.isFinite())throw new Error(`Foreign carryover requires finite ${label}`);return valueDecimal;
}
const normal=(value:string|undefined)=>value?.trim().toUpperCase();
const tin=(value:string|undefined)=>value?.replace(/-/g,'').trim();
const ratio=(numerator:Decimal,denominator:Decimal)=>denominator.lte(0)?d('0'):min(d('1'),numerator.div(denominator).toDecimalPlaces(4,Decimal.ROUND_HALF_UP));
const exactSubtract=(left:Decimal,right:Decimal)=>sumSourceMoney(left,right.negated());
type CarrySource = NonNullable<NonNullable<NonNullable<TaxYearInput['foreignTaxElection']>['deductionYearCarryover']>['carryovers']>[number];
function readCarrySources(rows: CarrySource[], year: number): ForeignTaxCarryoverDetail[] {
  const keys=new Set<string>();
  return rows.map(row=>{
    const origin=row.originTaxYear,category=row.category;
    if(origin===undefined||!Number.isInteger(origin)||origin>=year||origin<year-10||!category||!row.sourceReference?.trim())throw new Error('Foreign carryover requires actual unexpired prior origin year and category');
    const key=`${category}:${origin}`;if(keys.has(key))throw new Error('Foreign carryover duplicate origin/category balance');keys.add(key);
    return{originTaxYear:origin,category,amount:amount(row.amount,'adjusted prior balance'),absorbed:d('0'),expired:d('0'),remaining:d('0')};
  }).sort((a,b)=>a.originTaxYear-b.originTaxYear||a.category.localeCompare(b.category));
}
function absorbSources(details: ForeignTaxCarryoverDetail[], capacity: Decimal, year: number, audit: AuditTrail, form: string) {
  const carryforwardByCategory:ForeignTaxDeductionCarryoverResult['carryforwardByCategory']={};
  for(const row of details){
    row.absorbed=row.category==='passive'?min(row.amount,capacity):d('0');if(row.category==='passive')capacity=exactSubtract(capacity,row.absorbed);
    const unused=exactSubtract(row.amount,row.absorbed);row.expired=row.originTaxYear===year-10?unused:d('0');row.remaining=exactSubtract(unused,row.expired);
    if(row.remaining.gt(0))(carryforwardByCategory[row.category]??=[]).push({taxYear:row.originTaxYear,amount:row.remaining});
    audit.record(form,`${row.category}:${row.originTaxYear}:remaining`,'Actual prior foreign tax remaining',row.remaining,'Prior balance less deemed absorption and end-of-tenth-year expiration',{available:row.amount,absorbed:row.absorbed,expired:row.expired});
  }
  return {details,carryforwardByCategory,absorbed:sumSourceMoney(...details.map(row=>row.absorbed)),expired:sumSourceMoney(...details.map(row=>row.expired)),carryforward:sumSourceMoney(...details.map(row=>row.remaining))};
}

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
  const capacity=zeroFloor(hypotheticalLimitation.minus(currentQualifiedForeignTaxes));
  const details=readCarrySources(facts.carryovers,year);
  const suppliedTotal=sum(...details.map(row=>row.amount));const prior=input.priorYear;
  if(d(prior?.foreignTaxCreditCarryforward).gt(0)&&!d(prior?.foreignTaxCreditCarryforward).eq(suppliedTotal))throw new Error('Foreign carryover actual ledger disagrees with saved aggregate balance');
  for(const [name,rows] of [['by-year',prior?.foreignTaxCreditCarryforwardByYear],['passive',prior?.foreignTaxCreditCarryforwardByCategory?.passive],['general',prior?.foreignTaxCreditCarryforwardByCategory?.general]] as const){
    if(!rows?.length)continue;
    const expected=new Map<number,Decimal>();for(const row of details.filter(row=>name==='by-year'||row.category===name))expected.set(row.originTaxYear,(expected.get(row.originTaxYear)??d('0')).plus(row.amount));
    const actual=new Map<number,Decimal>();for(const row of rows)actual.set(row.taxYear,(actual.get(row.taxYear)??d('0')).plus(amount(row.amount,'saved carry balance')));
    if([...new Set([...actual.keys(),...expected.keys()])].some(key=>!(actual.get(key)??d('0')).eq(expected.get(key)??d('0'))))throw new Error('Foreign carryover actual ledger disagrees with saved origin/category balances');
  }
  const {carryforwardByCategory,absorbed,expired,carryforward}=absorbSources(details,capacity,year,audit,'Foreign Deduction Carryover WS');
  for(const [line,label,value] of [['18','Hypothetical worldwide taxable income',worldwide],['19','Actual foreign limitation ratio',limitRatio],['20','Hypothetical regular income tax',context.incomeTax],['21','Hypothetical credit limitation',hypotheticalLimitation],['current-tax','Actual current qualified foreign taxes',currentQualifiedForeignTaxes],['absorbed','Prior carry deemed absorbed without tax benefit',absorbed],['expired','Unused tenth-year carry expired',expired],['carryforward','Actual remaining prior carry',carryforward]] as const) audit.record('Foreign Deduction Carryover WS',line,label,value,'Actual deduction-year hypothetical credit method; no current credit or carryover deduction');
  const amtFacts=facts.amt;
  if(input.form982NolSources&&!amtFacts)throw new Error('COD foreign deduction carry requires the actual independent AMT carry history, including known empty');
  let amt:ForeignTaxDeductionAmtCarryoverResult|undefined;
  if(amtFacts){
    if(amtFacts.sourceTaxYear!==year||amtFacts.sourceFactsConfirmed!==true||!amtFacts.sourceReference?.trim()
      ||amtFacts.carryoverHistoryConfirmed!==true||amtFacts.adjustedThroughTaxYear!==year-1||!Array.isArray(amtFacts.carryovers))throw new Error('Foreign deduction requires actual complete independent AMT carry history and source year');
    const amtAudit=new AuditTrail(),form='AMT Foreign Deduction Carryover WS';
    const amtDetails=readCarrySources(amtFacts.carryovers,year);
    if(amtDetails.length===0){
      amtAudit.record(form,'empty-inventory','Actual complete empty AMT foreign carry history',d('0'),'No prior AMT balance; annual deduction creates no current foreign-credit carry');
      amt={method:'complete_empty_inventory',currentQualifiedForeignTaxes,...absorbSources(amtDetails,d('0'),year,amtAudit,form),lines:amtAudit.getLines()};
    }else{
      const actual=context.amt;
      if(!actual||Object.values(actual).some(value=>!Decimal.isDecimal(value)||!value.isFinite()||value.lt(0))
        ||actual.rate26Limit.isZero()||actual.taxableExcess.gt(actual.amti))throw new Error('Foreign deduction AMT absorption requires actual canonical pre-credit6251 amounts');
      if(amtFacts.foreignAmountsSameAsRegularConfirmed!==true||amtFacts.noRevocationConfirmed!==true
        ||typeof amtFacts.simplifiedElectionMadeInFirstClaimYear!=='boolean'||!Number.isInteger(amtFacts.firstPost1997CreditClaimTaxYear)
        ||amtFacts.firstPost1997CreditClaimTaxYear!<1998||amtFacts.firstPost1997CreditClaimTaxYear!>year)throw new Error('Foreign deduction AMT requires actual source amounts and first-claim simplified election history');
      const amtDeduction=context.deductionUsed==='itemized'?sum(context.scheduleA.medical,context.scheduleA.mortgageInterest,context.scheduleA.charitableContributions):d('0');
      if(!actual.grossIncome.eq(context.totalIncome)||!actual.amti.eq(actual.grossIncome.minus(amtDeduction)))throw new Error('Foreign deduction AMTI requires its separate actual ordinary source method');
      const amtContext={...context,totalIncome:actual.grossIncome,agi:actual.grossIncome,totalDeductions:amtDeduction,
        seniorDeduction:d('0'),deductionAmount:amtDeduction,incomeTax:actual.taxBeforeCredit};
      const separate=calculateForeignTaxOrdinaryAllocation({context:amtContext,countries:[...countries].map(([country,row])=>({country,...row})),
        itemizedAllocation:facts.itemizedAllocation,auditForm:form,amt:true});
      amtAudit.merge(separate.lines);
      const highRate=actual.taxableExcess.lte(actual.rate26Limit)?d('.26'):d('.28');
      if(sum(...[...countries.values()].map(row=>row.tax)).gt(separate.netForeignTaxableIncome.times(highRate)))throw new Error('AMT high-taxed passive income requires its actual reclassification method');
      const net=amtFacts.simplifiedElectionMadeInFirstClaimYear?netForeignTaxableIncome:separate.netForeignTaxableIncome;
      const amtRatio=ratio(net,actual.amti),limit=roundDollar(actual.taxBeforeCredit.times(amtRatio));
      const retained=absorbSources(amtDetails,zeroFloor(limit.minus(currentQualifiedForeignTaxes)),year,amtAudit,form);
      for(const [line,label,value]of[['18','Hypothetical AMTI before exemption',actual.amti],['19','Actual AMT foreign limitation ratio',amtRatio],
        ['20','Canonical pre-credit tentative minimum tax',actual.taxBeforeCredit],['21','Hypothetical AMT credit limitation',limit],
        ['current-tax','Actual current qualified foreign taxes',currentQualifiedForeignTaxes],['absorbed','Prior AMT carry deemed absorbed without credit',retained.absorbed],
        ['expired','Unused tenth-year AMT carry expired',retained.expired],['carryforward','Actual remaining prior AMT carry',retained.carryforward]]as const){
        amtAudit.record(form,line,label,value,'Separate actual AMT history and statutory substitutions; no current credit or new deduction-year carry');
      }
      amt={method:'ordinary_hypothetical',hypotheticalLimitation:limit,netForeignTaxableIncome:net,worldwideTaxableIncome:actual.amti,currentQualifiedForeignTaxes,...retained,lines:amtAudit.getLines()};
    }
  }
  return{hypotheticalLimitation,netForeignTaxableIncome,currentQualifiedForeignTaxes,absorbed,expired,carryforward,carryforwardByCategory,details,
    ...(amt?{amt}:{}),lines:[...audit.getLines(),...(amt?.lines??[])]};
}
