// Spec: spec/federal/ira-return-integration.yaml
import { describe, it, expect, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const prior = { calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,
  calculationMethod:"regular",withholdingMethod:"equal-installments",priorYearTaxStatus:"no-tax-liability",priorYearFullYear:true,
  priorYearResidentAllYear:true,priorYearTaxForForm2210:"0",priorYearTaxComputationConfirmed:true };
const ws = { primaryContributions:"7000",primaryIsActiveParticipant:true,primaryCompensation:"85000",
  primarySection501c18Contributions:"0",primaryRothContributions:"0",sourceFactsConfirmed:true };
const base = { ...simpleW2Fixture, form2210:prior, iraDeductionWorksheet:ws };
const calc = (value: unknown) => calculateFederalTax(TaxYearInputSchema.parse(value));
describe("IRA complete return source coordination", () => {
  it("uses complete interest and farm income in one canonical IRA worksheet", () => {
    const result = calc({ ...base, w2s:[{ ...base.w2s[0],wages:"79000" }],
      form1099Int:[{ payer:"Synthetic Treasury",interestIncome:"0",usSavingsBondInterest:"10000" }] });
    expect(result.iraDeductionWorksheet?.magi.toString()).toBe("89000");
    expect(result.iraDeductionWorksheet?.totalDeduction.toString()).toBe("0");
    expect(result.agi.toString()).toBe("89000");
    expect(result.allLines.filter(l=>l.form==="Sched 1" && l.line==="20").map(l=>l.value.toString())).toEqual(["0"]);
    const farm = calc({ ...base,w2s:[{ ...base.w2s[0],wages:"80000" }],
      scheduleF:{ principalCropOrActivity:"Synthetic farm",accountHolder:"primary",salesOfProductsRaised:"5000" },
      iraDeductionWorksheet:{ ...ws,primaryCompensation:"84646" } });
    expect(farm.iraDeductionWorksheet?.magi.toString()).toBe("84646"); //SE: round4617.5=4618; SS573+Med134=707; half354
    expect(farm.iraDeductionWorksheet?.totalDeduction.toString()).toBe("3050"); //ceil(4354*.7/10)*10
    expect(farm.agi.toString()).toBe("81596");
  });
  it("coordinates Social Security using Appendix B before the actual deduction", () => {
    const result = calc({ ...base,taxpayer:{ ...base.taxpayer,filingStatus:"married_filing_jointly",
      primary:{ ...base.taxpayer.primary,dateOfBirth:"1960-01-01" },
      spouse:{ firstName:"Synthetic",lastName:"Spouse",ssn:"000-00-0002",dateOfBirth:"1960-01-01" } },
      w2s:[{ ...base.w2s[0],accountHolder:"primary",wages:"118000" }],
      formSSA1099:[{ recipient:"Synthetic Primary",netBenefits:"12000",federalWithheld:"0" }],
      iraDeductionWorksheet:{ ...ws,primaryContributions:"8000",primaryCompensation:"118000",spouseContributions:"0",
        spouseCompensation:"0",spouseRothContributions:"0",spouseSection501c18Contributions:"0",spouseIsActiveParticipant:false } });
    expect(result.iraDeductionWorksheet?.magi.toString()).toBe("128200");
    expect(result.iraDeductionWorksheet?.totalDeduction.toString()).toBe("7120"); //17800*.4
    expect(result.socialSecurityBenefitsTaxable.toString()).toBe("10200");
    expect(result.agi.toString()).toBe("121080");
    expect(result.allLines.filter(l=>l.form==="Sched 1" && l.line==="20").map(l=>l.value.toString())).toEqual(["7120"]);
    const lowerIncome = calc({ ...base,w2s:[{ ...base.w2s[0],wages:"20000" }],
      formSSA1099:[{ recipient:"Synthetic Primary",netBenefits:"20000",federalWithheld:"0" }],
      iraDeductionWorksheet:{ ...ws,primaryCompensation:"20000" } });
    expect(lowerIncome.iraDeductionWorksheet?.magi.toString()).toBe("22500"); //30000provisional ->2500 pre-IRA benefits
    expect(lowerIncome.socialSecurityBenefitsTaxable.toString()).toBe("0"); //23000 provisional after7000 IRA
    expect(lowerIncome.agi.toString()).toBe("13000");
  });
  it("applies actual compensation and joint lower-earner limits without adding excess to basis", () => {
    const single = calc({ ...base,w2s:[{ ...base.w2s[0],wages:"2000" }],
      form1099Int:[{ payer:"Synthetic bank",interestIncome:"83000" }],iraDeductionWorksheet:{ ...ws,primaryCompensation:"2000" } });
    expect(single.iraDeductionWorksheet?.primary.deductibleAmount.toString()).toBe("2000");
    expect(single.iraDeductionWorksheet?.primary.nondeductibleAmount.toString()).toBe("0");
    expect(single.iraDeductionWorksheet?.primary.excessContributions.toString()).toBe("5000");
    const joint = calc({ ...base,taxpayer:{ ...base.taxpayer,filingStatus:"married_filing_jointly",
      spouse:{ firstName:"Synthetic",lastName:"Spouse",ssn:"000-00-0002",dateOfBirth:"1990-01-01" } },
      w2s:[{ ...base.w2s[0],accountHolder:"primary",wages:"10000" }],
      iraDeductionWorksheet:{ ...ws,primaryContributions:"6000",primaryCompensation:"10000",primaryRothContributions:"1000",
        primaryIsActiveParticipant:false,spouseContributions:"7000",spouseCompensation:"0",spouseRothContributions:"0",
        spouseSection501c18Contributions:"0",spouseIsActiveParticipant:false } });
    expect(joint.iraDeductionWorksheet?.primary.deductibleAmount.toString()).toBe("6000");
    expect(joint.iraDeductionWorksheet?.spouse?.compensationLimit?.toString()).toBe("3000");
    expect(joint.iraDeductionWorksheet?.spouse?.deductibleAmount.toString()).toBe("3000");
    expect(joint.iraDeductionWorksheet?.spouse?.excessContributions.toString()).toBe("4000");
    expect(joint.agi.toString()).toBe("1000");
  });
  it("preserves unknown IRA facts and rejects missing or unsupported coordination", () => {
    const unknown = TaxYearInputSchema.parse({ ...base,iraDeductionWorksheet:{ primaryContributions:"7000",primaryIsActiveParticipant:true } });
    expect(unknown.iraDeductionWorksheet).not.toHaveProperty("spouseContributions");
    const current = { ...base,taxpayer:{ ...base.taxpayer,taxYear:2026 },iraDeductionWorksheet:{ ...ws,primaryCompensation:undefined } };
    expect(()=>calc(current)).toThrow(/IRA.*compensation|primaryCompensation/i);
    expect(()=>calc({ ...base,iraDeductionWorksheet:{ ...ws,sourceFactsConfirmed:false } })).toThrow(/IRA.*confirm/i);
    expect(()=>calc({ ...base,priorYear:{ nolCarryforward:"1000" } })).toThrow(/IRA.*NOL.*coordination/i);
    const known = calc({ ...base,taxpayer:{ ...base.taxpayer,taxYear:2026 },iraDeductionWorksheet:{ ...ws,primaryContributions:"7500" } });
    expect(known.iraDeductionWorksheet?.primary.sourceFactsVerified).toBe(true);
    expect(known.iraDeductionWorksheet?.totalDeduction.toString()).toBe("4500"); //2026(91000-85000)*.75
  });
});
