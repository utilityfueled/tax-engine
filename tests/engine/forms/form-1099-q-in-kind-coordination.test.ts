// Spec: spec/federal/form-1099-q-in-kind-coordination.yaml.
import { expect,it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { inKindCoordinationFixture } from '../../fixtures/education-in-kind-coordination.js';
const calculate=(input:ReturnType<typeof inKindCoordinationFixture>)=>calculateForm1099Q(input.form1099Q,input.qualifiedEducationExpenses,{taxYear:input.taxpayer.taxYear,taxpayer:input.taxpayer,educationExpenses:input.educationExpenses});
const resultValues=(input:ReturnType<typeof inKindCoordinationFixture>)=>{const r=calculate(input);return [r.taxFreeEarnings,r.taxableEarnings,r.penaltyExceptionAmount,r.netPenalty].map(v=>v.toFixed());};
it('coordinates actual assistance and credit without inventing an exception',()=>{
 for(const year of [2025,2026]){
  const input=inKindCoordinationFixture(year,false),before=JSON.stringify(input);
  expect(resultValues(input)).toEqual(['400','400','200','20']);expect(JSON.stringify(input)).toBe(before);
  const facts=input.qualifiedEducationExpenses?.sourceFacts;if(!facts)throw new Error('Missing source');
  facts.penaltyExceptions=[{id:'actual-scholarship',sourceId:'prepaid',kind:'scholarship',qualifyingAmount:'1000',distributionAmount:'1000',eligibilityConfirmed:true}];
  expect(()=>calculate(input)).toThrow(/distinct|credit/i);
  facts.exceptionsDistinctFromCreditConfirmed=true;expect(resultValues(input)).toEqual(['400','400','400','0']);
  facts.penaltyExceptions[0].eligibilityConfirmed=false;expect(resultValues(input)).toEqual(['400','400','200','20']);
  facts.penaltyExceptions[0].eligibilityConfirmed=undefined;expect(()=>calculate(input)).toThrow(/eligib|confirm/i);
 }
 for(const [assistance,allocation,excluded,taxable] of [['1002.50','1997.50','400','400'],['1002.51','1997.49','399','401']]){
  const input=inKindCoordinationFixture(2025,false),facts=input.qualifiedEducationExpenses?.sourceFacts;
  if(!facts?.expenses?.[0]||!facts.allocations?.[0])throw new Error('Missing source');
  facts.expenses[0].taxFreeAssistance=assistance;facts.allocations[0].amount=allocation;
  expect(resultValues(input)).toEqual([excluded,taxable,'200','20']);
 }
});
it('uses the actual single-expense ESA election without reassigning costs',()=>{
 for(const [qtp,esa,excluded] of [['2000','6000',['400','1200']],['4000','4000',['800','800']]] as const){
  const input=inKindCoordinationFixture(),facts=input.qualifiedEducationExpenses?.sourceFacts,expense=facts?.expenses?.[0];
  if(!facts?.allocations?.[1]||!expense)throw new Error('Missing source');
  expense.taxFreeAssistance='0';expense.educationCreditAmount='0';facts.allocations[0].amount=qtp;facts.allocations[0].creditAmount='0';facts.allocations[1].amount=esa;input.educationExpenses=undefined;
  const before=JSON.stringify(input),r=calculate(input);expect(r.perDistribution.map(row=>row.taxFreeEarnings.toFixed())).toEqual(excluded);
  expect([r.taxableEarnings,r.netPenalty].map(v=>v.toFixed())).toEqual(['400','40']);expect(JSON.stringify(input)).toBe(before);
 }
 // Different actual earnings ratios make the taxpayer's allocation affect total income.
 for(const [qtp,esa,taxable,tax] of [['2000','6000','400','40'],['4000','4000','600','60']]){
  const input=inKindCoordinationFixture(),facts=input.qualifiedEducationExpenses?.sourceFacts;
  if(!facts?.expenses?.[0]||!facts.allocations?.[1]||!facts.coverdellAccounts?.[0])throw new Error('Missing source');
  facts.expenses[0].taxFreeAssistance='0';facts.expenses[0].educationCreditAmount='0';
  facts.allocations[0].amount=qtp;facts.allocations[0].creditAmount='0';facts.allocations[1].amount=esa;
  facts.coverdellAccounts[0].priorYearBasis='4200';input.form1099Q[1].basis='4200';input.form1099Q[1].earnings='1800';input.educationExpenses=undefined;
  const result=calculate(input);expect([result.taxableEarnings,result.netPenalty].map(v=>v.toFixed())).toEqual([taxable,tax]);
 }
});
it('conserves shared tuition reductions and exact source allocations',()=>{
 const input=inKindCoordinationFixture(),before=JSON.stringify(input);
 expect(resultValues(input)).toEqual(['1200','800','200','60']);
 const r=calculate(input);expect(r.perDistribution.map(row=>[row.taxFreeEarnings,row.taxableEarnings,row.creditException].map(v=>v.toFixed()))).toEqual([['200','600','200'],['1000','200','0']]);
 expect(JSON.stringify(input)).toBe(before);expect(resultValues({...input,form1099Q:[...input.form1099Q].reverse()})).toEqual(['1200','800','200','60']);
 const outside=inKindCoordinationFixture(),outsideFacts=outside.qualifiedEducationExpenses?.sourceFacts;
 if(!outsideFacts?.beneficiaries?.[0]||!outside.educationExpenses?.llcStudents?.[0])throw new Error('Missing student');
 outsideFacts.beneficiaries[0].studentTaxId='222-33-4444';outside.educationExpenses.llcStudents[0].studentTaxId='222-33-4444';
 for(const statement of outside.form1099Q){statement.recipientOwner='other';statement.recipientId='actual-outside-student';}
 const outsideResult=calculate(outside);expect([outsideResult.taxableEarnings,outsideResult.netPenalty].map(v=>v.toFixed())).toEqual(['0','0']);
 expect(outsideResult.perRecipient[0]?.taxableEarnings.toFixed()).toBe('800');expect(outsideResult.perRecipient[0]?.additionalTax.toFixed()).toBe('60');
 for(const change of ['4999.99','5000.01']){
  const changed=inKindCoordinationFixture(),allocation=changed.qualifiedEducationExpenses?.sourceFacts?.allocations?.[1];if(!allocation)throw new Error('Missing allocation');allocation.amount=change;expect(()=>calculate(changed)).toThrow(/allocat|expense|tuition/);
 }
});
it('rejects invented or conflicting ESA tuition source groups',()=>{
 for(const mutation of ['history','recipient','extra-source','extra-expense','transfer','unknown-assistance','unknown-refund','credit','year','qualified','category','missing-allocation']){
  const input=inKindCoordinationFixture(),facts=input.qualifiedEducationExpenses?.sourceFacts,expense=facts?.expenses?.[0],source=input.form1099Q[1];
  if(!facts?.allocations||!expense||!source)throw new Error('Missing sources');
  if(mutation==='history')facts.coverdellAccounts=[];
  if(mutation==='recipient'){source.recipientOwner='other';source.recipientId='conflicting-recipient';}
  if(mutation==='extra-source')input.form1099Q.push({...source,sourceId:'extra',accountId:'extra'});
  if(mutation==='extra-expense')facts.expenses?.push({...expense,id:'extra',amount:'0',taxFreeAssistance:'0',educationCreditAmount:'0'});
  if(mutation==='transfer')source.transfer={kind:'qtp'};
  if(mutation==='unknown-assistance')expense.taxFreeAssistance=undefined;
  if(mutation==='unknown-refund')expense.refundedAmount=undefined;
  if(mutation==='credit')facts.allocations[1].creditAmount='0.01';
  if(mutation==='year')source.taxYear=2025;
  if(mutation==='qualified')expense.qualificationConfirmed=false;
  if(mutation==='category')expense.category='postsecondary_room_board';
  if(mutation==='missing-allocation')facts.allocations.pop();
  expect(()=>calculate(input),mutation).toThrow();
 }
});
