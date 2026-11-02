import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, PDFString, PDFName, PDFRef } from "pdf-lib";
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


// Spec: spec/federal/pdf-page-only-temporary.yaml resolved-page-references.
it("removes only unresolved annotations from copied temporary pages", async () => {
  const dir = await directory();
  const doc = await actualDoc(true);
  const page = doc.getPages()[0];
  const link = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [40, 40, 140, 60],
    A: { Type: "Action", S: "URI", URI: PDFString.of("https://example.invalid/source") } });
  const linkRef = doc.context.register(link);
  const missingRef = PDFRef.of(98765, 0);
  page.node.addAnnot(linkRef);
  page.node.addAnnot(missingRef);
  const originalAnnotations = page.node.Annots();
  if (!originalAnnotations) throw new Error("Missing original synthetic annotations");
  const before = originalAnnotations.asArray().map(String);
  const ordinary = join(dir, "ordinary-with-original-reference.pdf");
  const temporary = join(dir, "temporary-with-resolved-link.pdf");
  await savePdf(doc, ordinary, { useObjectStreams: false });
  await savePdf(doc, temporary, { useObjectStreams: false, pageOnlyTemporaryMerge: true });
  expect(page.node.Annots()?.asArray().map(String)).toEqual(before);
  expect(doc.context.lookup(linkRef)).toBe(link);
  expect(doc.context.lookup(missingRef)).toBeUndefined();
  const values = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", `
import sys,json
from pypdf import PdfReader
def read(path):
 r=PdfReader(path); annotations=[a.get_object() for p in r.pages for a in p.get('/Annots',[])]
 return {'unresolved':sum(a is None for a in annotations),'links':[str(a.get('/A',{}).get('/URI')) for a in annotations if a is not None and a.get('/Subtype')=='/Link'],'widgets':sum(a is not None and a.get('/Subtype')=='/Widget' for a in annotations),'fields':len(r.get_fields() or {}),'pages':[p.extract_text() or '' for p in r.pages]}
print(json.dumps([read(p) for p in sys.argv[1:]]))`, ordinary, temporary], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000 }));
  // The two original widget refs left by flattening plus the explicit missing ref.
  expect(values[0].unresolved).toBe(3);
  expect(values[1].unresolved).toBe(0);
  expect(values[1].links).toEqual(["https://example.invalid/source"]);
  expect(values[0].links).toEqual(values[1].links);
  expect(values[1].widgets).toBe(0);
  expect(values[1].fields).toBe(0);
  expect(values[1].pages).toEqual(values[0].pages);
  expect(values[1].pages[0]).toContain("12345.67");
  expect(values[1].pages[0].split(REVIEW_PDF_NOTICE)).toHaveLength(2);
});

// Spec: spec/federal/pdf-page-only-temporary.yaml actual-pa40-pages.
it("removes dangling references left by flattening the actual PA40 template", async () => {
  const dir = await directory();
  const doc = await PDFDocument.load(await readFile("forms/blank/2025/pa-40.pdf"));
  doc.getForm().getTextField("5. Net Gain or Loss from Sale, etc. of Property").setText("200");
  doc.getForm().getTextField("13. Total PA Tax Withheld").setText("123");
  await markReviewPdf(doc);
  await flattenForm(doc.getForm());
  const path = join(dir, "actual-pa40-temporary.pdf");
  await savePdf(doc, path, { useObjectStreams: false, pageOnlyTemporaryMerge: true });
  const values = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", `
import sys,json
from pypdf import PdfReader
r=PdfReader(sys.argv[1]);annotations=[a.get_object() for p in r.pages for a in p.get('/Annots',[])]
print(json.dumps({'unresolved':sum(a is None for a in annotations),'widgets':sum(a is not None and a.get('/Subtype')=='/Widget' for a in annotations),'fields':len(r.get_fields() or {}),'pages':[p.extract_text() or '' for p in r.pages]}))`, path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000 }));
  expect(values.unresolved).toBe(0);
  expect(values.widgets).toBe(0);
  expect(values.fields).toBe(0);
  expect(values.pages).toHaveLength(2);
  expect(values.pages[0]).toContain("200");
  expect(values.pages[1]).toContain("123");
  for (const page of values.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
});
