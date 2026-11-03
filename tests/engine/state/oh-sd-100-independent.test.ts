/** Spec: state/oh-sd-100-independent.yaml. Independent Decimal literals frozen before execution. */
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn, type OhioResidentReturnInput } from '@/engine/state/oh-return.js';
import { buildOhioSchoolDistrictSource } from '@/engine/state/oh-sd-100-sources.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { schoolDistrictSourcesFixture as fixture, schoolDistrictEstimatedFixture as estimates,
  schoolDistrictPriorReturn, schoolW2, schoolW2Packet, bindSchoolDistrictFixture as bind,
  addSchoolMunicipalRow, type SchoolDistrictFixtureInput as Packet } from '../../fixtures/oh-school-district-sources.js';
function first<T>(rows: T[]): T { const value=rows[0]; if(value===undefined)throw new Error('Missing independently supplied original'); return value; }
function canonical(p: Packet) { return calculateOhioResidentReturn(buildOhioResidentReturnInput(p,calculateFederalTax(p))); }
function source(p: Packet, federal=calculateFederalTax(p)) {
 const ohio: OhioResidentReturnInput={taxYear:2025,filingStatus:'single',federalAgi:federal.agi,exemptions:1,ohioWithholding:'3000',computeUnderpaymentPenalty:true,estimatedPayments:'0',creditCarryforward:'0',useTax:'0',donations:'0',latePaymentInterest:'0'};
 return buildOhioSchoolDistrictSource(p,federal,ohio);
}
function rejects(p: Packet) { const before=JSON.stringify(p); expect(()=>source(p)).not.toThrow(TypeError);expect(()=>source(p)).toThrow();expect(JSON.stringify(p)).toBe(before); }
function row(p: Packet) { return first(p.ohioSchoolDistrict.w2Sources); }
function local(p: Packet) { return first(schoolW2Packet(p).localRows); }
function replaceFamily(p: Packet, family: string, value: unknown) {
 const parsed=TaxYearInputSchema.parse({...p,[family]:value});Reflect.set(p,family,Reflect.get(parsed,family));bind(p);
}
it('OH SD distinct independently proves printed tax and separate cash',()=>{
 const p=fixture(),before=JSON.stringify(p),r=canonical(p),sd=r.sd100,s=source(p);
 if(!sd)throw new Error('School source did not produce an SD100');
 expect([s.residentIncome.line29,s.residentIncome.line30,s.residentIncome.line31,s.residentIncome.line32,s.residentIncome.line33].map(v=>v.toString())).toEqual(['80000','0','80000','80000','80000']);
 expect([sd.line3_magi,sd.line6_traditionalTax,sd.line7_earnedIncomeTax,sd.line8_totalTaxAfterCredits,sd.line9_underpaymentPenalty,sd.line10_totalLiability,sd.line11_sdWithholding,sd.line12_estimatedPayments,sd.line13_totalPayments,sd.line14_amendedPriorOverpayment,sd.line15_netPayments,sd.line16_taxDue,sd.line17_latePaymentInterest,sd.line18_totalAmountDue,sd.line19_overpayment,sd.line20_creditCarryforward,sd.line21_refund].map(v=>v.toString())).toEqual(['80000','0','1000','1000','0','1000','1100','0','1100','0','1100','0','0','0','100','0','100']);
 expect(r.it1040.line14_ohioWithholding.toString()).toBe('3000');expect(s.district.rate).toBe('0.0125');expect(s.priorYearTaxLiability).toBeUndefined();expect(s.priorYearTimelyFiled).toBe(false);expect(JSON.stringify(p)).toBe(before);
 for(const municipalFirst of [true,false]){const m=fixture();addSchoolMunicipalRow(m,municipalFirst);const mr=canonical(m);expect(mr.sd100?.line21_refund.toString()).toBe('100');expect(mr.it1040.line14_ohioWithholding.toString()).toBe('3000');}
 const election=fixture();election.ohioSchoolDistrict.payments.refundDisposition.outgoingCarryforward='25';expect(canonical(election).sd100?.line21_refund.toString()).toBe('75');
 const e=estimates(),er=canonical(e);expect(er.sd100?.line12_estimatedPayments.toString()).toBe('400');expect(er.sd100?.line19_overpayment.toString()).toBe('0');expect(source(e).estimatedPaymentSchedule.map(v=>[v.date,v.amount.toString()])).toEqual([['2025-04-15','100'],['2025-06-16','100'],['2025-09-15','100'],['2026-01-15','100']]);
 const prior=fixture(),pays=prior.ohioSchoolDistrict.payments;pays.priorReturn=schoolDistrictPriorReturn(prior,'0','25','25');pays.priorCreditCarryforward={status:'actual_credit',sourceReference:'ACTUAL-PRIOR-ELECTION',accountHolder:'primary',accountSsn:prior.taxpayer.primary.ssn,electedAmount:'25',availableForThisReturn:'25',appliedToThisReturnConfirmed:true};pays.account.priorCreditApplied='25';expect(canonical(prior).sd100?.line21_refund.toString()).toBe('125');
});
const sourceCases: [string,(p:Packet)=>void][]=[
 ['missing confirmation',p=>{Reflect.deleteProperty(p.ohioSchoolDistrict,'sourceFactsConfirmed');}],
 ['unknown source classification',p=>{Reflect.set(p.ohioSchoolDistrict.income,'allOtherIncomeSourcesCheckedConfirmed',null);}],
 ['wrong current owner',p=>{p.ohioSchoolDistrict.owner.originalTaxpayer.ssn='900-70-9999';}],
 ['wrong current DOB',p=>{p.ohioSchoolDistrict.owner.originalTaxpayer.dateOfBirth='1990-01-16';}],
 ['wrong packet year',p=>{p.ohioSchoolDistrict.taxYear=2026;}],
 ['wrong lookup year',p=>{p.ohioSchoolDistrict.residence.lookup.taxYear=2026;}],
 ['future lookup date',p=>{p.ohioSchoolDistrict.residence.lookup.lookupDate='2026-04-02';}],
 ['invalid lookup date',p=>{p.ohioSchoolDistrict.residence.lookup.lookupDate='2026-02-30';}],
 ['lookup not confirmed',p=>{Reflect.set(p.ohioSchoolDistrict.residence.lookup,'officialResultMatchedConfirmed',false);}],
 ['changed lookup address',p=>{p.ohioSchoolDistrict.residence.lookup.originalAddress.street='Different actual home';}],
 ['changed current address',p=>{p.taxpayer.address.street='Changed current original';bind(p);}],
 ['school calendar gap',p=>{first(p.ohioSchoolDistrict.residence.periods).from='2025-01-02';}],
 ['school calendar overlap',p=>{p.ohioSchoolDistrict.residence.periods.push({...first(p.ohioSchoolDistrict.residence.periods)});}],
 ['impossible school calendar',p=>{first(p.ohioSchoolDistrict.residence.periods).through='2025-12-32';}],
 ['district differs from local WH',p=>{first(p.ohioSchoolDistrict.residence.periods).districtCode='0301';}],
 ['Ohio calendar gap',p=>{const own=first(p.ohioResidency.owners);first(own.periods).from='2025-01-02';}],
 ['box14 unknown',p=>{row(p).box14SchoolDistrictReporting.status='unknown';}],
 ['box14 reported',p=>{row(p).box14SchoolDistrictReporting.status='reported';}],
 ['local classification unresolved',p=>{first(row(p).localRows).classification='unresolved';}],
 ['municipal reclassified to school',p=>{addSchoolMunicipalRow(p,true);const actual=first(row(p).localRows);Object.assign(actual,{classification:'school_district',districtCode:'0302'});Reflect.deleteProperty(actual,'municipalityCode');}],
 ['missing local row coverage',p=>{row(p).localRows=[];}],
 ['same local row twice',p=>{row(p).localRows.push({...first(row(p).localRows)});}],
 ['blank actual local name',p=>{local(p).localityName='';bind(p);}],
 ['wrong W2 current year',p=>{schoolW2(p).taxYear=2024;bind(p);}],
 ['wrong W2 owner',p=>{schoolW2(p).accountHolder='spouse';bind(p);}],
 ['missing W2 original',p=>{Reflect.deleteProperty(schoolW2(p),'stateLocalSources');bind(p);}],
 ['IT penalty cannot be hidden by school refund',p=>{schoolW2(p).stateTaxWithheld='0';first(schoolW2Packet(p).stateRows).withheld='0';bind(p);}],
 ['missing W2 source coverage',p=>{p.ohioSchoolDistrict.w2Sources=[];}],
 ['school cents not whole',p=>{local(p).withheld='1100.50';schoolW2(p).localTaxWithheld='1100.50';bind(p);}],
 ['source unknown is not actualzero',p=>{Reflect.set(local(p),'withheld',undefined);bind(p);}],
];
it.each(sourceCases)('OH SD distinct rejects source contradiction %s',(_name,mutate)=>{const p=fixture();mutate(p);rejects(p);});
const retainedCases: [string,unknown][]=[
 ['form4797',{netSection1231GainOrLoss:'0',nonrecapturedNetSection1231Losses:'0',propertySales:[]}],
 ['homeSales',[{accountHolder:'primary',salePrice:'100',purchasePrice:'100',daysOwned:730,daysUsedAsResidence:730,usedExclusionInPrior2Years:false}]],
 ['form6252',[{description:'Separate retained actual installment original',accountHolder:'primary',isYearOfSale:true,sellingPrice:'100',costBasis:'100',paymentsReceived:'100'}]],
 ['form6781',{accountHolder:'primary',section1256Gains:'100',section1256Losses:'100',adjustments:'0',carrybackElection:false}],
 ['form8814',[{taxableInterest:'0',taxExemptInterest:'0',ordinaryDividends:'0',qualifiedDividends:'0',capitalGainDistributions:'0'}]],
 ['form8824',[{description:'Separate retained actual exchange original',fmvLikeKindPropertyReceived:'0',adjustedBasisLikeKindPropertyGivenUp:'0'}]],
 ['savingsBondRedemptions',[{sourceId:'separate-retained-bond',proceeds:'100',faceValue:'100',interest:'0',bondType:'series_i',issueDate:'2000-01-01',redemptionDate:'2025-08-01',ownerDateOfBirth:'1990-01-15',registeredOwner:'taxpayer',ownershipConfirmed:true,priorYearInterestReported:'0'}]],
];
it.each(retainedCases)('OH SD distinct rejects retained nonwage original %s',(family,value)=>{const p=fixture();replaceFamily(p,family,value);rejects(p);});
const cashCases: [string,(p:Packet)=>void][]=[
 ['wrong account owner',p=>{p.ohioSchoolDistrict.payments.account.accountSsn='900-70-9999';}],
 ['wrong account year',p=>{p.ohioSchoolDistrict.payments.account.taxYear=2024;}],
 ['incomplete agency account',p=>{Reflect.set(p.ohioSchoolDistrict.payments.account,'completeAccountConfirmed',false);}],
 ['wrong asof agency account',p=>{p.ohioSchoolDistrict.payments.account.asOfDate='2026-03-31';}],
 ['future actual receipt',p=>{first(p.ohioSchoolDistrict.payments.paymentRows).date='2026-04-02';}],
 ['copied date differs from original',p=>{first(p.ohioSchoolDistrict.payments.paymentRows).date='2025-06-16';}],
 ['copied amount differs from original',p=>{first(p.ohioSchoolDistrict.payments.paymentRows).amount='101';}],
 ['bank amount cents require method',p=>{const q=first(p.ohioSchoolDistrict.payments.paymentRows);q.amount='100.50';q.original.amount='100.50';p.ohioSchoolDistrict.payments.account.estimatedPaymentsCredited='400.50';}],
 ['claimed annual total differs',p=>{p.ohioSchoolDistrict.payments.account.estimatedPaymentsCredited='401';}],
 ['copied receipt account differs',p=>{first(p.ohioSchoolDistrict.payments.paymentRows).original.accountName='Different owner';}],
 ['copied receipt year differs',p=>{first(p.ohioSchoolDistrict.payments.paymentRows).original.taxYear=2024;}],
 ['receipt not actually applied',p=>{Reflect.set(first(p.ohioSchoolDistrict.payments.paymentRows),'appliedToThisReturnConfirmed',false);}],
 ['same cash renamed',p=>{const q={...first(p.ohioSchoolDistrict.payments.paymentRows),sourceId:'Other synthetic reference',original:{...first(p.ohioSchoolDistrict.payments.paymentRows).original}};q.original.confirmationNumber=`  ${q.original.confirmationNumber.toLowerCase()}  `;p.ohioSchoolDistrict.payments.paymentRows.push(q);p.ohioSchoolDistrict.payments.account.estimatedPaymentsCredited='500';}],
 ['late fourthquarter cannot cover earlier requiredquarter',p=>{const q=p.ohioSchoolDistrict.payments.paymentRows;p.ohioSchoolDistrict.payments.paymentRows=[{...first(q),date:'2026-01-15',amount:'1000',original:{...first(q).original,date:'2026-01-15',amount:'1000'}}];local(p).withheld='0';schoolW2(p).localTaxWithheld='0';p.ohioSchoolDistrict.payments.account.estimatedPaymentsCredited='1000';bind(p);}],
 ['outgoing exceeds overpayment',p=>{p.ohioSchoolDistrict.payments.refundDisposition.outgoingCarryforward='1';}],
 ['missing current actual timing',p=>{Reflect.deleteProperty(p.ohioSchoolDistrict.payments,'currentTiming');}],
 ['late current expected date',p=>{p.ohioSchoolDistrict.payments.currentTiming={kind:'expected',expectedDate:'2026-04-16',asOfDate:'2026-04-01'};}],
 ['IT cash cannot be used again for SD',p=>{const q=first(p.ohioSchoolDistrict.payments.paymentRows);p.ohioPayments.paymentRows=[{...q,returnType:'it1040',original:{...q.original,returnType:'it1040',confirmationNumber:` ${q.original.confirmationNumber.toLowerCase()} `}}];}],
 ['no_return does not prove prior credit',p=>{p.ohioSchoolDistrict.payments.priorCreditCarryforward={status:'actual_credit',sourceReference:'actual-credit',accountHolder:'primary',accountSsn:p.taxpayer.primary.ssn,electedAmount:'25',availableForThisReturn:'25',appliedToThisReturnConfirmed:true};p.ohioSchoolDistrict.payments.account.priorCreditApplied='25';}],
];
it.each(cashCases)('OH SD distinct rejects cash contradiction %s',(_name,mutate)=>{const p=estimates();mutate(p);rejects(p);});
it('OH SD distinct preserves commitments and exact finite boundaries',()=>{
 const p=fixture(),precision=Decimal.precision,s=source(p),before=JSON.stringify(p);expect(Decimal.precision).toBe(precision);
 const audit=JSON.stringify(s.lines);for(const secret of [p.taxpayer.primary.ssn,p.taxpayer.primary.firstName,p.taxpayer.address.street,p.ohioSchoolDistrict.sourceReference,schoolW2(p).employer.name])expect(audit).not.toContain(secret);
 expect(s.sourceDigest).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(p)).toBe(before);
 const changed=fixture();changed.ohioSchoolDistrict.residence.lookup.sourceReference='Actual independent new document';expect(source(changed).sourceDigest).not.toBe(s.sourceDigest);
 const stale=fixture(),saved=calculateFederalTax(stale);schoolW2(stale).employer.name='Changed actual payer original';expect(()=>source(stale,saved)).toThrow();
 const sameCash=fixture();schoolW2(sameCash).employer.name='Current changed actual payer original';bind(sameCash);expect(source(sameCash).sourceDigest).not.toBe(s.sourceDigest);
 expect(()=>buildOhioResidentReturnInput(p,calculateFederalTax(p),{sdWithholdingOverride:'99999'})).toThrow();
 const future=fixture();future.taxpayer.taxYear=2026;expect(()=>canonical(future)).toThrow();
});
