// Spec: spec/federal/form-4137-return.yaml.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import Decimal from "decimal.js";
import { PDFArray, PDFDocument, PDFRawStream, PDFTextField, StandardFonts, decodePDFRawStream } from "pdf-lib";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm4137, FORM_4137_FIELDS as F } from "@/pdf/fill-form-4137.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { tipFacts } from "../fixtures/form4137.js";
const blank="forms/blank/2025/f4137.pdf";
function required<T>(value:T|undefined):T {if(value===undefined)throw new Error("Missing actual synthetic source");return value;}
function source() {
  const primary=tipFacts("primary","18","18","25.50"),spouse=tipFacts("spouse","1000");
  primary.sourceFacts.employers=Array.from({length:6},(_,i)=>({...primary.sourceFacts.employers[0],sourceId:`actual-${i}`,employerName:`Actual employer ${i}`,employerEin:`12-345678${i}`}));
  return TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[],taxpayer:{...simpleW2Fixture.taxpayer,filingStatus:"married_filing_jointly",spouse:{...simpleW2Fixture.taxpayer.primary,firstName:"John",ssn:"555-55-5555"}},form4137ByOwner:{primary,spouse}});
}
const field=(doc:PDFDocument,name:string)=>doc.getForm().getTextField(name).getText();
function pageStreams(doc:PDFDocument,index:number):string {
  const contents=doc.getPage(index).node.Contents();
  const streams=contents instanceof PDFArray?contents.asArray().map(ref=>doc.context.lookup(ref)):[contents];
  return streams.filter((stream):stream is PDFRawStream=>stream instanceof PDFRawStream).map(stream=>Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
}
it("prints both owners and all source rows without substituting tax totals",async()=>{
  const input=source(),result=calculateFederalTax(input);
  const doc=await fillForm4137(input,result,blank);
  expect(field(doc,F.name)).toBe("Jane Doe");
  expect(field(doc,F.line2)).toBe("108");
  expect(field(doc,F.line4)).toBe("108");
  expect(field(doc,F.line5)).toBe("108");
  expect(field(doc,F.line6)).toBe("0");
  const ownerNames=doc.getForm().getFields().filter(f=>f instanceof PDFTextField&&f.getName().endsWith("f1_1[0]")).map(f=>(f as PDFTextField).getText());
  expect(ownerNames).toEqual(["Jane Doe","John Doe"]);
  expect(doc.getPageCount()).toBe(5); // two source forms/instructions plus continuation.
  const dir=await mkdtemp(join(tmpdir(),"tip-source-review-"));
  try {
    const {filledForms:files}=await fillReturn(input,result,{blankFormsDir:"forms/blank/2025",outputDir:dir,flatten:false});
    const path=files.find(file=>file.endsWith("f4137-filled.pdf"));expect(path).toBeDefined();
    expect((await PDFDocument.load(await readFile(required(path)))).getPageCount()).toBe(5);
    const small=TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[],form4137:tipFacts("primary","18","18")});
    const {filledForms:smallFiles}=await fillReturn(small,calculateFederalTax(small),{blankFormsDir:"forms/blank/2025",outputDir:dir,flatten:false});
    expect(smallFiles.some(file=>file.endsWith("f4137-filled.pdf"))).toBe(true);
  } finally {await rm(dir,{recursive:true,force:true});}
},15000);
it("rejects stale owner sources and altered intermediate audits",async()=>{
  const input=source(),result=calculateFederalTax(input);
  const primary=required(result.form4137ByOwner?.primary);
  const altered={...result,form4137ByOwner:{...result.form4137ByOwner,primary:{...primary,lines:primary.lines.map(row=>row.line==="5"?{...row,value:new Decimal(107)}:row)}}};
  await expect(fillForm4137(input,altered,blank)).rejects.toThrow(/audit|reconcile/i);
  const stalePayroll=TaxYearInputSchema.parse({...input,w2s:[{...simpleW2Fixture.w2s[0],accountHolder:"primary",socialSecurityWages:"1",socialSecurityTips:"0"}]});
  await expect(fillForm4137(stalePayroll,result,blank)).rejects.toThrow(/source|reconcile/i);
  required(input.form4137ByOwner?.primary?.sourceFacts?.employers?.[0]).cashAndChargeTipsReceived="19";
  await expect(fillForm4137(input,result,blank)).rejects.toThrow(/source|reconcile/i);
});
it("prints the actual Medicare-only government tip annotation",async()=>{
  const actual=tipFacts("primary");
  const input=TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[],form4137:{...actual,sourceFacts:{...actual.sourceFacts,employers:[{...actual.sourceFacts.employers[0],medicareOnlyGovernmentUnreportedTips:"500",medicareOnlyGovernmentQualificationConfirmed:true}]}}});
  const doc=await fillForm4137(input,calculateFederalTax(input),blank);
  expect(field(doc,F.line6)).toBe("1000");expect(field(doc,F.line10)).toBe("500");
  const saved=await PDFDocument.load(await doc.save());
  expect(pageStreams(saved,0)).toContain(Buffer.from("1.45% tips 500").toString("hex").toUpperCase());
});
it("accepts a separate-owner object with an explicitly absent spouse",async()=>{
  const input=TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[],form4137ByOwner:{primary:tipFacts("primary"),spouse:undefined}});
  const doc=await fillForm4137(input,calculateFederalTax(input),blank);
  expect(doc.getPageCount()).toBe(2);expect(field(doc,F.line13)).toBe("77");
});
it("wraps the full long employer identity on continuation pages",async()=>{
  const input=source();
  const name=Array.from({length:50},(_,index)=>`ActualEmployerSegment${index}`).join(" ");
  required(input.form4137ByOwner?.primary?.sourceFacts?.employers?.[5]).employerName=name;
  const doc=await fillForm4137(input,calculateFederalTax(input),blank);
  const saved=await PDFDocument.load(await doc.save());
  const lines=[...pageStreams(saved,2).matchAll(/<([\dA-F]+)> Tj/g)].map(match=>Buffer.from(match[1],"hex").toString("utf8"));
  expect(lines.join(" ")).toContain(name);
  const font=await saved.embedFont(StandardFonts.Helvetica);
  for(const line of lines.filter(line=>!line.includes("FOR REVIEW ONLY"))) expect(font.widthOfTextAtSize(line,10)).toBeLessThanOrEqual(528);
});
