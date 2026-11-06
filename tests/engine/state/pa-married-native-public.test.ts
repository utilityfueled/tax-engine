/** Spec: spec/state/pa-married-native-public.yaml. Existing public entry, no substitute dispatch. */
import {expect,it} from 'vitest';
import {calculatePAReturn,calculateFederalTax} from '@/index';
import type {TaxYearInput} from '@/models/inputs';
import {calculatePAMarriedOrdinaryReturn,type PAMarriedOrdinaryReturnResult} from '@/engine/state/pa-married-ordinary-return';
import {requiredNative,paMarriedNativePublicFixture,type NativeMarriedCase} from '../../fixtures/pa-married-native-public';
const literalCases=[
 ['whole','J',[['joint','80000','2456','2456','0','0']]],
 ['whole','M',[['primary','50000','1535','1535','0','0'],['spouse','30000','921','921','0','0']]],
 ['cents','J',[['joint','80001','2456','2457','0','1']]],
 ['cents','M',[['primary','50000','1535','1535','0','0'],['spouse','30000','921','921','0','0']]],
 ['shared-sp','J',[['joint','13001','399','399','359','359']]],
 ['shared-sp','M',[['primary','10000','307','307','276','276'],['spouse','3001','92','92','83','83']]],
]as const;
function attached(mode:'J'|'M'='M',name:NativeMarriedCase='whole'){const f=paMarriedNativePublicFixture(mode,name);f.input.paMarriedOrdinarySources=f.sources;return f;}
function actual(input:TaxYearInput):PAMarriedOrdinaryReturnResult{const result:unknown=calculatePAReturn(input);expect(result).toHaveProperty('methodVersion','pa-married-ordinary-return-v1');expect(result).not.toHaveProperty('pa40');expect(result).toHaveProperty('returns');return result as PAMarriedOrdinaryReturnResult;}
it.each(literalCases)('PA existing public J/M entry preserves six literal owner results %s %s',(name,mode,expected)=>{
 const f=attached(mode,name),before=JSON.stringify(f.input),federal=calculateFederalTax(f.input);const result=actual(f.input);
 expect(result.filingMode).toBe(mode);expect(result.returns.map(r=>[r.accountHolder,r.pa40.compensation.toString(),r.pa40.taxLiability.toString(),r.pa40.stateWithholding.toString(),r.scheduleSP.taxForgivenessCredit.toString(),r.pa40.netOverpayment.toString()])).toEqual(expected);
 expect(result.returns.every(r=>r.pa40.taxDue.isZero())).toBe(true);expect(result.federal.filingStatus).toBe('married_filing_jointly');expect(result.federal.adjustedGrossIncome.toString()).toBe(federal.agi.toString());expect(result.federal.earnedIncomeCredit.toString()).toBe('0');expect(result.returns.map(r=>r.refundDisposition.refund.toString())).toEqual(expected.map(row=>row[5]));expect(JSON.stringify(f.input)).toBe(before);
 if(name==='shared-sp')for(const r of result.returns){expect(r.scheduleSP.eligibilityIncome.toString()).toBe('13001');expect(r.scheduleSP.forgivenessPercentage.toString()).toBe('90');}
 if(name==='cents')expect(result.perOwner.map(r=>r.rawCompensation.toString())).toEqual(['50000.25','30000.25']);
});
const invalid:[string,(f:ReturnType<typeof attached>)=>void][]=[
 ['missing choice',f=>{f.sources.filingMode='';}],
 ['unknown source year',f=>{f.sources.sourceTaxYear=null;}],
 ['unconfirmed packet',f=>{f.sources.sourceFactsConfirmed=null;}],
 ['missing actual spouse',f=>{delete f.input.taxpayer.spouse;}],
 ['stale primary identity',f=>{f.input.taxpayer.primary.firstName='Changed actual name';}],
 ['stale spouse identity',f=>{requiredNative(f.input.taxpayer.spouse).ssn='900-70-0499';}],
 ['same-dollar owner reassignment',f=>{f.input.w2s[0].accountHolder='spouse';}],
 ['raw-cent original change',f=>{f.input.w2s[0].wages='50000.01';}],
 ['unknown payroll amount',f=>{f.sources.wages[1].payroll[0].grossCompensation='';}],
 ['unknown worldwide income',f=>{f.sources.owners[1].sp.categories['5'].status='';}],
 ['unknown owner account',f=>{f.sources.owners[1].payments.priorCreditStatus='';}],
 ['duplicate original wage',f=>{f.sources.wages.push(structuredClone(f.sources.wages[0]));}],
 ['conflicting single roots',f=>{Object.assign(f.input,{paOrdinaryReturnFacts:{sourceFactsConfirmed:true}});}],
 ['retained net-zero interest originals',f=>{f.input.form1099Int=[{payerName:'Fictional zero original',interestIncome:'0',federalTaxWithheld:'0'} as never];}],
 ['unknown disposition',f=>{f.sources.dispositions[1].refundRequested='';}],
 ['unsupported current year',f=>{f.input.taxpayer.taxYear=2026;f.sources.sourceTaxYear=2026;}],
];
it.each(invalid)('PA existing public J/M entry rejects actual invalid attached sources %s',(_name,change)=>{const f=attached();change(f);const before=JSON.stringify(f.input);expect(()=>calculatePAReturn(f.input)).toThrow();expect(JSON.stringify(f.input)).toBe(before);});
it('PA existing public attached J/M rejects every nonempty legacy override',()=>{for(const override of [{spouseIncome:'0'},{paCompensation:'0'},{scheduleSP:{eligibilityIncome:'0'}}]){const f=attached();expect(()=>calculatePAReturn(f.input,override as never)).toThrow();}});
it('PA existing public J/M stays unqualified for filing and PDF export',()=>{const f=attached();const r=actual(f.input);expect(r.readiness.filingEligible).toBe(false);expect(r.readiness.blockers).toContain('review-only-not-qualified-for-filing');expect(r.readiness.blockers.some(s=>/export|paper|integration/.test(s))).toBe(true);});

it.each(literalCases)('PA native literal originals already satisfy unchanged reviewed engine %s %s',(name,mode,expected)=>{const f=attached(mode,name),r=calculatePAMarriedOrdinaryReturn(f.input,f.sources);expect(r.returns.map(row=>[row.accountHolder,row.pa40.compensation.toString(),row.pa40.taxLiability.toString(),row.pa40.stateWithholding.toString(),row.scheduleSP.taxForgivenessCredit.toString(),row.pa40.netOverpayment.toString()])).toEqual(expected);});
