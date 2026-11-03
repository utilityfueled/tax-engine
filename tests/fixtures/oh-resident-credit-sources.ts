/** Explicit fictional actual records; literal source oracles predate calculation outputs. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { reciprocalOhioWageFixture } from './oh-reciprocal-wage-sources.js';
import { ohioResidencyOwner } from './oh-residency.js';

export function ohioResidentCreditFixture(vaIncome='60000',netTax='1000',ohioWithholding='2000') {
  const packet=reciprocalOhioWageFixture('100000',ohioWithholding);
  const input:TaxYearInput=packet.input,w2=input.w2s[0];
  if(!w2?.stateLocalSources)throw new Error('Fictional source requires one complete original W2');
  const D=Decimal.clone({precision:100});
  input.taxpayer.primary={...input.taxpayer.primary,firstName:'Robin',lastName:'ResidentCredit',ssn:'900-71-0412'};
  input.taxpayer.address={street:'412 Fictional Resident Lane',city:'Columbus',state:'OH',zip:'43215'};
  w2.employer={name:'Fictional Ordinary Interstate Employer',ein:'90-7100412'};
  w2.federalWithheld='10000'; w2.state='VA';w2.stateWages=vaIncome;w2.stateTaxWithheld='1200';
  const person=input.taxpayer.primary;
  const rows=w2.stateLocalSources.stateRows;
  rows[0]={printedRow:1,sourceReference:'PRIVATE-VA-RC-W2-ROW',state:'VA',employerStateIDStatus:'reported',employerStateID:'PRIVATE-VA-RC-STATE-ID',wages:vaIncome,withheld:'1200'};
  rows[1]={printedRow:2,sourceReference:'PRIVATE-OH-RC-W2-ROW',state:'OH',employerStateIDStatus:'reported',employerStateID:'PRIVATE-OH-RC-STATE-ID',wages:'100000',withheld:ohioWithholding};
  w2.stateLocalSources.owner.originalTaxpayer={firstName:person.firstName,lastName:person.lastName,ssn:person.ssn};
  const {stateLocalSources:_s,...rawW2}=w2;w2.stateLocalSources.originalW2=structuredClone(rawW2);
  const owner=ohioResidencyOwner('primary','full_year_resident');
  Object.assign(owner.amounts.wages,{federalAmount:'100000',residentAmount:'100000',nonresidentOhioAmount:'0'});
  const identity={firstName:person.firstName,lastName:person.lastName,ssn:person.ssn};
  const returnOriginal={sourceId:'PRIVATE-VA-763-ORIGINAL',sourceReference:'PRIVATE-FILED-VA-763-COMPLETE',taxYear:2025,accountHolder:'primary',originalTaxpayer:structuredClone(identity),stateCode:'VA',form:'763',filingStatus:'single',returnKind:'original',periodFrom:'2025-01-01',periodTo:'2025-12-31',filedDate:'2026-02-15',
    federalAgi:'100000',incomeTaxedByVirginia:vaIncome,incomeTaxBeforeCredits:new D(netTax).plus('1500').toFixed(),nonrefundableCredits:'1500',netIncomeTax:netTax,withholding:'1200',estimatedPayments:'0',balancePayments:'0',refund:new D('1200').minus(netTax).toFixed(),outgoingCredit:'0',otherTaxes:'0',penalties:'0',interest:'0',completedReturnAndCreditWorksheetsReference:'PRIVATE-VA-COMPLETED-TAX-CREDIT-WORKSHEETS'};
  // For cap-boundary tests actual extra balance receipts replace an impossible negative refund.
  if(new D(netTax).gt('1200')){returnOriginal.refund='0';returnOriginal.balancePayments=new D(netTax).minus('1200').toFixed();}
  const payments=[{sourceId:'PRIVATE-VA-APPLIED-W2-WH',sourceReference:'PRIVATE-AGENCY-EMPLOYER-WH-APPLIED',taxYear:2025,accountHolder:'primary',originalTaxpayer:structuredClone(identity),kind:'withholding',date:'2025-12-31',amount:'1200'}];
  if(new D(returnOriginal.balancePayments).gt(0))payments.push({sourceId:'PRIVATE-VA-BALANCE-PAID',sourceReference:'PRIVATE-VA-BANK-REMITTANCE',taxYear:2025,accountHolder:'primary',originalTaxpayer:structuredClone(identity),kind:'balance',date:'2026-02-15',amount:returnOriginal.balancePayments});
  const refunds=new D(returnOriginal.refund).gt(0)?[{sourceId:'PRIVATE-VA-REFUND-CASH',sourceReference:'PRIVATE-ACTUAL-VA-REFUND-RECEIPT',taxYear:2025,accountHolder:'primary',originalTaxpayer:structuredClone(identity),kind:'refund',date:'2026-03-01',amount:returnOriginal.refund}]:[];
  const source={sourceTaxYear:2025,sourceReference:'PRIVATE-VA-RESIDENT-CREDIT-SOURCE',sourceFactsConfirmed:true,accountHolder:'primary',originalTaxpayer:structuredClone(identity),originalW2:structuredClone(w2),
    allIncomeOriginalsIncludedConfirmed:true,noOtherIncomeOrAdjustmentsConfirmed:true,noSpecialCompensationConfirmed:true,taxDeductedInFederalAgi:'none',
    employerEntityOriginal:{sourceId:'PRIVATE-VA-ORDINARY-CORPORATION',sourceReference:'PRIVATE-CORPORATE-EMPLOYER-ORIGINAL',sourceTaxYear:2025,documentDate:'2026-01-15',employerName:w2.employer.name,employerTin:w2.employer.ein,entityType:'c_corporation'},
    serviceRows:[{sourceId:'PRIVATE-VA-EMPLOYER-SERVICES',sourceReference:'PRIVATE-VA-ACTUAL-PAYROLL-LEDGER',sourceTaxYear:2025,accountHolder:'primary',employerTin:w2.employer.ein,servicePeriodFrom:'2025-01-01',servicePeriodTo:'2025-06-30',paymentDate:'2025-06-30',serviceState:'VA',wages:vaIncome},{sourceId:'PRIVATE-OH-EMPLOYER-SERVICES',sourceReference:'PRIVATE-OH-ACTUAL-PAYROLL-LEDGER',sourceTaxYear:2025,accountHolder:'primary',employerTin:w2.employer.ein,servicePeriodFrom:'2025-07-01',servicePeriodTo:'2025-12-31',paymentDate:'2025-12-31',serviceState:'OH',wages:new D('100000').minus(vaIncome).toFixed()}],
    filedReturn:returnOriginal,
    completedAccount:{sourceId:'PRIVATE-VA-AGENCY-CLOSED-ACCOUNT',sourceReference:'PRIVATE-COMPLETE-VA-AGENCY-ACCOUNT',taxYear:2025,accountHolder:'primary',originalTaxpayer:structuredClone(identity),stateCode:'VA',statementDate:'2026-03-10',netIncomeTax:netTax,unpaidTax:'0',unappliedPayments:'0',outgoingCredit:'0',otherTaxes:'0',penalties:'0',interest:'0',allPaymentsAndRefundsIncludedConfirmed:true,noPendingChangesOrRefundClaimsConfirmed:true,payments,refunds}};
  const {reciprocalWageSources:_r,...baseFacts}=packet.facts;
  const facts={...baseFacts,owners:[owner],residentCreditSources:source};
  const paymentsOhio=packet.payments;paymentsOhio.currentTiming={kind:'expected',expectedDate:'2026-04-15',asOfDate:'2026-04-01'};
  input.ohioResidency=facts as TaxYearInput['ohioResidency'];input.ohioPayments=paymentsOhio;
  const result={input,facts,source,payments:paymentsOhio};rebindResidentCreditOuter(result);return result;
}
export function rebindResidentCreditOuter(packet:{input:TaxYearInput;facts:{originalFederalSources?:Record<string,unknown>};payments:{originalFederalSources:Record<string,unknown>}}){
 const {ohioResidency:_r,ohioPayments:_p,ohioSchoolDistrict:_s,...original}=packet.input;
 packet.facts.originalFederalSources=structuredClone(original);packet.payments.originalFederalSources=structuredClone(original);
}
