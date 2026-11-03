/** Spec: state/oh-reciprocal-native-independent.yaml; independent fixed literals before outputs. */
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {buildGuidedOhioReciprocalWages,confirmGuidedOhioReciprocalWages,emptyGuidedOhioReciprocalWages,updateGuidedOhioReciprocalWages,type OhioReciprocalWagesDraft} from '@/lib/guided-oh-reciprocal-wages';
import {snapshotGuidedOhioOriginals} from '@/lib/guided-ohio-residency-facts';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {guidedReciprocalWageFixture,reciprocalRequired as need} from '../../fixtures/guided-oh-reciprocal-wages-complete';
const cases=[['60000.99','1999.49','60001','1999'],['60000.01','1999.50','60000','2000'],['60000.00','0.00','60000','0']] as const;
for(const ohioFirst of [false,true])it.each(cases)('independent native reciprocal originals preserve separate exact cash and raw cents %s %s',(wages,withheld,printed,refund)=>{
 const f=guidedReciprocalWageFixture(wages,withheld,ohioFirst),before=JSON.stringify(f);
 const input=buildGuidedStateOriginals(f.original,f.state),federal=calculateFederalTax(input),oh=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:federal});
 expect(need(input.w2s[0]).wages).toBe(wages);expect(need(input.w2s[0]?.stateLocalSources).stateRows.find(row=>row.state==='OH')?.withheld).toBe(withheld);
 expect(federal.agi.toFixed(2)).toBe(wages);expect(oh.it1040.line1_federalAgi.toString()).toBe(printed);expect(oh.scheduleOfAdjustments.line14_reciprocityWages.toString()).toBe(printed);
 expect(oh.it1040.line3_ohioAgi.toString()).toBe('0');expect(oh.it1040.line10_taxAfterCredits.toString()).toBe('0');expect(oh.it1040.line14_ohioWithholding.toString()).toBe(refund);expect(oh.it1040.line26_refund.toString()).toBe(refund);expect(JSON.stringify(f)).toBe(before);
});
it.each(['residency','account','refund reference'] as const)('independent reciprocal confirmation never refreshes changed parent %s',which=>{
 const f=guidedReciprocalWageFixture('60000.99','1999.49');
 if(which==='residency')f.residency.sourceReference+=' corrected documentary identity';else if(which==='account')f.payments.sourceReference+=' corrected documentary identity';else f.payments.balanceFacts.sourceReference+=' corrected documentary identity';
 const before=JSON.stringify(f),old=JSON.stringify(f.draft);
 expect(()=>buildGuidedOhioReciprocalWages(f.original,f.draft,f.residency,f.payments)).toThrow();expect(JSON.stringify(f)).toBe(before);
 const confirmed=confirmGuidedOhioReciprocalWages(f.original,f.draft,f.residency,f.payments);expect(JSON.stringify(f.draft)).toBe(old);expect(confirmed.originalFederalSources).toEqual(f.draft.originalFederalSources);
 expect(buildGuidedOhioReciprocalWages(f.original,confirmed,f.residency,f.payments).reciprocalWageSources?.sourceFactsConfirmed).toBe(true);
});
it('independent reciprocal source preserves known zero and unknown distinctly',()=>{
 const f=guidedReciprocalWageFixture('60000.00','0.00'),draft=f.draft as OhioReciprocalWagesDraft;
 expect(buildGuidedOhioReciprocalWages(f.original,draft,f.residency,f.payments).reciprocalWageSources?.payrollRows.every(row=>row.ohioWithheld==='0.00')).toBe(true);
 const changed=structuredClone(draft);need(changed.payrollRows[0]).ohioWithheld='';const pending=updateGuidedOhioReciprocalWages(changed,{});expect(pending.sourceFactsConfirmed).toBeNull();expect(need(pending.payrollRows[0]).ohioWithheld).toBe('');
 expect(()=>confirmGuidedOhioReciprocalWages(f.original,pending,f.residency,f.payments)).toThrow();expect(need(draft.payrollRows[0]).ohioWithheld).toBe('0.00');
});
it('independent reciprocal source blocks retained unsupported originals even at zero',()=>{
 const f=guidedReciprocalWageFixture();f.original.form1099Nec=[{payer:'FICTIONAL OTHER SERVICE PAYER',payerTin:'90-7000111',nonemployeeCompensation:'0',federalWithheld:'0'}];
 expect(TaxYearInputSchema.safeParse(f.original).success).toBe(true);f.residency.originalFederalSources=snapshotGuidedOhioOriginals(f.original);f.payments.originalFederalSources=snapshotGuidedOhioOriginals(f.original);
 const before=JSON.stringify(f);expect(()=>confirmGuidedOhioReciprocalWages(f.original,f.draft,f.residency,f.payments)).toThrow();expect(JSON.stringify(f)).toBe(before);expect(f.original.form1099Nec).toHaveLength(1);
});
it.each(['residency','payments'] as const)('independent reciprocal source refuses contradictory canonical roots %s',which=>{
 const f=guidedReciprocalWageFixture();if(which==='residency'){f.original.ohioResidency=structuredClone(need(f.canonical.ohioResidency));f.original.ohioResidency.sourceReference+=' different actual original';}else{f.original.ohioPayments=structuredClone(need(f.canonical.ohioPayments));f.original.ohioPayments.sourceReference+=' different actual original';}
 const before=JSON.stringify(f);expect(()=>confirmGuidedOhioReciprocalWages(f.original,f.draft,f.residency,f.payments)).toThrow();expect(JSON.stringify(f)).toBe(before);
});
it('independent reciprocal source replay is immutable and public output private',()=>{
 const f=guidedReciprocalWageFixture('60000.99','1999.49');const saved=JSON.parse(JSON.stringify(f.state)),before=JSON.stringify(saved);const result=computeGuidedPreview(saved);expect(result?.state).toMatchObject({stateCode:'OH',stateTax:'0',stateRefund:'1999',stateWithholding:'1999'});
 const publicJSON=JSON.stringify(result);expect(publicJSON).not.toContain('PRIVATE-');expect(publicJSON).not.toContain('900-70-0611');expect(publicJSON).not.toContain('sourceReference');computeGuidedPreview(saved);expect(JSON.stringify(saved)).toBe(before);
});
it('independent new reciprocal draft keeps documentary facts unknown',()=>{
 const draft=emptyGuidedOhioReciprocalWages();expect(draft.sourceTaxYear).toBeNull();expect(draft.w2Index).toBeNull();expect(draft.originalW2).toBeUndefined();expect(draft.accountHolder).toBe('');expect(draft.originalTaxpayer).toEqual({firstName:'',lastName:'',ssn:''});expect(draft.sourceFactsConfirmed).toBeNull();expect(draft.domicileOriginal.from).toBe('');expect(draft.employerEntityOriginal.entityType).toBe('');expect(draft.serviceOriginal.totalCompensation).toBe('');expect(draft.payrollRows).toEqual([]);
});
