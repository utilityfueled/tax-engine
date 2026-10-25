/** Shared ordinary allocation. Spec: spec/federal/foreign-tax-ordinary-credit.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { ForeignTaxHypotheticalContext } from './foreign-tax-deduction-carryover.js';
import { d,min,roundDollar,sum,zeroFloor } from '@/utils/decimal.js';
import { AuditTrail } from '@/utils/audit.js';
import { calculateForeignTaxStateAllocation } from './foreign-tax-state-allocation.js';
type CarryFacts=NonNullable<NonNullable<TaxYearInput['foreignTaxElection']>['deductionYearCarryover']>;
export interface ForeignOrdinaryCountry { country:string;gross:Decimal;tax:Decimal }
export interface ForeignOrdinaryAllocationInput {
  context:ForeignTaxHypotheticalContext;countries:ForeignOrdinaryCountry[];
  itemizedAllocation?:CarryFacts['itemizedAllocation'];auditForm:string;amt?:boolean;
}
function amount(value:string|undefined,label:string):Decimal {
  if(value===undefined||!/^\d+(?:\.\d+)?$/.test(value))throw new Error(`Foreign allocation requires actual nonnegative ${label}`);
  const parsed=d(value);if(!parsed.isFinite())throw new Error(`Foreign allocation requires finite ${label}`);return parsed;
}
const ratio=(numerator:Decimal,denominator:Decimal)=>denominator.lte(0)?d('0'):min(d('1'),numerator.div(denominator).toDecimalPlaces(4,Decimal.ROUND_HALF_UP));
export function calculateForeignTaxOrdinaryAllocation(input:ForeignOrdinaryAllocationInput){
  const context=input.context;const countries=new Map(input.countries.map(row=>[row.country,row]));
  const grossForeign=sum(...input.countries.map(row=>row.gross));const audit=new AuditTrail();
  const sa=context.scheduleA;let nondirect=context.deductionAmount;let mortgage=d('0');
  const stateTaxByCountry=new Map<string,Decimal>();
  if(context.deductionUsed==='itemized'){
    const allocation=input.itemizedAllocation;
    if(!allocation||allocation.sourceFactsConfirmed!==true||!allocation.sourceReference?.trim())throw new Error('Foreign carryover itemizing requires actual deduction source allocation');
    if(sa.investmentInterest.gt(0)||sa.otherDeductions.gt(0)||sa.itemizedReduction.gt(0))throw new Error('Foreign carryover special itemized deductions require their separate actual allocation method');
    const taxes=amount(allocation.incomeOrSalesTaxes,'allowed income or sales tax');const home=amount(allocation.homeRealPropertyTaxes,'allowed home real estate tax');const personal=amount(allocation.personalPropertyTaxes,'allowed personal property tax');
    if(!input.amt&&(taxes.gt(sa.incomeOrSalesTaxes)||home.gt(sa.realPropertyTaxes)||personal.gt(sa.personalPropertyTaxes)||!roundDollar(sum(taxes,home,personal)).eq(sa.saltDeduction)))throw new Error('Foreign carryover tax allocations must reconcile with actual allowed ScheduleA taxes');
    if(home.gt(0)&&allocation.allRealPropertyTaxesForPersonalResidenceConfirmed!==true)throw new Error('Foreign carryover requires actual personal residence tax use');
    if(sa.charitableContributions.gt(0)&&allocation.noTreatyCharitableDeductionConfirmed!==true)throw new Error('Foreign carryover charitable deductions require actual treaty classification');
    nondirect=input.amt?sa.medical:sa.medical.plus(home).plus(personal).plus(sa.salesTaxElected?taxes:d('0'));
    if(sa.mortgageInterest.gt(0)){
      if(allocation.mortgageInterestMethod==='us_source_small_foreign_income'){
        if(grossForeign.gt(5000))throw new Error('Foreign carryover small-income interest election exceeds5000');
      }else if(allocation.mortgageInterestMethod==='gross_income')mortgage=sa.mortgageInterest;
      else throw new Error('Foreign carryover requires the actual mortgage-interest allocation method');
    }
    if(!sum(sa.medical,input.amt?d('0'):sa.saltDeduction,sa.mortgageInterest,sa.charitableContributions).eq(context.deductionAmount))throw new Error('Foreign carryover ordinary itemized sources must equal actual hypothetical deduction');
    if(sa.salesTaxElected&&(allocation.stateIncomeTaxes?.length||allocation.stateAllocation!==undefined))throw new Error('Foreign carryover state income-tax allocation conflicts with the actual sales-tax election');
    if(!input.amt&&!sa.salesTaxElected&&(taxes.gt(0)||allocation.stateIncomeTaxes!==undefined||allocation.stateAllocation!==undefined)){
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
      audit.record(input.auditForm,'state-worldwide-before-deduction','Worldwide taxable income before state income tax',worldwideBeforeState,
        'Hypothetical AGI less deductions, plus section151 amount and allowed state income tax');
      audit.record(input.auditForm,'state-foreign-taxable-before-deduction','Foreign taxable income before state income tax',foreignBeforeState,
        'Actual foreign income less prescribed nonstate deductions');
      audit.record(input.auditForm,'state-us-taxable-before-deduction','U.S. taxable income before state income tax',usBeforeState,
        'Worldwide pre-state taxable income less foreign pre-state taxable income');
      const stateAllocation=calculateForeignTaxStateAllocation(allocation,{allowedIncomeTaxes:taxes,usTaxableBeforeState:usBeforeState,foreignTaxableBeforeState:foreignBeforeState,
        countries:new Map([...countries].map(([country,group])=>[country,group.gross]))});
      for(const [country,value] of stateAllocation.countryTaxes)stateTaxByCountry.set(country,value);
      audit.merge(stateAllocation.lines);
    }
  }
  let netForeignTaxableIncome=d('0');let countryIndex=0;const countryAmounts:Array<{country:string;gross:Decimal;tax:Decimal;net:Decimal}>=[];
  for(const [country,group] of countries){
    const countryRatio=ratio(group.gross,context.totalIncome);
    const apportioned=roundDollar(nondirect.times(countryRatio));const interest=roundDollar(mortgage.times(countryRatio));
    const direct=roundDollar(stateTaxByCountry.get(country)??d('0'));
    const net=roundDollar(group.gross).minus(sum(apportioned,interest,direct));netForeignTaxableIncome=netForeignTaxableIncome.plus(net);
    countryIndex++;countryAmounts.push({country,gross:group.gross,tax:group.tax,net});
    if(stateTaxByCountry.has(country))audit.record(input.auditForm,`country-${countryIndex}:state-tax`,'State income tax allocated to foreign country',direct,
      'round(pooled allowed nonexempt state tax * actual aggregate country income / aggregate state taxable income)');
    audit.record(input.auditForm,`country-${countryIndex}:net-income`,'Hypothetical net ordinary foreign income',net,'Country gross less prescribed allowed direct and proportional deductions',{gross:group.gross,ratio:countryRatio,apportioned,interest,direct});
  }
  if(netForeignTaxableIncome.lt(0))throw new Error('Foreign carryover current overall foreign loss requires its separate actual loss-account method');
  const worldwide=zeroFloor(context.agi.minus(context.totalDeductions).plus(context.seniorDeduction));
  return{netForeignTaxableIncome,worldwideTaxableIncome:worldwide,countries:countryAmounts,lines:audit.getLines()};
}
