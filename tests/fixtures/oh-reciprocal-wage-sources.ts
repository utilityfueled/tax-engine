/** Explicit fictional originals, frozen independently of candidate outputs. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { OhioResidencyFacts } from '@/models/ohio-residency.js';
import type { OhioPaymentFacts } from '@/models/ohio-payments.js';
import type { W2StateLocalSources } from '@/models/w2-state-local.js';
import { simpleW2Fixture } from './simple-w2.js';
import { ohioResidencyFacts, ohioResidencyOwner } from './oh-residency.js';

const months = [
  ['2025-01-01','2025-01-31'],['2025-02-01','2025-02-28'],['2025-03-01','2025-03-31'],
  ['2025-04-01','2025-04-30'],['2025-05-01','2025-05-31'],['2025-06-01','2025-06-30'],
  ['2025-07-01','2025-07-31'],['2025-08-01','2025-08-31'],['2025-09-01','2025-09-30'],
  ['2025-10-01','2025-10-31'],['2025-11-01','2025-11-30'],['2025-12-01','2025-12-31'],
] as const;

export function reciprocalOhioWageFixture(wages = '60000.25', withholding = '2000.60', ohioFirst = false) {
  const D = Decimal.clone({precision:100});
  const input: TaxYearInput = structuredClone(simpleW2Fixture);
  input.taxpayer.primary = {...input.taxpayer.primary,firstName:'Casey',lastName:'Reciprocal',ssn:'900-70-0611'};
  input.taxpayer.address = {street:'611 Fictional Source Lane',city:'Pittsburgh',state:'PA',zip:'15201'};
  const w2 = input.w2s[0];
  if (!w2) throw new Error('Explicit reciprocal fixture requires one current W2');
  Object.assign(w2,{accountHolder:'primary',taxYear:2025,employer:{name:'Fictional Ordinary Employer Corporation',ein:'90-7000611'},
    wages,federalWithheld:'0',socialSecurityWages:wages,socialSecurityTips:'0',allocatedTips:'0',
    socialSecurityWithheld:new D(wages).times('.062').toFixed(2),medicareWages:wages,medicareWithheld:new D(wages).times('.0145').toFixed(2),
    box10DependentCareBenefits:'0',box12CodeW:'0',box12CodeD:'0',box12CodeE:'0',box12CodeF:'0',box12CodeG:'0',box12CodeH:'0',box12CodeS:'0',box12CodeAA:'0',box12CodeBB:'0',box12CodeEE:'0',box12CodeT:'0',
    state:ohioFirst?'OH':'PA',stateWages:wages,stateTaxWithheld:ohioFirst?withholding:'0',localWages:'0',localTaxWithheld:'0',localityName:''});
  const person=input.taxpayer.primary;
  const ohioRow={printedRow:ohioFirst?1:2,sourceReference:'PRIVATE-FICTIONAL-OH-STATE-ROW',state:'OH' as const,employerStateIDStatus:'reported' as const,employerStateID:'PRIVATE-OH-0611',wages,withheld:withholding};
  const paRow={printedRow:ohioFirst?2:1,sourceReference:'PRIVATE-FICTIONAL-PA-STATE-ROW',state:'PA' as const,employerStateIDStatus:'reported' as const,employerStateID:'PRIVATE-PA-0611',wages,withheld:'0'};
  const canonical:W2StateLocalSources={sourceTaxYear:2025,sourceReference:'PRIVATE-FICTIONAL-CURRENT-2025-W2',sourceFactsConfirmed:true,
    owner:{accountHolder:'primary',originalTaxpayer:{firstName:person.firstName,lastName:person.lastName,ssn:person.ssn}},
    originalW2:structuredClone(w2),currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,singleOriginalWithoutContinuationConfirmed:true,allOriginalPagesAndCopiesCheckedConfirmed:true,
    stateReporting:'multiple',localReporting:'none',legacyScalarProjection:'first_entered_rows',stateRows:ohioFirst?[ohioRow,paRow]:[paRow,ohioRow],localRows:[]};
  w2.stateLocalSources=canonical;
  const payrollRows=months.map(([from,to],index)=>({sourceId:`PRIVATE-PAYROLL-${index+1}`,sourceReference:`Fictional independently supplied payroll original ${index+1}`,
    accountHolder:'primary',sourceTaxYear:2025,employerTin:w2.employer.ein,servicePeriodFrom:from,servicePeriodTo:to,paymentDate:to,serviceState:'OH',
    wages:index===11?new D(wages).minus(new D('5000.02').times('11')).toFixed(2):'5000.02',
    ohioWithheld:new D(withholding).isZero()?'0.00':index===11?new D(withholding).minus(new D('166.72').times('11')).toFixed(2):'166.72'}));
  const reciprocalWageSources={sourceTaxYear:2025,sourceReference:'PRIVATE-FICTIONAL-RECIPROCAL-SOURCES',sourceFactsConfirmed:true,
    allIncomeOriginalsIncludedConfirmed:true,noOtherIncomeOrAdjustmentsConfirmed:true,noSpecialCompensationConfirmed:true,
    accountHolder:'primary',originalTaxpayer:{firstName:person.firstName,lastName:person.lastName,ssn:person.ssn},w2Index:0,originalW2:structuredClone(w2),
    domicileOriginal:{sourceId:'PRIVATE-PA-DOMICILE-2025',sourceTaxYear:2025,accountHolder:'primary',name:'Casey Reciprocal',ssn:person.ssn,from:'2025-01-01',to:'2025-12-31',domicileState:'PA',documentDate:'2026-01-15',completeYearDomicileConfirmed:true},
    employerEntityOriginal:{sourceId:'PRIVATE-CORPORATE-EMPLOYER-2025',sourceTaxYear:2025,employerTin:w2.employer.ein,employerName:w2.employer.name,entityType:'c_corporation',from:'2025-01-01',to:'2025-12-31',documentDate:'2026-01-15',notPassThroughOrPEOConfirmed:true},
    serviceOriginal:{sourceId:'PRIVATE-EMPLOYER-SERVICES-2025',sourceTaxYear:2025,accountHolder:'primary',employerTin:w2.employer.ein,from:'2025-01-01',to:'2025-12-31',documentDate:'2026-01-15',allCompensationOrdinaryOhioEmployeeServicesConfirmed:true,totalCompensation:wages},payrollRows};
  const owner=ohioResidencyOwner('primary','nonresident');owner.periods=[{from:'2025-01-01',to:'2025-12-31',domicileState:'PA'}];
  Object.assign(owner.amounts.wages,{federalAmount:wages,residentAmount:'0',nonresidentOhioAmount:wages,sourceReference:'PRIVATE-RAW-OH-SERVICE-PAYROLL-BEFORE-EXEMPTION'});
  const facts:OhioResidencyFacts & {reciprocalWageSources:typeof reciprocalWageSources}={...ohioResidencyFacts(),owners:[owner],reciprocalWageSources};
  const payments:OhioPaymentFacts={taxYear:2025,sourceReference:'PRIVATE-FICTIONAL-COMPLETE-OH-ACCOUNT-2025',sourceFactsConfirmed:true,originalFederalSources:{},calendarYearConfirmed:true,allPaymentsIncludedConfirmed:true,withholdingTreatment:'equal_quarters',paymentRows:[],
    priorReturn:{status:'no_return',sourceReference:'Fictional complete original account search establishes no previous Ohio return'},priorCreditCarryforward:{status:'none',sourceReference:'Fictional complete account confirms no credit'},
    remainingTaxPayment:{status:'no_remaining_tax',sourceReference:'Fictional source-complete all-exempt compensation and actual Ohio account history',sourceFactsConfirmed:true},
    currentTiming:{kind:'expected',expectedDate:'2026-04-15',asOfDate:'2026-04-01'},filingExtension:{kind:'none'},paymentExtension:{kind:'none'},returnKind:'original',specialMethod:'regular',balanceFacts:{sourceReference:'Fictional complete2025 use-tax records and express refund elections',useTax:'0',outgoingCarryforward:'0',donations:'0'}};
  input.ohioResidency=facts;input.ohioPayments=payments;
  const packet={input,facts,payments};rebindReciprocalOuter(packet);return packet;
}
export type ReciprocalOhioWagePacket=ReturnType<typeof reciprocalOhioWageFixture>;
export function reciprocalW2(packet:ReciprocalOhioWagePacket){const w=packet.input.w2s[0];if(!w)throw new Error('Fixture requires one current original');return w;}
export function rebindReciprocalOuter(packet:{input:TaxYearInput;facts:OhioResidencyFacts;payments:OhioPaymentFacts}){
  const {ohioResidency:_r,ohioPayments:_p,...original}=packet.input;
  packet.facts.originalFederalSources=structuredClone(original);packet.payments.originalFederalSources=structuredClone(original);
}
export function explicitlyReplaceReciprocalW2(packet:ReciprocalOhioWagePacket){
  const w=reciprocalW2(packet);const source=w.stateLocalSources;if(!source)throw new Error('Fixture requires actual state rows');
  const {stateLocalSources:_source,...original}=w;source.originalW2=structuredClone(original);
  packet.facts.reciprocalWageSources.originalW2=structuredClone(w);rebindReciprocalOuter(packet);
}
