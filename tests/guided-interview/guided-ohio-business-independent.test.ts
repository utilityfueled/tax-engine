/** Independent spec: spec/state/oh-business-native-independent.yaml. Frozen before candidate products/outputs. */
import {expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {calculateFederalTax} from '@/engine/federal';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {buildGuidedOhioBusinessFacts,confirmGuidedOhioBusinessFacts,emptyOhioBusinessDraft,emptyOhioBusinessReceipt,emptyOhioBusinessDeduction,invalidateOhioBusiness} from '@/lib/guided-ohio-business-facts';
import {buildGuidedOhioResidencyFacts,confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {guidedOhioBusinessFixture} from '../fixtures/guided-ohio-business-sources';

type Draft=Parameters<typeof buildGuidedOhioBusinessFacts>[0];
type Packet=ReturnType<typeof guidedOhioBusinessFixture>;
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Independent control requires an actual object');return v as Record<string,unknown>;}
function first(v:unknown):Record<string,unknown>{if(!Array.isArray(v)||!v.length)throw Error('Independent control requires an actual original row');return object(v[0]);}
function draft(p:Packet):Draft{return structuredClone(p.business) as Draft;}
function business(d:Draft):Record<string,unknown>{return first(object(object(d).facts).businesses);}
function original(d:Draft):Record<string,unknown>{return object(business(d).originalBusiness);}
function deduction(d:Draft):Record<string,unknown>{return object(first(object(d).federalDeductionSources).original);}
function paths(d:Draft):unknown[]{const rows=object(d).originalBusinessUndefinedPaths;if(!Array.isArray(rows)||!rows.length)throw Error('Actual fixture must supply authored undefined own source paths');return rows;}
function read(p:Packet,d:Draft){return buildGuidedOhioBusinessFacts(d,p.input);}
function saved(d:Draft):Draft{return JSON.parse(JSON.stringify(d)) as Draft;}
function run(p:Packet,d:Draft){
 const residency=structuredClone(p.residency);Reflect.set(residency,'businessSources',d);
 const confirmed=confirmGuidedOhioResidencyFacts(p.input,residency);
 const facts=buildGuidedOhioResidencyFacts(confirmed,p.input);
 const federal=calculateFederalTax(p.input);
 const ohio=calculateOhioResidentReturnFromFederal({taxInput:p.input,federalResult:federal,overlay:{residency:facts}});
 return{federal,ohio,confirmed};
}
const literals=[
 ['100000','14129','7065','92935','92935','0','0','0','0','0'],
 ['400000','32549','16275','383725','250000','133725','3955','0','3955','0'],
 ['1000000','48618','24309','975691','250000','725691','21771','62500','19894','1877'],
] as const;
const positives=literals.flatMap(row=>(['nonresident','part_year_resident'] as const).flatMap(status=>([false,true] as const).map(json=>[row[0],status,json,row] as const)));
it.each(positives)('independently replays actual %s %s business sources with %s saved JSON',(_profit,status,json,row)=>{
 const p=guidedOhioBusinessFixture(status,row[0]);const before=structuredClone(p);const precision=Decimal.precision;
 const confirmed=confirmGuidedOhioBusinessFacts(p.input,draft(p));const current=json?saved(confirmed):confirmed;
 const packet=read(p,current);expect(packet.facts.businesses[0]?.payroll.ohio).toBe('0');expect(packet.facts.businesses[0]?.payroll.everywhere).toBe('0');
 const {federal,ohio}=run(p,current);const nrc=ohio.nonresidentCreditResult;if(!nrc)throw Error('Independent NRC required');
 expect(federal.scheduleC?.netProfit.toFixed()).toBe(row[0]);expect(federal.selfEmploymentTax.toFixed()).toBe(row[1]);expect(federal.adjustmentsToIncome.toFixed()).toBe(row[2]);expect(federal.agi.toFixed()).toBe(row[3]);
 expect(ohio.scheduleOfAdjustments.line15_businessIncomeDeduction.toFixed()).toBe(row[4]);expect(ohio.it1040.line3_ohioAgi.toFixed()).toBe(row[5]);expect(ohio.it1040.line8c_totalTax.toFixed()).toBe(row[6]);expect(nrc.line5.toFixed()).toBe(row[7]);expect(nrc.line14.toFixed()).toBe('0');expect(nrc.line20.toFixed()).toBe(row[8]);expect(ohio.it1040.line10_taxAfterCredits.toFixed()).toBe(row[9]);
 expect(nrc.line19.toFixed(4)).toBe(row[0]==='100000'?'0.0000':row[0]==='400000'?'1.0000':'0.9138');expect(p).toEqual(before);expect(Decimal.precision).toBe(precision);
 expect(JSON.stringify(ohio.lines)).not.toContain('900-70-0411');
});
const blanks:Array<[string,(d:Draft)=>void]>=[
 ['property Ohio zero rent',d=>{object(business(d).property).annualRent={ohio:'',everywhere:'0'};}],
 ['property everywhere zero rent',d=>{object(business(d).property).annualRent={ohio:'0',everywhere:''};}],
 ['payroll Ohio actual zero',d=>{object(business(d).payroll).ohio='';}],
 ['payroll everywhere actual zero',d=>{object(business(d).payroll).everywhere='';}],
 ['receipt amount',d=>{first(object(d).receiptOriginals).grossReceipt='';}],
 ['receipt date',d=>{first(object(d).receiptOriginals).date='';}],
 ['personal deduction date',d=>{deduction(d).date='';}],
 ['personal deduction source',d=>{deduction(d).sourceReference='';}],
 ['actual original source assurance',d=>{object(d).sourceFactsConfirmed=null;}],
 ['actual source inclusion',d=>{object(d).allFederalDeductionSourcesIncludedConfirmed=null;}],
];
it.each(blanks)('independently rejects blank actual source field %s',(_name,mutate)=>{const p=guidedOhioBusinessFixture();const d=draft(p);mutate(d);const before=structuredClone(d);expect(()=>read(p,d)).toThrow();expect(d).toEqual(before);});
const changed:Array<[string,(p:Packet,d:Draft)=>void]>=[
 ['same-cash current C identity',p=>{if(!p.input.scheduleC)throw Error('Actual C required');p.input.scheduleC.businessName='Actual equal-cash replacement';}],
 ['same-cash current C source code',p=>{if(!p.input.scheduleC)throw Error('Actual C required');p.input.scheduleC.businessCode='541611';}],
 ['current actual receipt cents',p=>{if(!p.input.scheduleC)throw Error('Actual C required');p.input.scheduleC.grossReceipts='400000.01';}],
 ['current actual owner',p=>{if(!p.input.scheduleC)throw Error('Actual C required');p.input.scheduleC.accountHolder='spouse';}],
 ['unknown original C identity',(_p,d)=>{expect(original(d).businessCode).toBe('541990');Reflect.deleteProperty(original(d),'businessCode');}],
 ['tampered retained C source',(_p,d)=>{original(d).businessName='Different retained original';}],
 ['business owner',(_p,d)=>{business(d).accountHolder='spouse';}],
 ['business source year',(_p,d)=>{business(d).sourceTaxYear='2026';}],
 ['business owner status',(_p,d)=>{business(d).ownerResidencyStatus='full_year_resident';}],
 ['duplicate actual invoice',(_p,d)=>{const a=object(d).receiptOriginals;if(!Array.isArray(a))throw Error('Actual receipts required');a.push(structuredClone(a[0]));}],
 ['duplicate deduction original',(_p,d)=>{const a=object(d).federalDeductionSources;if(!Array.isArray(a))throw Error('Actual deductions required');a.push(structuredClone(a[0]));}],
 ['invoice impossible date',(_p,d)=>{first(object(d).receiptOriginals).date='2025-02-30';}],
 ['deduction impossible date',(_p,d)=>{deduction(d).date='2025-02-30';}],
 ['deduction source year',(_p,d)=>{deduction(d).sourceTaxYear='2026';}],
 ['deduction actual half SE changed',(_p,d)=>{deduction(d).amount='16274';}],
 ['unmatched original invoice ID',(_p,d)=>{first(object(d).receiptOriginals).receiptId='unmatched-actual-original';}],
 ['invented factor scalar',(_p,d)=>{object(d).apportionmentRatio='.3125';}],
 ['missing original packet',(_p,d)=>{Reflect.deleteProperty(d,'originalBusinessSourcePacket');}],
 ['missing current federal capture',(_p,d)=>{Reflect.deleteProperty(d,'originalFederalSources');}],
];
it.each(changed)('independently rejects altered source evidence %s',(_name,mutate)=>{const p=guidedOhioBusinessFixture('part_year_resident');const d=draft(p);mutate(p,d);const before=structuredClone({input:p.input,d});expect(()=>read(p,d)).toThrow();expect({input:p.input,d}).toEqual(before);});
const meta:Array<[string,(d:Draft)=>void]>=[
 ['missing metadata',d=>{Reflect.deleteProperty(d,'originalBusinessUndefinedPaths');}],
 ['duplicate metadata',d=>{const a=paths(d);a.push(structuredClone(a[0]));}],
 ['wrong business index',d=>{first(paths(d)).businessIndex=1;}],
 ['negative business index',d=>{first(paths(d)).businessIndex=-1;}],
 ['prototype root',d=>{first(paths(d)).path=['__proto__','independentPollution'];}],
 ['constructor prototype',d=>{first(paths(d)).path=['constructor','prototype','independentPollution'];}],
 ['populated original source deletion',d=>{first(paths(d)).path=['grossReceipts'];}],
 ['missing intermediate path',d=>{first(paths(d)).path=['fictionalMissing','value'];}],
 ['empty path',d=>{first(paths(d)).path=[];}],
 ['noninteger array index',d=>{first(paths(d)).businessIndex='0';}],
 ['duplicate path with string index',d=>{const a=paths(d);const row=structuredClone(object(a[0]));row.businessIndex='0';a.push(row);}],
];
it.each(meta)('independently rejects forged saved undefined metadata %s',(_name,mutate)=>{const p=guidedOhioBusinessFixture();const d=saved(draft(p));mutate(d);const before=structuredClone(d);expect(()=>read(p,d)).toThrow();expect(d).toEqual(before);expect(Reflect.get(Object.prototype,'independentPollution')).toBeUndefined();});
it('rejects stale C reads and captures actual new C only on explicit confirmation',()=>{const p=guidedOhioBusinessFixture();const d=draft(p);const retained=structuredClone(d);if(!p.input.scheduleC)throw Error('Actual C required');p.input.scheduleC.businessName='Actual new same-cash original not present in retained sources';expect(()=>read(p,d)).toThrow();const confirmed=confirmGuidedOhioBusinessFacts(p.input,d);expect(read(p,confirmed).facts.businesses[0]?.originalBusiness).toEqual(p.input.scheduleC);expect(d).toEqual(retained);});
it('invalidates source confirmation without changing retained original evidence',()=>{const p=guidedOhioBusinessFixture();const d=draft(p);const before=structuredClone(d);const invalid=invalidateOhioBusiness(d);expect(invalid.sourceFactsConfirmed).not.toBe(true);expect(business(invalid).originalBusiness).toEqual(business(d).originalBusiness);expect(d).toEqual(before);expect(()=>read(p,invalid)).toThrow();});
it('keeps actual empty native source records unconfirmed and unknown',()=>{const empty=emptyOhioBusinessDraft();const receipt=emptyOhioBusinessReceipt();const deduction=emptyOhioBusinessDeduction();expect(empty.sourceFactsConfirmed).not.toBe(true);expect(receipt.grossReceipt).toBe('');expect(receipt.date).toBe('');expect(deduction.original.amount).toBe('');expect(deduction.original.date).toBe('');const p=guidedOhioBusinessFixture();expect(()=>confirmGuidedOhioBusinessFacts(p.input,empty)).toThrow();});
it('replays actual public guided binding after saved JSON without mutating sources',()=>{const p=guidedOhioBusinessFixture();const state=JSON.parse(JSON.stringify(p.state)) as Packet['state'];const before=structuredClone(state);const result=buildGuidedStateOriginals(p.input,state);const nrc=calculateOhioResidentReturnFromFederal({taxInput:result,federalResult:calculateFederalTax(result)});expect(nrc.it1040.line10_taxAfterCredits.toFixed()).toBe('0');expect(result.ohioResidency?.businessSources?.facts.businesses[0]?.originalBusiness).toEqual(p.input.scheduleC);expect(state).toEqual(before);});
it('preserves the public 2026 denial after actual year replacement',()=>{const p=guidedOhioBusinessFixture();p.input.taxpayer.taxYear=2026;expect(()=>calculateFederalTax(p.input)).toThrow(/Tax year 2026 rule pack .* is incomplete; calculation is unavailable/);});

it('rejects a forged undefined leaf at the canonical parent source boundary',()=>{const p=guidedOhioBusinessFixture();const d=saved(draft(p));first(paths(d)).path=['fictionalAbsentOriginal'];const before=structuredClone({input:p.input,d});const child=read(p,d);const row=child.facts.businesses[0];if(!row)throw Error('Actual child business row required');expect(Object.hasOwn(row.originalBusiness,'fictionalAbsentOriginal')).toBe(true);expect(row.originalBusiness.fictionalAbsentOriginal).toBeUndefined();expect(()=>run(p,d)).toThrow(/original identity does not match current source/);expect({input:p.input,d}).toEqual(before);});

it('observes raw structural restoration without granting canonical undefined identity',()=>{const p=guidedOhioBusinessFixture();const d=saved(draft(p));first(paths(d)).path=['fictionalAbsentOriginal'];const before=structuredClone({input:p.input,d});const child=read(p,d);const row=child.facts.businesses[0];if(!row)throw Error('Actual raw child row required');expect(Object.hasOwn(row.originalBusiness,'fictionalAbsentOriginal')).toBe(true);expect(row.originalBusiness.fictionalAbsentOriginal).toBeUndefined();expect({input:p.input,d}).toEqual(before);});
