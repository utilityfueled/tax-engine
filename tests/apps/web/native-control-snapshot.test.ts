/** Spec: browser/native-control-snapshot.yaml. Pure locator/channel fakes; no browser timing claim. */
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {schoolPartYearNativeKind} from '../../../apps/web/tests/helpers/school-part-year-native-kinds';

const root=process.cwd(), candidate=root;
const paths=['oh-business-native','oh-business-part-year-native','oh-reciprocal-native','pa-married-payment-native','pa-royalty-sources','passenger-native-source-collector'].map(n=>'apps/web/tests/'+n+'.spec.ts').concat('apps/web/tests/helpers/oh-resident-credit-browser.ts');
const schoolPath='apps/web/tests/oh-school-district-part-year-native.spec.ts';
const schoolInput='School account reference', schoolSelect='School account return type';
function required<T>(value:T|undefined):T{if(value===undefined)throw Error('Required test fact');return value;}
type NodeLike={tagName:string;id:string};
type Scenario={frames:NodeLike[][];afterSnapshot?:NodeLike[];afterLabel?:NodeLike[];afterFill?:NodeLike[];reject?:'selectOption'|'fill'|'press';labelCount?:number};
function fn(text:string,name:string){const sf=ts.createSourceFile('actual.ts',text,ts.ScriptTarget.Latest,true);const n=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!n)throw Error('Actual entry function missing '+name);return ts.transpileModule(n.getText(sf).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;}
function loadHelper(pw:unknown,sourceRoot:string,fileName:string,exportName:string){const file=path.join(sourceRoot,'apps/web/tests/helpers',fileName);let source:string;try{source=readFileSync(file,'utf8');}catch{return undefined;}const loaded={exports:{}};const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('module','exports','require',compiled)(loaded,loaded.exports,(n:string)=>{if(n!=='@playwright/test')throw Error('Unexpected dependency');return pw;});return Reflect.get(loaded.exports,exportName);}
function helper(pw:unknown,sourceRoot=candidate){return loadHelper(pw,sourceRoot,'native-control-snapshot.ts','nativeControlTag') as ((field:unknown)=>Promise<string>)|undefined;}
function harness(s:Scenario){const actions:string[]=[],reads:string[]=[],polls:Array<{timeout:number;attempts:number;elapsed:number}>=[];let index=0,current=s.frames[0]??[],clock=0;const next=()=>{current=s.frames[Math.min(index++,s.frames.length-1)]??[];return current;};
 const exact=()=>{if(current.length!==1)throw Error('strict count');return required(current[0]);};
 const field={async evaluateAll(cb:(nodes:NodeLike[])=>unknown){reads.push('evalOnSelectorAll');const value=cb(next());if(s.afterSnapshot)current=s.afterSnapshot;return value;},async evaluate(cb:(node:NodeLike)=>unknown){reads.push('waitForSelector','evaluateExpression','dispose');const value=cb(exact());if(s.afterSnapshot)current=s.afterSnapshot;return value;},async selectOption(value:string){const n=exact();actions.push('selectOption:'+n.id+':'+value);if(n.tagName!=='SELECT'||s.reject==='selectOption')throw Error('select rejected');},async fill(value:string){const n=exact();actions.push('fill:'+n.id+':'+value);if(!['INPUT','TEXTAREA'].includes(n.tagName)||s.reject==='fill')throw Error('fill rejected');if(s.afterFill)current=s.afterFill;},async press(value:string){const n=exact();actions.push('press:'+n.id+':'+value);if(s.reject==='press')throw Error('press rejected');}};
 const assertCount=async()=>{reads.push('expect');for(let i=0;i<100;i++){if(next().length===1)return;clock+=100;if(clock>=5000)throw Error('count timeout 5000');}throw Error('poll bound');};
 const labels:string[]=[];
 const label={locator(selector:string){
  expect(selector).toBe('..');
  return {locator(selector:string){expect(selector).toBe('input,select');return field;}};
 }};
 const pw=Object.assign((actual:unknown)=>({async toHaveCount(value:number){
  expect(value).toBe(1);
  if(actual===field)return assertCount();
  expect(actual).toBe(label);
  reads.push('expect-label');
  if(s.labelCount!==undefined&&s.labelCount!==1)throw Error('label count');
  if(s.afterLabel)current=s.afterLabel;
 }}),{poll(callback:()=>Promise<unknown>,options?:{timeout?:number;intervals?:number[]}){return{async toBe(value:unknown){const timeout=options?.timeout??5000,record={timeout,attempts:0,elapsed:0};polls.push(record);const intervals=options?.intervals??[100,250,500,1000];while(true){record.attempts++;if(Object.is(await callback(),value))return;const step=required(intervals[Math.min(record.attempts-1,intervals.length-1)]);if(record.elapsed+step>=timeout)throw Error('poll timeout '+timeout);record.elapsed+=step;}}};}});
 const page={locator(selector:string){
  expect(selector).toBe('label');
  return {getByText(text:string,options:{exact:boolean}){expect(options).toEqual({exact:true});labels.push(text);return label;}};
 }};
 return{actions,reads,polls,labels,field,pw,page};}
