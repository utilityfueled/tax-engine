// Spec: spec/federal/qbi-minimum-deduction.yaml
// Draft constants injected solely for law integration; production 2026 remains unavailable.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const make = (participation?:boolean,wages="0") => TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:2026},w2s:[{...simpleW2Fixture.w2s[0],wages,socialSecurityWages:wages,socialSecurityTips:"0"}],scheduleC:{businessName:"Actual trade",grossReceipts:"1200",qbiMateriallyParticipated:participation}});
describe("2026 QBI minimum integration",()=>{
  it("computes minimum even when standard deduction eliminates taxable income",()=>{
    const input = make(true);
    // This positive-earned-income synthetic2026 return also needs actual EIC
    // claimant facts. No eligibility fact is inferred from the QBI source.
    input.taxpayer.primary.employmentValidSsnIssuedByDueDate = true;
    input.eic = { mfsEligible: false, primaryIsFullTimeStudent: false, claimantEligibility: {
      sourceTaxYear: 2026, sourceReference: "Synthetic claimant identity and residency records",
      sourceFactsConfirmed: true, primaryNonresidentAlienDuringYear: false,
    } };
    const r=calculateFederalTax(input);
    expect(r.form8995?.qbiDeduction.toString()).toBe("400");
    expect(r.taxableIncome.toString()).toBe("0");
  });
  it("preserves missing material participation rather than defaulting true",()=>{
    expect(()=>calculateFederalTax(make(undefined,"20000"))).toThrow(/participation/i);
  });
  it("preserves an existing QBI loss when no current business income exists",()=>{
    const r=calculateFederalTax(TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:2026},priorYear:{qbiLossCarryforward:"5000"}}));
    expect(r.carryforwards.qbiLossCarryforward.toString()).toBe("5000");
  });
  it("retains an actual inactive activity",()=>{
    const r=calculateFederalTax(make(false,"20000"));
    // Net profit $1,200 less half SE tax $85 gives QBI $1,115; 20% = $223.
    expect(r.form8995?.qbiDeduction.toString()).toBe("223");
  });
});
