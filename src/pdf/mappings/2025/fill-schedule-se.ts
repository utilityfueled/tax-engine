/** Official 2025 Schedule SE review mapping. Spec: spec/federal/schedule-se.yaml. */
import { PDFDocument, PDFObjectCopier, PDFPage, PDFPageLeaf } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { ScheduleSEAmounts, ScheduleSEPerTaxpayer } from "@/engine/schedules/schedule-se.js";
import { assertPdfExportAllowed } from "../../export-policy.js";
import { loadReviewTemplate, setTextField, setCurrencyField } from "../../pdf-utils.js";
const p1=(name:string)=>`topmostSubform[0].Page1[0].${name}`;
export const SCHEDULE_SE_FIELDS={
  name:p1("f1_1[0]"),ssn:p1("f1_2[0]"),churchExemption:p1("c1_1[0]"),
  line1a:p1("f1_3[0]"),line1b:p1("f1_4[0]"),line2:p1("f1_5[0]"),line3:p1("f1_6[0]"),
  line4a:p1("f1_7[0]"),line4b:p1("f1_8[0]"),line4c:p1("f1_9[0]"),
  line5a:p1("Line5a_ReadOrder[0].f1_10[0]"),line5b:p1("f1_11[0]"),line6:p1("f1_12[0]"),
  // Line7 is the preprinted $176,100; f1_13 is a one-point placeholder.
  line8a:p1("Line8a_ReadOrder[0].f1_14[0]"),line8b:p1("f1_15[0]"),line8c:p1("f1_16[0]"),line8d:p1("f1_17[0]"),
  line9:p1("f1_18[0]"),line10:p1("f1_19[0]"),line11:p1("f1_20[0]"),line12:p1("f1_21[0]"),line13:p1("f1_22[0]"),
} as const;
const amounts: Array<Exclude<keyof ScheduleSEAmounts,"lines">>=["netFarmProfit","netNonfarmProfit","netSEEarnings","taxableEarnings","earningsSubjectToSETax","socialSecurityPortion","medicarePortion","totalSETax","deductibleHalf"];
function fillIndividual(doc:PDFDocument,input:TaxYearInput,se?:ScheduleSEPerTaxpayer):void {
  const form=doc.getForm();
  const owner=se?.accountHolder ?? (input.taxpayer.filingStatus!=="married_filing_jointly"?"primary":undefined);
  const person=owner==="spouse"?input.taxpayer.spouse:owner==="primary"?input.taxpayer.primary:undefined;
  if(owner==="spouse"&&!person)throw new Error("Schedule SE spouse source is missing");
  if(person) {
    setTextField(form,SCHEDULE_SE_FIELDS.name,`${person.firstName} ${person.lastName}`);
    setTextField(form,SCHEDULE_SE_FIELDS.ssn,person.ssn.replaceAll("-",""));
  }
  if(!se)return;
  const audited=(line:string)=>{
    const entries=se.lines.filter(entry=>entry.form==="Sched SE"&&entry.line===line);
    if(entries.length!==1||!entries[0].value.isFinite())throw new Error(`Missing, duplicate or invalid Schedule SE audit ${line}`);
    return entries[0].value;
  };
  for(const [line,key] of [["1a","netFarmProfit"],["2","netNonfarmProfit"],["3","netSEEarnings"],["6","earningsSubjectToSETax"],["10","socialSecurityPortion"],["11","medicarePortion"],["12","totalSETax"],["13","deductibleHalf"]] as const) {
    if(!audited(line).eq(se[key]))throw new Error(`Schedule SE result does not reconcile with audit ${line}`);
  }
  if(!audited("7").eq(176100))throw new Error("Schedule SE wage base does not match the 2025 template");
  for(const line of ["1a","1b","2","3","4a","4b","4c","5a","5b","6","8a","8b","8c","8d","9","10","11","12","13"] as const) {
    setCurrencyField(form,SCHEDULE_SE_FIELDS[`line${line}`],audited(line));
  }
}

/** Copy pages and their original field graph with one copier, preserving interactive fields. */
async function appendIndividual(target:PDFDocument,source:PDFDocument,owner:string):Promise<void> {
  const roots=source.getForm().acroForm.getFields();
  for(const [field] of roots)field.setPartialName(`${owner}_ScheduleSE`);
  source.getForm().updateFieldAppearances();
  await source.flush();
  const copier=PDFObjectCopier.for(source.context,target.context);
  for(const [,ref] of roots)target.getForm().acroForm.addField(copier.copy(ref));
  for(const page of source.getPages()) {
    const ref=copier.copy(page.ref);
    const node=target.context.lookup(ref);
    if(!(node instanceof PDFPageLeaf))throw new Error("Copied Schedule SE page is invalid");
    target.addPage(PDFPage.of(node,ref,target));
  }
}

export async function fillScheduleSE(input:TaxYearInput,result:TaxReturnResult,blankPdfPath:string):Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear,result.taxYear);
  const se=result.scheduleSE;
  if(se) {
    for(const key of amounts) {
      const total=se.perTaxpayer.reduce((value,row)=>value.plus(row[key]),new Decimal(0));
      if(!se[key].isFinite()||!total.eq(se[key]))throw new Error(`Schedule SE aggregate ${key} does not reconcile`);
    }
    const owners=se.perTaxpayer.map(row=>row.accountHolder);
    if(new Set(owners).size!==owners.length)throw new Error("Duplicate Schedule SE taxpayer owners");
    if(owners.length>1&&owners.includes(undefined))throw new Error("Separate Schedule SE forms require actual owners");
  }
  const doc=await loadReviewTemplate(blankPdfPath,2025);
  fillIndividual(doc,input,se?.perTaxpayer[0]);
  for(const row of se?.perTaxpayer.slice(1)??[]) {
    const source=await loadReviewTemplate(blankPdfPath,2025);
    fillIndividual(source,input,row);
    await appendIndividual(doc,source,row.accountHolder ?? "unknown");
  }
  return doc;
}
