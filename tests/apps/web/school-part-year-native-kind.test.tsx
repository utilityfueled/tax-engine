// @vitest-environment jsdom
/** Spec: browser/school-part-year-known-native-control.yaml. Inert locator contract, real DOM covered separately. */
import {it,expect} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const R=process.cwd();
function load(source:string,pw:unknown,tag?:unknown){const m={exports:{}};Function('module','exports','require',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports,(name:string)=>{if(name==='@playwright/test')return{expect:pw};if(name==='./native-control-snapshot')return{nativeControlTag:tag};throw Error('Unexpected import');});return m.exports as Record<string,unknown>;}
function harness(count=1,tag='INPUT',labels=1){const calls:string[]=[],reads:string[]=[],nodes=Array.from({length:count},()=>({tagName:tag}));const exact=(kind:string)=>{if(nodes.length!==1)throw Error('strict count');if(nodes[0]?.tagName!==kind)throw Error('native type');};
 const field={async fill(v:string){exact('INPUT');calls.push('fill:'+v);},async selectOption(v:string){exact('SELECT');calls.push('select:'+v);},async press(v:string){exact('INPUT');calls.push('press:'+v);},async evaluateAll(fn:(nodes:Array<{tagName:string}>)=>unknown){reads.push('snapshot');return fn(nodes);}};
 const locator={locator(){return this;},getByText(){return this;}};const parent={locator(){return field;},getByText(){return locator;}};const span={locator(){return parent;}};const page={locator(){return{getByText(){return span;}};}};
 const pw=Object.assign((_actual:unknown)=>({async toHaveCount(n:number){reads.push('label');if(labels!==n)throw Error('label count');}}),{poll(fn:()=>Promise<unknown>){return{async toBe(value:unknown){if(await fn()!==value)throw Error('snapshot count');}};}});
 const tagfn=load(fs.readFileSync(path.join(R,'apps/web/tests/helpers/native-control-snapshot.ts'),'utf8'),pw).nativeControlTag;
 const fn=load(fs.readFileSync(path.join(R,'apps/web/tests/helpers/known-native-control.ts'),'utf8'),pw,tagfn).enterKnownNativeControl as(page:unknown,label:string,value:string,kind:string)=>Promise<void>;
 return{fn,page,calls,reads};}
it('requires known kind before labels or native actions',async()=>{const h=harness();await expect(h.fn(h.page,'Actual','x','unknown')).rejects.toThrow();expect(h.calls).toEqual([]);expect(h.reads).toEqual([]);});
it('rejects an expected native kind that disagrees with the actual current control',async()=>{for(const[tag,kind]of[['INPUT','select'],['SELECT','input']]){const h=harness(1,tag);await expect(h.fn(h.page,'Actual','x',kind)).rejects.toThrow();expect(h.calls).toEqual([]);}});
it('preserves independent labels and strict native actions',async()=>{for(const[tag,kind,wanted]of[['INPUT','input',['fill:x','press:Tab']],['SELECT','select',['select:x']]]as const){const h=harness(1,tag);await h.fn(h.page,'Actual','x',kind);expect(h.calls).toEqual(wanted);expect(h.reads).toEqual(['label']);}for(const labels of[0,2]){const h=harness(1,'INPUT',labels);await expect(h.fn(h.page,'Actual','x','input')).rejects.toThrow('label count');expect(h.calls).toEqual([]);}for(const count of[0,2]){const h=harness(count);await expect(h.fn(h.page,'Actual','x','input')).rejects.toThrow();expect(h.calls).toEqual([]);}});

