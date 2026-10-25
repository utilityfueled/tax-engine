import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
/**
 * PDF filler for IRS Form 4137 — Social Security and Medicare Tax on Unreported Tip Income.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Uses "topmostSubform[0].Page1[0]" as root.
 */

import { PDFDocument, PDFObjectCopier, PDFPage, PDFPageLeaf, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";
import type { Form4137Result } from "@/engine/forms/form-4137.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { getConstants } from "@/models/constants.js";
import { calculateUnreportedTipPayroll } from "@/engine/forms/unreported-tip-payroll.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  formatCurrency,
} from "../../pdf-utils.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const tblRow = (r: number, n: string) =>
  `topmostSubform[0].Page1[0].Table_Line1[0].BodyRow${r}[0].${n}`;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Form 4137 fillable PDF field inspection.

const FIELDS = {
  // ── Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Line 1: Employer detail rows A–E ──
  // Each row has: (a) employer name, (b) EIN, (c) tips received, (d) tips reported
  rows: [
    {
      employerName: tblRow(1, "f1_3[0]"),
      ein: tblRow(1, "f1_4[0]"),
      tipsReceived: tblRow(1, "f1_5[0]"),
      tipsReported: tblRow(1, "f1_6[0]"),
    },
    {
      employerName: tblRow(2, "f1_7[0]"),
      ein: tblRow(2, "f1_8[0]"),
      tipsReceived: tblRow(2, "f1_9[0]"),
      tipsReported: tblRow(2, "f1_10[0]"),
    },
    {
      employerName: tblRow(3, "f1_11[0]"),
      ein: tblRow(3, "f1_12[0]"),
      tipsReceived: tblRow(3, "f1_13[0]"),
      tipsReported: tblRow(3, "f1_14[0]"),
    },
    {
      employerName: tblRow(4, "f1_15[0]"),
      ein: tblRow(4, "f1_16[0]"),
      tipsReceived: tblRow(4, "f1_17[0]"),
      tipsReported: tblRow(4, "f1_18[0]"),
    },
    {
      employerName: tblRow(5, "f1_19[0]"),
      ein: tblRow(5, "f1_20[0]"),
      tipsReceived: tblRow(5, "f1_21[0]"),
      tipsReported: tblRow(5, "f1_22[0]"),
    },
  ],

  // ── Summary Lines ──
  line2: p1("f1_23[0]"),   // Total tips received (sum of column c)
  line3: p1("f1_24[0]"),   // Total tips reported (sum of column d)
  line4: p1("f1_25[0]"),   // Unreported tips (line 2 - line 3) → Form 1040 line 1c
  line5: p1("f1_26[0]"),   // Tips under $20/month (not subject to FICA)
  line6: p1("f1_27[0]"),   // Unreported tips subject to Medicare (line 4 - line 5)
  // Line 7 is pre-printed ($176,100) — f1_28 is not used
  line8: p1("f1_29[0]"),   // SS wages and tips already reported
  line9: p1("f1_30[0]"),   // Subtract line 8 from line 7
  line10: p1("f1_31[0]"),  // Tips subject to SS tax
  line11: p1("f1_32[0]"),  // SS tax (line 10 × 6.2%)
  line12: p1("f1_33[0]"),  // Medicare tax (line 6 × 1.45%)
  line13: p1("f1_34[0]"),  // Total (line 11 + line 12)
} as const;

