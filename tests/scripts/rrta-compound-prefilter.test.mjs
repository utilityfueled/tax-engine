// Spec: spec/browser/rrta-compound-prefilter.yaml
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,URL} from 'node:url';
import test from 'node:test';
const moduleUrl=new URL('../../scripts/rrta-python-version-comparison/compound-prefilter.mjs',import.meta.url);
const originalUrl=new URL('../../apps/web/tests/helpers/rrta-paper-review-privacy.py',import.meta.url);
test('binds the exact complete derivative and refuses changed input',async()=>{
 const {derive,ORIGINAL_SHA,CANDIDATE_SHA}=await import(moduleUrl),source=await readFile(originalUrl,'utf8');
 const hash=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(hash(source),ORIGINAL_SHA);assert.equal(hash(derive(source)),CANDIDATE_SHA);
 for(const changed of [source+'\n',source.replace('<=4096','<=4095'),source.replace('def inspect','def other')])if(changed!==source)assert.throws(()=>derive(changed));
});
test('requires canonical matching explicit opt in',async()=>{
 const {compoundMode}=await import(moduleUrl);
 for(const a of [undefined,'false'])for(const b of [undefined,'false'])assert.equal(compoundMode(a,b),false);
 assert.equal(compoundMode('true','true'),true);
 for(const [a,b]of [['true',undefined],['false','true'],[undefined,'true'],['True','true'],[true,'true'],['true',true],['1','1'],[{},{}]])assert.throws(()=>compoundMode(a,b));
});
test('binds both branch helper paths and hashes without changing the default',async()=>{
 const {helperPlan,ORIGINAL_SHA,CANDIDATE_SHA}=await import(moduleUrl),original=fileURLToPath(originalUrl),work='/private/rrta-owned-example';
 assert.deepEqual(helperPlan(original,work,false),{paths:{A:original,B:original},hashes:{A:ORIGINAL_SHA,B:ORIGINAL_SHA}});
 const p=helperPlan(original,work,true);assert.equal(p.paths.A,original);assert.equal(p.paths.B,work+'/compound-helper.py');assert.deepEqual(p.hashes,{A:ORIGINAL_SHA,B:CANDIDATE_SHA});
 for(const args of [['relative',work,true],[original,'relative',true],[original,work,'true'],[work+'/compound-helper.py',work,true]])assert.throws(()=>helperPlan(...args));
});
