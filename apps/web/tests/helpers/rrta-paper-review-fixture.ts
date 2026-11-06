/** Spec: spec/federal/guided-rrta-paper-browser.yaml. No paper facts are seeded. */
import {expect,type Page} from '@playwright/test';
import {PDFArray,PDFBool,PDFDict,PDFDocument,PDFHexString,PDFName,PDFObject,PDFRawStream,PDFRef,PDFStream,PDFString,decodePDFRawStream} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync,type SpawnSyncReturns} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nativeRRTA} from '../../../../tests/guided-interview/guided-rrta-fixture';
import {buildSectionRoute,type GuidedFlowState} from '../../src/lib/guided-interview-flow';
import {captureGuidedRRTAPayrollSources} from '../../src/lib/guided-interview-bridge';

export const paperReference='SYNTHETIC-private-all-W2-paper-B-N-review';
export const editedPaperReference='SYNTHETIC-private-all-W2-paper-reference-revised';
export const password='synthetic-paper-encrypted-recovery-password';
export const wrongPassword='wrong-synthetic-paper-recovery-password';
export function required<T>(value:T|null|undefined):T{if(value==null)throw Error('Required actual synthetic original is missing');return value;}
/** Only already-covered canonical payroll/tip/household setup. Target paper stays absent. */
export function confirmedPayrollSetup():GuidedFlowState{
 const state=nativeRRTA(),additional=required(state.sectionData['additional-deductions']);
 additional.rrtaPayrollSources={...captureGuidedRRTAPayrollSources(state),sourceFactsConfirmed:true};
 if(additional.rrtaPayrollSources.paperSources!==undefined)throw Error('Target paper facts must not be seeded');
 const route=buildSectionRoute(state.segmentation),index=route.findIndex(section=>section.id==='additional-deductions');if(index<0)throw Error('Actual original-source route absent');
 state.phase='interview';state.currentSectionIndex=index;state.completedSections=route.slice(0,index).map(section=>section.id);return state;
}
export function rrtaDraft(state:GuidedFlowState){return required(state.sectionData['additional-deductions']?.rrtaPayrollSources);}
export function paperDraft(state:GuidedFlowState){return required(rrtaDraft(state).paperSources);}
export function control(page:Page,label:string){return page.locator('label').getByText(label,{exact:true}).locator('..').locator('input,select');}
export async function enter(page:Page,label:string,value:string){const field=control(page,label);await expect(field).toHaveCount(1);if(await field.evaluate(node=>node.tagName)==='SELECT')await field.selectOption(value);else{await field.fill(value);await field.press('Tab');}}
export async function saved(page:Page,id:string):Promise<GuidedFlowState>{return page.evaluate(id=>JSON.parse(localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`)??'null'),id);}
export async function stored(page:Page,id:string){return page.evaluate(id=>({raw:localStorage.getItem(`tax-engine.guided-flow-state.v1:${id}`),workspace:JSON.parse(localStorage.getItem('tax-engine.return-workspaces.v1')??'{}').workspaces?.[id],keys:Object.keys(localStorage).filter(key=>key.includes(id))}),id);}
export function privateMarkers(state:GuidedFlowState):string[]{
 const values=new Set([paperReference,editedPaperReference]),keys=new Set(['firstName','lastName','ssn','dateOfBirth','addressLine1','addressLine2','employerName','employerEin','sourceReference','sourceId','reportedTipReconciliationReference']);
 function visit(value:unknown):void{if(Array.isArray(value)){value.forEach(visit);return;}if(value&&typeof value==='object')for(const[key,child]of Object.entries(value)){if(keys.has(key)&&typeof child==='string'&&child){values.add(child);if(key==='ssn'||key==='employerEin')values.add(child.replaceAll('-',''));}else if(child&&typeof child==='object')visit(child);}}
 visit(state.sectionData);return [...values];
}
/** Existing RRTA review contract forbids personal/employer identifiers and source markers. */
export function pdfPrivateIdentifiers(state:GuidedFlowState):string[]{
 const values=new Set([paperReference,editedPaperReference,password,wrongPassword]);
 function visit(value:unknown):void{if(!value||typeof value!=='object')return;for(const[key,item]of Object.entries(value)){if(typeof item==='string'&&item.trim()&&/(?:ssn|tin|ein|taxid|identifyingnumber|accountReference|sourceId|sourceReference|reportingSourceReference)$/iu.test(key)){values.add(item);if(/^[-.()\s\d]+$/u.test(item))values.add(item.replace(/\D/gu,''));}else visit(item);}}
 visit(state);return [...values];
}
/** Inspect raw and decoded URL/query and every JSON string; malformed deep encoding denies. */
export function privacyFailure(request:{url:string;method:string;body:string},origin:string,markers:readonly string[]):string|null{
 const url=new URL(request.url);if(url.origin!==origin)return 'foreign-origin';
 function decode(raw:string):string[]|null{const values=[raw];try{const parsed:unknown=JSON.parse(raw);const walk=(v:unknown):void=>{if(typeof v==='string')values.push(v);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(parsed);}catch{/* Raw bodies still receive exact and decoded scanning. */}const output:string[]=[];for(const value of values){let current=value;output.push(current);for(let depth=0;depth<3;depth++){let next:string;try{next=decodeURIComponent(current.replaceAll('+',' '));}catch{return null;}if(next===current)break;output.push(next);current=next;}if(/%[a-f0-9]{2}/iu.test(current))return null;}return output;}
 const urls=decode(request.url),bodies=decode(request.body);if(!urls||!bodies)return 'unchecked-encoding';const has=(surfaces:readonly string[],terms:readonly string[])=>surfaces.some(v=>terms.some(term=>v.includes(term)));
 if(has([...urls,...bodies],[password,wrongPassword]))return 'password';if(has(urls,markers))return 'private-url';if(has(bodies,markers)&&(request.method!=='POST'||url.pathname!=='/api/workspace/filled-return'))return 'private-body';return null;
}
export interface SavedReviewPrivacyInspection {
 schemaVersion:1;status:'PASS';sha256:string;bytes:number;pages:number;markersChecked:number;geometrySubstringExemptions:number;scope:'full-graph-typed-content';
}
const savedPrivacyPhases=['module_started','imports_ready','inspection_entered','content_contexts','operand_strings','raw_graph','page_text','complete']as const;
export interface SavedPrivacyPhase {v:1;seq:number;phase:typeof savedPrivacyPhases[number];wallUs:number;cpuUs:number;}
/** Untrusted diagnostic bytes never participate in the privacy verdict. */
export function parseSavedPrivacyPhases(raw:unknown):SavedPrivacyPhase[]|null{
 if(Buffer.isBuffer(raw))raw=raw.toString('utf8');
 if(typeof raw!=='string'||!raw.length||Buffer.byteLength(raw,'utf8')>2048||!/^[\x20-\x7e\n]+$/u.test(raw)||raw.includes('\\')||!raw.endsWith('\n'))return null;
 const lines=raw.slice(0,-1).split('\n');if(!lines.length||lines.length>8)return null;const result:SavedPrivacyPhase[]=[];
 for(const[lineIndex,line]of lines.entries()){
  if(Buffer.byteLength(line,'utf8')>256||(line.match(/"(?:v|seq|phase|wallUs|cpuUs)"\s*:/gu)?.length??0)!==5)return null;
  let parsed:unknown;try{parsed=JSON.parse(line);}catch{return null;}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;const v=parsed as Record<string,unknown>,keys=['v','seq','phase','wallUs','cpuUs'];
  if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k))||v.v!==1||v.seq!==lineIndex||v.phase!==savedPrivacyPhases[lineIndex])return null;
  if(!Number.isSafeInteger(v.wallUs)||!Number.isSafeInteger(v.cpuUs)||(v.wallUs as number)<0||(v.cpuUs as number)<0||(v.wallUs as number)>10000000||(v.cpuUs as number)>10000000)return null;
  const previous=result.at(-1);if(previous&&((v.wallUs as number)<previous.wallUs||(v.cpuUs as number)<previous.cpuUs))return null;
  result.push({v:1,seq:lineIndex,phase:v.phase as typeof savedPrivacyPhases[number],wallUs:v.wallUs as number,cpuUs:v.cpuUs as number});
 }
 return result;
}
/** Fixed saved-byte inspector. Child output never supplies trusted bytes, scope or source facts. */
export function inspectSavedPrivacy(path:string,identifiers:readonly string[],expected:{sha256:string;bytes:number;pages:number}):SavedReviewPrivacyInspection{
 const began=process.hrtime.bigint();let child:SpawnSyncReturns<string>|undefined;
 const fail=(category:'timeout'|'spawn'|'signal'|'exit'|'stderr'|'output'|'json'|'projection')=>{
  try{const phases=parseSavedPrivacyPhases(child?.output?.[3]),elapsed=Number((process.hrtime.bigint()-began)/1000n),parentWallUs=Number.isSafeInteger(elapsed)&&elapsed>=0&&elapsed<=10000000?elapsed:null;console.info('RRTA_PDF_PHASE '+JSON.stringify({schemaVersion:1,status:phases?'VALID_PREFIX':'UNAVAILABLE',category,parentWallUs,phases:phases??[]}));}catch{/* Optional diagnostics never forward errors or change the verdict. */}
  return new Error(`Bounded saved-PDF privacy inspection failed [${category}]`);
 };
 const env:NodeJS.ProcessEnv={};for(const key of ['PATH','SystemRoot','WINDIR','TMPDIR','TMP','TEMP','LANG','LC_ALL'])if(process.env[key]!==undefined)env[key]=process.env[key];
 try{child=spawnSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-I','-B',fileURLToPath(new URL('./rrta-paper-review-privacy.py',import.meta.url)),path,'--phase-fd3'],{input:JSON.stringify(identifiers),encoding:'utf8',timeout:4000,maxBuffer:65536,env,stdio:['pipe','pipe','pipe','pipe']});}catch{throw fail('spawn');}
 if(child.error)throw fail((child.error as NodeJS.ErrnoException).code==='ETIMEDOUT'?'timeout':'spawn');
 if(child.signal!==null)throw fail('signal');
 if(child.status!==0)throw fail('exit');
 if(typeof child.stdout!=='string'||typeof child.stderr!=='string'||Buffer.byteLength(child.stdout,'utf8')>65536)throw fail('output');
 if(child.stderr.length)throw fail('stderr');
 let parsed:unknown;try{parsed=JSON.parse(child.stdout);}catch{throw fail('json');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw fail('projection');const value=parsed as Record<string,unknown>;
 const keys=['schemaVersion','status','sha256','bytes','pages','markersChecked','geometrySubstringExemptions','scope'];if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw fail('projection');
 if(value.schemaVersion!==1||value.status!=='PASS'||value.scope!=='full-graph-typed-content'||value.sha256!==expected.sha256||value.bytes!==expected.bytes||value.pages!==expected.pages||value.markersChecked!==identifiers.length||!Number.isSafeInteger(value.geometrySubstringExemptions)||(value.geometrySubstringExemptions as number)<0)throw fail('projection');
 return value as unknown as SavedReviewPrivacyInspection;
}
/** Saved bytes only: structural/identifier checks; ROOT separately inspects actual printed pages. */
export async function inspectSavedReview(path:string,identifiers:readonly string[]){
 const bytes=await readFile(path);expect(bytes.subarray(0,5).toString('ascii')).toBe('%PDF-');const doc=await PDFDocument.load(bytes);expect(doc.getSubject()).toBe('FOR REVIEW ONLY - NOT FOR FILING');expect(doc.getPageCount()).toBeGreaterThan(3);expect(doc.catalog.has(PDFName.of('AcroForm'))).toBe(false);
 const surfaces:Array<{kind:'strict'|'decoded-stream';value:string}>=[{kind:'strict',value:bytes.toString('latin1')}],seen=new Set<PDFObject>(),dictionaryKeys:string[]=[],dictionarySubtypes:Array<PDFObject|undefined>=[];
 function strictSurface(value:string){surfaces.push({kind:'strict',value});}
 function visit(value:PDFObject):void{if(seen.has(value))return;seen.add(value);if(value instanceof PDFRef){visit(required(doc.context.lookup(value)));return;}if(value instanceof PDFString||value instanceof PDFHexString){strictSurface(value.decodeText());return;}if(value instanceof PDFRawStream){const decoded=Buffer.from(decodePDFRawStream(value).decode()).toString('latin1');surfaces.push({kind:'decoded-stream',value:decoded});for(const match of decoded.matchAll(/<([0-9a-f]+)>/giu))strictSurface(PDFHexString.of(required(match[1])).decodeText());for(const match of decoded.matchAll(/\(((?:\\.|[^()\\])*)\)/gu))strictSurface(PDFString.of(required(match[1])).decodeText());visit(value.dict);return;}if(value instanceof PDFStream){visit(value.dict);return;}if(value instanceof PDFDict){dictionarySubtypes.push(value.get(PDFName.of('Subtype')));for(const[k,v]of value.entries()){dictionaryKeys.push(k.decodeText());strictSurface(k.decodeText());visit(v);}return;}if(value instanceof PDFArray)for(let i=0;i<value.size();i++)visit(value.get(i));}
 for(const[,object]of doc.context.enumerateIndirectObjects())visit(object);
 // Same full-graph predicates, with bounded assertion/trace bookkeeping. No scan surface is dropped.
 expect(dictionarySubtypes).not.toContainEqual(PDFName.of('Widget'));expect(dictionaryKeys.filter(key=>['AcroForm','JS','JavaScript','OpenAction','AA'].includes(key))).toEqual([]);
 // Every legacy derived string/raw-byte surface remains strict, including strings decoded from unknown streams.
 for(const marker of identifiers)expect(surfaces.some(surface=>surface.kind==='strict'&&surface.value.includes(marker))).toBe(false);
 const privacy=inspectSavedPrivacy(path,identifiers,{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,pages:doc.getPageCount()});
 for(const page of doc.getPages()){const contents=page.node.normalizedEntries().Contents;expect(contents).toBeDefined();let notices=0;for(let i=0;i<required(contents).size();i++){const stream=doc.context.lookup(required(contents).get(i));if(stream instanceof PDFStream&&stream.dict.get(PDFName.of('TaxEngineReviewNotice'))===PDFBool.True)notices++;}expect(notices).toBe(1);}
 return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,pages:doc.getPageCount(),resolvedObjects:seen.size,reviewNoticePerPage:true,flattened:true,identifierScanPassed:true,privacyScope:privacy.scope,geometrySubstringExemptions:privacy.geometrySubstringExemptions,strictSurfaces:surfaces.filter(surface=>surface.kind==='strict').length,typedStreamSurfaces:surfaces.filter(surface=>surface.kind==='decoded-stream').length,physicalInspectionClaim:false};
}
