// Spec: spec/federal/royalty-property-sources.yaml. Literal source controls.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculateScheduleE } from '@/engine/schedules/schedule-e.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { royaltyPropertyFixture, parsedRoyaltyPropertyFixture } from '../fixtures/royalty-property.js';

it('deducts actual direct royalty expenses once across Schedule E EIC and NIIT',()=>{
  const input=parsedRoyaltyPropertyFixture(), before=JSON.stringify(input), result=calculateFederalTax(input);
  expect(calculateScheduleE(input).totalRoyaltyIncome.toFixed()).toBe('11000.5');
  expect(result.agi.toFixed()).toBe('211000.5');
  expect(['4a','4c','12','17'].map(id=>result.form8960.lines.find(row=>row.line===id)?.value.toFixed())).toEqual(['11000.5','11000.5','11000.5','418']);
  expect(['8','9','10'].map(id=>result.allLines.find(row=>row.form==='EIC Investment Income Worksheet'&&row.line===id)?.value.toFixed())).toEqual(['12000.25','999.75','11000.5']);
  expect(JSON.stringify(input)).toBe(before);
  expect(JSON.stringify(result.allLines)).not.toMatch(/Private royalty|private-property|Private legal|Private agent|royalty-account/);
});

it('conserves original allocations across properties and independent K1 royalties',()=>{
  const raw=royaltyPropertyFixture(); raw.form1099Misc[0].royalties='1000.01';
  const first=raw.royaltyPropertySources.properties[0]; first.incomeSources[0].original.royalties='1000.01';
  first.incomeSources[0].allocatedGross='333.33';first.expenses=[{...first.expenses[0],amountPaid:'100.01'}];
  const second=structuredClone(first);second.propertyId='private-property-2';second.incomeSources[0].allocatedGross='666.68';
  second.expenses[0].sourceId='expense-2';second.expenses[0].amountPaid='200.02';raw.royaltyPropertySources.properties.push(second);
  const input=TaxYearInputSchema.parse({...raw,scheduleK1:[{partnershipName:'Fictional passive entity',partnershipEIN:'44-4444444',
    entityType:'s_corporation',ordinaryIncome:'-400',royalties:'50.02',isPassiveActivity:true}]});
  const result=calculateFederalTax(input);
  expect(calculateScheduleE(input).totalRoyaltyIncome.toFixed()).toBe('750');expect(result.agi.toFixed()).toBe('200750');
  expect(result.form8582?.suspendedLoss.toFixed()).toBe('400');expect(result.form8960.netInvestmentIncome.toFixed()).toBe('750');
  raw.royaltyPropertySources.properties.reverse();
  expect(calculateScheduleE(TaxYearInputSchema.parse(raw)).totalRoyaltyIncome.toFixed()).toBe('699.98');
});

it('rejects incomplete stale or unsupported royalty property facts',()=>{
  const mutations:Array<(raw:ReturnType<typeof royaltyPropertyFixture>)=>void>=[
    r=>{r.royaltyPropertySources.sourceTaxYear=2024;},
    r=>{r.royaltyPropertySources.sourceFactsConfirmed=false;},
    r=>{r.royaltyPropertySources.allDirectRoyaltySourcesIncluded=false;},
    r=>{r.royaltyPropertySources.properties[0].currentYearExpensesComplete=false;},
    r=>{r.royaltyPropertySources.properties[0].incomeSources[0].sourceIndex=1;},
    r=>{r.form1099Misc[0].royalties='12000.26';},
    r=>{r.form1099Misc[0].payer='Changed original';},
    r=>{r.royaltyPropertySources.properties[0].incomeSources[0].allocatedGross='12000.24';},
    r=>{r.royaltyPropertySources.properties[0].tradeOrBusiness=true;},
    r=>{r.royaltyPropertySources.properties[0].operatingInterest=true;},
    r=>{r.royaltyPropertySources.properties[0].capitalDisposition=true;},
    r=>{r.royaltyPropertySources.properties[0].foreignSource=true;},
    r=>{r.royaltyPropertySources.properties[0].communityPropertyAllocationRequired=true;},
    r=>{r.royaltyPropertySources.properties[0].cashMethod=false;},
    r=>{r.royaltyPropertySources.properties[0].depletionExpense='0.01';},
    r=>{r.royaltyPropertySources.properties[0].interestExpense='0.01';},
    r=>{r.royaltyPropertySources.properties[0].depreciationExpense='0.01';},
    r=>{r.royaltyPropertySources.properties[0].otherExpenses='0.01';},
    r=>{r.royaltyPropertySources.properties[0].priorUnallowedExpenses='0.01';},
    r=>{r.royaltyPropertySources.properties[0].sameRegularAmtTreatmentConfirmed=false;},
    r=>{r.royaltyPropertySources.properties[0].propertyReference='';},
    r=>{r.royaltyPropertySources.properties[0].incomeSources=[];},
    r=>{r.royaltyPropertySources.properties[0].incomeSources.push(structuredClone(r.royaltyPropertySources.properties[0].incomeSources[0]));},
    r=>{r.royaltyPropertySources.properties.push(structuredClone(r.royaltyPropertySources.properties[0]));},
    r=>{r.royaltyPropertySources.properties[0].expenses[0].amountPaid='12000';},
    r=>{r.royaltyPropertySources.properties[0].expenses[0].paidDate='2025-02-30';},
    r=>{r.royaltyPropertySources.properties[0].expenses[0].paidDate='2024-02-29';},
    r=>{r.royaltyPropertySources.properties[0].expenses[0].capitalOrImprovement=true;},
    r=>{r.royaltyPropertySources.properties[0].expenses[0].personalOrOwnLabor=true;},
    r=>{r.royaltyPropertySources.properties[0].expenses[0].ordinaryNecessaryForProperty=false;},
    r=>{r.royaltyPropertySources.properties[0].expenses[0].relatesOnlyToCurrentYear=false;},
    r=>{r.royaltyPropertySources.properties[0].expenses[0].reimbursed=true;},
    r=>{r.royaltyPropertySources.properties[0].expenses.push({...r.royaltyPropertySources.properties[0].expenses[0]});},
    r=>{r.form1099Misc.push({...r.form1099Misc[0],sourceId:'second-original'});},
  ];
  for (const mutate of mutations) {const raw=royaltyPropertyFixture();mutate(raw);expect(()=>calculateScheduleE(TaxYearInputSchema.parse(raw))).toThrow(/royalt/i);}
  const unknown=royaltyPropertyFixture();Reflect.deleteProperty(unknown.royaltyPropertySources.properties[0],'currentYearExpensesComplete');
  expect(()=>calculateScheduleE(TaxYearInputSchema.parse(unknown))).toThrow(/royalt/i);
  for(const key of ['expenses','interestExpense','propertyType','accountHolder']) {
    const missing=royaltyPropertyFixture();Reflect.deleteProperty(missing.royaltyPropertySources.properties[0],key);
    expect(()=>calculateScheduleE(TaxYearInputSchema.parse(missing))).toThrow(/royalt/i);
  }
});

