// Spec: spec/federal/form-2210-schedule-ai.yaml special-rate-period-sources.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateForm2210ScheduleAi } from '@/engine/forms/form-2210-schedule-ai.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { fillForm2210 } from '@/pdf/mappings/2025/fill-form-2210.js';
import { syntheticScheduleDSpecialGainInput } from '../../fixtures/schedule-d-special-gains.js';

const period = (adjustedGrossIncome: string, rate28GainLoss: string, unrecaptured1250BeforeLosses: string, netCapitalGain = '10000') => ({ adjustedGrossIncome, qualifiedDividends:'0', netCapitalGain,
  rate28GainLoss, unrecaptured1250BeforeLosses, itemizedDeductions:'0',qbiDeduction:'0',netProfitFromSelfEmployment:'0',socialSecurityWages:'0',otherTaxes:'0',credits:'0' });
const rows = () => [period('30000','-250','500'),period('60000','0','1000'),period('120000','750','1500'),period('200000','1000','2000')];
const run = (periods=rows(), patch: Record<string,unknown>={}) => calculateForm2210ScheduleAi({ taxYear:2025,filingStatus:'single',requiredAnnualPayment:new Decimal('30000'),taxAfterRefundableCredits:new Decimal('36437'),
  returnContext:{standardDeduction:new Decimal('15750'),agi:new Decimal('200000'),taxableIncome:new Decimal('184250'),preferentialIncome:true,selfEmployedOwners:0,specialTaxMethod:false,
    specialRatePreferentialIncome:{qualifiedDividends:new Decimal('0'),netCapitalGain:new Decimal('10000'),rate28GainLoss:new Decimal('1000'),unrecaptured1250BeforeLosses:new Decimal('2000')}},
  facts:{annualizedIncomePeriods:periods,specialRatePeriodsConfirmed:true},...patch });
const line=(result:ReturnType<typeof run>,id:string)=>result.lines.find(row=>row.line===id)?.value.toFixed();

it('annualizes actual signed special sources and binds every full-year component',()=>{
 const result=run();
 expect(['a','b','c','d'].map(c=>line(result,`14-rate28-gain-loss-${c}`))).toEqual(['-1000','0','1125','1000']);
 expect(['a','b','c','d'].map(c=>line(result,`14-unrecaptured1250-before-losses-${c}`))).toEqual(['2000','2400','2250','2000']);
 expect(line(result,'14-section1250-gain-a')).toBe('1000');
 expect(line(result,'14-collectibles-gain-a')).toBe('0');
 for(const key of ['qualifiedDividends','netCapitalGain','rate28GainLoss','unrecaptured1250BeforeLosses'] as const){
  const changed=rows(); changed[3]![key]=new Decimal(changed[3]![key]).plus('.01').toFixed();
  expect(()=>run(changed),key).toThrow(/each reconcile/);
 }
 for(const key of ['rate28GainLoss','unrecaptured1250BeforeLosses'] as const){
  const missing=rows(); delete (missing[1]! as Partial<typeof missing[number]>)[key];
  expect(()=>run(missing),key).toThrow(/actual/);
 }
 expect(()=>run(rows(),{facts:{annualizedIncomePeriods:rows()}})).toThrow(/confirmed special/);
 expect(()=>run(rows(),{returnContext:{standardDeduction:new Decimal(15750),agi:new Decimal(200000),taxableIncome:new Decimal(184250),preferentialIncome:true,selfEmployedOwners:0,specialTaxMethod:true}})).toThrow(/separate tax method|special/);
});

it('reconciles signed collectible netting with actual short losses and carryovers from canonical sources',async()=>{
 const original=syntheticScheduleDSpecialGainInput(2025);
 original.priorYear!.longTermCapitalLoss='-100';
 original.scheduleDSpecialGainSources!.priorLongTermCapitalLoss='-100';
 original.form1099Div.push({payer:'Fictional ordinary dividend source',ordinaryDividends:'1000',qualifiedDividends:'500',totalCapitalGainDistributions:'0',section1250Gain:'0',section1202Gain:'0',collectiblesGain:'0',nondividendDistributions:'0',federalWithheld:'0',section199ADividends:'0',foreignTaxPaid:'0',exemptInterestDividends:'0',stateWithheld:'0'});
 original.scheduleDSpecialGainSources!.reportedGains.push({sourceId:'form1099Div:0',sourceTaxYear:2025,sourceReference:'Fictional complete capital zero original',payerName:'Fictional ordinary dividend source',accountHolder:'primary',netLongTermCapitalGain:'0',collectiblesGain:'0',unrecapturedSection1250Gain:'0',section1202Gain:'0'});
 original.w2s[0]!.federalWithheld='0';
 const completed=calculateFederalTax(original), child=completed.scheduleD.specialGainWorksheets!;
 const signed=Decimal.sum(...child.lines.filter(row=>row.form==='28% Rate Gain Worksheet'&&/^[1-6]$/.test(row.line)).map(row=>row.value)).toFixed();
 expect(signed).toBe('-370');
 const before=child.lines.find(row=>row.form==='Unrecaptured Section1250 Gain Worksheet'&&row.line==='13')!.value.toFixed();
 const gain=Decimal.max(0,Decimal.min(completed.scheduleD.netLongTerm,completed.scheduleD.netCapitalGainLoss)).toFixed();
 const last=period(completed.agi.toFixed(),signed,before,gain);
 last.qualifiedDividends='500';
 last.otherTaxes=completed.form8814!.totalTax.toFixed();
 const input=TaxYearInputSchema.parse({...original,form2210:{calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,
  withholdingMethod:'equal-installments',priorYearTaxStatus:'no-return',calculationMethod:'annualized',specialRatePeriodsConfirmed:true,
  annualizedIncomePeriods:[period('0','0','0','0'),period('0','0','0','0'),period('0','0','0','0'),last]}});
 const result=calculateFederalTax(input);expect(result.form2210?.scheduleAi).toBeDefined();
 const doc=await fillForm2210(input,result,'forms/blank/2025/f2210.pdf');
 const tax=result.form2210!.lines.find(row=>row.form==='Form 2210 Schedule AI'&&row.line==='14d')!.value.toFixed(0);
 expect(doc.getForm().getTextField('topmostSubform[0].Page3[0].Part1Table[0].Line14[0].f3_56[0]').getText()).toBe(tax);
 const stale=structuredClone(input);stale.form2210!.annualizedIncomePeriods![3]!.rate28GainLoss='-369.99';
 await expect(fillForm2210(stale,result,'/nonexistent-template-must-not-open.pdf')).rejects.toThrow(/original|reconcile/);
 const noIdentity=structuredClone(input);noIdentity.taxpayer.primary.ssn='';
 await expect(fillForm2210(noIdentity,result,'/nonexistent-template-must-not-open.pdf')).rejects.toThrow(/preferential review.*original/);
});
