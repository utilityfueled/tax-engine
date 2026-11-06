/** Spec: federal/guided-rrta-paper-browser.yaml#saved-pdf-typed-privacy. Synthetic regression PDFs only. */
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PDFBool,PDFDocument,PDFHexString,PDFName,PDFString} from 'pdf-lib';
import {confirmedPayrollSetup,pdfPrivateIdentifiers,inspectSavedPrivacy,inspectSavedReview} from '../../apps/web/tests/helpers/rrta-paper-review-fixture';
vi.mock('node:child_process',async importOriginal=>{const original=await importOriginal<typeof import('node:child_process')>();return{...original,spawnSync:vi.fn(original.spawnSync)};});
const compact='111111111',fraction='41.611111111111114';
const owned:string[]=[];
beforeEach(async()=>{vi.mocked(spawnSync).mockReset().mockImplementation((await vi.importActual<typeof import('node:child_process')>('node:child_process')).spawnSync);});
afterEach(async()=>{vi.mocked(spawnSync).mockReset();await Promise.all(owned.splice(0).map(path=>rm(path,{recursive:true,force:true})));});
type Kind='clean'|'literal'|'hex'|'utf16'|'nested'|'metadata'|'hidden-name'|'unknown-hex'|'unknown-octal'|'unreferenced-hex'|'unreferenced-octal'|'unused-form'|'geometry-cm'|'geometry-Tm'|'geometry-form'|'geometry-string'|'integer'|'unknown-operator'|'raw'|'uncompressed-geometry'|'malformed';
async function synthetic(kind:Kind){
 const doc=await PDFDocument.create();doc.setSubject('FOR REVIEW ONLY - NOT FOR FILING');
 let content='q Q';
 if(kind==='literal')content=`BT (${compact}) Tj ET`;
 if(kind==='hex')content=`BT <${Buffer.from(compact).toString('hex')}> Tj ET`;
 if(kind==='utf16')content=`BT ${PDFHexString.fromText(compact).toString()} Tj ET`;
 if(kind==='nested')content=`/Span << /ActualText (${compact}) >> BDC EMC`;
 if(kind==='geometry-cm'||kind==='uncompressed-geometry')content=`q 1 0 0 1 ${fraction} 0 cm Q`;
 if(kind==='geometry-Tm')content=`BT 1 0 0 1 ${fraction} 0 Tm ET`;
 if(kind==='geometry-string')content=`BT (${fraction}) Tj ET`;
 if(kind==='integer')content=`q 1 0 0 1 ${compact} 0 cm Q`;
 if(kind==='unknown-operator')content=`q 1 0 0 1 ${fraction} 0 cm XYZ Q`;
 if(kind==='metadata')doc.setTitle(compact);
 if(kind==='hidden-name')doc.catalog.set(PDFName.of('SyntheticHidden'),doc.context.obj({[compact]:PDFString.of('harmless')}));
 if(['unknown-hex','unknown-octal','unreferenced-hex','unreferenced-octal'].includes(kind)){
  const encoded=kind.endsWith('hex')?`<${Buffer.from(compact).toString('hex')}>`:'('+('\\061'.repeat(9))+')';
  const stream=doc.context.flateStream(encoded),ref=doc.context.register(stream);
  if(kind.startsWith('unknown'))doc.catalog.set(PDFName.of('SyntheticUnknown'),ref);
 }
 for(let i=0;i<4;i++){
  const page=doc.addPage([200,200]);let pageContent=content;
  if(kind==='geometry-form'||kind==='unused-form'){
   const form=doc.context.flateStream(`q 1 0 0 1 ${fraction} 0 cm Q`,{Type:'XObject',Subtype:'Form',BBox:[0,0,200,200],Resources:{}}),ref=doc.context.register(form);
   page.node.set(PDFName.of('Resources'),doc.context.obj({XObject:{SyntheticForm:ref}}));
   pageContent=kind==='geometry-form'?'/SyntheticForm Do':'q Q';
  }
  const dict={TaxEngineReviewNotice:PDFBool.True};const stream=kind==='uncompressed-geometry'?doc.context.stream(pageContent,dict):doc.context.flateStream(pageContent,dict);
  page.node.set(PDFName.of('Contents'),doc.context.register(stream));
 }
 let bytes=Buffer.from(await doc.save({useObjectStreams:false}));if(kind==='raw')bytes=Buffer.concat([bytes,Buffer.from(`\n%${compact}\n`)]);if(kind==='malformed')bytes=Buffer.from('%PDF-1.7\nmalformed synthetic PDF');
 const dir=await mkdtemp(join(tmpdir(),'rrta-saved-privacy-'));owned.push(dir);const path=join(dir,'synthetic-review.pdf');await writeFile(path,bytes);return{path,bytes,expected:{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,pages:4}};
}
function result(expected:{sha256:string;bytes:number;pages:number},markersChecked=1){return{schemaVersion:1,status:'PASS',...expected,markersChecked,geometrySubstringExemptions:0,scope:'full-graph-typed-content'};}
function child(stdout:unknown,overrides:Record<string,unknown>={}){return{pid:0,output:[],stdout,stderr:'',status:0,signal:null,...overrides}as unknown as ReturnType<typeof spawnSync>;}
describe('Spec guided-rrta-paper-browser saved-pdf-typed-privacy',()=>{
 it.each(['literal','hex','utf16','nested','metadata','hidden-name','unknown-hex','unknown-octal','unreferenced-hex','unreferenced-octal','unused-form','geometry-string','integer','unknown-operator','raw','uncompressed-geometry']as const)('denies hidden saved-review identifier case %s',async kind=>{const sample=await synthetic(kind);expect(()=>inspectSavedPrivacy(sample.path,[compact],sample.expected),kind).toThrow('Bounded saved-PDF privacy inspection failed');});
 it.each(['clean','geometry-cm','geometry-Tm','geometry-form']as const)('preserves typed saved-review geometry boundary case %s',async kind=>{const sample=await synthetic(kind),read=inspectSavedPrivacy(sample.path,[compact],sample.expected);expect(read.status).toBe('PASS');if(kind==='clean')expect(read.geometrySubstringExemptions).toBe(0);else expect(read.geometrySubstringExemptions).toBeGreaterThan(0);});
 it('distinguishes compressed geometry in the actual saved-review inspector',async()=>{const sample=await synthetic('geometry-cm'),read=await inspectSavedReview(sample.path,[compact]);expect(read.identifierScanPassed).toBe(true);expect(read.geometrySubstringExemptions).toBeGreaterThan(0);expect(read.pages).toBe(4);});
 it('retains all legacy strict derived surfaces before any typed child result',async()=>{
  for(const kind of ['literal','hex','utf16','nested','metadata','hidden-name','unknown-hex','unknown-octal','unreferenced-hex','unreferenced-octal','raw']as const){const sample=await synthetic(kind),mock=vi.mocked(spawnSync);mock.mockReturnValue(child(JSON.stringify(result(sample.expected))));await expect(inspectSavedReview(sample.path,[compact]),kind).rejects.toThrow();expect(mock,kind).not.toHaveBeenCalled();mock.mockReset();}
  const sample=await synthetic('geometry-cm'),mock=vi.mocked(spawnSync);mock.mockReturnValue(child(JSON.stringify(result(sample.expected))));const read=await inspectSavedReview(sample.path,[compact]);expect(mock).toHaveBeenCalledTimes(1);expect(read.strictSurfaces).toBeGreaterThan(0);expect(read.typedStreamSurfaces).toBe(4);
 });
 it('rejects malformed saved PDFs and untrusted bounded child outcomes',async()=>{
  const broken=await synthetic('malformed');expect(()=>inspectSavedPrivacy(broken.path,[compact],broken.expected)).toThrow('Bounded saved-PDF privacy inspection failed');
  const expected={sha256:'a'.repeat(64),bytes:100,pages:4},good=result(expected),mock=vi.mocked(spawnSync);
  const invalid=[child('not-json'),child(JSON.stringify({...good,extra:true})),child(JSON.stringify({...good,sha256:'b'.repeat(64)})),child(JSON.stringify({...good,bytes:101})),child(JSON.stringify({...good,pages:5})),child(JSON.stringify({...good,markersChecked:0})),child(JSON.stringify({...good,scope:'unknown'})),child(JSON.stringify({...good,status:'DENY'})),child(JSON.stringify({...good,geometrySubstringExemptions:-1})),child(JSON.stringify({...good,geometrySubstringExemptions:0.5})),child(JSON.stringify(good),{error:new Error('synthetic child error')}),child(JSON.stringify(good),{status:2}),child(JSON.stringify(good),{status:null,signal:'SIGTERM'}),child(JSON.stringify(good),{stderr:'synthetic warning'}),child(' '.repeat(65537)),child(null)];
  for(const value of invalid){mock.mockReturnValue(value);expect(()=>inspectSavedPrivacy('synthetic-owned.pdf',[compact],expected)).toThrow('Bounded saved-PDF privacy inspection failed');}
  mock.mockImplementation(()=>{throw Error('untrusted child detail');});expect(()=>inspectSavedPrivacy('synthetic-owned.pdf',[compact],expected)).toThrow('Bounded saved-PDF privacy inspection failed');
  const allMarkers=pdfPrivateIdentifiers(confirmedPayrollSetup()),allGood=result(expected,allMarkers.length);mock.mockReturnValue(child(JSON.stringify(allGood)));expect(inspectSavedPrivacy('synthetic-owned.pdf',allMarkers,expected)).toEqual(allGood);const call=mock.mock.calls.at(-1);expect(call?.[1]?.slice(0,2)).toEqual(['-I','-B']);const options=call?.[2]as{timeout:number;maxBuffer:number;input:string;env:Record<string,string>};expect(options.timeout).toBe(4000);expect(options.maxBuffer).toBe(65536);expect(JSON.parse(options.input)).toEqual(allMarkers);expect(Object.keys(options.env).every(key=>['PATH','SystemRoot','WINDIR','TMPDIR','TMP','TEMP','LANG','LC_ALL'].includes(key))).toBe(true);
 });
 it('keeps all eighteen original browser identifier markers unchanged',()=>{expect(pdfPrivateIdentifiers(confirmedPayrollSetup())).toEqual(["SYNTHETIC-private-all-W2-paper-B-N-review", "SYNTHETIC-private-all-W2-paper-reference-revised", "synthetic-paper-encrypted-recovery-password", "wrong-synthetic-paper-recovery-password", "111-22-3333", "111223333", "222-33-4444", "222334444", "11-1111111", "111111111", "Actual annual diary and payroll reconciliation", "restaurant", "12-3456789", "123456789", "Actual railroad annual payroll and Box14 originals", "rail-original", "formW2:0", "Actual W2 Box14 original"]);});
});
