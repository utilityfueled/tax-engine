/** Canonical tip ownership. Spec: spec/federal/form-4137-return.yaml. */
import type { TaxYearInput, Form4137Input } from "@/models/inputs.js";
import type { YearConstants } from "@/models/constants.js";
import { d, sum } from "@/utils/decimal.js";
import { calculateForm4137, type Form4137Result } from "./form-4137.js";

type Owner = "primary" | "spouse";
export function calculateUnreportedTipPayroll(input: TaxYearInput, constants: YearConstants) {
  if (constants.taxYear !== input.taxpayer.taxYear) throw new Error("Tip payroll constants must match the actual return year.");
  if (input.form4137 && input.form4137ByOwner) throw new Error("Use one actual Form4137 source representation; duplicate summaries are unsupported.");
  const joint = input.taxpayer.filingStatus === "married_filing_jointly";
  const records: Form4137Input[] = input.form4137 ? [input.form4137] : [];
  for (const owner of ["primary", "spouse"] as const) {
    const record = input.form4137ByOwner?.[owner];
    if (!record) continue;
    if (record.accountHolder !== owner || !record.sourceFacts) throw new Error("Separate-owner Form4137 requires matching actual owner and source facts.");
    records.push(record);
  }
  const forms: Form4137Result[] = [];
  for (const record of records) {
    if (record.accountHolder === "spouse" && (!joint || !input.taxpayer.spouse)) throw new Error("Spouse Form4137 requires an actual joint household.");
    if (input.taxpayer.taxYear >= 2026 && !record.sourceFacts) throw new Error("2026 Form4137 requires actual employer and monthly tip source facts.");
    const actual = record.sourceFacts !== undefined;
    if (actual && !record.accountHolder) throw new Error("Actual Form4137 requires the recipient owner.");
    const validW2Owners=new Set<unknown>(joint ? ["primary","spouse"] : ["primary",undefined]);
    if (actual && input.w2s.some(w2=>!validW2Owners.has(w2.accountHolder))) throw new Error("Actual Form4137 requires individual W2 owners consistent with the household.");
    if (actual && joint && input.form8919 && !input.form8919.accountHolder) throw new Error("Actual tip payroll with Form8919 requires that wage source owner's attribution.");
    const w2s = input.w2s.flatMap((w2,index)=>{
      const owner = w2.accountHolder ?? (!joint ? "primary" : undefined);
      return record.accountHolder === undefined || record.accountHolder === owner ? [{w2,index,owner}] : [];
    });
    if (actual && w2s.some(({w2})=>w2.socialSecurityWages === undefined || w2.socialSecurityTips === undefined)) throw new Error("Actual Form4137 requires known W2 payroll Boxes3 and7, including zero.");
    // This source amount is Tier1 Social Security compensation, not Medicare
    // compensation. Do not silently create Form8959's distinct RRTA base.
    if (actual && d(record.sourceFacts?.railroadRetirementCompensation).gt(0)) throw new Error("Actual RRTA tips payroll requires the separate Medicare compensation source worksheet before return integration.");
    const result = calculateForm4137(record,constants,{
      socialSecurityWagesAndTipsAlreadyReported:sum(...w2s.map(({w2})=>d(w2.socialSecurityWages))),
      socialSecurityTipsAlreadyReported:sum(...w2s.map(({w2})=>d(w2.socialSecurityTips))),
      sourcePayroll:actual && record.accountHolder ? { accountHolder:record.accountHolder,w2s:w2s.map(({w2,index})=>({
        sourceId:`formW2:${index}`,accountHolder:record.accountHolder as Owner,employerName:w2.employer?.name,employerEin:w2.employer?.ein,
        socialSecurityWages:d(w2.socialSecurityWages),socialSecurityTips:d(w2.socialSecurityTips),allocatedTips:w2.allocatedTips === undefined ? undefined : d(w2.allocatedTips),
      })) } : undefined,
    });
    forms.push(result);
  }
  const byOwner: Partial<Record<Owner,Form4137Result>> = {};
  for (const form of forms) if (form.accountHolder) byOwner[form.accountHolder]=form;
  const lines = forms.flatMap(form=>forms.length>1 ? form.lines.map(line=>({...line,form:`Form 4137 (${form.accountHolder})`})) : form.lines);
  return { forms, byOwner, singular:forms.length === 1 ? forms[0] : undefined, sourceFactsVerified:forms.every(form=>form.sourceFactsVerified),
    income:sum(...forms.map(form=>form.unreportedTipIncome)), medicareTips:sum(...forms.map(form=>form.line6)), tax:sum(...forms.map(form=>form.line13)), lines };
}
