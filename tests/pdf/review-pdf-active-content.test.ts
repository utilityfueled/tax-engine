/** Spec: federal/review-pdf-active-content.yaml. Actual source + semantic controls. */
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {PDFArray,PDFDict,PDFDocument,PDFHexString,PDFName,PDFObject,PDFRef,PDFStream,PDFString} from 'pdf-lib';
import {expect,it} from 'vitest';
import {markReviewPdf} from '@/pdf/export-policy.js';
import {flattenForm,loadPdfDocumentQuietly} from '@/pdf/pdf-utils.js';

const unsafe=new Set(['JavaScript','Launch','GoToR','GoToE','SubmitForm','ImportData','Rendition','Sound','Movie']);
function executableEntries(doc:PDFDocument):string[]{
 const seen=new Set<PDFObject>(),found:string[]=[];
 const walk=(value:PDFObject):void=>{
  const obj=value instanceof PDFRef?doc.context.lookup(value):value;if(!obj||seen.has(obj))return;seen.add(obj);
  if(obj instanceof PDFStream){walk(obj.dict);return;}
  if(obj instanceof PDFDict){
   for(const [key,child] of obj.entries()){
    if(['AA','OpenAction','JS','JavaScript'].includes(key.decodeText()))found.push(key.decodeText());
    if(key===PDFName.of('S')&&child instanceof PDFName&&unsafe.has(child.decodeText()))found.push('action:'+child.decodeText());
    walk(child);
   }
  }else if(obj instanceof PDFArray)for(const child of obj.asArray())walk(child);
 };
 for(const [,value] of doc.context.enumerateIndirectObjects())walk(value);
 return found;
}
async function saved(doc:PDFDocument,name:string):Promise<PDFDocument>{
 const bytes=await doc.save();
 if(process.env.TAX_ENGINE_ACTIVE_PDF_EVIDENCE_DIR){await mkdir(process.env.TAX_ENGINE_ACTIVE_PDF_EVIDENCE_DIR,{recursive:true});await writeFile(join(process.env.TAX_ENGINE_ACTIVE_PDF_EVIDENCE_DIR,name+'.pdf'),bytes);}
 return loadPdfDocumentQuietly(bytes);
}
it.each(['interactive','flattened'] as const)('removes original IRS scripts from the %s review copy',async kind=>{
 const path=join(process.cwd(),'forms/blank/2025/f1040s1.pdf'),bytes=await readFile(path);
 const hash=createHash('sha256').update(bytes).digest('hex');expect(hash).toBe('8dafec719f6a4716c259a2bdaca546d9bb9e262d1eabef885fe116a7327458fa');
 const doc=await loadPdfDocumentQuietly(bytes);expect(executableEntries(doc).filter(x=>x==='JS').length).toBeGreaterThanOrEqual(3);
 const names=doc.getForm().getFields().map(f=>f.getName()),geometry=doc.getPages().map(p=>p.getSize());
 await markReviewPdf(doc);if(kind==='flattened')await flattenForm(doc.getForm());
 const output=await saved(doc,'official-'+kind);expect(executableEntries(output)).toEqual([]);
 expect(output.getPages().map(p=>p.getSize())).toEqual(geometry);
 expect(output.getForm().getFields().map(f=>f.getName())).toEqual(kind==='interactive'?names:[]);
 expect(createHash('sha256').update(await readFile(path)).digest('hex')).toBe(hash);
});
it('removes executable actions throughout the graph and preserves ordinary document semantics',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([612,792]),form=doc.getForm();
 const field=form.createTextField('actual.amount');field.setText('12345');field.addToPage(page,{x:40,y:600,width:100,height:20});
 const script=doc.context.register(doc.context.obj({S:'JavaScript',JS:PDFHexString.fromText('app.alert("UNTRUSTED")')}));
 doc.catalog.set(PDFName.of('Names'),doc.context.obj({JavaScript:{Names:[PDFString.of('source-script'),script]},Dests:{Names:[PDFString.of('safe-destination'),[page.ref,'Fit']]}}));
 doc.catalog.set(PDFName.of('OpenAction'),script);page.node.set(PDFName.of('AA'),doc.context.obj({O:script}));
 for(const action of unsafe)doc.context.register(doc.context.obj({S:action,JS:PDFString.of('do not run'),Next:script}));
 const uri=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[20,100,200,120],A:{S:'URI',URI:PDFString.of('https://www.irs.gov/')}}));page.node.addAnnot(uri);
 const table=doc.context.register(doc.context.obj({Type:'StructElem',S:'TD',A:{O:'Table',ColSpan:2}}));doc.catalog.set(PDFName.of('TestTableAttribute'),table);
 expect(executableEntries(doc).length).toBeGreaterThan(10);await markReviewPdf(doc);
 const output=await saved(doc,'semantic-graph');expect(executableEntries(output)).toEqual([]);
 expect(output.getForm().getTextField('actual.amount').getText()).toBe('12345');
 const link=output.context.lookup(uri,PDFDict).lookup(PDFName.of('A'),PDFDict);expect(link.lookup(PDFName.of('S'),PDFName)).toBe(PDFName.of('URI'));
 expect(link.lookup(PDFName.of('URI'),PDFString).decodeText()).toBe('https://www.irs.gov/');
 const attributes=output.context.lookup(table,PDFDict).lookup(PDFName.of('A'),PDFDict);expect(attributes.lookup(PDFName.of('O'),PDFName)).toBe(PDFName.of('Table'));
 expect(output.catalog.lookup(PDFName.of('Names'),PDFDict).has(PDFName.of('Dests'))).toBe(true);
 expect(output.getPages()[0]?.getSize()).toEqual({width:612,height:792});
});
it('keeps fields and review notices stable when marking twice',async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage(),field=doc.getForm().createTextField('known.zero');field.setText('0');field.addToPage(page,{x:20,y:100,width:80,height:20});
 await markReviewPdf(doc);await markReviewPdf(doc);const output=await saved(doc,'repeat');
 expect(executableEntries(output)).toEqual([]);expect(output.getForm().getTextField('known.zero').getText()).toBe('0');
 const notices=output.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDFStream&&o.dict.has(PDFName.of('TaxEngineReviewNotice')));
 // Old orphan notice streams may be retained by pdf-lib; the page has only one live notice.
 expect(notices.length).toBeGreaterThanOrEqual(1);
 const contents=output.getPages()[0]?.node.normalizedEntries().Contents;let live=0;
 for(const ref of contents?.asArray()??[]){const obj=output.context.lookup(ref);if(obj instanceof PDFStream&&obj.dict.has(PDFName.of('TaxEngineReviewNotice')))live++;}
 expect(live).toBe(1);
});
