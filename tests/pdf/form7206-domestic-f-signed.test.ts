// Spec: spec/federal/form-7206-return.yaml, signed-domestic-f-source/facts.
import {expect,it} from "vitest";
import {PDFDocument} from "pdf-lib";
import {execFileSync} from "node:child_process";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {calculateFederalTax} from "@/engine/federal.js";
import {fillForm7206,assertForm7206ReviewSource,FORM_7206_FIELDS as F} from "@/pdf/fill-form-7206.js";
import {redactReviewIdentifiers} from "@/pdf/redact-review-identifiers.js";
import {domesticFSignedHealthFixture} from "../fixtures/domestic-f-signed-health.js";
it("reopens proven domestic farm review with actual signed foreign conservation",async()=>{
 const input=domesticFSignedHealthFixture(),r=calculateFederalTax(input),render=redactReviewIdentifiers(input);
 const pdf=await fillForm7206(render,r,"forms/blank/2025/f7206.pdf","scheduleF","primary");
 const bytes=await pdf.save(),reopen=await PDFDocument.load(bytes),form=reopen.getForm();
 expect(form.getTextField(F.line12).getText()).toBe("0");expect(form.getTextField(F.line14).getText()).toBe("100");expect(form.getTextField(F.ssn).getText()??"").toBe("");
 const dir=mkdtempSync(join(tmpdir(),"domestic-f-review-"));
 try{
  const file=join(dir,"farm.pdf");writeFileSync(file,bytes);
  const pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??"python3",["-c","from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages]))",file],{encoding:"utf8"}));
  const text=pages.join(" ").replace(/\s+/g," ");
  expect(text).toContain("Actual signed Form2555 line45 remains on its sole foreign C source: $-568");
  expect(text).toContain("Known zero foreign exclusion attributable to the independently proven domestic farm: $0");
  expect(text).not.toContain(input.form7206!.domesticFarmSources!.sourceReference);
  expect(text).not.toContain(input.form2555!.sourceMapping!.rows[0]!.sourceReference);
  for(const page of pages){expect(page).not.toMatch(/123.?45.?6789|6789/);expect(page.split("FOR REVIEW ONLY - NOT FOR FILING")).toHaveLength(2);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it("revalidates current foreign and domestic originals and saved signed audits before export",()=>{
 const input=domesticFSignedHealthFixture(),r=calculateFederalTax(input);
 for(const change of [
  (v:typeof input)=>{v.form2555!.sourceMapping!.sourceFactsConfirmed=false;},
  (v:typeof input)=>{v.form2555!.sourceMapping!.rows[0]!.payerName="Other business";},
  (v:typeof input)=>{v.form2555!.sourceMapping!.rows[0]!.businessGrossReceipts="200001";},
  (v:typeof input)=>{v.form7206!.domesticFarmSources!.sourceFactsConfirmed=false;},
  (v:typeof input)=>{v.form7206!.domesticFarmSources!.allIncomeDomesticConfirmed=undefined;},
  (v:typeof input)=>{v.form7206!.domesticFarmSources!.sourceReference="Different original source";},
  (v:typeof input)=>{v.scheduleF!.principalCropOrActivity="Different farm";},
  (v:typeof input)=>{v.scheduleF!.salesOfProductsRaised="1001";},
 ]){const v=structuredClone(input);change(v);expect(()=>assertForm7206ReviewSource(v,r)).toThrow();}
 const line=r.form2555?.lines.find(row=>row.line==="45");if(!line)throw Error("Missing actual2555audit");line.value=line.value.plus(1);
 expect(()=>assertForm7206ReviewSource(input,r)).toThrow(/foreign|audit|source/i);
});

it("binds both original business identities when equal-dollar originals change together",()=>{
 const input=domesticFSignedHealthFixture(),r=calculateFederalTax(input);
 const farm=structuredClone(input);farm.scheduleF!.ein="99-9999999";farm.form7206!.domesticFarmSources!.ein="99-9999999";
 expect(()=>assertForm7206ReviewSource(farm,r)).toThrow(/audit|source|identity/i);
 const business=structuredClone(input);business.scheduleC!.businessName="Other Services";business.form2555!.sourceMapping!.rows[0]!.payerName="Other Services";
 expect(()=>assertForm7206ReviewSource(business,r)).toThrow(/audit|source|identity/i);
 const reference=structuredClone(input);reference.form2555!.sourceMapping!.rows[0]!.sourceReference="Changed original foreign source reference";
 expect(()=>assertForm7206ReviewSource(reference,r)).toThrow(/audit|source|identity/i);
});

it("binds the original health ledger and within-month payment date",()=>{
 const input=domesticFSignedHealthFixture(),r=calculateFederalTax(input);
 const ledger=structuredClone(input);ledger.form7206!.sourceReference="Different original premium ledger";
 expect(()=>assertForm7206ReviewSource(ledger,r)).toThrow(/audit|source/i);
 const date=structuredClone(input);date.form7206!.plans![0]!.payments![0]!.datePaid="2025-01-16";
 expect(()=>assertForm7206ReviewSource(date,r)).toThrow(/audit|source/i);
});

it("accepts JSON property reordering while preserving exact original source text",()=>{
 const input=domesticFSignedHealthFixture(),r=calculateFederalTax(input);
 const reorder=(v:unknown):unknown=>Array.isArray(v)?v.map(reorder):v!==null&&typeof v==="object"?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reorder(x)])):v;
 expect(()=>assertForm7206ReviewSource(reorder(input) as typeof input,r)).not.toThrow();
 const whitespace=structuredClone(input);whitespace.form7206!.domesticFarmSources!.sourceReference+=" ";
 expect(()=>assertForm7206ReviewSource(whitespace,r)).toThrow(/audit|source/i);
});
