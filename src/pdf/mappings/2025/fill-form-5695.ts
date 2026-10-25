/** 2025 review-only Form 5695: numeric lines come exclusively from the engine audit. */
import { PDFDocument, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { loadReviewTemplate, setTextField, setCurrencyField } from "../../pdf-utils.js";

const field = (page: number, name: string) => `topmostSubform[0].Page${page}[0].${name}[0]`;
const p1 = (name: string) => field(1, name);
const p2 = (name: string) => field(2, name);
const p3 = (name: string) => field(3, name);
const p4 = (name: string) => field(4, name);
const qmid = (page: number, section: string, name: string, box = "Box1-4") => `topmostSubform[0].Page${page}[0].${section ? `${section}[0].` : ""}${box}[0].${name}[0]`;

export const FORM_5695_FIELDS = {
  name:p1("f1_01"),ssn:p1("f1_02"),name2:p2("f2_01"),ssn2:p2("f2_02"),
  line1:p1("f1_08"),line2:p1("f1_09"),line3:p1("f1_10"),line4:p1("f1_11"),line5b:p1("f1_12"),
  line6a:p1("f1_13"),line6b:p1("f1_14"),line8:p1("f1_20"),line9:p1("f1_21"),
  capacityInteger:p1("f1_22"),capacityFraction:p1("f1_23"),line10:p1("f1_24"),
  line11:p1("f1_25"),line12:p1("f1_26"),line13:p1("f1_27"),line14:p1("f1_28"),line15:p1("f1_29"),line16:p1("f1_30"),
  line18a:p2("f2_08"),line18b:p2("f2_09"),line19a:p2("f2_10"),line19c:p2("f2_13"),line19d:p2("f2_14"),
  line19d1:p2("f2_17"),line19d2:p2("f2_20"),line19e:p2("f2_21"),line19f:p2("f2_22"),line19g:p2("f2_23"),line19h:p2("f2_24"),
  line20a:p2("f2_25"),line20a1:p2("f2_28"),line20a2:p2("f2_31"),line20a3:p2("f2_34"),line20a4:p2("f2_37"),
  line20b:p2("f2_38"),line20c:p2("f2_39"),line20d:p2("f2_40"),
  line22a:p3("f3_21"),line22b:p3("f3_24"),line22c:p3("f3_25"),line22d:p3("f3_26"),
  line23a:p3("f3_27"),line23a1:p3("f3_30"),line23a2:p3("f3_32"),line23b:p3("f3_33"),line23c:p3("f3_34"),line23d:p3("f3_35"),
  line24a:p3("f3_36"),line24b:p3("f3_39"),line24c:p3("f3_40"),line24d:p3("f3_41"),line25c:p3("f3_49"),line25e:p3("f3_52"),
  line26b:p4("f4_01"),line26c:p4("f4_02"),line27:p4("f4_03"),line28:p4("f4_04"),
  line29a:p4("f4_05"),line29b:p4("f4_08"),line29c:p4("f4_09"),line29d:p4("f4_12"),line29e:p4("f4_13"),line29f:p4("f4_16"),
  line29g:p4("f4_17"),line29h:p4("f4_18"),line30:p4("f4_19"),line31:p4("f4_20"),line32:p4("f4_21"),
  doorQmids:[qmid(2,"Ln19b","f2_11"),qmid(2,"Ln19i","f2_15"),qmid(2,"Ln19ii","f2_18")],
  windowQmids:[qmid(2,"Ln20i","f2_26"),qmid(2,"Ln20ii","f2_29"),qmid(2,"Ln20iii","f2_32"),qmid(2,"Ln20iv","f2_35")],
  acQmid:qmid(3,"Ln_22a","f3_22"),waterHeaterQmids:[qmid(3,"Ln23ai","f3_28"),qmid(3,"Ln23aii","f3_30")],furnaceQmid:qmid(3,"Ln_24a","f3_37"),
  panelQmids:[qmid(3,"","f3_50"),qmid(3,"","f3_51","Box2-4")],heatPumpQmid:qmid(4,"Ln_29a","f4_06"),heatPumpWaterQmid:qmid(4,"Ln_29c","f4_10"),biomassQmid:qmid(4,"Ln_29e","f4_14"),
} as const;
const F=FORM_5695_FIELDS;

export async function fillForm5695(input:TaxYearInput,result:TaxReturnResult,blankPdfPath:string):Promise<PDFDocument>{
  assertPdfExportAllowed(input.taxpayer.taxYear,result.taxYear);
  const source=input.energyCredits;
  const calculation=result.form5695;
  if(!source||!calculation) throw new Error("Form 5695 review requires energy source facts and its calculation audit");
  const audited=(line:string):Decimal=>{
    const matches=calculation.lines.filter(entry=>entry.form==="Form 5695"&&entry.line===line);
    if(matches.length!==1||!matches[0].value.isFinite()) throw new Error(`Missing, duplicate or invalid Form 5695 audit entry ${line}; reconcile legacy energy totals first`);
    return matches[0].value;
  };
  // Validate the complete audited path before creating any output.
  const numericEntries=Object.entries(F).filter(([key])=>/^line\d/.test(key));
  for(const [key] of numericEntries) audited(key.slice(4).replace(/^(19d|20a|23a)(\d)$/,"$1-$2"));
  if(!audited("15").eq(calculation.residentialCleanEnergyCredit)||!audited("32").eq(calculation.energyImprovementCredit)) throw new Error("Form 5695 audit disagrees with allowed credit totals");
  const doc=await loadReviewTemplate(blankPdfPath,2025);
  const form=doc.getForm();
  const name=input.taxpayer.spouse?`${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`:`${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  for(const nameField of [F.name,F.name2]) setTextField(form,nameField,name);
  for(const ssnField of [F.ssn,F.ssn2]) setTextField(form,ssnField,input.taxpayer.primary.ssn.replace(/-/g,""));
  for(const [key,path] of numericEntries) setCurrencyField(form,path as string,audited(key.slice(4).replace(/^(19d|20a|23a)(\d)$/,"$1-$2")));
  const capacity=audited("10-capacity");
  if(capacity.gt(0)){
    const [whole,fraction="0"]=capacity.toFixed().split(".");
    setTextField(form,F.capacityInteger,whole);setTextField(form,F.capacityFraction,fraction);
  }
  const qualifiedItems=(category:string)=>(source.qualifiedImprovements??[]).filter(entry=>entry.category===category&&entry.qualificationConfirmed&&source.residenceEligibilityConfirmed===true&&entry.installationCompletedDate.startsWith("2025-")).sort((a,b)=>new Decimal(b.qualifiedCost).comparedTo(a.qualifiedCost));
  for(const [category,paths] of [
    ["exterior_door",F.doorQmids],["windows_skylights",F.windowQmids],["central_ac",[F.acQmid]],
    ["gas_water_heater",F.waterHeaterQmids],["furnace_boiler",[F.furnaceQmid]],["electrical_panel",F.panelQmids],
    ["heat_pump",[F.heatPumpQmid]],["heat_pump_water_heater",[F.heatPumpWaterQmid]],["biomass",[F.biomassQmid]],
  ] as const){
    const entries=qualifiedItems(category);
    for(let index=0;index<Math.min(paths.length,entries.length);index++){
      const qmid=entries[index].manufacturerQualifiedId;
      if(!qmid||! /^[A-Za-z0-9]{4}$/.test(qmid)) throw new Error("Form 5695 review requires the actual four-character QMID");
      setTextField(form,paths[index],qmid);
    }
  }
  // A calculation-level qualification flag does not establish each printed
  // question or an installation address. Leave those unanswered, visibly explain
  // the gap, and include every record (including overflow and ineligible costs).
  const font=await doc.embedFont(StandardFonts.Helvetica);
  let page=doc.addPage();let y=page.getHeight()-40;
  const write=(text:string)=>{
    for(const line of text.match(/.{1,96}(?:\s|$)|.{1,96}/g)??[text]){
      if(y<45){page=doc.addPage();y=page.getHeight()-40;}
      page.drawText(line.trim(),{x:32,y,size:9,font});y-=15;
    }
  };
  write("FORM 5695 REVIEW DETAILS - incomplete physical-form facts");
  write("Amounts copy the calculation audit. No installation address, original-user, five-year-life,");
  write("new-construction, joint-occupancy or condo/co-op allocation facts have been collected.");
  write("Electrical-panel enabled-property codes are also uncollected. Related form boxes remain blank.");
  write("A qualification confirmation is not an answer to each physical-form question. Reconcile these");
  write("facts and independently qualify the final form before any filing. Mailing address is not inferred.");
  write(`Confirmed residence eligibility: ${String(source.residenceEligibilityConfirmed)}.`);
  for(const [index,entry] of [...(source.cleanEnergyProperties??[]),...(source.qualifiedImprovements??[])].entries()){
    write(`${index+1}. ${entry.category}; qualified cost supplied: $${entry.qualifiedCost}; completed: ${entry.installationCompletedDate}; eligibility: ${entry.qualificationConfirmed?"confirmed":"ineligible"}.`);
    if("manufacturerQualifiedId" in entry&&entry.manufacturerQualifiedId) write(`Manufacturer qualified ID: ${entry.manufacturerQualifiedId}`);
    if("fuelCellKilowattCapacity" in entry&&entry.fuelCellKilowattCapacity!==undefined) write(`Fuel-cell capacity: ${entry.fuelCellKilowattCapacity} kW`);
  }
  write(`Disallowed costs: $${calculation.disallowedNewEnergyCosts.toFixed(2)}. Clean credit carried to ${calculation.carryforwardTaxYear}: $${calculation.residentialCleanEnergyCarryforward.toFixed(2)}.`);
  await markReviewPdf(doc);
  return doc;
}