async function run(file:string,s:Scenario,sourceRoot=candidate,label='Actual source'){
 const h=harness(s),source=readFileSync(path.join(sourceRoot,file),'utf8'),name=file.includes('passenger-native')?'enterControl':'enter';
 const pw={expect:h.pw},tag=helper(pw,sourceRoot);
 const known=file===schoolPath?loadHelper(pw,sourceRoot,'known-native-control.ts','enterKnownNativeControl'):undefined;
 const f=new Function('expect','nativeControlTag','control','enterKnownNativeControl','schoolPartYearNativeKind',fn(source,name)+';return '+name)(
  h.pw,tag,()=>h.field,known,schoolPartYearNativeKind,
 )as(...args:unknown[])=>Promise<void>;
 let error:string|null=null;try{await(file.includes('passenger-native')?f(h.field,'actual'):f(h.page,label,'actual'));}catch(e){error=(e as Error).message;}return{...h,error};
}
function runSchool(label:string,scenario:Scenario){return run(schoolPath,scenario,candidate,label);}
const input={tagName:'INPUT',id:'original'},select={tagName:'SELECT',id:'original'};
describe('native exact control snapshot',()=>{
 it('uses one read-only protocol snapshot per successful entry',async()=>{for(const file of paths){const r=await run(file,{frames:[[input]]});expect(r.error,file).toBeNull();expect(r.reads.filter(v=>v!=='expect-label'),file).toEqual(['evalOnSelectorAll']);expect(r.actions,file).toEqual(['fill:original:actual','press:original:Tab']);}});
 it('requires exactly one current match before actions',async()=>{for(const frames of [[[]],[[input,select]]])for(const file of paths){const r=await run(file,{frames});expect(r.error,file).toContain('timeout 5000');expect(r.actions,file).toEqual([]);expect(r.polls[0]?.timeout,file).toBe(5000);}});
 it('preserves ordered real actions and re-resolves replacements',async()=>{for(const file of paths){for(const node of [input,select]){const r=await run(file,{frames:[[node]],afterSnapshot:[{...node,id:'replacement'}]});expect(r.error,file).toBeNull();expect(r.actions,file).toEqual(node===input?['fill:replacement:actual','press:replacement:Tab']:['selectOption:replacement:actual']);}}});
 it('accepts dynamically appearing single controls without retaining an earlier node',async()=>{for(const file of paths){const r=await run(file,{frames:[[],[input,select],[select]]});expect(r.error,file).toBeNull();expect(r.reads,file).toEqual(['evalOnSelectorAll','evalOnSelectorAll','evalOnSelectorAll']);expect(r.actions,file).toEqual(['selectOption:original:actual']);}});
 it('propagates wrong type and action rejections without subsequent actions',async()=>{for(const file of paths){for(const [node,reject,wanted]of [[{tagName:'BUTTON',id:'wrong'},undefined,['fill:wrong:actual']],[select,'selectOption',['selectOption:original:actual']],[input,'fill',['fill:original:actual']],[input,'press',['fill:original:actual','press:original:Tab']]]as const){const r=await run(file,{frames:[[node]],reject});expect(r.error,file).not.toBeNull();expect(r.actions,file).toEqual(wanted);}}});
 it('fails closed if current action match disappears or becomes duplicate',async()=>{for(const file of paths)for(const replacement of [[],[input,select]]){const r=await run(file,{frames:[[input]],afterSnapshot:replacement});expect(r.error,file).toBe('strict count');expect(r.actions,file).toEqual([]);}});
 it('takes a fresh snapshot on repeated calls to the same locator',async()=>{const h=harness({frames:[[input],[select]]}),read=helper({expect:h.pw});expect(read).toBeTypeOf('function');expect(await required(read)(h.field)).toBe('INPUT');expect(await required(read)(h.field)).toBe('SELECT');expect(h.reads).toEqual(['evalOnSelectorAll','evalOnSelectorAll']);});
});

