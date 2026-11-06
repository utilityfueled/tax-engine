/** Spec: state/oh-reciprocal-wages-guided.yaml. New helper contract frozen before products. */
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/index';
import {emptyGuidedOhioReciprocalWages,copySelectedGuidedOhioReciprocalW2,confirmGuidedOhioReciprocalWages,buildGuidedOhioReciprocalWages,updateGuidedOhioReciprocalWages} from '@/lib/guided-oh-reciprocal-wages';
import {guidedReciprocalWageFixture,reciprocalRequired as required} from '../../fixtures/guided-oh-reciprocal-wages-complete';
it('starts reciprocal source records unknown without inferred owner year original or cash',()=>{const d=emptyGuidedOhioReciprocalWages();expect(d.sourceTaxYear).toBeNull();expect(d.accountHolder).toBe('');expect(d.w2Index).toBeNull();expect(d.originalW2).toBeUndefined();expect(d.originalTaxpayer).toEqual({firstName:'',lastName:'',ssn:''});expect(d.sourceFactsConfirmed).toBeNull();expect(d.w2OriginalsCheckedConfirmed).toBeNull();expect(d.payrollRows).toEqual([]);expect(d.serviceOriginal.totalCompensation).toBe('');expect(d.domicileOriginal.completeYearDomicileConfirmed).toBeNull();});
it('copies only an explicitly checked selected original and retains stale evidence',()=>{
 const f=guidedReciprocalWageFixture(),d=structuredClone(f.draft),before=structuredClone(f.original);d.sourceFactsConfirmed=null;d.originalW2={};d.w2OriginalsCheckedConfirmed=null;expect(()=>copySelectedGuidedOhioReciprocalW2(f.original,d)).toThrow();d.w2OriginalsCheckedConfirmed=true;
 const copied=copySelectedGuidedOhioReciprocalW2(f.original,d);expect(copied.originalW2).toEqual(required(f.original.w2s[0]));expect(copied.originalTaxpayer).toEqual(d.originalTaxpayer);expect(copied.sourceFactsConfirmed).toBeNull();expect(copied.originalFederalSources).toEqual(d.originalFederalSources);expect(f.original).toEqual(before);expect(d.originalW2).toEqual({});
 const current=structuredClone(f.original);required(current.w2s[0]).employer.name='Actual same-cash replacement employer';expect(()=>buildGuidedOhioReciprocalWages(current,copied,f.residency,f.payments)).toThrow();expect(copied.originalW2).toEqual(required(f.original.w2s[0]));
});
it('confirms exact current reciprocal sources without changing originals on read',()=>{const f=guidedReciprocalWageFixture(),draft=structuredClone(f.draft);draft.sourceFactsConfirmed=null;const before=structuredClone(f),confirmed=confirmGuidedOhioReciprocalWages(f.original,draft,f.residency,f.payments);expect(confirmed.sourceFactsConfirmed).toBe(true);expect(confirmed.originalW2).toEqual(f.draft.originalW2);const facts=buildGuidedOhioReciprocalWages(f.original,confirmed,f.residency,f.payments);expect(facts.reciprocalWageSources).toEqual(f.source);const result=calculateOhioResidentReturnFromFederal({taxInput:{...f.original,ohioResidency:facts,ohioPayments:f.canonical.ohioPayments},federalResult:calculateFederalTax(f.original)});expect(result.it1040.line26_refund.toString()).toBe('2001');expect(f).toEqual(before);const saved=JSON.parse(JSON.stringify(confirmed)),snapshot=structuredClone(saved);expect(buildGuidedOhioReciprocalWages(f.original,saved,f.residency,f.payments)).toEqual(facts);expect(saved).toEqual(snapshot);});
it('revokes reciprocal confirmation but preserves all original commitments on draft edit',()=>{const f=guidedReciprocalWageFixture(),before=structuredClone(f.draft),edited=updateGuidedOhioReciprocalWages(f.draft,{sourceReference:'Actual changed documentary reference'});expect(edited.sourceFactsConfirmed).toBeNull();expect(edited.originalW2).toEqual(before.originalW2);expect(edited.originalFederalSources).toEqual(before.originalFederalSources);expect(edited.originalResidencySources).toEqual(before.originalResidencySources);expect(edited.originalPaymentSources).toEqual(before.originalPaymentSources);expect(f.draft).toEqual(before);});
const attacks:[string,(f:ReturnType<typeof guidedReciprocalWageFixture>)=>void][]=[
 ['unknown current originals review',f=>{f.draft.w2OriginalsCheckedConfirmed=null;}],
 ['missing current selected W2',f=>{Reflect.deleteProperty(f.draft,'originalW2');}],
 ['wrong entered original taxpayer',f=>{f.draft.originalTaxpayer.ssn='900-70-9999';}],
 ['actual new source year',f=>{f.draft.sourceTaxYear=2026;}],
 ['spouse-owned source',f=>{f.draft.accountHolder='spouse';}],
 ['unknown income inventory',f=>{Reflect.deleteProperty(f.draft,'allIncomeOriginalsIncludedConfirmed');}],
 ['unreviewed special services',f=>{Reflect.set(f.draft,'noSpecialCompensationConfirmed',false);}],
 ['missing domicile year evidence',f=>{Reflect.deleteProperty(f.draft.domicileOriginal,'completeYearDomicileConfirmed');}],
 ['wrong original domicile owner',f=>{f.draft.domicileOriginal.name='Other actual person';}],
 ['actual pass-through twenty percent owner',f=>{f.draft.employerEntityOriginal.entityType='pass_through_20_percent_owner';}],
 ['unreviewed ordinary employee services',f=>{Reflect.set(f.draft.serviceOriginal,'allCompensationOrdinaryOhioEmployeeServicesConfirmed',false);}],
 ['duplicate payroll original',f=>{f.draft.payrollRows.push(structuredClone(required(f.draft.payrollRows[0])));}],
 ['invalid calendar payroll date',f=>{required(f.draft.payrollRows[0]).paymentDate='2025-02-30';}],
 ['payroll coverage gap',f=>{required(f.draft.payrollRows[0]).servicePeriodFrom='2025-01-02';}],
 ['actual wage sum conflict',f=>{required(f.draft.payrollRows[0]).wages='5000.01';}],
 ['actual Ohio cash sum conflict',f=>{required(f.draft.payrollRows[0]).ohioWithheld='166.71';}],
 ['unreviewed parent residency',f=>{f.residency.sourceFactsConfirmed=null;}],
 ['unreviewed parent payments',f=>{f.payments.sourceFactsConfirmed=null;}],
 ['unknown actual no remaining tax proof',f=>{f.payments.remainingTaxPayment.sourceFactsConfirmed=null;}],
 ['invented refund scalar',f=>{Reflect.set(f.draft,'refund','2001');}],
 ['retained unsupported zero income',f=>{f.original.form1099Int=[{payer:{name:'Actual retained zero interest original'},interestIncome:'0'}];}],
];
it.each(attacks)('guards actual reciprocal source conflict %s',(_name,mutate)=>{const f=guidedReciprocalWageFixture();mutate(f);const before=structuredClone(f);expect(()=>confirmGuidedOhioReciprocalWages(f.original,f.draft,f.residency,f.payments)).toThrow();expect(f).toEqual(before);});
it.each(['residency','payments']as const)('guards same-cash current parent source identity change %s',kind=>{const f=guidedReciprocalWageFixture();if(kind==='residency')f.residency.sourceReference='Actually changed domicile original reference';else f.payments.sourceReference='Actually changed account original reference';const before=structuredClone(f);expect(()=>buildGuidedOhioReciprocalWages(f.original,f.draft,f.residency,f.payments)).toThrow();expect(f).toEqual(before);});
