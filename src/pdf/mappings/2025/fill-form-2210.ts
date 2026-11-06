/** Physical 2025 Form 2210 review map; calculations belong exclusively to the engine. */
import { PDFDocument, StandardFonts, type PDFForm } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { qbiLossReviewOriginalSourceInput, type PreparedQbiLossReview } from "../../qbi-loss-review-context.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm2210ScheduleAi } from "@/engine/forms/form-2210-schedule-ai.js";
import { flattenForm, formatCurrency, loadReviewTemplate, setCheckBox, setTextField } from "../../pdf-utils.js";

import {form2210ReviewOriginalInput,hasForm2210OriginalIdentity,prepareForm2210Review,requiresForm2210ScheduleAiReview,type PreparedForm2210Review} from '../../form-2210-review-context.js';

const p1 = (name: string) => `topmostSubform[0].Page1[0].${name}`;
const p2 = (name: string) => `topmostSubform[0].Page2[0].${name}`;
const cell = (line: number, field: number) => p2(`SectionATable[0].Line${line}[0].f2_${field}[0]`);

/** Printed labels and field rectangles inspected against the registered 2025 PDF. */
export const FORM_2210_FIELDS = {
  name: p1("f1_1[0]"), ssn: p1("f1_2[0]"),
  line1: p1("f1_3[0]"), line2: p1("f1_4[0]"), line3: p1("f1_5[0]"),
  line4: p1("f1_6[0]"), line5: p1("f1_7[0]"), line6: p1("f1_8[0]"),
  line7: p1("f1_9[0]"), line8: p1("f1_10[0]"), line9: p1("f1_11[0]"),
  line9No: p1("c1_1[0]"), line9Yes: p1("c1_1[1]"),
  boxA: p1("c1_2[0]"), boxB: p1("c1_3[0]"), boxC: p1("c1_4[0]"),
  boxD: p1("c1_5[0]"), boxE: p1("c1_6[0]"),
  line10a: cell(10, 1), line10b: cell(10, 2), line10c: cell(10, 3), line10d: cell(10, 4),
  line11a: cell(11, 5), line11b: cell(11, 6), line11c: cell(11, 7), line11d: cell(11, 8),
  line12a: cell(12, 9), line12b: cell(12, 10), line12c: cell(12, 11), line12d: cell(12, 12),
  line13a: cell(13, 13), line13b: cell(13, 14), line13c: cell(13, 15), line13d: cell(13, 16),
  line14a: cell(14, 17), line14b: cell(14, 18), line14c: cell(14, 19), line14d: cell(14, 20),
  line15a: cell(15, 21), line15b: cell(15, 22), line15c: cell(15, 23), line15d: cell(15, 24),
  line16a: cell(16, 25), line16b: cell(16, 26), line16c: cell(16, 27), line16d: cell(16, 28),
  line17a: cell(17, 29), line17b: cell(17, 30), line17c: cell(17, 31), line17d: cell(17, 32),
  line18a: cell(18, 33), line18b: cell(18, 34), line18c: cell(18, 35), line18d: cell(18, 36),
  line19: p2("f2_37[0]"),
} as const;

/** All field names follow the actual pinned printed line/column widgets.
 * Printed constants have one-point placeholders and must remain blank. */
