// Spec: spec/state/pa-royalty-property-sources.yaml.
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator.js';
import { calculatePAScheduleE } from '@/engine/state/pa-schedule-e.js';
import { parsedRoyaltyPropertyFixture } from '../../fixtures/royalty-property.js';

import { paRoyaltyPropertyFixture as fixture } from '../../fixtures/pa-royalty-property.js';
type TestProperty = ReturnType<typeof fixture>['royaltyPropertySources']['properties'][number];

function calculate(raw=fixture()) {
  const input=TaxYearInputSchema.parse(raw);
  return calculatePAScheduleE({taxYear:input.taxpayer.taxYear,filingStatus:input.taxpayer.filingStatus,taxpayer:input.taxpayer,
    royaltyPropertySources:input.royaltyPropertySources,form1099Misc:input.form1099Misc,scheduleK1:input.scheduleK1,rentalProperties:input.rentalProperties});
}
it('requires the PA property source method before using actual royalty ledgers',()=>{
  const input=parsedRoyaltyPropertyFixture();input.taxpayer.address.state='PA';
  expect(()=>calculatePAReturn(input)).toThrow(/PA.*royalt.*(classification|source|expense)/i);
});
it('uses original gross and separately rounded PA expense lines',()=>{
  const raw=fixture(),result=calculate(raw),state=calculatePAReturn(TaxYearInputSchema.parse(raw));
  expect(result.miscRoyalties.toFixed()).toBe('12000');
  expect(result.directRoyaltyExpenses.toFixed()).toBe('1000');
  expect(result.directRoyaltyNetIncome.toFixed()).toBe('11000');
  expect(result.totalAllowableExpenses.toFixed()).toBe('1000');
  expect(result.netRentalRoyaltyIncome.toFixed()).toBe('11000');
  expect(state.scheduleE?.netRentalRoyaltyIncome.toFixed()).toBe('11000');
  expect(state.pa40.netRentalIncome.toFixed()).toBe('11000');
  expect(result.royaltyProperties[0].lines.find(line=>line.line==='0:8')?.value.toFixed()).toBe('49');
  expect(result.royaltyProperties[0].lines.find(line=>line.line==='0:9')?.value.toFixed()).toBe('951');
  const cents=fixture(),property=cents.royaltyPropertySources.properties[0];
  property.expenses=property.expenses.map((row,i)=>({...row,category:'legal-professional',amountPaid:i===0?'0.25':'0.25'}));
  property.paTreatment.expenses=property.paTreatment.expenses.map(row=>({...row,category:'legal-professional',amountPaid:'0.25'}));
  expect(calculate(cents).directRoyaltyExpenses.toFixed()).toBe('1');
  expect(calculate(cents).directRoyaltyNetIncome.toFixed()).toBe('11999');
});
it('excludes actual mineral surface expenses while retaining gross and allowed subsurface receipts',()=>{
  const raw=fixture(),p=raw.royaltyPropertySources.properties[0];
  Object.assign(p,{propertyType:'nonoperating-mineral'});Object.assign(p.paTreatment,{propertyType:'nonoperating-mineral'});
  Object.assign(p.expenses[0],{category:'property-production-taxes'});p.paTreatment.expenses[0].category=p.expenses[0].category;
  p.paTreatment.expenses[0].surfaceRights=true;p.paTreatment.expenses[0].relatesToRoyaltyRights=false;
  const r=calculate(raw);expect(r.miscRoyalties.toFixed()).toBe('12000');expect(r.directRoyaltyExpenses.toFixed()).toBe('951');
  expect(r.directRoyaltyNetIncome.toFixed()).toBe('11049');expect(r.royaltyProperties[0].disallowedSurfaceExpenses.toFixed()).toBe('49.25');
});
it('keeps actual royalty owners separate from the other spouses class loss',()=>{
  const raw=fixture();Object.assign(raw.taxpayer,{filingStatus:'married_filing_jointly',spouse:{firstName:'Synthetic',lastName:'Spouse',ssn:'987654321',dateOfBirth:'1980-01-01'}});
  const input=TaxYearInputSchema.parse({...raw,scheduleK1:[{partnershipName:'Spouse royalty loss',partnershipEIN:'44-4444444',ordinaryIncome:'0',accountHolder:'spouse',royalties:'-4000'}]});
  const r=calculatePAScheduleE({taxYear:2025,filingStatus:input.taxpayer.filingStatus,taxpayer:input.taxpayer,royaltyPropertySources:input.royaltyPropertySources,form1099Misc:input.form1099Misc,scheduleK1:input.scheduleK1});
  expect(r.taxpayerNetRentalRoyaltyIncome.toFixed()).toBe('11000');expect(r.spouseNetRentalRoyaltyIncome.toFixed()).toBe('-4000');
  expect(r.netRentalRoyaltyIncome.toFixed()).toBe('7000');expect(r.reportableNetRentalRoyaltyIncome.toFixed()).toBe('11000');
});
it('rejects missing stale duplicate and unsupported state facts without inventing amounts',()=>{
  const changes: ((p:TestProperty)=>unknown)[]=[
    p=>Reflect.deleteProperty(p.paTreatment,'ownerFullYearPAResident'),p=>Object.assign(p.paTreatment,{sourceTaxYear:2026}),
    p=>Object.assign(p.paTreatment,{sourceFactsConfirmed:false}),p=>Object.assign(p.paTreatment,{accountHolder:'spouse'}),
    p=>Object.assign(p.paTreatment,{propertyType:'patent'}),p=>Object.assign(p.paTreatment,{forProfit:false}),
    p=>Object.assign(p.paTreatment,{paIncomeClass:'business'}),p=>Object.assign(p.paTreatment,{allExpenseClassificationsIncluded:false}),
    p=>p.paTreatment.expenses.pop(),p=>p.paTreatment.expenses.push({...p.paTreatment.expenses[0]}),
    p=>Object.assign(p.paTreatment.expenses[0],{amountPaid:'49.26'}),p=>Object.assign(p.paTreatment.expenses[0],{paidDate:'2025-02-16'}),
    p=>Object.assign(p.paTreatment.expenses[0],{category:'insurance'}),p=>Reflect.deleteProperty(p.paTreatment.expenses[0],'surfaceRights'),
    p=>Object.assign(p.paTreatment.expenses[0],{netIncomeTax:true}),p=>Object.assign(p.paTreatment.expenses[0],{relatesToRoyaltyRights:false}),
    p=>{Object.assign(p,{propertyType:'nil-rights'});Object.assign(p.paTreatment,{propertyType:'nil-rights'});},
  ];
  for(const change of changes){const raw=fixture();change(raw.royaltyPropertySources.properties[0]);expect(()=>calculate(raw)).toThrow();}
  const residency=fixture();Object.assign(residency.taxpayer,{stateResidency:'part-year'});expect(()=>calculate(residency)).toThrow(/residen/i);
});
it('uses actual household status when the duplicate schedule status is omitted',()=>{
  const raw=fixture();Object.assign(raw.taxpayer,{filingStatus:'married_filing_jointly',spouse:{firstName:'Synthetic',lastName:'Spouse',ssn:'987654321',dateOfBirth:'1980-01-01'}});
  const input=TaxYearInputSchema.parse({...raw,scheduleK1:[{partnershipName:'Spouse royalty loss',partnershipEIN:'44-4444444',ordinaryIncome:'0',accountHolder:'spouse',royalties:'-4000'}]});
  const source={taxYear:2025,taxpayer:input.taxpayer,royaltyPropertySources:input.royaltyPropertySources,form1099Misc:input.form1099Misc,scheduleK1:input.scheduleK1};
  const result=calculatePAScheduleE(source);
  expect(result.taxpayerNetRentalRoyaltyIncome.toFixed()).toBe('11000');
  expect(result.spouseNetRentalRoyaltyIncome.toFixed()).toBe('-4000');
  expect(result.reportableNetRentalRoyaltyIncome.toFixed()).toBe('11000');
  expect(()=>calculatePAScheduleE({...source,filingStatus:'single'})).toThrow(/status/);
});
it('preserves zero net and requires the source year independently',()=>{
  const raw=fixture(),p=raw.royaltyPropertySources.properties[0];raw.form1099Misc[0].royalties='1000';p.incomeSources[0].original.royalties='1000';p.incomeSources[0].allocatedGross='1000';
  p.expenses=[{...p.expenses[0],amountPaid:'1000'}];p.paTreatment.expenses=[{...p.paTreatment.expenses[0],amountPaid:'1000'}];
  const zero=calculate(raw);expect(zero.netRentalRoyaltyIncome.isZero()).toBe(true);expect(zero.royaltyProperties).toHaveLength(1);
  Object.assign(raw.taxpayer,{taxYear:2026});raw.royaltyPropertySources.sourceTaxYear=2026;p.paTreatment.sourceTaxYear=2026;
  Object.assign(raw.form1099Misc[0],{taxYear:2026,sourceFormRevision:'2026-12'});Object.assign(p.incomeSources[0].original,{taxYear:2026,sourceFormRevision:'2026-12'});
  p.expenses[0].paidDate='2026-02-15';p.paTreatment.expenses[0].paidDate='2026-02-15';
  expect(calculate(raw).netRentalRoyaltyIncome.isZero()).toBe(true);
  p.paTreatment.sourceTaxYear=2025;expect(()=>calculate(raw)).toThrow(/year/i);
});
