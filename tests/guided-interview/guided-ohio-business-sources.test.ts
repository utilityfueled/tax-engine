/** Spec: spec/state/oh-canonical-business-guided.yaml. Existing public guide APIs. */
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {updateSectionData,validateSection} from '@/lib/guided-interview-flow';
import {guidedOhioBusinessFixture} from '../fixtures/guided-ohio-business-sources';

it.each(['nonresident','part_year_resident']as const)('originates actual native business source through existing state API %s',status=>{
 const f=guidedOhioBusinessFixture(status);expect(f.input.scheduleC?.grossReceipts).toBe('400000');expect(f.input.w2s).toHaveLength(0);
 const current=buildGuidedStateOriginals(f.input,f.state);const federal=calculateFederalTax(current);expect(federal.agi.toString()).toBe('383725');
 const result=calculateOhioResidentReturnFromFederal({taxInput:current,federalResult:federal});expect(result.it1040.line10_taxAfterCredits.toString()).toBe('0');expect(result.nonresidentCreditResult?.line20.toString()).toBe('3955');
});
it.each((['nonresident','part_year_resident']as const).flatMap(status=>(['100000','400000','1000000']as const).map(profit=>[status,profit]as const)))('preserves independently pinned business worksheet %s %s',(status,profit)=>{
 const f=guidedOhioBusinessFixture(status,profit),before=JSON.stringify(f.state);const input=buildGuidedStateOriginals(f.input,f.state);const federal=calculateFederalTax(input),r=calculateOhioResidentReturnFromFederal({taxInput:input,federalResult:federal});
 expect(federal.agi.toString()).toBe(f.expected.federalAGI);expect(r.it1040.line3_ohioAgi.toString()).toBe(f.expected.OhioAGI);expect(r.it1040.line8c_totalTax.toString()).toBe(f.expected.taxBeforeNRC);expect(r.nonresidentCreditResult?.line5.toString()).toBe(f.expected.sectionI5);expect(r.nonresidentCreditResult?.line20.toString()).toBe(f.expected.NRC);expect(r.it1040.line10_taxAfterCredits.toString()).toBe(f.expected.taxAfterNRC);expect(JSON.stringify(f.state)).toBe(before);
 const reopened=JSON.parse(JSON.stringify(f.state));expect(buildGuidedStateOriginals(f.input,reopened)).toEqual(input);
});
function recordAt(root:unknown,...path:(string|number)[]):Record<string,unknown>{
 let value=root;
 for(const key of path){if(!value||typeof value!=='object')throw Error(`Explicit fixture record required at ${String(key)}`);value=Reflect.get(value,key);}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Explicit fixture record required');
 return value as Record<string,unknown>;
}
const negative:[string,(f:ReturnType<typeof guidedOhioBusinessFixture>)=>void][]=[
 ['missing-source-packet-capture',f=>{Reflect.deleteProperty(f.business,'originalBusinessSourcePacket');}],
 ['flag-only-equal-cash-receipt-identity-edit',f=>{recordAt(f.business,'receiptOriginals',0).originalDocumentId='Different actual equal-cash invoice';}],
 ['flag-only-property-source-edit',f=>{recordAt(f.business,'facts','businesses',0,'property').sourceReference='Different retained property original';}],
 ['unknown-zero-payroll',f=>{recordAt(f.business,'facts','businesses',0,'payroll').ohio=null;}],
 ['unknown-zero-rent',f=>{recordAt(f.business,'facts','businesses',0,'property','annualRent').everywhere=null;}],
 ['missing-current-C',f=>{Reflect.deleteProperty(f.input,'scheduleC');}],
 ['other-owner',f=>{recordAt(f.business,'facts','businesses',0).accountHolder='spouse';}],
 ['wrong-source-year',f=>{recordAt(f.business,'receiptOriginals',0).sourceTaxYear='2024';}],
 ['unknown-receipt-date',f=>{recordAt(f.business,'receiptOriginals',0).date='';}],
 ['overprecision-receipt',f=>{recordAt(f.business,'receiptOriginals',0).grossReceipt='400000.001';}],
 ['missing-personal-deduction-document',f=>{recordAt(f.business,'federalDeductionSources',0).original=null;}],
 ['unknown-personal-deduction-timing',f=>{recordAt(f.business,'federalDeductionSources',0,'original').date='';}],
 ['duplicate-receipt-original',f=>{const rows=Reflect.get(f.business,'receiptOriginals');if(!Array.isArray(rows))throw Error('Actual receipts required');rows.push(structuredClone(rows[0]));}],
 ['unknown-retained-business-source-key',f=>{f.business.unreviewedSource='Retained unknown original';}],
 ['missing-child',f=>{Reflect.deleteProperty(f.residency,'businessSources');}],['unknown-child',f=>{f.business.sourceFactsConfirmed=null;}],['missing-current-original',f=>{Reflect.deleteProperty(f.business,'originalFederalSources');}],['stale-C',f=>{if(!f.input.scheduleC)throw Error('Fixture C required');f.input.scheduleC.businessName='Different retained C identity';}],['unknown-payment',f=>{f.payments.sourceFactsConfirmed=null;}],['unknown-parent',f=>{f.residency.sourceFactsConfirmed=null;}],['unsupported-W2',f=>{f.input.w2s.push({accountHolder:'primary',taxYear:2025,wages:'1'}as never);}],
];
it.each(negative)('rejects missing stale or unsupported native business source %s',(_name,mutate)=>{const f=guidedOhioBusinessFixture();mutate(f);expect(()=>buildGuidedStateOriginals(f.input,f.state)).toThrow();});
it.each(['federal','residency','payment','business']as const)('revokes linked native business confirmation after %s',kind=>{
 const f=guidedOhioBusinessFixture();let next;
 if(kind==='federal'){const p=f.state.sectionData['personal-info'];if(!p)throw Error('Fixture person required');next=updateSectionData(f.state,'personal-info',{...p,lastName:'Changed current owner'});}
 else{const d=f.state.sectionData['state-return'];if(!d)throw Error('Fixture state source required');const changed=structuredClone(d);if(kind==='payment'){if(!changed.ohioPayments)throw Error('Fixture payment required');changed.ohioPayments.sourceReference='Changed actual current account';}else if(kind==='residency'){if(!changed.ohioResidency)throw Error('Fixture residency required');changed.ohioResidency.sourceReference='Changed domicile original';}else{if(!changed.ohioResidency)throw Error('Fixture residency required');const b=Reflect.get(changed.ohioResidency,'businessSources');if(!b||typeof b!=='object')throw Error('Fixture business required');Reflect.set(b,'sourceReference','Changed actual property/receipt source packet');}next=updateSectionData(f.state,'state-return',changed);}
 const actual=next.sectionData['state-return']?.ohioResidency;expect(actual?.sourceFactsConfirmed).not.toBe(true);expect(actual&&Reflect.get(actual,'businessSources')?.sourceFactsConfirmed).not.toBe(true);expect(validateSection(next,'state-return').status).not.toBe('complete');
});