import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {OhioSchoolDistrictDetails} from '@/components/guided-interview/ohio-school-district-details';
import {schoolPyHeaderPacket,schoolPyPaperCases} from '../../fixtures/oh-school-district-part-year-official-review';
import {guidedSchoolDistrictFixture,enteredSchoolDraft,schoolNativeFields} from '../../fixtures/guided-oh-school-district-complete';
import {schoolPartYearNativeKind} from '../../../apps/web/tests/helpers/school-part-year-native-kinds';
function required<T>(value:T|null|undefined):T{if(value==null)throw Error('Actual fictional source required');return value;}
function scalar(root:unknown,keys:readonly(string|number)[]):string{let v:unknown=root;for(const k of keys){if(!v||typeof v!=='object')throw Error('Original source path missing');v=Reflect.get(v,k);}if(!['string','number','boolean'].includes(typeof v))throw Error('Original scalar missing');return String(v);}
it.each([0,1]as const)('matches actual component definitions and all original actions %s',async which=>{
 const packet=schoolPyHeaderPacket(required(schoolPyPaperCases[which])),draft=enteredSchoolDraft(packet.canonical.ohioSchoolDistrict);
 // Canonical payroll years are numeric; the native draft control displays the same supplied year as text.
 const remaining=draft.payments.remainingTaxPayment;if(remaining.status!=='no_remaining_tax')throw Error('Original two-fixture balance contract changed');
 const renderDraft={...draft,payments:{...draft.payments,remainingTaxPayment:remaining},partYearWageSources:draft.partYearWageSources?{...draft.partYearWageSources,payrollOriginals:draft.partYearWageSources.payrollOriginals.map(row=>({...row,taxYear:String(row.taxYear)}))}:undefined};
 const html=renderToStaticMarkup(<OhioSchoolDistrictDetails data={renderDraft} onChange={()=>{}} originalInput={packet.original} ohioResidency={undefined} ohioPayments={undefined} taxYear={2025}/>),root=document.createElement('div'),actions:Array<{label:string;value:string;kind:string}>=[],buttons:string[]=[];
 root.innerHTML=html;
 const source=fs.readFileSync(path.join(R,'apps/web/tests/oh-school-district-part-year-native.spec.ts'),'utf8');const body=source.slice(source.indexOf('async function enterSchool('),source.indexOf('\nasync function enterHeader('));
 const known=async(_page:unknown,label:string,value:string,kind:string)=>{
  const labels=[...root.querySelectorAll('label span')].filter(n=>n.textContent===label);expect(labels,label).toHaveLength(1);const nodes=required(labels[0]?.parentElement).querySelectorAll('input,select');expect(nodes,label).toHaveLength(1);const n=required(nodes[0]);expect(n.tagName,label).toBe(kind==='select'?'SELECT':'INPUT');
  if(kind==='select')expect([...n.querySelectorAll('option')].some(o=>o.value===value),label).toBe(true);actions.push({label,value,kind});
 };
 const page={getByRole(role:string,options:{name:string;exact:boolean}){expect(role).toBe('button');expect(options.exact).toBe(true);return{async click(){buttons.push(options.name);}};}};
 const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const run=Function('required','enteredSchoolDraft','guidedSchoolDistrictFixture','schoolNativeFields','read','enterKnownNativeControl','schoolPartYearNativeKind',js+';return enterSchool;')(required,enteredSchoolDraft,guidedSchoolDistrictFixture,schoolNativeFields,scalar,known,schoolPartYearNativeKind);
 await run(page,packet);expect(actions).toHaveLength(137);expect(new Set(actions.map(a=>a.label)).size).toBe(137);expect(actions.filter(a=>a.kind==='input')).toHaveLength(98);expect(actions.filter(a=>a.kind==='select')).toHaveLength(39);expect(buttons).toHaveLength(11);
 const adapter="\n const enter=(page:Page,label:string,value:string)=>enterKnownNativeControl(page,label,value,schoolPartYearNativeKind(label));\n const fields=async(page:Page,rows:readonly(readonly[string,string])[])=>{for(const[label,value]of rows)await enter(page,label,value);};";
 const originalBody=body.replace(adapter,'');expect(originalBody).not.toBe(body);
 const baselineActions:Array<{label:string;value:string;kind:string}>=[],baselineButtons:string[]=[];
 const oldEnter=async(_page:unknown,label:string,value:string)=>{baselineActions.push({label,value,kind:schoolPartYearNativeKind(label)});};const oldFields=async(p:unknown,rows:readonly(readonly[string,string])[])=>{for(const[label,v]of rows)await oldEnter(p,label,v);};
 const oldJs=ts.transpileModule(originalBody,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const old=Function('required','enteredSchoolDraft','guidedSchoolDistrictFixture','schoolNativeFields','read','enter','fields',oldJs+';return enterSchool;')(required,enteredSchoolDraft,guidedSchoolDistrictFixture,schoolNativeFields,scalar,oldEnter,oldFields);
 await old({getByRole(_role:string,o:{name:string}){return{async click(){baselineButtons.push(o.name);}};}},packet);expect(actions).toEqual(baselineActions);expect(buttons).toEqual(baselineButtons);root.remove();
});
it('rejects unknown fixture labels rather than inferring a kind',()=>{for(const label of['','unknown','__proto__','constructor','School account reference '])expect(()=>schoolPartYearNativeKind(label)).toThrow('Unknown');});
