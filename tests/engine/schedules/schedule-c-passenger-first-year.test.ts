/** Spec: spec/federal/schedule-c-passenger-first-year-sources.yaml. */
import {it,expect} from 'vitest';
function required<T>(value:T|undefined|null):T{if(value===undefined||value===null)throw new Error('Required synthetic fixture or result missing');return value;}
import {TaxYearInputSchema} from '@/models/inputs.js';
import {calculateScheduleC} from '@/engine/schedules/schedule-c.js';
import {calculateScheduleE} from '@/engine/schedules/schedule-e.js';
import {passengerParentFixture} from '../../fixtures/passenger-auto-parent.js';
it('canonical admission requires actual parent income instead of arbitrary standalone income',()=>{
 const input=passengerParentFixture(),before=JSON.stringify(input),parsed=TaxYearInputSchema.parse(input);
 expect(calculateScheduleC(parsed,parsed.scheduleC).netProfit.toString()).toBe('3775');
 expect(JSON.stringify(input)).toBe(before);
});
it('actual direct Schedule C deducts the qualified passenger allocation exactly once',()=>{
 const input=passengerParentFixture(),result=calculateScheduleC(input,input.scheduleC);
 expect(result.depreciationAndSection179Deduction.toString()).toBe('9225');
 expect(result.totalExpenses.toString()).toBe('11225');expect(result.netProfit.toString()).toBe('3775');
});
it('complete canonical Schedule E ignores only the validated business form and deducts nothing',()=>{
 const input=passengerParentFixture(),result=calculateScheduleE(input);expect(result.totalSupplementalIncome.toString()).toBe('0');
});
import Decimal from 'decimal.js';
import {calculateScheduleCSourceFacts} from '@/engine/schedules/schedule-c-source-facts.js';
import {calculateScheduleCPassengerSources} from '@/engine/schedules/schedule-c-passenger-first-year-sources.js';
import {parentProof} from '../../fixtures/passenger-auto-parent.js';
import type {TaxYearInput} from '@/models/inputs.js';
function bindFictionalCurrentBusiness(input:TaxYearInput){const facts=required(required(input.scheduleC).sourceFacts);const {passengerFirstYear:_self,...other}=facts;void _self;parentProof(input).originalBusiness=structuredClone({...input.scheduleC,sourceFacts:other});}
for(const [label,receipts,income,section179,bonus,expectedDepreciation,expectedNet,reported] of [
 ['ordinary exact income boundary','11225','5000','5000',false,'9225','0','5000'],
 ['known zero income','11225','0','0',false,'9225','0','0'],
 ['bonus positive','22000','9775','5000',true,'15225','4775','9775'],
 ['bonus exact income boundary','17225','5000','5000',true,'15225','0','5000'],
 ['raw cents below reporting half','15000.49','8775.49','5000',false,'9225','3775.49','8775'],
 ['raw cents at reporting half','15000.50','8775.50','5000',false,'9225','3775.5','8776'],
 ['raw income above reported maximum','3006225','3000000','5000',false,'9225','2995000','2560000'],
] as const)it(`actual parent reconciles ${label}`,()=>{
 const input=TaxYearInputSchema.parse(passengerParentFixture(receipts,income,section179,bonus)),before=JSON.stringify(input),result=calculateScheduleC(input,input.scheduleC);
 expect(required(result.form4562).line11.toString()).toBe(reported);expect(required(result.form4562).line12.toString()).toBe(section179);expect(result.depreciationAndSection179Deduction.toString()).toBe(expectedDepreciation);expect(result.netProfit.toString()).toBe(expectedNet);
 expect(calculateScheduleCSourceFacts(input,input.scheduleC,result)?.commitment).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(input)).toBe(before);
});
for(const [label,receipts,income,section179,bonus] of [
 ['ordinary half dollar shortfall','11224.50','4999.50','5000',false],
 ['bonus half dollar shortfall','17224.50','4999.50','5000',true],
 ['arbitrary raw PartI income','15000','100000','5000',false],
 ['printed ceiling substituted for raw income','3006225','2560000','5000',false],
 ['known negative final profit remains unsupported','11224.99','0','0',false],
] as const)it(`raw eligibility denies ${label} without rewriting the original election`,()=>{
 const input=passengerParentFixture(receipts,income,section179,bonus),before=JSON.stringify(input);expect(TaxYearInputSchema.safeParse(input).success).toBe(false);expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow();expect(JSON.stringify(input)).toBe(before);
});
it('every permitted cash category contributes once using its exact original classification',()=>{
 const input=passengerParentFixture(),values={advertising:'1000',insurance:'200',legalAndProfessional:'200',officeExpense:'200',supplies:'200',utilities:'200'};
 Object.assign(required(required(input.scheduleC).expenses),values);Object.assign((parentProof(input).amounts as {expenses:object}).expenses,values);bindFictionalCurrentBusiness(input);
 const result=calculateScheduleC(TaxYearInputSchema.parse(input),input.scheduleC);expect(result.totalExpenses.toString()).toBe('11225');expect(result.netProfit.toString()).toBe('3775');
});
it('actual NEC and non-NEC annual cash receipts reconcile once with unique original coverage',()=>{
 const input=passengerParentFixture();input.form1099Nec=[{taxYear:2026,accountHolder:'primary',payer:'Fictional service client',nonemployeeCompensation:'10000',federalWithheld:'0',stateWithheld:'0'}];
 const proof=parentProof(input);proof.nonNecCashReceipts='5000';proof.necRows=[{index:0,originalRecord:structuredClone(input.form1099Nec[0]),sourceReference:'private-nec-source',confirmed:true,actualSameBusinessCashServicesConfirmed:true}];
 const result=calculateScheduleC(TaxYearInputSchema.parse(input),input.scheduleC);expect(result.grossReceipts.toString()).toBe('15000');expect(result.netProfit.toString()).toBe('3775');
 for(const mutate of [(i:TaxYearInput)=>{parentProof(i).nonNecCashReceipts='15000';},(i:TaxYearInput)=>{parentProof(i).necRows=[];},(i:TaxYearInput)=>{i.form1099Nec[0].accountHolder='spouse';},(i:TaxYearInput)=>{i.form1099Nec[0].taxYear=2025;},(i:TaxYearInput)=>{i.form1099Nec.push(structuredClone(i.form1099Nec[0]));}]){const copy=structuredClone(input);mutate(copy);expect(()=>calculateScheduleC(copy,copy.scheduleC)).toThrow();}
});
it('100-character-scale original income remains exact without changing caller Decimal precision',()=>{
 const receipts='15000.000000000000000000000000000000000000000000000000000000000000000000000000000000000001';
 const income='8775.000000000000000000000000000000000000000000000000000000000000000000000000000000000001';
 const input=passengerParentFixture(receipts,income),precision=Decimal.precision,result=calculateScheduleC(TaxYearInputSchema.parse(input),input.scheduleC);
 expect(result.netProfit.toString()).toBe('3775.000000000000000000000000000000000000000000000000000000000000000000000000000000000001');expect(Decimal.precision).toBe(precision);
 expect(required(calculateScheduleCPassengerSources(input,input.scheduleC)).incomeLimit.toString()).toBe(income);
});
it('saved final result cannot trust a source commitment while money or allocation was changed',()=>{
 const input=passengerParentFixture(),result=calculateScheduleC(input,input.scheduleC);
 const mutations=[()=>{result.netProfit=new Decimal('3776');},()=>{result.expenseBreakdown.Advertising=new Decimal('2001');},()=>{result.depreciationAndSection179Deduction=new Decimal('18450');},()=>{required(result.form4562).line12=new Decimal('1');},()=>{required(result.lines.find(row=>row.form==='Sched C'&&row.line==='31')).value=new Decimal('0');}];
 for(const mutate of mutations){const original=calculateScheduleC(input,input.scheduleC);Object.assign(result,original);mutate();expect(()=>calculateScheduleCSourceFacts(input,input.scheduleC,result)).toThrow();}
 const saved=calculateScheduleC(input,input.scheduleC);parentProof(input).ledgerReference='private-new-equal-cash-original';expect(()=>calculateScheduleCSourceFacts(input,input.scheduleC,saved)).toThrow(/stale/);
});
it('actual unexpected benefit adjustment cannot change a qualified parent result',()=>{const input=passengerParentFixture();expect(()=>calculateScheduleC(input,input.scheduleC,{dependentCareBenefitsAdjustment:new Decimal('1')})).toThrow();});
it('numeric parent audit excludes originals and does not mutate the supplied private records',()=>{
 const input=passengerParentFixture(),before=JSON.stringify(input),result=calculateScheduleC(input,input.scheduleC),audit=JSON.stringify(result.lines);
 expect(audit).not.toContain('private-');expect(audit).not.toContain('123-45-6789');expect(audit).not.toContain('1A2345678T1234567');expect(audit).not.toContain('Jane Doe');expect(JSON.stringify(input)).toBe(before);
 expect(required(result.lines.find(row=>row.line==='passenger-parent-income-limit')).value.toString()).toBe('8775');
});
it('indistinguishable duplicate NEC originals require a separate reconciled source method',()=>{
 const input=passengerParentFixture('20000','13775'),nec={taxYear:2026,accountHolder:'primary' as const,payer:'Same fictional client',nonemployeeCompensation:'10000',federalWithheld:'0',stateWithheld:'0'};input.form1099Nec=[structuredClone(nec),structuredClone(nec)];
 const p=parentProof(input);p.nonNecCashReceipts='0';p.necRows=input.form1099Nec.map((originalRecord,index)=>({index,originalRecord:structuredClone(originalRecord),sourceReference:'private-separate-nec-'+index,confirmed:true,actualSameBusinessCashServicesConfirmed:true}));
 expect(()=>calculateScheduleC(input,input.scheduleC)).toThrow();
});

