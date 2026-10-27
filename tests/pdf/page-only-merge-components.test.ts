import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, PDFString, PDFName } from "pdf-lib";
import { afterEach, expect, it } from "vitest";
import { savePdf, flattenForm } from "@/pdf/pdf-utils.js";
import { markReviewPdf, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { execFileSync } from "node:child_process";
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function directory(){const d=await mkdtemp(join(tmpdir(),"tax-page-only-merge-"));dirs.push(d);return d;}
async function actualDoc(flatten:boolean){
 const doc=await PDFDocument.create();const page=doc.addPage([612,792]);
 const amount=doc.getForm().createTextField("actual-amount");amount.setText("12345.67");amount.addToPage(page,{x:50,y:650,width:200,height:30});
 const box=doc.getForm().createCheckBox("actual-choice");box.check();box.addToPage(page,{x:50,y:600,width:15,height:15});
 doc.setTitle("Temporary review component");doc.setAuthor("Synthetic source");await markReviewPdf(doc);
 if(flatten)await flattenForm(doc.getForm());
 // Unreachable template remnants must not be serialized in the opt-in merge input.
 for(let i=0;i<20;i++)doc.context.register(PDFString.of("unused-template-object-".repeat(100)));
 return doc;
}
it("copies only completed page resources while preserving appearances and review metadata",async()=>{
 const dir=await directory(),doc=await actualDoc(true);const before=doc.context.enumerateIndirectObjects().length;
 const ordinary=join(dir,"ordinary.pdf"),merge=join(dir,"merge.pdf");
 await savePdf(doc,ordinary,{useObjectStreams:false});await savePdf(doc,merge,{useObjectStreams:false,pageOnlyTemporaryMerge:true});
 const base=await readFile(ordinary),candidate=await readFile(merge);expect(candidate.length).toBeLessThan(base.length);
 expect(candidate.toString("latin1")).not.toContain("unused-template-object-");expect(base.toString("latin1")).toContain("unused-template-object-");
 expect(doc.context.enumerateIndirectObjects().length).toBeGreaterThanOrEqual(before);
 const reopened=await PDFDocument.load(candidate);expect(reopened.getForm().getFields()).toHaveLength(0);expect(reopened.getPageCount()).toBe(1);
 expect(reopened.getSubject()).toBe(doc.getSubject());expect(reopened.getTitle()).toBe(doc.getTitle());expect(reopened.getAuthor()).toBe(doc.getAuthor());
 const values=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??"python3",["-c","import sys,json;from pypdf import PdfReader;print(json.dumps([[p.extract_text() for p in PdfReader(f).pages] for f in sys.argv[1:]]))",ordinary,merge],{encoding:"utf8",timeout:5000}));
 expect(values[1]).toEqual(values[0]);expect(values[1][0]).toContain("12345.67");expect(values[1][0].split(REVIEW_PDF_NOTICE)).toHaveLength(2);
});
it("rejects an interactive component before writing instead of dropping its fields",async()=>{
 const dir=await directory(),output=join(dir,"not-created","component.pdf"),doc=await actualDoc(false);
 await expect(savePdf(doc,output,{useObjectStreams:false,pageOnlyTemporaryMerge:true})).rejects.toThrow(/flattened|interactive/);
 await expect(stat(join(dir,"not-created"))).rejects.toMatchObject({code:"ENOENT"});
 expect(doc.getForm().getTextField("actual-amount").getText()).toBe("12345.67");
});
it("keeps default interactive exports compressed with their original fields",async()=>{
 const dir=await directory(),output=join(dir,"ordinary.pdf"),doc=await actualDoc(false);await savePdf(doc,output);
 const bytes=await readFile(output);expect(bytes.toString("latin1")).toContain("/Type /ObjStm");const reopened=await PDFDocument.load(bytes);
 expect(reopened.getForm().getTextField("actual-amount").getText()).toBe("12345.67");expect(reopened.getForm().getCheckBox("actual-choice").isChecked()).toBe(true);
});
it("rejects a page-only option outside the explicitly uncompressed temporary route",async()=>{
 const dir=await directory();await expect(savePdf(await actualDoc(true),join(dir,"component.pdf"),{pageOnlyTemporaryMerge:true})).rejects.toThrow(/temporary|uncompressed/);
});
it("rejects unflattened page-only packet requests before template access",async()=>{
 const dir=await directory(),result=calculateFederalTax(simpleW2Fixture);
 await expect(fillReturn(simpleW2Fixture,result,{blankFormsDir:join(dir,"missing-template"),outputDir:join(dir,"not-created"),flatten:false,useObjectStreams:false,pageOnlyTemporaryMerge:true})).rejects.toThrow(/flattened|flatten/);
 await expect(stat(join(dir,"not-created"))).rejects.toMatchObject({code:"ENOENT"});
});

it("rejects an orphan page widget before creating output even when catalog fields are empty", async () => {
  const dir = await directory();
  const doc = await actualDoc(false);
  doc.getForm().updateFieldAppearances();
  doc.catalog.getOrCreateAcroForm().dict.set(PDFName.of("Fields"), doc.context.obj([]));
  expect(doc.getForm().getFields()).toHaveLength(0);
  const output = join(dir, "not-created", "orphan.pdf");
  await expect(savePdf(doc, output, { useObjectStreams: false, pageOnlyTemporaryMerge: true }))
    .rejects.toThrow(/flattened|interactive|widget/);
  await expect(stat(join(dir, "not-created"))).rejects.toMatchObject({ code: "ENOENT" });
});
