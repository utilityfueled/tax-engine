/** Spec: spec/state/pa-married-native-public.yaml. Frozen native source lifecycle. */
import {expect,it} from 'vitest';
import {PAMarriedOrdinarySourcesSchema,type PAMarriedOrdinarySources} from '@/models/pa-married-ordinary-sources';
import {emptyGuidedPAMarriedOrdinarySources,updateGuidedPAMarriedOrdinarySources,confirmGuidedPAMarriedOrdinarySources,buildGuidedPAMarriedOrdinarySources} from '@/lib/guided-pa-married-ordinary-sources';
import {calculatePAReturn} from '@/index';
import {fictionalEmptyEicHistory} from '../../fixtures/eic-disallowance';
import {requiredNative,paMarriedNativePublicFixture,unconfirmedNativeMarriedFixture} from '../../fixtures/pa-married-native-public';
it('PA married native blank draft contains no answers or owner assumptions',()=>{
 const d=emptyGuidedPAMarriedOrdinarySources();expect(PAMarriedOrdinarySourcesSchema.parse(d)).toEqual(d);expect(d.sourceTaxYear).toBeNull();expect(d.sourceFactsConfirmed).toBeNull();expect(d.sourceReference).toBe('');expect(d.filingMode).toBe('');expect(d.originalFederalSources).toEqual({});expect(d.owners).toEqual([]);expect(d.wages).toEqual([]);expect(d.dispositions).toEqual([]);expect(d.coverage.localJurisdictions).toEqual([]);for(const [key,value]of Object.entries(d.coverage))if(key.endsWith('Confirmed'))expect(value,key).toBeNull();expect(Object.values(d.timing).every(v=>v==='')).toBe(true);
});
it('PA married native explicit confirmation binds both real owners without changing federal input',()=>{
 const f=unconfirmedNativeMarriedFixture(),before=JSON.stringify(f.input),draftBefore=JSON.stringify(f.sources);const d=confirmGuidedPAMarriedOrdinarySources(f.input,f.sources);
 expect(d.sourceFactsConfirmed).toBe(true);expect(d.originalFederalSources).toEqual(f.input);expect(d.owners.map(r=>r.originalTaxpayer)).toEqual([f.input.taxpayer.primary,f.input.taxpayer.spouse].map(p=>({firstName:requiredNative(p).firstName,lastName:requiredNative(p).lastName,ssn:requiredNative(p).ssn})));expect(d.wages.map(r=>r.original)).toEqual(f.input.w2s);expect(d.wages.map(r=>r.originalRecipientSsn)).toEqual(['900-70-0411','900-70-0412']);expect(buildGuidedPAMarriedOrdinarySources(f.input,d)).toEqual(d);expect(JSON.stringify(f.input)).toBe(before);expect(JSON.stringify(f.sources)).toBe(draftBefore);
});
it('PA married native confirmation excludes exactly its own packet and retains actual roots',()=>{
 const f=paMarriedNativePublicFixture();f.input.paMarriedOrdinarySources=f.sources;const d=confirmGuidedPAMarriedOrdinarySources(f.input,f.sources);expect(d.originalFederalSources).not.toHaveProperty('paMarriedOrdinarySources');expect(d.originalFederalSources.w2s).toEqual(f.input.w2s);expect(d.originalFederalSources.taxpayer).toEqual(f.input.taxpayer);expect(buildGuidedPAMarriedOrdinarySources(f.input,d)).toEqual(d);
});
const stale:[string,(f:ReturnType<typeof paMarriedNativePublicFixture>)=>void][]=[
 ['primary name',f=>{f.input.taxpayer.primary.firstName='Changed primary';}],
 ['spouse name',f=>{requiredNative(f.input.taxpayer.spouse).firstName='Changed spouse';}],
 ['spouse birth date',f=>{requiredNative(f.input.taxpayer.spouse).dateOfBirth='1952-05-04';}],
 ['primary original payer same dollars',f=>{f.input.w2s[0].employer.name='Actual changed employer';}],
 ['spouse original owner same dollars',f=>{f.input.w2s[1].accountHolder='primary';}],
 ['raw original cent',f=>{f.input.w2s[1].stateTaxWithheld='921.01';}],
 ['current original year',f=>{f.input.w2s[0].taxYear=2026;}],
];
it.each(stale)('PA married native reads reject stale actual sources %s',(_label,change)=>{const f=paMarriedNativePublicFixture(),d=confirmGuidedPAMarriedOrdinarySources(f.input,f.sources),before=JSON.stringify(d);change(f);expect(()=>buildGuidedPAMarriedOrdinarySources(f.input,d)).toThrow();expect(JSON.stringify(d)).toBe(before);});
const unknown:[string,(d:PAMarriedOrdinarySources)=>void][]=[
 ['source year',d=>{d.sourceTaxYear=null;}],['filing choice',d=>{d.filingMode='';}],
 ['marital answer',d=>{d.owners[1].marriedAndLivedTogetherEntireYearConfirmed=null;}],
 ['actual days',d=>{d.owners[1].residency.actualDaysInPA=null;}],
 ['payroll gross',d=>{d.wages[1].payroll[0].grossCompensation='';}],
 ['payroll date',d=>{d.wages[1].payroll[0].paidOn='';}],
 ['worldwide source',d=>{d.owners[1].sp.categories['5'].status='';}],
 ['prior account',d=>{d.owners[0].payments.priorCreditStatus='';}],
 ['coverage',d=>{d.coverage.allCareExpensesAndEmployerBenefitsKnownNoneConfirmed=null;}],
 ['refund election',d=>{d.dispositions[1].refundRequested='';}],
 ['filing date',d=>{d.timing.filingDate='';}],
];
it.each(unknown)('PA married native confirmation cannot invent missing %s',(_label,change)=>{const f=unconfirmedNativeMarriedFixture();change(f.sources);const before=JSON.stringify(f.sources);expect(()=>confirmGuidedPAMarriedOrdinarySources(f.input,f.sources)).toThrow();expect(JSON.stringify(f.sources)).toBe(before);});
it.each(['paResidencySources','paReciprocitySources','paOrdinaryReturnFacts','paOrdinaryReturnCompletionSources']as const)('PA married native conflicts with retained old %s',key=>{const f=paMarriedNativePublicFixture();Object.assign(f.input,{[key]:{sourceReference:'Actual retained old root'}});expect(()=>confirmGuidedPAMarriedOrdinarySources(f.input,f.sources)).toThrow();expect(f.input).toHaveProperty(key);});
it('PA married native update clears confirmation and retains privately saved proof',()=>{const f=paMarriedNativePublicFixture(),old=JSON.stringify(f.sources);const d=updateGuidedPAMarriedOrdinarySources(f.sources,{sourceReference:'Actual changed review reference'});expect(d.sourceFactsConfirmed).toBeNull();expect(d.originalFederalSources).toEqual(f.sources.originalFederalSources);expect(d.wages).toEqual(f.sources.wages);expect(()=>buildGuidedPAMarriedOrdinarySources(f.input,d)).toThrow();expect(JSON.stringify(f.sources)).toBe(old);});
it('PA married native explicit reconfirmation refreshes both original identities only after source reconciliation',()=>{const f=paMarriedNativePublicFixture(),d=confirmGuidedPAMarriedOrdinarySources(f.input,f.sources);requiredNative(f.input.taxpayer.spouse).firstName='Reconciled actual Robin';expect(()=>buildGuidedPAMarriedOrdinarySources(f.input,d)).toThrow();requiredNative(f.input.eic).disallowanceSources=fictionalEmptyEicHistory(f.input.taxpayer);const next=confirmGuidedPAMarriedOrdinarySources(f.input,updateGuidedPAMarriedOrdinarySources(d,{}));expect(next.owners[1].originalTaxpayer.firstName).toBe('Reconciled actual Robin');expect(next.originalFederalSources.taxpayer).toEqual(f.input.taxpayer);expect(buildGuidedPAMarriedOrdinarySources(f.input,next)).toEqual(next);});
it('PA married native private JSON roundtrip preserves cents and separately owned elections',()=>{const f=paMarriedNativePublicFixture('M','cents'),d=confirmGuidedPAMarriedOrdinarySources(f.input,f.sources),restored=JSON.parse(JSON.stringify(d));expect(buildGuidedPAMarriedOrdinarySources(f.input,restored)).toEqual(d);expect(restored.wages.map((r:PAMarriedOrdinarySources['wages'][number])=>r.payroll[0].grossCompensation)).toEqual(['50000.25','30000.25']);expect(restored.dispositions.map((r:PAMarriedOrdinarySources['dispositions'][number])=>r.accountHolder)).toEqual(['primary','spouse']);expect(restored).not.toHaveProperty('pa40');});
it('PA married native strict draft rejects invented aggregate or owner income scalars',()=>{const f=paMarriedNativePublicFixture();expect(()=>confirmGuidedPAMarriedOrdinarySources(f.input,{...f.sources,householdRefund:'100'})).toThrow();expect(()=>confirmGuidedPAMarriedOrdinarySources(f.input,{...f.sources,owners:[{...f.sources.owners[0],spouseIncome:'0'},f.sources.owners[1]]})).toThrow();});
it('PA married native confirmed packet reaches the actual existing public entry',()=>{const f=unconfirmedNativeMarriedFixture('M','shared-sp'),d=confirmGuidedPAMarriedOrdinarySources(f.input,f.sources);const result:unknown=calculatePAReturn({...f.input,paMarriedOrdinarySources:d});expect(result).toMatchObject({methodVersion:'pa-married-ordinary-return-v1',filingMode:'M',returns:[{accountHolder:'primary'},{accountHolder:'spouse'}]});expect(result).not.toHaveProperty('pa40');});
