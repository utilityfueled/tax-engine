// Spec: spec/federal/form-1099-q-in-kind-k12.yaml. Derived statutory controls.
import { expect,it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { inKindK12Fixture } from '../../fixtures/education-in-kind-k12.js';
const run=(input:ReturnType<typeof inKindK12Fixture>)=>calculateForm1099Q(input.form1099Q,input.qualifiedEducationExpenses,{taxYear:input.taxpayer.taxYear});
it('keeps actual prepaid benefits outside the cash-only annual cap',()=>{
 for(const year of [2025,2026]){
  const input=inKindK12Fixture(year),before=JSON.stringify(input),result=run(input);
  expect(result.perDistribution.map(row=>row.educationExpenseExcludedEarnings.toFixed())).toEqual(['800','200']);
  expect(result.taxFreeEarnings.toFixed()).toBe('1000');expect(result.taxableEarnings.toFixed()).toBe('200');expect(result.netPenalty.toFixed()).toBe('20');
  expect(result.lines.find(row=>row.line==='educator:k12-qualified')?.value.toFixed()).toBe('1000');expect(JSON.stringify(input)).toBe(before);
  const reverse=structuredClone(input);reverse.form1099Q.reverse();expect(run(reverse).taxableEarnings.toFixed()).toBe('200');
 }
 const large=inKindK12Fixture(),facts=large.qualifiedEducationExpenses!.sourceFacts!;
 large.form1099Q=[{...large.form1099Q[0],grossDistribution:'40000',earnings:'8000',basis:'32000'}];
 facts.expenses![0].amount='40000';facts.inKindBenefits![0].amount='40000';facts.allocations=[{sourceId:'prepaid',expenseId:'tuition',amount:'40000',creditAmount:'0'}];
 expect(run(large).taxFreeEarnings.toFixed()).toBe('8000');expect(run(large).taxableEarnings.toFixed()).toBe('0');
});
it('rejects unverified plan and outside-cash source facts',()=>{
 const base=inKindK12Fixture();base.qualifiedEducationExpenses!.sourceFacts!.beneficiaries![0].outsideK12QualifiedDistributions='0';
 for(const key of ['prepaidPlanSponsor','prepaidPlanQualifiedConfirmed','prepaidTuitionCreditRedeemed','prepaidPlanSourceReference']){
  for(const value of [undefined,false,'']){
   const input=structuredClone(base),benefit=input.qualifiedEducationExpenses!.sourceFacts!.inKindBenefits![0] as Record<string,unknown>;benefit[key]=value;
   expect(()=>run(input)).toThrow(/prepaid|program|credit|source/i);
  }
 }
 for(const value of [undefined,false]){
  const input=structuredClone(base);Object.assign(input.qualifiedEducationExpenses!.sourceFacts!.beneficiaries![0],{outsideK12CashOnlyConfirmed:value});
  expect(()=>run(input)).toThrow(/cash|source/i);
 }
 const institution=structuredClone(base),benefit=institution.qualifiedEducationExpenses!.sourceFacts!.inKindBenefits![0];
 Object.assign(benefit,{prepaidPlanSponsor:'eligible_educational_institutions'});expect(()=>run(institution)).toThrow(/trust|determination/i);
 Object.assign(benefit,{prepaidInstitutionQualifiedTrustConfirmed:true,prepaidInstitutionDeterminationReference:'Synthetic original IRS determination'});
 expect(run(institution).taxableEarnings.toFixed()).toBe('0');
 const cash=structuredClone(base);cash.form1099Q[0].distributionMedium='cash';expect(()=>run(cash)).toThrow(/in-kind|benefit/i);
});
it('preserves cash rounding and actual category dates',()=>{
 for(const [outside,taxable] of [['19002.50','200'],['19002.51','201']]){
  const input=inKindK12Fixture();input.qualifiedEducationExpenses!.sourceFacts!.beneficiaries![0].outsideK12QualifiedDistributions=outside;
  expect(run(input).taxableEarnings.toFixed()).toBe(taxable);
 }
 const ineligible=inKindK12Fixture(),facts=ineligible.qualifiedEducationExpenses!.sourceFacts!;
 facts.expenses![0].qualificationConfirmed=false;facts.inKindBenefits![0].qualificationConfirmed=false;
 expect(run(ineligible).taxableEarnings.toFixed()).toBe('1200');
 const expanded=inKindK12Fixture(2025);expanded.qualifiedEducationExpenses!.sourceFacts!.expenses![0].category='k12_books';
 for(const date of ['2025-07-04','2025-07-05']){
  expanded.form1099Q.forEach(form=>{form.distributionDate=date;});
  expanded.qualifiedEducationExpenses!.sourceFacts!.inKindBenefits![0].providedDate=date;
  expanded.qualifiedEducationExpenses!.sourceFacts!.expenses![0].paidDate=date;
  expect(run(expanded).taxableEarnings.toFixed()).toBe(date==='2025-07-04'?'1200':'200');
 }
});
it('binds expanded eligibility to the actual furnished benefit dates',()=>{
 const original=inKindK12Fixture(2025);original.qualifiedEducationExpenses!.sourceFacts!.expenses![0].category='k12_books';
 const conflict=structuredClone(original);conflict.qualifiedEducationExpenses!.sourceFacts!.inKindBenefits![0].providedDate='2025-07-04';
 expect(()=>run(conflict)).toThrow(/date|timing|conflict/);
 conflict.form1099Q[0].distributionDate=undefined;conflict.form1099Q[0].allDistributionsAfterJuly42025=true;
 expect(()=>run(conflict)).toThrow(/date|timing|conflict/);
 conflict.form1099Q[0].allDistributionsAfterJuly42025=undefined;
 expect(run(conflict).perDistribution.find(row=>row.sourceId==='prepaid')?.educationExpenseExcludedEarnings.toFixed()).toBe('0');
 expect(run(conflict).taxableEarnings.toFixed()).toBe('1000');
 const late=structuredClone(original);late.form1099Q[0].distributionDate=undefined;
 late.qualifiedEducationExpenses!.sourceFacts!.inKindBenefits![0].providedDate='2025-07-05';
 expect(run(late).taxableEarnings.toFixed()).toBe('200');
 const mixed=structuredClone(late),benefits=mixed.qualifiedEducationExpenses!.sourceFacts!.inKindBenefits!;
 benefits[0].amount='2000';benefits.push({...benefits[0],id:'early-benefit',providedDate:'2025-07-04',sourceReference:'Actual second provided benefit'});
 expect(()=>run(mixed)).toThrow(/mixed|timing|date/);
 benefits[1].providedDate='2025-07-06';expect(run(mixed).taxableEarnings.toFixed()).toBe('200');
});
