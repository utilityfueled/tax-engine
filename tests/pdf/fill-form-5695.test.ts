/** Spec: spec/federal/form-5695.yaml; PDF values copy audited lines, never recalculate. */
import { describe,it,expect } from "vitest";
import Decimal from "decimal.js";
import { PDFDocument } from "pdf-lib";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm5695 } from "@/engine/forms/form-5695.js";
import { fillForm5695,FORM_5695_FIELDS as F } from "@/pdf/fill-form-5695.js";
import { energySource, sourceCleanProperty, sourceImprovement } from "../fixtures/energy-source.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
const path="forms/blank/2025/f5695.pdf";
function fixture(){
 const input=TaxYearInputSchema.parse({taxpayer:{taxYear:2025,filingStatus:"single",primary:{firstName:"Casey",lastName:"Example",ssn:"111-22-3333",dateOfBirth:"1980-01-01"},address:{street:"99 Mailing Only",city:"Denver",state:"CO",zip:"80202"}},energyCredits:{...energySource,
 cleanEnergyProperties:[{...sourceCleanProperty,category:"solar_electric",qualifiedCost:"10000",installationCompletedDate:"2025-06-01",qualificationConfirmed:true},{...sourceCleanProperty,sourceId:"fuel",category:"fuel_cell",qualifiedCost:"10000",installationCompletedDate:"2025-06-01",qualificationConfirmed:true,fuelCellKilowattCapacity:"0.5"}],
 qualifiedImprovements:[{...sourceImprovement,category:"exterior_door",qualifiedCost:"1000",installationCompletedDate:"2025-06-01",qualificationConfirmed:true,manufacturerQualifiedId:"A1B2"},{...sourceImprovement,sourceId:"water-1",category:"gas_water_heater",qualifiedCost:"2000",installationCompletedDate:"2025-06-01",qualificationConfirmed:true,manufacturerQualifiedId:"B2C3"},{...sourceImprovement,sourceId:"water-2",category:"gas_water_heater",qualifiedCost:"1000",installationCompletedDate:"2025-06-01",qualificationConfirmed:true,manufacturerQualifiedId:"C3D4"}],priorYearCarryforward:"300",carryforwardConfirmed:true,carryforwardSourceTaxYear:2024}});
 const result=calculateFederalTax({...input,energyCredits:undefined});
 result.form5695=calculateForm5695(input.energyCredits,{taxLiabilityLimit:new Decimal(1000),improvementTaxLiabilityLimit:new Decimal(400)});
 return{input,result};
}
describe("Form 5695 audited review mapping",()=>{
 it("copies clean and improvement limits and carryforward with source QMIDs",async()=>{
  const {input,result}=fixture();const doc=await fillForm5695(input,result,path);const form=doc.getForm();
  for(const [key,value] of [["line1","10000"],["line6b","3000"],["line9","3000"],["line10","500"],["line11","500"],["line12","300"],["line13","3800"],["line14","1000"],["line15","1000"],["line16","2800"],["line19h","250"],["line23a1","2000"],["line23a2","1000"],["line23d","600"],["line30","850"],["line31","400"],["line32","400"]] as const) expect(form.getTextField(F[key]).getText()).toBe(value);
  expect(form.getTextField(F.capacityInteger).getText()).toBe("0");expect(form.getTextField(F.capacityFraction).getText()).toBe("5");
  expect(form.getTextField(F.waterHeaterQmids[0]).getText()).toBe("B2C3");expect(form.getTextField(F.waterHeaterQmids[1]).getText()).toBe("C3D4");
  expect(form.getTextField("topmostSubform[0].Page1[0].f1_03[0]").getText()).toBe("12 Installation Way");
  expect(form.getCheckBox("topmostSubform[0].Page2[0].c2_1[0]").isChecked()).toBe(true);
  expect(doc.getSubject()).toBe(REVIEW_PDF_NOTICE);expect(doc.getPageCount()).toBeGreaterThan(4);
  const saved=await PDFDocument.load(await doc.save());expect(saved.getForm().getTextField(F.line23a1).getText()).toBe("2000");expect(saved.getForm().getTextField(F.waterHeaterQmids[1]).getText()).toBe("C3D4");
  const names=saved.getForm().getFields().map(field=>field.getName());expect(new Set(names).size).toBe(names.length);
 });
 it("rejects absent or duplicate audits, mismatched totals and legacy scalar calculations",async()=>{
  const {input,result}=fixture();const calculated=result.form5695!;
  result.form5695={...calculated,lines:calculated.lines.filter(line=>line.line!=="23d")};await expect(fillForm5695(input,result,path)).rejects.toThrow(/audit entry 23d/);
  result.form5695={...calculated,lines:[...calculated.lines,calculated.lines.find(line=>line.line==="15")!]};await expect(fillForm5695(input,result,path)).rejects.toThrow(/audit entry 15/);
  result.form5695={...calculated,residentialCleanEnergyCredit:new Decimal(999)};await expect(fillForm5695(input,result,path)).rejects.toThrow(/disagrees/);
  result.form5695=calculateForm5695({solarElectricCost:"10000"});await expect(fillForm5695(input,result,path)).rejects.toThrow(/verified|reconcile legacy/);
  result.form5695=undefined;await expect(fillForm5695(input,result,path)).rejects.toThrow(/source facts/);
 });
 it("retains all overflow records and rejects an invalid supplied QMID",async()=>{
  const {input,result}=fixture();const source=input.energyCredits!;const template=source.qualifiedImprovements![0];
  source.qualifiedImprovements=Array.from({length:80},(_,index)=>({...template,sourceId:`door-${index}`,qualifiedCost:String(index+1)}));
  result.form5695=calculateForm5695(source,{taxLiabilityLimit:new Decimal(1000),improvementTaxLiabilityLimit:new Decimal(400)});
  const doc=await fillForm5695(input,result,path);expect(doc.getPageCount()).toBeGreaterThan(7);
  source.qualifiedImprovements[79].manufacturerQualifiedId="";await expect(fillForm5695(input,result,path)).rejects.toThrow(/actual four-character/);
 });
 it("preserves year and exact template revision gates",async()=>{
  const {input,result}=fixture();await expect(fillForm5695({...input,taxpayer:{...input.taxpayer,taxYear:2026}},result,path)).rejects.toThrow(/years must match/);
  await expect(fillForm5695(input,result,"forms/blank/2025/f8936.pdf")).rejects.toThrow();
 });
});