type Owner = "primary" | "spouse";
const sourceFor = (input: TaxYearInput, owner?: Owner) => owner && input.form4137ByOwner ? input.form4137ByOwner[owner] : input.form4137;
function audited(result: Form4137Result, line: string): Decimal {
  const entries=result.lines.filter(row=>row.form === "Form 4137" && row.line === line);
  if(entries.length !== 1 || !entries[0].value.isFinite()) throw new Error(`Form4137 audit ${line} is missing, duplicated or nonfinite`);
  return entries[0].value;
}
export function assertForm4137ReviewSource(input: TaxYearInput, result: TaxReturnResult): Form4137Result[] {
  const forms=result.form4137ByOwner ? (["primary","spouse"] as const).flatMap(owner=>{
    const form=result.form4137ByOwner?.[owner];
    if(form && form.accountHolder !== owner) throw new Error("Form4137 result owner does not reconcile");
    return form ? [form] : [];
  }) : result.form4137 ? [result.form4137] : [];
  const actualSources=input.form4137ByOwner ? Object.values(input.form4137ByOwner).filter(source=>source!==undefined) : input.form4137?.sourceFacts ? [input.form4137] : [];
  if(actualSources.length !== forms.filter(form=>form.sourceFactsVerified).length) throw new Error("Form4137 actual source forms do not reconcile with retained results");
  const sourceCalculation=actualSources.length ? calculateUnreportedTipPayroll(input,getConstants(input.taxpayer.taxYear)) : undefined;
  for(const item of forms) {
    for(const line of ["6","8","9","10","11","12","13"] as const) if(!audited(item,line).eq(item[`line${line}`])) throw new Error(`Form4137 audit/result ${line} does not reconcile`);
    if(!audited(item,"13").eq(audited(item,"11").plus(audited(item,"12")))) throw new Error("Form4137 total audit does not reconcile");
    if(!item.sourceFactsVerified) continue;
    const calculated=sourceCalculation?.byOwner[item.accountHolder ?? "primary"];
    if(!calculated || !calculated.unreportedTipIncome.eq(item.unreportedTipIncome)
      || calculated.lines.some(row=>!audited(item,row.line).eq(row.value))) throw new Error("Form4137 source payroll and retained audit do not reconcile");
    const source=sourceFor(input,item.accountHolder), facts=source?.sourceFacts;
    if(!facts || source?.accountHolder !== item.accountHolder || facts.sourceTaxYear !== input.taxpayer.taxYear || item.sourceTaxYear !== facts.sourceTaxYear
      || facts.sourceFactsConfirmed !== true || facts.allEmployersIncluded !== true || facts.reportingYearTreatmentConfirmed !== true || !facts.employers || !item.employers
      || facts.employers.length !== item.employers.length) throw new Error("Form4137 actual source year, owner and completeness must reconcile");
    if(item.accountHolder === "spouse" && (!input.taxpayer.spouse || input.taxpayer.filingStatus !== "married_filing_jointly")) throw new Error("Form4137 spouse source identity is missing");
    for(const [index,row] of facts.employers.entries()) {
      const saved=item.employers[index];
      if(!saved || row.sourceId !== saved.sourceId || row.employerName !== saved.employerName || row.employerEin !== saved.employerEin
        || !d(row.cashAndChargeTipsReceived).eq(saved.cashAndChargeTipsReceived) || !d(row.tipsReportedToEmployer).eq(saved.tipsReportedToEmployer)) throw new Error("Form4137 employer source does not reconcile with retained result");
    }
    for(const line of ["2","3","4","5","7"] as const) if(item[`line${line}`] === undefined || !audited(item,line).eq(item[`line${line}`] ?? "NaN")) throw new Error(`Form4137 audit/result ${line} does not reconcile`);
    const actualReceived=sum(...item.employers.map(row=>row.cashAndChargeTipsReceived)), actualReported=sum(...item.employers.map(row=>row.tipsReportedToEmployer));
    if(!actualReceived.eq(audited(item,"2")) || !actualReported.eq(audited(item,"3")) || !audited(item,"4").eq(actualReceived.minus(actualReported))
      || !audited(item,"6").eq(audited(item,"4").minus(audited(item,"5"))) || !audited(item,"7").eq(176100)
      || !audited(item,"9").eq(Decimal.max(0,audited(item,"7").minus(audited(item,"8"))))
      || !audited(item,"10").eq(Decimal.min(audited(item,"6").minus(sum(...item.employers.map(row=>row.medicareOnlyGovernmentTips))),audited(item,"9")))
      || !audited(item,"11").eq(roundDollar(audited(item,"10").times("0.062"))) || !audited(item,"12").eq(roundDollar(audited(item,"6").times("0.0145")))) throw new Error("Form4137 intermediate audit equations do not reconcile");
    if(!item.unreportedTipIncome.eq(audited(item,"4").plus(d(facts.noncashTipsNotIncludedInWages)))) throw new Error("Form4137 taxable source income does not reconcile");
  }
  return forms;
}
async function fillIndividual(doc: PDFDocument,input: TaxYearInput,item?: Form4137Result):Promise<void> {
  const form=doc.getForm(),owner=item?.accountHolder ?? (input.taxpayer.filingStatus === "married_filing_jointly" ? undefined : "primary");
  const person=owner === "spouse" ? input.taxpayer.spouse : owner === "primary" ? input.taxpayer.primary : undefined;
  if(person) {setTextField(form,FIELDS.name,`${person.firstName} ${person.lastName}`);setTextField(form,FIELDS.ssn,person.ssn.replaceAll("-",""));}
  if(!item)return;
  for(const line of ["6","8","9","10","11","12","13"] as const) {
    const value=audited(item,line);
    if(item.sourceFactsVerified) setTextField(form,FIELDS[`line${line}`],value.isZero()?"0":formatCurrency(value));
    else setCurrencyField(form,FIELDS[`line${line}`],value);
  }
  if(!item.sourceFactsVerified)return;
  for(const line of ["2","3","4","5"] as const) {
    const value=audited(item,line);setTextField(form,FIELDS[`line${line}`],value.isZero()?"0":formatCurrency(value));
  }
  const employers=sourceFor(input,owner)?.sourceFacts?.employers ?? [];
  employers.slice(0,5).forEach((row,index)=>{
    const fields=FIELDS.rows[index];setTextField(form,fields.employerName,row.employerName ?? "");setTextField(form,fields.ein,row.employerEin ?? "");
    setCurrencyField(form,fields.tipsReceived,d(row.cashAndChargeTipsReceived));setCurrencyField(form,fields.tipsReported,d(row.tipsReportedToEmployer));
  });
  const governmentTips=sum(...(item.employers ?? []).map(row=>row.medicareOnlyGovernmentTips));
  if(governmentTips.gt(0)) {
    const font=await doc.embedFont(StandardFonts.Helvetica);
    doc.getPage(0).drawText(`1.45% tips ${formatCurrency(governmentTips)}`,{x:414,y:326,size:8,font});
  }
  if(employers.length > 5) {
    const font=await doc.embedFont(StandardFonts.Helvetica);
    let page:PDFPage,y=0;
    const newPage=()=>{
      page=doc.addPage([612,792]);y=730;
      for(const text of [`Form 4137 actual employer continuation - ${owner}`,"Amounts are included in the main form totals; these are additional source rows."]) {
        page.drawText(text,{x:42,y,size:10,font});y-=18;
      }
    };
    const drawLine=(text:string)=>{
      if(y<50)newPage();
      page.drawText(text,{x:42,y,size:10,font});y-=14;
    };
    const drawWrapped=(text:string)=>{
      let line="";
      for(const word of text.split(" ")) {
        const candidate=line?`${line} ${word}`:word;
        if(font.widthOfTextAtSize(candidate,10)<=528) {line=candidate;continue;}
        if(line)drawLine(line);
        line="";
        for(const character of word) {
          if(font.widthOfTextAtSize(line+character,10)>528) {drawLine(line);line="";}
          line+=character;
        }
      }
      if(line)drawLine(line);
    };
    newPage();
    employers.slice(5).forEach((row,index)=>{
      drawWrapped(`${index+6}. ${row.employerName ?? ""} | EIN ${row.employerEin ?? ""}`);
      drawWrapped(`Tips received ${d(row.cashAndChargeTipsReceived).toFixed()} | reported ${d(row.tipsReportedToEmployer).toFixed()}`);
      y-=4;
    });
    await markReviewPdf(doc);
  }
}
async function appendOwner(target:PDFDocument,source:PDFDocument,owner:string) {
  const roots=source.getForm().acroForm.getFields();for(const [field] of roots)field.setPartialName(`${owner}_Form4137`);
  source.getForm().updateFieldAppearances();await source.flush();const copier=PDFObjectCopier.for(source.context,target.context);
  for(const [,ref] of roots)target.getForm().acroForm.addField(copier.copy(ref));
  for(const page of source.getPages()) {const ref=copier.copy(page.ref),node=target.context.lookup(ref);if(!(node instanceof PDFPageLeaf))throw new Error("Invalid copied Form4137 page");target.addPage(PDFPage.of(node,ref,target));}
}
export async function fillForm4137(input: TaxYearInput,result: TaxReturnResult,blankPdfPath: string):Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear,result.taxYear);
  const forms=assertForm4137ReviewSource(input,result);
  const doc=await loadReviewTemplate(blankPdfPath,2025);await fillIndividual(doc,input,forms[0]);
  for(const item of forms.slice(1)) {const other=await loadReviewTemplate(blankPdfPath,2025);await fillIndividual(other,input,item);await appendOwner(doc,other,item.accountHolder ?? "unknown");}
  await markReviewPdf(doc);
  return doc;
}
export { FIELDS as FORM_4137_FIELDS };
