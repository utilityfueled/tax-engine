/** Actual ordinary Form1116 arithmetic. Spec: spec/federal/foreign-tax-ordinary-credit.yaml. */
import Decimal from 'decimal.js';
import type { CalculatedLine } from '@/models/outputs.js';
import type { FilingStatus } from '@/models/inputs.js';
import type { ForeignTaxHypotheticalContext } from './foreign-tax-deduction-carryover.js';
import type { ForeignTaxDirectCarrySource } from './foreign-tax-direct-sources.js';
import { calculateForeignTaxOrdinaryAllocation, type ForeignOrdinaryAllocationInput, type ForeignOrdinaryCountry } from './foreign-tax-ordinary-allocation.js';
import { AuditTrail } from '@/utils/audit.js';
import { d,min,roundDollar,sum,zeroFloor } from '@/utils/decimal.js';
export interface ForeignTaxPriorReturnCapacity {
  taxYear:number;election:'form1116_credit'|'direct_credit_election'|'deduction';
  sourceFactsConfirmed:boolean;sourceReference:string;allPriorUseIncludedConfirmed:boolean;
  limitation?:Decimal;currentTaxes?:Decimal;priorCarryoversUsed?:Decimal;
}
export interface ForeignTaxOrdinaryCreditInput {
  taxYear:number;filingStatus:FilingStatus;sourceFactsConfirmed:boolean;
  context:ForeignTaxHypotheticalContext;countries:ForeignOrdinaryCountry[];
  itemizedAllocation?:ForeignOrdinaryAllocationInput['itemizedAllocation'];
  passiveGroup?:'withholding_15_or_more'|'withholding_under_15'|'no_foreign_tax'|'other_foreign_tax';
  noCfcOrQbuIncomeConfirmed:boolean;
  regularCarryovers:ForeignTaxDirectCarrySource[];amtCarryovers:ForeignTaxDirectCarrySource[];
  regularCarryback?:ForeignTaxPriorReturnCapacity;amtCarryback?:ForeignTaxPriorReturnCapacity;
  amt:{amti:Decimal;grossIncome:Decimal;taxBeforeCredit:Decimal;taxableExcess:Decimal;rate26Limit:Decimal;foreignAmountsSameAsRegularConfirmed:boolean;
    firstPost1997CreditClaimTaxYear:number;simplifiedElectionMadeInFirstClaimYear?:boolean;noRevocationConfirmed:boolean};
}
export interface ForeignOrdinaryCarryDetail extends ForeignTaxDirectCarrySource {used:Decimal;expired:Decimal;remaining:Decimal}
export interface ForeignOrdinaryCategoryResult {
  netForeignTaxableIncome:Decimal;worldwideTaxableIncome:Decimal;limitationRatio:Decimal;limitation:Decimal;
  currentTaxExact:Decimal;currentTaxReported:Decimal;creditAllowed:Decimal;priorUsed:Decimal;expired:Decimal;
  currentTaxExcess:Decimal;carryback:Decimal;currentCarryforward:Decimal;carryforward:Decimal;
  details:ForeignOrdinaryCarryDetail[];carryforwardByCategory:Record<string,Array<{taxYear:number;amount:Decimal}>>;
  lines:CalculatedLine[];
}
export interface ForeignTaxOrdinaryCreditResult {regular:ForeignOrdinaryCategoryResult;amt:ForeignOrdinaryCategoryResult;lines:CalculatedLine[]}
function money(value:Decimal|undefined,label:string){if(!Decimal.isDecimal(value)||!value.isFinite()||value.lt(0))throw new Error(`Ordinary foreign credit requires actual finite nonnegative ${label}`);return value;}
const ratio=(numerator:Decimal,denominator:Decimal)=>denominator.lte(0)?d('0'):min(d('1'),numerator.div(denominator).toDecimalPlaces(4,Decimal.ROUND_HALF_UP));
function priorCapacity(record:ForeignTaxPriorReturnCapacity|undefined,year:number,kind:string):Decimal {
  if(!record||record.taxYear!==year-1||record.sourceFactsConfirmed!==true||record.allPriorUseIncludedConfirmed!==true||!record.sourceReference?.trim())throw new Error(`${kind} foreign credit excess requires actual prior-return carryback sources`);
  if(record.election==='deduction')throw new Error(`${kind} prior deduction-year carryback requires its actual separate hypothetical method`);
  if(record.election==='direct_credit_election')return d('0');
  if(record.election!=='form1116_credit')throw new Error(`${kind} prior carryback election is unknown`);
  const limit=money(record.limitation,'prior limitation'),tax=money(record.currentTaxes,'prior current tax'),used=money(record.priorCarryoversUsed,'prior carryovers used');
  if(![limit,tax,used].every(value=>value.eq(roundDollar(value)))||used.gt(zeroFloor(limit.minus(tax))))throw new Error(`${kind} prior credit capacity must reconcile to the completed printed source lines`);
  return zeroFloor(limit.minus(tax).minus(used));
}
function category(input:ForeignTaxOrdinaryCreditInput,kind:'regular'|'AMT',allocation:ReturnType<typeof calculateForeignTaxOrdinaryAllocation>,tax:Decimal,rows:ForeignTaxDirectCarrySource[],prior:ForeignTaxPriorReturnCapacity|undefined,highTaxNetIncome=allocation.netForeignTaxableIncome):ForeignOrdinaryCategoryResult {
  const form=kind==='regular'?'Form 1116 (actual passive)':'AMT Form 1116 (actual passive)';const audit=new AuditTrail();audit.merge(allocation.lines);
  const currentTaxExact=sum(...input.countries.map(row=>row.tax));const currentTaxReported=sum(...input.countries.map(row=>roundDollar(row.tax)));
  // Section59(a)(1)(C) substitutes the applicable55(b)(1) rate, not an
  // unconditional highest28percent rate. These amounts come from6251/constants.
  const highRate=kind==='regular'?d('.37'):(input.amt.taxableExcess.lte(input.amt.rate26Limit)?d('.26'):d('.28'));
  if(currentTaxExact.gt(highTaxNetIncome.times(highRate)))throw new Error(`${kind} high-taxed passive group requires its actual reclassification method`);
  audit.record(form,'high-tax-net-income','Actual income for passive high-tax classification',highTaxNetIncome,
    'Step1 actual category income before any simplified limitation substitution',{rate:highRate,foreignTaxes:currentTaxExact});
  const limitationRatio=ratio(allocation.netForeignTaxableIncome,allocation.worldwideTaxableIncome);const limitation=roundDollar(tax.times(limitationRatio));
  let capacity=zeroFloor(limitation.minus(currentTaxReported));const seen=new Set<string>();
  const details:ForeignOrdinaryCarryDetail[]=rows.map(row=>{
    if(!Number.isInteger(row.originTaxYear)||row.originTaxYear<input.taxYear-10||row.originTaxYear>=input.taxYear||!['passive','general'].includes(row.category))throw new Error(`${kind} actual carryover origin/category is outside the supported history`);
    const key=`${row.category}:${row.originTaxYear}`;if(seen.has(key))throw new Error(`${kind} duplicate carryover origin/category`);seen.add(key);
    return{...row,amount:money(row.amount,'prior balance'),used:d('0'),expired:d('0'),remaining:d('0')};
  }).sort((a,b)=>a.originTaxYear-b.originTaxYear||a.category.localeCompare(b.category));
  const byCategory:ForeignOrdinaryCategoryResult['carryforwardByCategory']={passive:[],general:[]};
  for(const row of details){
    row.used=row.category==='passive'?min(row.amount,capacity):d('0');capacity=capacity.minus(row.used);
    const unused=row.amount.minus(row.used);row.expired=row.originTaxYear===input.taxYear-10?unused:d('0');row.remaining=unused.minus(row.expired);
    if(row.remaining.gt(0))(byCategory[row.category]??=[]).push({taxYear:row.originTaxYear,amount:row.remaining});
    audit.record(form,`${row.category}:${row.originTaxYear}:remaining`,'Actual prior credit retained',row.remaining,'Opening less actual use and tenth-year expiration',{opening:row.amount,used:row.used,expired:row.expired});
  }
  const priorUsed=sum(...details.map(row=>row.used));const expired=sum(...details.map(row=>row.expired));
  const creditAllowed=min(limitation,roundDollar(min(currentTaxReported,limitation).plus(priorUsed)));
  const currentTaxExcess=zeroFloor(currentTaxReported.minus(limitation));
  const carryback=currentTaxExcess.gt(0)?min(currentTaxExcess,priorCapacity(prior,input.taxYear,kind)):d('0');
  const currentCarryforward=currentTaxExcess.minus(carryback);
  if(currentCarryforward.gt(0))(byCategory.passive??=[]).push({taxYear:input.taxYear,amount:currentCarryforward});
  const carryforward=sum(...details.map(row=>row.remaining),currentCarryforward);
  for(const [line,label,value]of[
    ['9','Current eligible paid taxes',currentTaxReported],['10','Prior passive credits available',roundDollar(sum(...rows.filter(row=>row.category==='passive').map(row=>row.amount)))],
    ['17','Net foreign taxable income',allocation.netForeignTaxableIncome],['18','Worldwide taxable income before exemption',allocation.worldwideTaxableIncome],
    ['19','Foreign limitation ratio',limitationRatio],['20','Actual tax before foreign credit',tax],['21','Foreign credit limitation',limitation],['24','Actual allowed category foreign credit',creditAllowed],['35','Actual foreign tax credit',creditAllowed],
    ['prior-used','Prior credit used',priorUsed],['expired','Unused tenth-year credit expired',expired],['current-excess','Current eligible tax exceeding current limitation',currentTaxExcess],
    ['carryback','Current tax allocated to actual prior-year capacity',carryback],['new-carry','Current tax retained after carryback',currentCarryforward],['carryforward','All retained category credits',carryforward],
  ]as const)audit.record(form,line,label,value,'Actual ordinary category calculation; independent regular and AMT histories');
  return{netForeignTaxableIncome:allocation.netForeignTaxableIncome,worldwideTaxableIncome:allocation.worldwideTaxableIncome,limitationRatio,limitation,currentTaxExact,currentTaxReported,
    creditAllowed,priorUsed,expired,currentTaxExcess,carryback,currentCarryforward,carryforward,details,carryforwardByCategory:byCategory,lines:audit.getLines()};
}
export function calculateForeignTaxOrdinaryCredit(input:ForeignTaxOrdinaryCreditInput):ForeignTaxOrdinaryCreditResult {
  const context=input.context;
  if(![2025,2026].includes(input.taxYear)||input.sourceFactsConfirmed!==true||context.taxYear!==input.taxYear||context.filingStatus!==input.filingStatus||!context.ordinaryIncomeOnly)throw new Error('Ordinary foreign credit requires actual supported year/status and ordinary source context');
  for(const [label,value]of Object.entries(context))if(Decimal.isDecimal(value))money(value,label);
  for(const [label,value]of Object.entries(context.scheduleA))if(Decimal.isDecimal(value))money(value,`ScheduleA ${label}`);
  if(!context.agi.eq(context.totalIncome)||!context.totalDeductions.eq(context.deductionAmount.plus(context.seniorDeduction)))throw new Error('Ordinary foreign credit current income and deductions require their actual separate allocation method');
  if(!['withholding_15_or_more','withholding_under_15','no_foreign_tax','other_foreign_tax'].includes(input.passiveGroup??'')||input.noCfcOrQbuIncomeConfirmed!==true)throw new Error('Ordinary foreign credit requires actual supported passive group without CFC or QBU sources');
  const countries=new Set<string>();
  for(const row of input.countries){if(!row.country.trim()||countries.has(row.country.trim().toUpperCase()))throw new Error('Ordinary foreign credit country is missing or duplicate');countries.add(row.country.trim().toUpperCase());money(row.gross,'country income');money(row.tax,'country tax');}
  const gross=sum(...input.countries.map(row=>row.gross));if(gross.gt(context.totalIncome))throw new Error('Ordinary foreign credit exceeds actual worldwide income');
  if(input.passiveGroup==='no_foreign_tax'&&input.countries.some(row=>row.tax.gt(0)))throw new Error('Untaxed passive group conflicts with actual foreign taxes');
  const amt=input.amt;money(amt.amti,'AMTI');money(amt.grossIncome,'AMT gross income');money(amt.taxBeforeCredit,'AMT before credit');
  money(amt.taxableExcess,'AMT taxable excess');money(amt.rate26Limit,'AMT indexed rate breakpoint');
  if(amt.taxableExcess.gt(amt.amti)||amt.rate26Limit.isZero())throw new Error('Actual AMT taxable excess and indexed rate breakpoint must reconcile');
  if(amt.foreignAmountsSameAsRegularConfirmed!==true||amt.noRevocationConfirmed!==true||typeof amt.simplifiedElectionMadeInFirstClaimYear!=='boolean')throw new Error('Actual AMT source differences and simplified election history are required');
  if(!Number.isInteger(amt.firstPost1997CreditClaimTaxYear)||amt.firstPost1997CreditClaimTaxYear<1998||amt.firstPost1997CreditClaimTaxYear>input.taxYear)throw new Error('Actual first post1997 AMT foreign credit claim history is required');
  const priorAmt=input.amtCarryback;
  if(priorAmt?.election==='form1116_credit'&&priorAmt.limitation!==undefined&&priorAmt.currentTaxes!==undefined&&priorAmt.priorCarryoversUsed!==undefined
    && min(money(priorAmt.limitation,'prior AMT limitation'),money(priorAmt.currentTaxes,'prior AMT current tax')).plus(money(priorAmt.priorCarryoversUsed,'prior AMT credit use')).gt(0)
    && amt.firstPost1997CreditClaimTaxYear>priorAmt.taxYear)throw new Error('Actual first AMT credit claim conflicts with known prior allowed credit history');
  if(amt.grossIncome.lt(context.totalIncome))throw new Error('Ordinary AMT gross income requires its separate actual source adjustment method');
  const regularAllocation=calculateForeignTaxOrdinaryAllocation({context,countries:input.countries,itemizedAllocation:input.itemizedAllocation,auditForm:'Form 1116 (actual passive)'});
  const amtDeduction=context.deductionUsed==='itemized'?sum(context.scheduleA.medical,context.scheduleA.mortgageInterest,context.scheduleA.charitableContributions):d('0');
  if(!amt.amti.eq(amt.grossIncome.minus(amtDeduction)))throw new Error('Actual AMTI differs from the supported ordinary AMT source deductions');
  const amtContext={...context,totalIncome:amt.grossIncome,agi:amt.grossIncome,totalDeductions:amtDeduction,seniorDeduction:d('0'),deductionAmount:amtDeduction,incomeTax:amt.taxBeforeCredit};
  const separateAmtAllocation=calculateForeignTaxOrdinaryAllocation({context:amtContext,countries:input.countries,itemizedAllocation:input.itemizedAllocation,auditForm:'AMT Form 1116 (actual passive)',amt:true});
  const amtAllocation=amt.simplifiedElectionMadeInFirstClaimYear?{...separateAmtAllocation,netForeignTaxableIncome:regularAllocation.netForeignTaxableIncome}:separateAmtAllocation;
  const regular=category(input,'regular',regularAllocation,context.incomeTax,input.regularCarryovers,input.regularCarryback);
  const amtResult=category(input,'AMT',amtAllocation,amt.taxBeforeCredit,input.amtCarryovers,input.amtCarryback,separateAmtAllocation.netForeignTaxableIncome);
  return{regular,amt:amtResult,lines:[...regular.lines,...amtResult.lines]};
}