const unsafeSerialization:[string,(f:ReturnType<typeof guidedOhioBusinessFixture>)=>void][]=[
 ['missing',f=>{Reflect.deleteProperty(f.business,'originalBusinessUndefinedPaths');}],
 ['removed-original-path',f=>{const paths=Reflect.get(f.business,'originalBusinessUndefinedPaths');if(!Array.isArray(paths)||paths.length===0)throw Error('Fictional authored undefined source paths required');paths.pop();}],
 ['duplicate',f=>{const paths=Reflect.get(f.business,'originalBusinessUndefinedPaths');if(!Array.isArray(paths)||paths.length===0)throw Error('Fictional authored undefined source paths required');paths.push(structuredClone(paths[0]));}],
 ['overwrite-actual-amount',f=>{const paths=Reflect.get(f.business,'originalBusinessUndefinedPaths');if(!Array.isArray(paths))throw Error('Fictional retained serialization paths required');paths.push({businessIndex:0,path:['grossReceipts']});}],
];
it.each(unsafeSerialization)('rejects missing or unsafe retained serialization metadata %s',(_name,change)=>{const f=guidedOhioBusinessFixture();change(f);const saved=JSON.parse(JSON.stringify(f.state));expect(()=>buildGuidedStateOriginals(f.input,saved)).toThrow();});