it('lower actual basis uses uncapped regular depreciation in the same parent income equation',()=>{
 const input=TaxYearInputSchema.parse(passengerParentFixture('6800','2000','1000',false,'20000')),result=calculateScheduleC(input,input.scheduleC),form=required(result.form4562);
 expect(form.line12.toString()).toBe('1000');expect(form.line21.toString()).toBe('2800');expect(form.line22.toString()).toBe('3800');expect(form.line11.toString()).toBe('2000');expect(result.netProfit.toString()).toBe('1000');
});
it('finite exact parent arithmetic preserves deliberately low caller precision and rounding',()=>{
 const input=passengerParentFixture('15000.50','8775.50'),precision=Decimal.precision,rounding=Decimal.rounding;
 try{Decimal.set({precision:5,rounding:Decimal.ROUND_DOWN});const result=calculateScheduleC(input,input.scheduleC);expect(result.netProfit.toString()).toBe('3775.5');expect(required(result.form4562).line11.toString()).toBe('8776');expect(Decimal.precision).toBe(5);expect(Decimal.rounding).toBe(Decimal.ROUND_DOWN);}finally{Decimal.set({precision,rounding});}
});

// Spec saved-projection: source acceptance uses the actual entire saved result,
// including detail that does not change the already-checked scalar totals.
it('saved passenger replay rejects changed financial projection detail',()=>{
 const changes:Array<(result:ReturnType<typeof calculateScheduleC>)=>void>=[
  ...(['returnsAndAllowances','netReceipts','costOfGoodsSold','grossProfit','otherIncome'] as const).map(key=>(r:ReturnType<typeof calculateScheduleC>)=>{r[key]=new Decimal('999999');}),
  ...['2','3','4','5','6'].map(line=>(r:ReturnType<typeof calculateScheduleC>)=>{required(r.lines.find(row=>row.form==='Sched C'&&row.line===line)).value=new Decimal('999999');}),
  r=>{required(required(r.form4562).passengerFirstYearWorksheet)['20']=new Decimal('999999');},
  r=>{Object.assign(required(r.form4562),{assetResults:[{description:'Invented',depreciation:new Decimal('999999')}]});},
  r=>{Object.assign(required(r.form4562),{listedPropertyResults:[{description:'Invented',depreciation:new Decimal('999999')}]});},
  r=>{Object.assign(required(r.form4562),{amortizationResults:[{description:'Invented',deduction:new Decimal('999999')}]});},
  r=>{required(r.form4562).midQuarterRequired=true;},
  r=>{required(r.form4562).lines.push({...required(r.form4562).lines[0],value:new Decimal('999999')});},
  r=>{required(r.lines.find(row=>row.form==='Form 4562')).value=new Decimal('999999');},
  r=>{required(r.lines.find(row=>row.line==='passenger-parent-income-limit')).value=new Decimal('999999');},
 ];
 const input=passengerParentFixture(),before=JSON.stringify(input);
 for(const change of changes){const saved=calculateScheduleC(input,input.scheduleC);change(saved);expect(()=>calculateScheduleCSourceFacts(input,input.scheduleC,saved)).toThrow();}
 expect(JSON.stringify(input)).toBe(before);
});
it('saved passenger replay rejects omitted invented typed and audit-input detail',()=>{
 const changes:Array<(result:ReturnType<typeof calculateScheduleC>)=>void>=[
  r=>{delete required(required(r.form4562).passengerFirstYearWorksheet)['20'];},
  r=>{Object.assign(required(required(r.form4562).passengerFirstYearWorksheet),{invented:new Decimal('0')});},
  r=>{Object.assign(r,{returnsAndAllowances:'0'});},
  r=>{required(r.lines.find(row=>row.line==='passenger-parent-income-limit')).formula='Invented formula';},
  r=>{required(r.lines.find(row=>row.form==='Form 4562')).inputs['Invented allocation']=new Decimal('0');},
  r=>{required(r.form4562).lines.reverse();},
 ];
 const input=passengerParentFixture();for(const change of changes){const saved=calculateScheduleC(input,input.scheduleC);change(saved);expect(()=>calculateScheduleCSourceFacts(input,input.scheduleC,saved)).toThrow();}
});
it('saved passenger replay accepts equivalent Decimal values and object key order without input mutation',()=>{
 const input=passengerParentFixture(),before=JSON.stringify(input),saved=calculateScheduleC(input,input.scheduleC);
 saved.returnsAndAllowances=new Decimal('0.00');saved.expenseBreakdown=Object.fromEntries(Object.entries(saved.expenseBreakdown).reverse());
 expect(calculateScheduleCSourceFacts(input,input.scheduleC,saved)).toBeDefined();expect(JSON.stringify(input)).toBe(before);
});

