/** Spec: federal/pdf-standalone-flatten.yaml. Structural diagnostics, not form qualification. */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, PDFDict, PDFName, PDFRef, PDFString } from "pdf-lib";
import { afterEach, expect, it } from "vitest";
import { flattenForm, savePdf } from "@/pdf/pdf-utils.js";
import { markReviewPdf, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAOrdinaryReturn } from "@/engine/state/pa-ordinary-return.js";
import { preparePAOrdinaryReturnReview } from "@/pdf/pa-ordinary-return-review-context.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { paOrdinaryBusinessFixture } from "../fixtures/pa-ordinary-business-sources.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
async function directory(name: string) {
  const retained = process.env.TAX_ENGINE_FLATTEN_ARTIFACT_DIR;
  const path = retained ? join(retained, name) : await mkdtemp(join(tmpdir(), "tax-standalone-flatten-"));
  await mkdir(path, { recursive: true });
  if (!retained) temporaryDirectories.push(path);
  return path;
}
type Saved = {
  errors: string[]; fields: Record<string, { value: string; type: string }>;
  annotations: { subtype: string; name: string; value: string; appearance: boolean; appearanceState: string; normalAppearanceStates: string[]; uri: string }[];
  pages: string[]; signature: { byteRange: number[]; reason: string } | null;
};
function independentlyRead(path: string): Saved {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", `
import json,sys
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject
r=PdfReader(sys.argv[1],strict=True); errors=[]; seen=set()
def visit(o,where):
 if isinstance(o,IndirectObject):
  key=(o.idnum,o.generation)
  if key in seen:return
  seen.add(key)
  try: resolved=o.get_object()
  except Exception as exc:errors.append(where+': unresolved: '+str(exc));return
  if resolved is None:errors.append(where+': unresolved');return
  visit(resolved,where+'->'+str(key))
 elif isinstance(o,DictionaryObject):
  for k,v in o.items():visit(v,where+'/'+str(k))
 elif isinstance(o,ArrayObject):
  for i,v in enumerate(o):visit(v,where+'/'+str(i))
visit(r.trailer,'trailer')
fields=r.get_fields() or {}; annotations=[]
for p in r.pages:
 for ref in p.get('/Annots',[]):
  try:a=ref.get_object()
  except Exception:continue
  if a is None:continue
  owner=a; chain=set()
  while '/Parent' in owner and '/T' not in owner:
   parent=owner['/Parent']; key=id(parent)
   if key in chain:break
   chain.add(key);owner=parent
  ap=a.get('/AP');ap=ap.get_object() if ap else None
  appearance=bool(ap and '/N' in ap and ap['/N'] is not None)
  normal=ap['/N'] if ap and '/N' in ap else None
  action=a.get('/A',{});action=action.get_object() if hasattr(action,'get_object') else action
  annotations.append({'subtype':str(a.get('/Subtype','')),'name':str(owner.get('/T','')),'value':str(a.get('/V',owner.get('/V',''))),'appearance':appearance,'appearanceState':str(a.get('/AS','')),'normalAppearanceStates':list(normal.keys()) if isinstance(normal,DictionaryObject) else [],'uri':str(action.get('/URI',''))})
signature=None
if 'signature' in fields:
 v=fields['signature'].get('/V');v=v.get_object() if v else None
 if v:signature={'byteRange':list(v.get('/ByteRange',[])),'reason':str(v.get('/Reason',''))}
print(json.dumps({'errors':errors,'fields':{k:{'value':str(v.get('/V','')),'type':str(v.get('/FT',''))} for k,v in fields.items()},'annotations':annotations,'pages':[p.extract_text() or '' for p in r.pages],'signature':signature}))
`, path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 }));
}
function expectFlattened(saved: Saved) {
  expect(saved.errors).toEqual([]);
  expect(saved.fields).toEqual({});
  expect(saved.annotations.filter(annotation => annotation.subtype === "/Widget")).toEqual([]);
}
async function synthetic() {
  const doc = await PDFDocument.create();
  const first = doc.addPage([612, 792]), second = doc.addPage([612, 792]);
  const amount = doc.getForm().createTextField("amount"); amount.setText("12345.67");
  for (const page of [first, second]) amount.addToPage(page, { x: 60, y: 620, width: 200, height: 30 });
  const selected = doc.getForm().createCheckBox("selected");
  selected.addToPage(first, { x: 60, y: 580, width: 15, height: 15 });
  selected.check();
  const link = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [40, 40, 140, 60],
    A: { Type: "Action", S: "URI", URI: PDFString.of("https://example.invalid/retained-source") } }));
  first.node.addAnnot(link);
  const note = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Text", Rect: [40, 80, 60, 100], Contents: PDFString.of("Synthetic retained note") }));
  second.node.addAnnot(note);
  await markReviewPdf(doc);
  return { doc, first, second, link, note };
}

it("repairs only widget refs invalidated by standalone flatten across shared-field pages", async () => {
  const { doc, first, second, link, note } = await synthetic();
  const originalLink = doc.context.lookup(link), originalNote = doc.context.lookup(note);
  await flattenForm(doc.getForm());
  await flattenForm(doc.getForm()); // Repeated flatten is harmless; no broad cleanup pass.
  const output = join(await directory("synthetic"), "standalone.pdf");
  await savePdf(doc, output);
  const saved = independentlyRead(output); expectFlattened(saved);
  expect(saved.annotations.map(annotation => annotation.subtype).sort()).toEqual(["/Link", "/Text"]);
  expect(saved.annotations.find(annotation => annotation.subtype === "/Link")?.uri).toBe("https://example.invalid/retained-source");
  expect(doc.context.lookup(link)).toBe(originalLink); expect(doc.context.lookup(note)).toBe(originalNote);
  expect(first.node.Annots()?.asArray()).toEqual([link]); expect(second.node.Annots()?.asArray()).toEqual([note]);
  for (const page of saved.pages) { expect(page).toContain("12345.67"); expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2); }
});

it.each([true, false])("actual PA40 standalone flatten resolves annotations with object streams %s", async useObjectStreams => {
  const doc = await PDFDocument.load(await readFile("forms/blank/2025/pa-40.pdf"));
  doc.getForm().getTextField("5. Net Gain or Loss from Sale, etc. of Property").setText("200");
  doc.getForm().getTextField("13. Total PA Tax Withheld").setText("123");
  await markReviewPdf(doc); await flattenForm(doc.getForm());
  const output = join(await directory("actual-pa40-" + useObjectStreams), "standalone.pdf");
  await savePdf(doc, output, { useObjectStreams });
  const saved = independentlyRead(output); expectFlattened(saved);
  expect(saved.pages).toHaveLength(2); expect(saved.pages[0]).toContain("200"); expect(saved.pages[1]).toContain("123");
  for (const page of saved.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
});

it("preserves preexisting missing refs and orphan widget ambiguity", async () => {
  const { doc, first } = await synthetic();
  const missing = PDFRef.of(98765, 0);
  const orphan = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Widget", FT: "Tx", T: PDFString.of("orphan"), V: PDFString.of("Keep ambiguity"), Rect: [40, 120, 160, 140] }));
  first.node.addAnnot(missing); first.node.addAnnot(orphan);
  await flattenForm(doc.getForm());
  expect(first.node.Annots()?.asArray()).toContain(missing); expect(first.node.Annots()?.asArray()).toContain(orphan);
  const output = join(await directory("original-invalid"), "retained-invalid-original.pdf");
  await savePdf(doc, output, { useObjectStreams: false });
  const saved = independentlyRead(output);
  expect(saved.errors).toHaveLength(1); expect(saved.errors[0]).toContain("unresolved");
  expect(saved.annotations.filter(annotation => annotation.subtype === "/Widget").map(annotation => annotation.name)).toEqual(["orphan"]);
  expect(saved.annotations.map(annotation => annotation.subtype).sort()).toEqual(["/Link", "/Text", "/Widget"]);
});

it("default interactive save preserves canonical widgets and signature structure", async () => {
  const { doc, first } = await synthetic();
  const signatureValue = doc.context.register(doc.context.obj({ Type: "Sig", ByteRange: [0, 0, 0, 0], Reason: PDFString.of("Synthetic unsigned structure only") }));
  const signature = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Widget", FT: "Sig", T: PDFString.of("signature"), V: signatureValue, Rect: [40, 140, 180, 160], P: first.ref }));
  doc.getForm().acroForm.addField(signature); first.node.addAnnot(signature);
  const output = join(await directory("interactive"), "interactive.pdf"); await savePdf(doc, output);
  const saved = independentlyRead(output); expect(saved.errors).toEqual([]);
  expect(saved.fields.amount.value).toBe("12345.67"); expect(saved.fields.selected.value).toBe("/Yes"); expect(saved.fields.signature.type).toBe("/Sig");
  const widgets = saved.annotations.filter(annotation => annotation.subtype === "/Widget");
  expect(widgets).toHaveLength(4);
  for (const widget of widgets.filter(widget => widget.name !== "signature")) {
    expect(widget.value).toBe(saved.fields[widget.name].value); expect(widget.appearance).toBe(true);
    if (saved.fields[widget.name].type === "/Btn") {
      expect(widget.appearanceState).toBe(saved.fields[widget.name].value);
      expect(widget.normalAppearanceStates).toContain(widget.appearanceState);
    }
  }
  expect(saved.signature).toEqual({ byteRange: [0, 0, 0, 0], reason: "Synthetic unsigned structure only" });
  expect(doc.getForm().getFields()).toHaveLength(3);
});

it("prunes only deleted-widget structure kids and preserves mixed tags and parent mappings", async () => {
  const { doc, first, second, link } = await synthetic();
  const firstAnnotations = first.node.Annots(), secondAnnotations = second.node.Annots();
  if (!firstAnnotations || !secondAnnotations) throw new Error("Actual synthetic widget annotations required");
  const firstWidgets = firstAnnotations.asArray().slice(0, 2), secondWidget = secondAnnotations.get(0);
  const orphan = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Widget", FT: "Tx", T: PDFString.of("untouched-orphan"), Rect: [40, 120, 160, 140], StructParent: 4 }));
  second.node.addAnnot(orphan);
  for (const [key, ref] of [...firstWidgets, secondWidget, link].entries()) {
    doc.context.lookup(ref, PDFDict).set(PDFName.of("StructParent"), doc.context.obj(key));
  }
  const root = doc.context.obj({ Type: "StructTreeRoot" }), rootRef = doc.context.register(root);
  const objectKid = (ref: PDFRef) => doc.context.obj({ Type: "OBJR", Obj: ref, Pg: first.ref });
  const indirectDeletedKid = doc.context.register(objectKid(firstWidgets[1] as PDFRef));
  const deletedParent = doc.context.register(doc.context.obj({ Type: "StructElem", S: "Form", ID: PDFString.of("deleted-parent"), P: rootRef, K: [objectKid(firstWidgets[0] as PDFRef), indirectDeletedKid] }));
  const retainedParent = doc.context.register(doc.context.obj({ Type: "StructElem", S: "P", ID: PDFString.of("retained-parent"), P: rootRef, K: [{ Type: "MCR", Pg: first.ref, MCID: 7 }, objectKid(link), objectKid(orphan), objectKid(secondWidget as PDFRef)] }));
  root.set(PDFName.of("K"), doc.context.obj([deletedParent, retainedParent]));
  root.set(PDFName.of("ParentTree"), doc.context.obj({ Nums: [0, deletedParent, 1, deletedParent, 2, retainedParent, 3, retainedParent, 4, retainedParent, 100, [null, null, null, null, null, null, null, retainedParent]] }));
  root.set(PDFName.of("ParentTreeNextKey"), doc.context.obj(101));
  root.set(PDFName.of("IDTree"), doc.context.obj({ Names: [PDFString.of("deleted-parent"), deletedParent, PDFString.of("retained-parent"), retainedParent] }));
  first.node.set(PDFName.of("StructParents"), doc.context.obj(100));
  doc.catalog.set(PDFName.of("StructTreeRoot"), rootRef);
  await flattenForm(doc.getForm());
  const output = join(await directory("mixed-tags"), "standalone.pdf"); await savePdf(doc, output);
  const saved = independentlyRead(output); expect(saved.errors).toEqual([]); expect(saved.fields).toEqual({});
  expect(saved.annotations.filter(annotation => annotation.subtype === "/Widget").map(annotation => annotation.name)).toEqual(["untouched-orphan"]);
  const tags = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", `
import json,sys
from pypdf import PdfReader
from pypdf.generic import ArrayObject,NullObject
r=PdfReader(sys.argv[1],strict=True);root=r.trailer['/Root']['/StructTreeRoot']; parents=[]
for ref in root['/K']:
 p=ref.get_object();kids=p.get('/K',[]);kids=kids.get_object() if hasattr(kids,'get_object') else kids
 if not isinstance(kids,ArrayObject):kids=[kids]
 values=[]
 for k in kids:
  k=k.get_object()
  if k.get('/Type')=='/MCR':values.append('MCID:'+str(k['/MCID']))
  else:values.append('OBJR:'+str(k['/Obj'].get('/Subtype')))
 parents.append({'id':str(p['/ID']),'kids':values,'parentIsRoot':p['/P']==root})
nums=root['/ParentTree']['/Nums']; mappings=[]
for i in range(0,len(nums),2):
 v=nums[i+1].get_object()
 mappings.append([nums[i],[None if isinstance(x,NullObject) else str(x.get_object()['/ID']) for x in v] if isinstance(v,ArrayObject) else str(v['/ID'])])
names=root['/IDTree']['/Names']
print(json.dumps({'parents':parents,'mappings':mappings,'nextKey':root['/ParentTreeNextKey'],'idTree':[[str(names[i]),str(names[i+1].get_object()['/ID'])] for i in range(0,len(names),2)],'pageStructParents':r.pages[0]['/StructParents']}))
`, output], { encoding: "utf8", timeout: 15000 }));
  expect(tags).toEqual({ parents: [{ id: "deleted-parent", kids: [], parentIsRoot: true }, { id: "retained-parent", kids: ["MCID:7", "OBJR:/Link", "OBJR:/Widget"], parentIsRoot: true }], mappings: [[0, "deleted-parent"], [1, "deleted-parent"], [2, "retained-parent"], [3, "retained-parent"], [4, "retained-parent"], [100, [null, null, null, null, null, null, null, "retained-parent"]]], nextKey: 101, idTree: [["deleted-parent", "deleted-parent"], ["retained-parent", "retained-parent"]], pageStructParents: 100 });
});

it("actual ordinary fillReturn standalone components resolve without temporary merge", async () => {
  const fixture = paOrdinaryBusinessFixture("resident");
  const input = Object.assign(fixture.input, { paOrdinaryReturnFacts: fixture.facts, paOrdinaryReturnCompletionSources: fixture.sources });
  const before = structuredClone(input), ordinary = calculatePAOrdinaryReturn(input, fixture.facts, fixture.sources), result = calculateFederalTax(input);
  result.stateReturns = { pennsylvania: ordinary };
  const packet = await fillReturn(redactReviewIdentifiers(input), result, { blankFormsDir: join(process.cwd(), "forms/blank/2025"), outputDir: await directory("actual-fill-return"), flatten: true, useObjectStreams: false, purpose: "review", paOrdinaryReview: preparePAOrdinaryReturnReview(input) });
  expect(packet.filledForms.length).toBeGreaterThan(1);
  const outputs = packet.filledForms.map(path => ({ path, saved: independentlyRead(path) }));
  for (const { saved } of outputs) {
    expectFlattened(saved);
    for (const page of saved.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    for (const identity of [input.taxpayer.primary.ssn, input.taxpayer.primary.ssn.replace(/\D/g, ""), input.form1099Nec[0].payerTin]) if (identity) expect(saved.pages.join("\n")).not.toContain(identity);
  }
  expect(outputs.find(output => output.path.endsWith("pa-40-filled.pdf"))?.saved.pages.join("\n").replaceAll(",", "")).toContain("2005");
  expect(outputs.find(output => output.path.endsWith("pa-schedule-c-reference.pdf"))?.saved.pages.join("\n")).toContain("$15200");
  expect(input).toEqual(before); expect(ordinary.readiness.filingEligible).toBe(false);
}, 120000);