function fillScheduleAiPage(form:PDFForm,input:TaxYearInput,result:TaxReturnResult,owner:'primary'|'spouse',spouseOnly=false):void{
 const calculation=result.form2210,source=input.form2210,ai=calculation?.scheduleAi;
 if(!calculation||!source||!ai||!source.annualizedIncomePeriods)throw new Error('Form2210 physical Schedule AI requires current original sources');
 const rows=new Map(calculation.lines.filter(row=>row.form==='Form 2210 Schedule AI').map(row=>[row.line,row.value]));
 const value=(id:string):Decimal=>{const current=rows.get(id);if(!current)throw new Error('Form2210 missing current Schedule AI audit '+id);return current;};
 const actualAmount=(raw:string|undefined):Decimal=>{if(raw===undefined)throw new Error('Form2210 actual original period amount is missing');return new Decimal(raw);};
 const both=source.selfEmploymentOwnerPeriods!==undefined;
 const partII=both||ai.returnContext.selfEmployedOwners>0;
 const constants=new Set([2,5,20,29,32,34]);
 for(let line=1;line<=36;line++)for(let column=0;column<4;column++){
  const suffix=String.fromCharCode(97+column),field=`topmostSubform[0].Page3[0].${line<=27?'Part1Table':'PartIITable'}[0].Line${line}[0].f3_${(line-1)*4+column+1}[0]`;
  const period=source.annualizedIncomePeriods[column];if(!period)throw new Error('Form2210 missing current original period');
  let printed:Decimal|undefined;
  if(!constants.has(line)&&!(spouseOnly&&line<=27)&&!(line>=28&&!partII)&&!([22,25].includes(line)&&column===0)&&!(line===6&&result.deductionUsed!=='itemized')){
   if(line===1)printed=actualAmount(period.adjustedGrossIncome);
   else if(line===4)printed=actualAmount(period.itemizedDeductions);
   else if(line===10)printed=value('8'+suffix).plus(value('9'+suffix));
   else if(line===11)printed=value('3'+suffix).minus(value('8'+suffix)).minus(value('9'+suffix));
   else if(line===12)printed=new Decimal(0);
   else if(line===15)printed=value('36'+suffix);
   else if(line===17)printed=value('14'+suffix).plus(value('36'+suffix)).plus(value('16'+suffix));
   else if(line>=28){
    if(both)printed=value(String(line)+suffix+'-'+owner);
    else{
     const raw=actualAmount(period.netProfitFromSelfEmployment).times('0.9235');
     const rounded=Decimal.max(0,raw).toDecimalPlaces(0,Decimal.ROUND_HALF_UP),earnings=rounded.lt(400)?new Decimal(0):rounded;
     const wage=actualAmount(period.socialSecurityWages),cap=Decimal.max(0,new Decimal(['44025','73375','117400','176100'][column]??'0').minus(wage));
     const amounts:Record<number,Decimal>={28:earnings,30:wage,31:cap,33:Decimal.min(earnings,cap).times(['0.496','0.2976','0.186','0.124'][column]??'0'),35:earnings.times(['0.116','0.0696','0.0435','0.029'][column]??'0'),36:value('36'+suffix)};
     printed=amounts[line];if(!printed)throw new Error('Form2210 missing source Part II physical row');
    }
   }else printed=value(String(line)+suffix);
  }
  setTextField(form,field,printed===undefined?'':printed.isZero()?'0':formatCurrency(printed));
 }
}