describe('part-year School known native controls',()=>{
 it('preserves the independent school label assertion',async()=>{
  for(const labelCount of [0,2]){
   const r=await runSchool(schoolInput,{frames:[[input]],labelCount});
   expect(r.labels).toEqual([schoolInput]);
   expect(r.reads).toEqual(['expect-label']);
   expect(r.error).toBe('label count');
   expect(r.actions).toEqual([]);
  }
  for(const [label,node,actions] of [
   [schoolInput,input,['fill:original:actual','press:original:Tab']],
   [schoolSelect,select,['selectOption:original:actual']],
  ]as const){
   const r=await runSchool(label,{frames:[[node]],labelCount:1});
   expect(r.error).toBeNull();
   expect(r.labels).toEqual([label]);
   expect(r.reads).toEqual(['expect-label']);
   expect(r.polls).toEqual([]);
   expect(r.actions).toEqual(actions);
  }
 });

 it('uses the current School control after the label gate and between actions',async()=>{
  const replacement={...input,id:'replacement'},tabTarget={...input,id:'tab-target'};
  const r=await runSchool(schoolInput,{frames:[[input]],afterLabel:[replacement],afterFill:[tabTarget]});
  expect(r.error).toBeNull();
  expect(r.reads).toEqual(['expect-label']);
  expect(r.actions).toEqual(['fill:replacement:actual','press:tab-target:Tab']);
  const appeared=await runSchool(schoolSelect,{frames:[[]],afterLabel:[select]});
  expect(appeared.error).toBeNull();
  expect(appeared.reads).toEqual(['expect-label']);
  expect(appeared.actions).toEqual(['selectOption:original:actual']);
 });

 it('rejects unknown School labels, missing and duplicate controls',async()=>{
  const unknown=await runSchool('Unknown school fixture label',{frames:[[input]]});
  expect(unknown.error).toBe('Unknown part-year school native field label');
  expect(unknown.labels).toEqual([]);
  expect(unknown.reads).toEqual([]);
  expect(unknown.actions).toEqual([]);
  for(const replacement of [[],[input,select]]){
   const r=await runSchool(schoolInput,{frames:[[input]],afterLabel:replacement});
   expect(r.error).toBe('strict count');
   expect(r.reads).toEqual(['expect-label']);
   expect(r.actions).toEqual([]);
   const afterFill=await runSchool(schoolInput,{frames:[[input]],afterFill:replacement});
   expect(afterFill.error).toBe('strict count');
   expect(afterFill.actions).toEqual(['fill:original:actual']);
  }
 });

 it('propagates a mismatched School control kind and action rejection without later actions',async()=>{
  const cases=[
   [schoolInput,select,undefined,'fill rejected',['fill:original:actual']],
   [schoolSelect,input,undefined,'select rejected',['selectOption:original:actual']],
   [schoolSelect,select,'selectOption','select rejected',['selectOption:original:actual']],
   [schoolInput,input,'fill','fill rejected',['fill:original:actual']],
   [schoolInput,input,'press','press rejected',['fill:original:actual','press:original:Tab']],
  ]as const;
  for(const [label,node,reject,error,actions] of cases){
   const r=await runSchool(label,{frames:[[node]],reject});
   expect(r.error).toBe(error);
   expect(r.reads).toEqual(['expect-label']);
   expect(r.actions).toEqual(actions);
  }
 });
});