import {vi} from 'vitest';
for(const first of ['sourcefacts','scheduleC'] as const)it(`saved passenger module ${first} first terminates at one fresh replay`,async()=>{
 vi.resetModules();
 if(first==='sourcefacts')await import('@/engine/schedules/schedule-c-source-facts.js');
 else await import('@/engine/schedules/schedule-c.js');
 const sourceModule=await import('@/engine/schedules/schedule-c-source-facts.js'),calculator=await import('@/engine/schedules/schedule-c.js');
 expect(calculator.calculateScheduleC).not.toBe(calculateScheduleC);
 const spy=vi.spyOn(sourceModule,'calculateScheduleCSourceFacts'),input=passengerParentFixture(),before=JSON.stringify(input),precision=Decimal.precision,rounding=Decimal.rounding;
 try{
  const saved=calculator.calculateScheduleC(input,input.scheduleC);expect(spy).toHaveBeenCalledTimes(1);spy.mockClear();
  expect(sourceModule.calculateScheduleCSourceFacts(input,input.scheduleC,saved)).toBeDefined();expect(spy).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(input)).toBe(before);expect(Decimal.precision).toBe(precision);expect(Decimal.rounding).toBe(rounding);
 }finally{spy.mockRestore();}
});
it('saved passenger replay preserves hostile caller precision and actual cents',()=>{
 const input=passengerParentFixture('15000.50','8775.50'),before=JSON.stringify(input),precision=Decimal.precision,rounding=Decimal.rounding;
 try{Decimal.set({precision:3,rounding:Decimal.ROUND_DOWN});const saved=calculateScheduleC(input,input.scheduleC);expect(saved.netProfit.toString()).toBe('3775.5');expect(calculateScheduleCSourceFacts(input,input.scheduleC,saved)).toBeDefined();expect(Decimal.precision).toBe(3);expect(Decimal.rounding).toBe(Decimal.ROUND_DOWN);expect(JSON.stringify(input)).toBe(before);}finally{Decimal.set({precision,rounding});}
});