it('retains actual expense categories and separate joint owners',()=>{
  const raw=royaltyPropertyFixture(),property=raw.royaltyPropertySources.properties[0],receipt=property.expenses[0];
  const input=TaxYearInputSchema.parse({...raw,taxpayer:{...raw.taxpayer,filingStatus:'married_filing_jointly',
    spouse:{firstName:'Actual',lastName:'Spouse',ssn:'999-80-0001',dateOfBirth:'1988-01-01'}},
    form1099Misc:[{...raw.form1099Misc[0],accountHolder:'spouse'}],royaltyPropertySources:{...raw.royaltyPropertySources,
      properties:[{...property,accountHolder:'spouse',incomeSources:[{...property.incomeSources[0],original:{...raw.form1099Misc[0],accountHolder:'spouse'}}],
        expenses:['commissions','insurance','legal-professional','management-fees','property-production-taxes'].map((category,index)=>({
          ...receipt,sourceId:`actual-expense-${index}`,category,amountPaid:'100.01'}))}]}});
  const result=calculateScheduleE(input),source=result.royaltyProperties[0];
  expect(source.accountHolder).toBe('spouse');expect(source.sourceIndex).toBe(0);
  expect([source.commissions,source.insurance,source.legalProfessional,source.managementFees,source.taxes].map(v=>v.toFixed())).toEqual(Array(5).fill('100.01'));
  expect(result.grossRoyaltyIncome.toFixed()).toBe('12000.25');expect(result.totalRoyaltyExpenses.toFixed()).toBe('500.05');
  expect(result.totalRoyaltyIncome.toFixed()).toBe('11500.2');
  const absent=structuredClone(input);delete absent.taxpayer.spouse;expect(()=>calculateScheduleE(absent)).toThrow(/royalt/i);
});

it('rejects duplicate originals even with different source identifiers',()=>{
  const raw=royaltyPropertyFixture();raw.form1099Misc.push({...raw.form1099Misc[0],sourceId:'second-id'});
  raw.royaltyPropertySources.properties[0].incomeSources.push({sourceIndex:1,original:{...raw.form1099Misc[1]},allocatedGross:'12000.25'});
  expect(()=>calculateScheduleE(TaxYearInputSchema.parse(raw))).toThrow(/royalt.*account/i);
  raw.form1099Misc[1].accountReference='separate-account';raw.royaltyPropertySources.properties[0].incomeSources[1].original.accountReference='separate-account';
  expect(calculateScheduleE(TaxYearInputSchema.parse(raw)).totalRoyaltyIncome.toFixed()).toBe('23000.75');
});

it('preserves explicit zero expenses and actual source years',()=>{
  const raw=royaltyPropertyFixture();raw.royaltyPropertySources.properties[0].expenses=[];
  expect(calculateScheduleE(TaxYearInputSchema.parse(raw)).totalRoyaltyIncome.toFixed()).toBe('12000.25');
  const next=JSON.parse(JSON.stringify(raw));next.taxpayer.taxYear=2026;next.royaltyPropertySources.sourceTaxYear=2026;
  for(const original of [next.form1099Misc[0],next.royaltyPropertySources.properties[0].incomeSources[0].original]) {
    original.taxYear=2026;original.sourceFormRevision='2026-12';
  }
  expect(calculateScheduleE(TaxYearInputSchema.parse(next)).totalRoyaltyIncome.toFixed()).toBe('12000.25');
  next.royaltyPropertySources.properties[0].incomeSources[0].original.sourceFormRevision='2025-04';
  expect(()=>calculateScheduleE(TaxYearInputSchema.parse(next))).toThrow(/royalt/i);
});
