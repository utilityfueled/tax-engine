/** Spec: state/pa-ordinary-employee-independent.yaml. Independent literal controls. */
import Decimal from 'decimal.js';
import { isDeepStrictEqual } from 'node:util';
import { expect, it } from 'vitest';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculatePAOrdinaryEmployeeSources } from '@/engine/state/pa-ordinary-employee-sources';
import { calculatePAResidencySources } from '@/engine/state/pa-residency-sources';
import { calculatePAOrdinaryReturnFacts } from '@/engine/state/pa-ordinary-return-facts';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return';
import { paOrdinaryEmployeeFixture, paOrdinaryEmployeeReturnFixture } from '../../fixtures/pa-ordinary-employee-sources';
type Fixture = ReturnType<typeof paOrdinaryEmployeeFixture>;
function row(f: Fixture) { const r = f.packet.employers[0]; if (!r) throw new Error('Independent synthetic employer missing'); return r; }
function first(f: Fixture) { const r = calculatePAOrdinaryEmployeeSources(f.input, f.packet).perEmployer[0]; if (!r) throw new Error('Independent employer result missing'); return r; }
function reimburse(f: Fixture, method: 'exact_accounted_not_w2'|'fixed_allowance_not_w2', amount: string, copies=1) {
 const r=row(f); const refs=r.ue.expenses.map(e=>e.sourceReference);
 r.ue.reimbursements=Array.from({length:copies},(_,i)=>({sourceReference:`Independent actual reimbursement ${i+1}`,paidOn:'2025-05-01',amount,method,expenseReferences:[...refs],includedInW2Confirmed:false}));
 for(const e of r.ue.expenses){e.reimbursementMethod=method;e.reimbursementReferences=r.ue.reimbursements.map(x=>x.sourceReference);}
}
function reject(f: Fixture) { expect(()=>calculatePAOrdinaryEmployeeSources(f.input,f.packet)).toThrow(/actual|source|original|work|calendar|payroll|expense|reimburse|method|known/i); }
it('independent actual employee all3 literals preserve originals and readiness',()=>{
 for(const [status,gross,ue,net,tax,outside]of [['resident','75000','1000','74000','2272','0'],['part_year','27000','360','26640','818','47360'],['nonresident','27000','360','26640','818','47360']]as const){
  const f=paOrdinaryEmployeeReturnFixture(status),before=structuredClone(f),a=calculatePAResidencySources(f.input,f.residency),p=calculatePAOrdinaryReturnFacts(f.input,f.facts),r=calculatePAOrdinaryReturn(f.input,f.facts,f.sources);
  expect([a.reportedCompensation,a.unreimbursedEmployeeExpenses,a.totalOrdinaryPATaxableIncome,a.taxBeforeCredits].map(n=>n.toFixed())).toEqual([gross,ue,net,tax]);
  expect(p.spOutsidePAIncome.toFixed()).toBe(outside);expect(p.actualPAServiceCompensation.toFixed()).toBe('26640');expect(r.pa40.taxDue.toFixed()).toBe(tax);expect(r.readiness.filingEligible).toBe(false);expect(f).toEqual(before);
 }
});
it('independent actual employee calendar has90 PA160 outside and10 actual leave',()=>{const f=paOrdinaryEmployeeFixture(),r=first(f);expect([r.calendarDays,r.nonworkingDays,r.workingDays,r.paWorkingDays]).toEqual([260,10,250,90]);expect(r.workingDayFraction.toFixed(6)).toBe('0.360000');expect([r.rawGrossCompensation,r.rawPAServiceCompensation,r.rawAllowableExpenses,r.rawPAAllowableExpenses].map(n=>n.toFixed())).toEqual(['75000','27000','1000','360']);});
it('independent actual employee fixed allowance gap is nondeductible',()=>{const f=paOrdinaryEmployeeFixture();reimburse(f,'fixed_allowance_not_w2','600');expect(first(f).scheduleUE.lineJ.toFixed()).toBe('0');});
it('independent actual employee exact receipt reimbursement is nondeductible',()=>{const f=paOrdinaryEmployeeFixture();reimburse(f,'exact_accounted_not_w2','1000');expect(first(f).scheduleUE.lineJ.toFixed()).toBe('0');});
it('independent actual employee fixed allowance excess requires its unsupported taxable-excess method',()=>{const f=paOrdinaryEmployeeFixture();reimburse(f,'fixed_allowance_not_w2','1500');reject(f);});
it('independent actual employee multiple exact originals cannot hide aggregate taxable excess',()=>{const f=paOrdinaryEmployeeFixture();reimburse(f,'exact_accounted_not_w2','1000',2);reject(f);});
it('independent actual employee unknown original Box8 cannot be supplied by confirmation flag',()=>{const f=paOrdinaryEmployeeFixture();Reflect.deleteProperty(f.input.w2s[0],'allocatedTips');row(f).originalW2=structuredClone(f.input.w2s[0]);const admitted=TaxYearInputSchema.parse(f.input);expect(admitted.w2s[0].allocatedTips).toBeUndefined();f.input=admitted;reject(f);});
it('independent actual employee current owner edit rejects equal money',()=>{const f=paOrdinaryEmployeeFixture();f.input.taxpayer.primary.ssn='987-65-4321';reject(f);});
it('independent actual employee current employer edit rejects equal money',()=>{const f=paOrdinaryEmployeeFixture();f.input.w2s[0].employer.name='Independent edited employer';reject(f);});
it('independent actual employee incomplete signature and full-calendar proofs reject',()=>{for(const key of ['signed','documentAvailableConfirmed','fullCalendarAndOutsideDaysVerifiedConfirmed']as const){const f=paOrdinaryEmployeeFixture();row(f).statement[key]=null;reject(f);}});
it('independent actual employee missing or duplicate actual calendar dates reject',()=>{for(const duplicate of [false,true]){const f=paOrdinaryEmployeeFixture();if(duplicate)row(f).calendar[10].date=row(f).calendar[11].date;else row(f).calendar.splice(10,1);reject(f);}});
it('independent actual employee nonworking locations cannot fabricate work',()=>{const f=paOrdinaryEmployeeFixture();row(f).calendar[0].locations=[structuredClone(row(f).calendar[10].locations[0])];reject(f);});
it('independent actual employee transit never becomes compensable physical work',()=>{const f=paOrdinaryEmployeeFixture();row(f).calendar[10].travelClassification='transit_only';reject(f);});
it('independent actual employee convenience work counts as PA with suitable PA workplace',()=>{const f=paOrdinaryEmployeeFixture();row(f).calendar[100].locations[0].employerRequiredOutsideWork=false;const r=first(f);expect(r.paWorkingDays).toBe(91);expect(r.workingDayFraction.toFixed(6)).toBe('0.364000');expect(r.rawPAServiceCompensation.toFixed()).toBe('27300');expect(r.scheduleNRH.line16.toFixed()).toBe('364');expect(r.scheduleNRH.line22.toFixed()).toBe('26936');});
it('independent actual employee unknown outside necessity rejects',()=>{const f=paOrdinaryEmployeeFixture();row(f).calendar[100].locations[0].employerRequiredOutsideWork=null;reject(f);});
it('independent actual employee missing payroll day and original gross mismatch reject',()=>{for(const badDate of [false,true]){const f=paOrdinaryEmployeeFixture();if(badDate)row(f).payroll[0].serviceThrough='2025-09-16';else row(f).payroll[0].grossCompensation='75000.01';reject(f);}});
it('independent actual employee future signature and expenses reject',()=>{for(const signature of [false,true]){const f=paOrdinaryEmployeeFixture();if(signature)row(f).statement.signedOn='2026-02-02';else row(f).ue.expenses[0].paidOn='2026-01-01';reject(f);}});
it('independent actual employee unknown eligible expense status and wrong category reject',()=>{for(const category of [false,true]){const f=paOrdinaryEmployeeFixture();if(category)row(f).ue.expenses[0].category='education';else row(f).ue.expenses[0].actuallyPaidConfirmed=null;reject(f);}});
it('independent actual employee semantic receipts remain distinct and reimbursements cannot disappear',()=>{for(const reimbursement of [false,true]){const f=paOrdinaryEmployeeFixture();if(reimbursement){reimburse(f,'exact_accounted_not_w2','1000');row(f).ue.expenses[0].reimbursementReferences=[];}else row(f).ue.expenses[1].receiptReference=row(f).ue.expenses[0].receiptReference;reject(f);}});
it('independent actual employee raw receipts preserve mixed integer and fractional span',()=>{const f=paOrdinaryEmployeeFixture(),r=row(f);r.ue.expenses=r.ue.expenses.slice(0,2);r.ue.expenses[0].amount='1'+'0'.repeat(140);r.ue.expenses[1].amount='0.'+'0'.repeat(140)+'1';expect(first(f).rawAllowableExpenses.toFixed()).toBe('1'+'0'.repeat(140)+'.'+'0'.repeat(140)+'1');});
it('independent actual employee fresh repeats use stable Decimal outputs and keep global context',()=>{const f=paOrdinaryEmployeeFixture(),before=structuredClone(f),precision=Decimal.precision,rounding=Decimal.rounding;const a=calculatePAOrdinaryEmployeeSources(f.input,f.packet),b=calculatePAOrdinaryEmployeeSources(f.input,f.packet);expect(isDeepStrictEqual(a,b)).toBe(true);expect(a.perEmployer[0].rawGrossCompensation.constructor).toBe(Decimal);expect(f).toEqual(before);expect([Decimal.precision,Decimal.rounding]).toEqual([precision,rounding]);});
it('independent actual employee private owner and receipt metadata do not enter projection',()=>{const f=paOrdinaryEmployeeFixture();row(f).ue.expenses[0].description='Independent private receipt metadata912-34-5678';const text=JSON.stringify(calculatePAOrdinaryEmployeeSources(f.input,f.packet));expect(text).not.toContain(f.input.taxpayer.primary.ssn);expect(text).not.toContain('912-34-5678');expect(text).not.toContain(row(f).statement.signerName);expect(calculatePAOrdinaryEmployeeSources(f.input,f.packet).sourceCommitment).toMatch(/^[a-f0-9]{64}$/);});
it('independent actual employee source commitment binds receipt date despite unchanged amount',()=>{const f=paOrdinaryEmployeeFixture(),a=calculatePAOrdinaryEmployeeSources(f.input,f.packet).sourceCommitment;row(f).ue.expenses[0].paidOn='2025-04-22';expect(calculatePAOrdinaryEmployeeSources(f.input,f.packet).sourceCommitment).not.toBe(a);});
it('independent actual employee per-employer UE cannot offset another employer wages',()=>{
 const f=paOrdinaryEmployeeFixture(),firstRow=row(f),second=structuredClone(firstRow),secondW2=structuredClone(f.input.w2s[0]),secondWage=structuredClone(f.residency.wages[0]);
 firstRow.ue.expenses=firstRow.ue.expenses.slice(0,1);firstRow.ue.expenses[0].amount='80000';
 second.originalIndex=1;second.sourceReference='Independent separate actual employer';secondW2.employer={name:'Independent second instrument employer',ein:'98-7654321'};second.originalW2=structuredClone(secondW2);second.employer.name=secondW2.employer.name;second.employer.ein=secondW2.employer.ein;
 for(const e of second.ue.expenses){e.sourceReference='Second '+e.sourceReference;e.receiptReference='Second '+e.receiptReference;}
 secondWage.sourceReference='Independent separate actual residency wage original';secondWage.originalIndex=1;secondWage.original=structuredClone(secondW2);f.input.w2s.push(secondW2);f.packet.employers.push(second);f.residency.wages.push(secondWage);
 const result=calculatePAResidencySources(f.input,f.residency);expect(result.reportedCompensation.toFixed()).toBe('54000');expect(result.unreimbursedEmployeeExpenses.toFixed()).toBe('27360');expect(result.totalOrdinaryPATaxableIncome.toFixed()).toBe('26640');expect(result.taxBeforeCredits.toFixed()).toBe('818');
});
