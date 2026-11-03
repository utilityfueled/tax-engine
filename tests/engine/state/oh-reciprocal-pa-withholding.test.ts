/** Spec: spec/state/oh-reciprocal-wage-sources.yaml additive PA source rules. */
import {expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculateOhioResidentReturnFromFederal} from '@/engine/state/oh-engine.js';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter.js';
import {prepareOhioResidencyReview,resolveOhioResidencyReview} from '@/engine/state/oh-residency-source.js';
import {calculateW2StateLocalSources} from '@/engine/forms/w2-state-local.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {reciprocalW2,explicitlyReplaceReciprocalW2,type ReciprocalOhioWagePacket} from '../../fixtures/oh-reciprocal-wage-sources.js';
import {separatePACases,separatePAFixture,separatePARow,replaceActualPACash,separatePARequired,type SeparatePACase} from '../../fixtures/oh-reciprocal-pa-withholding.js';
const cases:[string,SeparatePACase][]=separatePACases.map(c=>[c.name,c]);
function run(p:ReciprocalOhioWagePacket){return calculateOhioResidentReturnFromFederal({taxInput:p.input,federalResult:calculateFederalTax(p.input)});}
function commitment(p:ReciprocalOhioWagePacket){return buildOhioResidentReturnInput(p.input,calculateFederalTax(p.input)).residencySourceDigest;}
function expectOhio(p:ReciprocalOhioWagePacket,c:SeparatePACase){
 const result=run(p);
 expect(result.it1040.line1_federalAgi.toString()).toBe(c.reportedWages);
 expect(result.scheduleOfAdjustments.line47_totalDeductions.toString()).toBe(c.reportedWages);
 expect(result.it1040.line3_ohioAgi.toString()).toBe('0');
 expect(result.it1040.line10_taxAfterCredits.toString()).toBe('0');
 expect(result.it1040.line14_ohioWithholding.toString()).toBe(c.reportedOhioWithheld);
 expect(result.it1040.line26_refund.toString()).toBe(c.reportedOhioWithheld);
 expect(result.nonresidentCreditResult?.line1.toString()).toBe('0');
 expect(result.nonresidentCreditResult?.line20.toString()).toBe('0');
 return result;
}
it.each(cases)('reciprocal separate PA cash preserves literal Ohio values %s',(_name,c)=>{
 const p=separatePAFixture(c),before=JSON.stringify(p),w=reciprocalW2(p),precision=Decimal.precision;
 const actual=calculateW2StateLocalSources(p.input,0,w.stateLocalSources);
 expect(actual.stateRows.map(row=>[row.state,row.withheld.toFixed(2)])).toEqual(c.ohioFirst?[['OH',c.ohioWithheld],['PA',c.paWithheld]]:[['PA',c.paWithheld],['OH',c.ohioWithheld]]);
 expect(actual.totalStateWithheld.eq(new Decimal(c.ohioWithheld).plus(c.paWithheld))).toBe(true);
 expect(calculateFederalTax(p.input).agi.toFixed(2)).toBe(c.wages);
 const result=expectOhio(p,c);
 expect(result.it1040.line14_ohioWithholding.eq(new Decimal(c.ohioWithheld).plus(c.paWithheld))).toBe(false);
 expect(separatePARow(p).withheld).toBe(c.paWithheld);
 expect(JSON.stringify(result.lines)).not.toContain('PRIVATE-');
 expect(JSON.stringify(result.lines)).not.toContain(p.input.taxpayer.primary.ssn);
 expect(JSON.stringify(p)).toBe(before);expect(Decimal.precision).toBe(precision);
});
it.each(cases)('reciprocal separate PA cash is independent of Ohio cash %s',(_name,c)=>{
 const original=separatePAFixture(c),before=JSON.stringify(original),first=commitment(original);
 expectOhio(original,c);
 for(const actualPA of ['3999.99','0.00']){
  const changed=separatePAFixture(c);replaceActualPACash(changed,actualPA);const current=JSON.stringify(changed);
  expectOhio(changed,c);expect(commitment(changed)).not.toBe(first);
  expect(separatePARow(changed).withheld).toBe(actualPA);
  expect(JSON.stringify(changed)).toBe(current);expect(JSON.stringify(original)).toBe(before);
 }
});
const malformedValues:[string,unknown][]=[['missing',undefined],['blank',''],['negative','-0.01'],['NaN','NaN'],['Infinity','Infinity'],['null',null],['numeric scalar',1842.01],['fractional-cent positive','1842.001'],['fractional-cent nearzero','0.001']];
const malformed:[string,SeparatePACase,unknown][]=separatePACases.slice(0,2).flatMap(c=>malformedValues.map(([name,value]):[string,SeparatePACase,unknown]=>[`${name} ${c.name}`,c,value]));
it.each(malformed)('reciprocal separate PA cash refuses malformed original %s',(_name,c,value)=>{
 const p=separatePAFixture(c),w=reciprocalW2(p),row=separatePARow(p);
 if(value===undefined){Reflect.deleteProperty(row,'withheld');if(w.state==='PA')Reflect.deleteProperty(w,'stateTaxWithheld');}
 else{Reflect.set(row,'withheld',value);if(w.state==='PA')Reflect.set(w,'stateTaxWithheld',value);}
 explicitlyReplaceReciprocalW2(p);const before=JSON.stringify(p);expect(()=>run(p)).toThrow();expect(JSON.stringify(p)).toBe(before);
});
it.each(cases)('reciprocal separate PA cash denies stale same-cash original %s',(_name,c)=>{
 const p=separatePAFixture(c),federal=calculateFederalTax(p.input),context=prepareOhioResidencyReview(p.input);
 separatePARow(p).sourceReference='Changed same-cash actual original PA row reference';const changed=JSON.stringify(p);
 expect(()=>resolveOhioResidencyReview(redactReviewIdentifiers(p.input),federal,context)).toThrow();
 expect(()=>run(p)).toThrow();expect(JSON.stringify(p)).toBe(changed);
});
it.each(cases)('reciprocal separate PA cash binds explicit same-cash original replacement %s',(_name,c)=>{
 const original=separatePAFixture(c),before=JSON.stringify(original),first=commitment(original);
 const changed=separatePAFixture(c);separatePARow(changed).sourceReference='Explicitly supplied replacement actual PA original identity';explicitlyReplaceReciprocalW2(changed);const current=JSON.stringify(changed);
 expectOhio(changed,c);expect(commitment(changed)).not.toBe(first);
 expect(JSON.stringify(changed)).toBe(current);expect(JSON.stringify(original)).toBe(before);
});
const badRows:[string,(p:ReciprocalOhioWagePacket)=>void][]=[
 ['duplicate actual PA row',p=>{const rows=separatePARequired(reciprocalW2(p).stateLocalSources).stateRows;rows.push(structuredClone(separatePARow(p)));explicitlyReplaceReciprocalW2(p);}],
 ['replace actual Ohio jurisdiction with PA',p=>{const rows=separatePARequired(reciprocalW2(p).stateLocalSources).stateRows;separatePARequired(rows.find(row=>row.state==='OH')).state='PA';explicitlyReplaceReciprocalW2(p);}],
 ['conflicting first-row scalar cash',p=>{const w=reciprocalW2(p);w.stateTaxWithheld=new Decimal(separatePARequired(w.stateTaxWithheld)).plus('1').toFixed(2);explicitlyReplaceReciprocalW2(p);}],
 ['missing actual PA original identity',p=>{separatePARow(p).sourceReference='';explicitlyReplaceReciprocalW2(p);}],
 ['duplicate printed position',p=>{separatePARow(p).printedRow=separatePARequired(separatePARequired(reciprocalW2(p).stateLocalSources).stateRows.find(row=>row.state==='OH')).printedRow;explicitlyReplaceReciprocalW2(p);}],
];
const rowControls:[string,SeparatePACase,(p:ReciprocalOhioWagePacket)=>void][]=separatePACases.slice(0,2).flatMap(c=>badRows.map(([name,mutate]):[string,SeparatePACase,(p:ReciprocalOhioWagePacket)=>void]=>[`${name} ${c.name}`,c,mutate]));
it.each(rowControls)('reciprocal separate PA cash refuses duplicate or conflicting rows %s',(_name,c,mutate)=>{
 const p=separatePAFixture(c);mutate(p);const before=JSON.stringify(p);expect(()=>run(p)).toThrow();expect(JSON.stringify(p)).toBe(before);
});

it('reciprocal separate PA cash source records validate before Ohio admission',()=>{
 for(const c of separatePACases){
  const p=separatePAFixture(c),before=JSON.stringify(p),w=reciprocalW2(p);
  const actual=calculateW2StateLocalSources(p.input,0,w.stateLocalSources);
  expect(actual.stateRows).toHaveLength(2);expect(actual.localRows).toHaveLength(0);
  expect(actual.stateRows.find(row=>row.state==='PA')?.withheld.toFixed(2)).toBe(c.paWithheld);
  expect(actual.stateRows.find(row=>row.state==='OH')?.withheld.toFixed(2)).toBe(c.ohioWithheld);
  expect(actual.totalStateWithheld.eq(new Decimal(c.paWithheld).plus(c.ohioWithheld))).toBe(true);
  expect(calculateFederalTax(p.input).agi.toFixed(2)).toBe(c.wages);
  expect(JSON.stringify(p)).toBe(before);
 }
});