export async function fillForm2210(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string, qbiLossReview?: PreparedQbiLossReview, preparedReview?:PreparedForm2210Review): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  // Validate complete current originals before any template/file I/O. Legacy
  // original-less direct calls retain their old disclosure rather than recapture.
  const review=preparedReview??(requiresForm2210ScheduleAiReview(input,result)&&hasForm2210OriginalIdentity(input)?prepareForm2210Review(input):undefined);
  const actualOriginal=review?form2210ReviewOriginalInput(input,result,review):undefined;
  // A supplied older QBI proof remains authoritative, even beside the new context.
  if(qbiLossReview){try{qbiLossReviewOriginalSourceInput(input,result,qbiLossReview);}catch(error){throw new Error('Form 2210 current actual owner sources cannot be reconciled to the original QBI review context',{cause:error});}}
  const calculation = result.form2210;
  if (!calculation) throw new Error("Form 2210 review requires its calculation audit");
  const actualBusinessOwners = new Set([
    input.scheduleC?.accountHolder, input.scheduleF?.accountHolder,
    ...input.form1099Nec.map(row => row.accountHolder),
    ...input.scheduleK1.filter(row => row.entityType !== "s_corporation").map(row => row.accountHolder),
    input.cryptoIncome?.businessAccountHolder,
  ].filter(owner => owner === "primary" || owner === "spouse"));
  if ((input.form2210?.calculationMethod === "annualized" && actualBusinessOwners.size > 1)
      || input.form2210?.selfEmploymentOwnerPeriods !== undefined || input.form2210?.bothSpousesSelfEmployed === true
      || calculation.scheduleAi?.returnContext.ownerSources !== undefined || (calculation.scheduleAi?.returnContext.selfEmployedOwners ?? 0) > 1
      || calculation.lines.some(row => row.line === "owner-source-commitment" || /[abcd]-(?:primary|spouse)$/.test(row.line))) {
    // Bind the saved result to current actual sources before opening any template.
    // Replaying a saved returnContext would trust stale payroll or source identity.
    let current: typeof calculation;
    try {
      const original = actualOriginal ?? (input.qbiLossSources || qbiLossReview
        ? qbiLossReviewOriginalSourceInput(input, result, qbiLossReview) : input);
      const actual = calculateFederalTax(original).form2210;
      if (!actual) throw new Error("Missing actual calculation");
      current = actual;
    } catch {
      throw new Error("Form 2210 current actual owner sources cannot be reconciled to the saved calculation");
    }
    if (JSON.stringify(current) !== JSON.stringify(calculation)) {
      throw new Error("Form 2210 current actual owner sources and source commitment do not match the saved calculation");
    }
  }
  if (calculation.farmerMethod) throw new Error("Form 2210-F has no review map");
  if (calculation.taxYear !== 2025) throw new Error("Form 2210 calculation year does not match the 2025 physical map");
  const audited = new Map<string, Decimal>();
  for (const entry of calculation.lines) {
    if (entry.form !== "Form 2210") continue;
    if (audited.has(entry.line) || !Decimal.isDecimal(entry.value) || !entry.value.isFinite() || entry.value.isNegative()) {
      throw new Error(`Form 2210 invalid or duplicate audit line ${entry.line}`);
    }
    audited.set(entry.line, entry.value);
  }
  const required = (id: string): Decimal => {
    const value = audited.get(id);
    if (!value) throw new Error(`Form 2210 missing audit line ${id}`);
    return value;
  };
  for (const id of ["1", "2", "3", "4", "5", "6", "7", "9", "19"]) required(id);
  if (!required("9").eq(calculation.requiredAnnualPayment) || !required("19").eq(calculation.penalty)
      || !calculation.exactPenalty.isFinite() || calculation.exactPenalty.isNegative()
      || !calculation.exactPenalty.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).eq(calculation.waiver?.penaltyBeforeWaiver ?? calculation.penalty)) {
    throw new Error("Form 2210 audit does not reconcile to its calculated totals");
  }
  if (calculation.installments.length !== 0 && calculation.installments.length !== 4) throw new Error("Form 2210 audit must contain four installment columns");
  if (!calculation.safeHarborMet && calculation.installments.length !== 4) throw new Error("Form 2210 missing audited installment history");
  for (const [index, installment] of calculation.installments.entries()) {
    if (installment.installment !== index + 1) throw new Error("Form 2210 installment audit order is invalid");
    const suffix = String.fromCharCode(97 + index);
    for (let line = 10; line <= 18; line++) required(`${line}${suffix}`);
    for (const [line, value] of [[10, installment.required], [11, installment.payments], [17, installment.underpayment], [18, installment.overpayment]] as const) {
      if (!required(`${line}${suffix}`).eq(value)) throw new Error(`Form 2210 installment audit line ${line}${suffix} does not reconcile`);
    }
  }
  const source = input.form2210;
  if (calculation.sourceFactsVerified && source?.priorYearTaxStatus === "return-filed" && source.priorYearFullYear) required("8");
  if ((calculation.withholdingMethod === "actual-dates") !== (source?.withholdingMethod === "actual-dates")) {
    throw new Error("Form 2210 actual withholding election does not reconcile to the source facts");
  }
  const exactTotal = calculation.interestPeriods.reduce((sum, period) => {
    if (!period.principal.isFinite() || period.principal.isNegative() || !period.annualRate.isFinite()
        || period.annualRate.isNegative() || !period.exactPenalty.isFinite() || period.exactPenalty.isNegative()
        || !Number.isInteger(period.days) || period.days <= 0) throw new Error("Form 2210 invalid dated penalty audit");
    const from = Date.parse(`${period.startDate}T00:00:00Z`);
    const through = Date.parse(`${period.endDate}T00:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(through) || (through - from) / 86_400_000 + 1 !== period.days
        || !period.principal.times(period.annualRate).times(period.days).div(365).eq(period.exactPenalty)) {
      throw new Error("Form 2210 dated penalty audit arithmetic does not reconcile");
    }
    return sum.plus(period.exactPenalty);
  }, new Decimal(0));
  if (!exactTotal.eq(calculation.exactPenalty)) throw new Error("Form 2210 dated penalty audit does not reconcile to exactPenalty");

  const annualized = source?.calculationMethod === "annualized";
  const scheduleAi = calculation.lines.filter(entry => entry.form === "Form 2210 Schedule AI");
  if (annualized !== (scheduleAi.length > 0) && calculation.installments.length > 0) throw new Error("Form 2210 Schedule AI audit does not reconcile to the source method");
  if (scheduleAi.length > 0) {
    if (!calculation.scheduleAi || !source) throw new Error("Form 2210 Schedule AI audit does not reconcile to the source method");
    const recomputed = calculateForm2210ScheduleAi({ ...calculation.scheduleAi, facts: source }).lines;
    const text = (rows: typeof scheduleAi) => JSON.stringify(rows.map(row => [row.line, row.value.toFixed()]));
    if (text(recomputed) !== text(scheduleAi)) throw new Error("Form 2210 Schedule AI lines do not reconcile to the original period sources");
  }
  for (const [index, installment] of calculation.installments.entries()) {
    const line27 = scheduleAi.filter(entry => entry.line === `27${String.fromCharCode(97 + index)}`);
    const actualLine27=line27[0];
    if (annualized && (line27.length !== 1 || !actualLine27 || !actualLine27.value.eq(installment.required))) throw new Error("Form 2210 line10 does not reconcile to Schedule AI line27");
  }

  const doc = await loadReviewTemplate(blankPdfPath, 2025);
  const spouseSource=actualOriginal?.form2210?.selfEmploymentOwnerPeriods!==undefined?await PDFDocument.load(await doc.save()):undefined;
  const form = doc.getForm();
  const F = FORM_2210_FIELDS;
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  setTextField(form, F.name, name);
  setTextField(form, F.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));
  const stopsAtPartI = required("4").lt(1000) || required("7").lt(1000);
  for (const [key, field] of Object.entries(F)) {
    if (!/^line\d+[a-d]?$/.test(key)) continue;
    const id = key.slice(4);
    const value = audited.get(id);
    const notApplicable = (id === "8" && !value) || (/^(?:1[0-8])[a-d]$/.test(id) && calculation.installments.length === 0)
      || ["12a", "13a", "14a", "16a", "16d", "18d"].includes(id)
      || (stopsAtPartI && (id === "8" || id === "9"));
    // Touch blank mapped fields too: a missing/wrong-type template cannot pass silently.
    setTextField(form, field, notApplicable ? "" : (required(id).isZero() ? "0" : formatCurrency(required(id))));
  }
  const line9Greater = required("9").gt(required("6"));
  setCheckBox(form, F.line9No, !stopsAtPartI && !line9Greater);
  setCheckBox(form, F.line9Yes, !stopsAtPartI && line9Greater);
  // Disaster relief never reaches this mapping. Missing physical
  // source facts remain disclosed; unchecked is not an inferred answer.
  setCheckBox(form, F.boxA, calculation.waiver?.kind === "full");
  setCheckBox(form, F.boxB, calculation.waiver?.kind === "partial");
  setCheckBox(form, F.boxC, annualized && scheduleAi.length > 0);
  setCheckBox(form, F.boxD, source?.withholdingMethod === "actual-dates");
  const changedJointStatus = source?.priorYearJointReturn !== undefined
    && source.priorYearJointReturn !== (input.taxpayer.filingStatus === "married_filing_jointly");
  const priorRequired = audited.get("8");
  setCheckBox(form, F.boxE, changedJointStatus && priorRequired !== undefined && priorRequired.lt(required("5")));

  if(actualOriginal){
    fillScheduleAiPage(form,actualOriginal,result,'primary');
    if(spouseSource){
      // Flatten the separate source page before inserting it, avoiding duplicate
      // AcroForm names or accidental pooling of the two owners' wage limits.
      fillScheduleAiPage(spouseSource.getForm(),actualOriginal,result,'spouse',true);
      await flattenForm(spouseSource.getForm());
      const copied=await doc.copyPages(spouseSource,[2]);const spousePage=copied[0];
      if(!spousePage)throw new Error('Form2210 missing actual spouse source worksheet page');
      doc.insertPage(3,spousePage);
      const labelFont=await doc.embedFont(StandardFonts.Helvetica);
      const primaryPage=doc.getPages()[2];if(!primaryPage)throw new Error('Form2210 missing actual primary source worksheet page');
      primaryPage.drawText('REVIEW ONLY - PRIMARY PART II WORKSHEET',{x:36,y:26,size:7,font:labelFont});
      spousePage.drawText('REVIEW ONLY - SPOUSE PART II WORKSHEET',{x:36,y:26,size:7,font:labelFont});
    }
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage();
  let cursor = page.getHeight() - 40;
  const write = (text: string) => {
    const sanitized = text.replace(/[^\x20-\x7E]/g, " ");
    for (const line of sanitized.match(/.{1,100}(?:\s|$)|.{1,100}/g) ?? [sanitized]) {
      if (cursor < 45) { page = doc.addPage(); cursor = page.getHeight() - 40; }
      page.drawText(line.trim(), { x: 32, y: cursor, size: 9, font });
      cursor -= 14;
    }
  };
  write(`FORM 2210 REVIEW - dated ${scheduleAi.length > 0 ? "annualized-income" : "regular-method"} evidence`);
  write(calculation.sourceFactsVerified ? "Calculation uses the supported actual-source contract." : "Historical or exception-only calculation: complete source qualification has not been established.");
  write(actualOriginal?"Form 2210 with completed Schedule AI is included for source-qualified review only; no filing qualification is implied.":"This is a review worksheet. The default return packet omits Form 2210; no filing qualification is implied.");
  if (scheduleAi.length > 0) write(actualOriginal?"The printed Schedule AI source page is completed. Separate actual owner Part II worksheets are included when required.":"Schedule AI page 3 is not completed in this packet. Its calculated lines follow.");
  for (const entry of scheduleAi) write(`Schedule AI line ${entry.line}: ${entry.description} ${entry.value.toFixed()}`);
  if (source?.priorYearJointReturn === undefined && priorRequired !== undefined) write("Prior joint-return status is unknown; Part II box E remains unanswered.");
  if (!source) write("Physical filing-reason source facts are uncollected; unchecked boxes are not confirmed negative answers.");
  if (calculation.interestPeriods.length === 0) write(`No dated interest accrues. ${calculation.safeHarborReason}.`);
  for (const period of calculation.interestPeriods) {
    write(`Installment ${period.installment}: ${period.startDate} through ${period.endDate}; ${period.days} days; principal $${period.principal.toFixed()}; annual rate ${period.annualRate.times(100).toFixed()}%.`);
    write(`Exact penalty $${period.exactPenalty.toFixed()}. Published rate: ${period.rateSource}`);
  }
  write(`Exact combined penalty $${calculation.exactPenalty.toFixed()}; whole-dollar Form 2210 line 19 $${calculation.penalty.toFixed()}.`);
  if (calculation.waiver) write(`Waiver requested for $${calculation.waiver.requestedAmount.toFixed()} of the $${calculation.waiver.penaltyBeforeWaiver.toFixed()} penalty. Enter that amount in parentheses by line 19 and attach the statement. The IRS decides.`);
  write("Payments retire the oldest installment first. Statutory withholding is allocated by law; estimated-payment dates are never invented.");
  await markReviewPdf(doc);
  return doc;
}

export { FORM_2210_FIELDS as FORM_2210_FIELDS_MAP };
