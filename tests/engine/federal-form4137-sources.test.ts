// Spec: spec/federal/form-4137-return.yaml. Official4137/SE/8959 source lines.
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se.js";
import { calculateForm8959 } from "@/engine/forms/form-8959.js";
import { calculateUnreportedTipPayroll } from "@/engine/forms/unreported-tip-payroll.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { getConstants } from "@/models/constants.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { tipFacts } from "../fixtures/form4137.js";
const d=(value:string|number)=>new Decimal(value);
function required<T>(value:T|undefined):T {if(value===undefined)throw new Error("Missing actual synthetic source");return value;}
function input() {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly",
    spouse: { firstName: "John", lastName: "Doe", ssn: "555-55-5555", dateOfBirth: "1991-01-02" } },
    w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", employer: {name: "Primary Restaurant", ein: "12-3456789"}, wages: "176100", socialSecurityWages: "176100", socialSecurityTips: "0", allocatedTips: "0", medicareWages: "176100", medicareWithheld: "2553.45", federalWithheld: "60000" },
      { ...simpleW2Fixture.w2s[0], accountHolder: "spouse", employer: {name: "Spouse Restaurant", ein: "98-7654321"}, wages: "10000", socialSecurityWages: "10000", socialSecurityTips: "0", allocatedTips: "0", medicareWages: "10000", medicareWithheld: "145", federalWithheld: "0" }],
    form4137ByOwner: { primary: tipFacts("primary", "1000", "0", "0", 0), spouse: tipFacts("spouse", "1000", "0", "0", 1) },
  });
}
it("keeps each actual owner's tip tax and wage-base usage separate",()=>{
  const result=calculateFederalTax(input());
  expect(result.form4137ByOwner?.primary?.line11.toString()).toBe("0");
  expect(result.form4137ByOwner?.primary?.line13.toString()).toBe("15");
  expect(result.form4137ByOwner?.spouse?.line11.toString()).toBe("62");
  expect(result.form4137ByOwner?.spouse?.line13.toString()).toBe("77");
  expect(result.allLines.find(row=>row.form==="Sched 2"&&row.line==="5")?.value.toString()).toBe("92");
  expect(result.totalWages.toString()).toBe("188100");
});
it("routes only actual taxable tips to SE and Additional Medicare",()=>{
  const actual=input(); required(actual.form4137ByOwner).spouse=TaxYearInputSchema.parse({ ...simpleW2Fixture, form4137: tipFacts("spouse","1018","18","25.50",1) }).form4137;
  required(actual.w2s[0]).medicareWages="250000";
  actual.scheduleC=TaxYearInputSchema.parse({...simpleW2Fixture,scheduleC:{accountHolder:"spouse",businessName:"Spouse source",grossReceipts:"200000",expenses:{}}}).scheduleC;
  const se=calculateScheduleSE(actual,getConstants(2025));
  expect(se.perTaxpayer.find(row=>row.accountHolder==="spouse")?.lines.find(row=>row.line==="8b")?.value.toString()).toBe("1000");
  expect(se.socialSecurityPortion.toString()).toBe("20472"); // (176100-10000-1000)*.124
  const medicare=calculateForm8959(actual,d(0),"married_filing_jointly",getConstants(2025));
  expect(medicare.unreportedTips.toString()).toBe("2000");
  expect(medicare.additionalMedicareTax.toString()).toBe("108"); // (260000+2000-250000)*.009
});
it("rejects unknown and contradictory tip source ownership",()=>{
  const actual=input();required(actual.w2s[0]).accountHolder=undefined;
  expect(()=>calculateFederalTax(actual)).toThrow(/owner/i);
  const jointW2=input();
  expect(TaxYearInputSchema.safeParse({...jointW2,w2s:[{...jointW2.w2s[0],accountHolder:"joint"}]}).success).toBe(false);
  const unownedWages=input();unownedWages.form8919={wagesNotReportedOnW2:"1000"};
  expect(()=>calculateFederalTax(unownedWages)).toThrow(/owner/i);
  const wrong=input();required(wrong.form4137ByOwner?.spouse?.sourceFacts?.employers?.[0]).w2SourceIds=["formW2:0"];
  expect(()=>calculateFederalTax(wrong)).toThrow(/owner|source/i);
  const missing=input();required(missing.w2s[0]).socialSecurityTips=undefined;
  expect(()=>calculateFederalTax(missing)).toThrow(/Box|payroll/i);
  const legacy=TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:2026},form4137:{accountHolder:"primary",unreportedTipIncome:"1000"}});
  expect(()=>calculateUnreportedTipPayroll(legacy,FEDERAL_2026_CONSTANTS)).toThrow(/actual.*source|source.*actual/i);
  expect(()=>calculateUnreportedTipPayroll(input(),FEDERAL_2026_CONSTANTS)).toThrow(/year/i);
});
it("uses the actual 2026 wage base separately for each tip recipient",()=>{
  const actual=input();actual.taxpayer.taxYear=2026;
  for(const record of Object.values(actual.form4137ByOwner ?? {})) if(record.sourceFacts) record.sourceFacts.sourceTaxYear=2026;
  required(actual.w2s[0]).socialSecurityWages="184000";
  const result=calculateUnreportedTipPayroll(actual,FEDERAL_2026_CONSTANTS);
  expect(result.byOwner.primary?.line7?.toFixed()).toBe("184500");
  expect(result.byOwner.primary?.line10.toFixed()).toBe("500");
  expect(result.byOwner.primary?.line13.toFixed()).toBe("46");
  expect(result.byOwner.spouse?.line13.toFixed()).toBe("77");
  expect(result.tax.toFixed()).toBe("123");
});
it("retains small cash and noncash income without payroll tax",()=>{
  const actual=TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[],form4137:tipFacts("primary","18","18","25.50")});
  const result=calculateFederalTax(actual);
  expect(result.form4137?.line13.toString()).toBe("0");
  expect(result.form4137?.line6.toString()).toBe("0");
  expect(result.totalWages.toString()).toBe("43.5");
  expect(result.allLines.find(row=>row.form==="1040"&&row.line==="1c")?.value.toString()).toBe("43.5");
});
