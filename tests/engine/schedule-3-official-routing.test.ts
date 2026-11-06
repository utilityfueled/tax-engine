// Spec: spec/federal/schedule-3.yaml, official-line-routing.
import {describe,it,expect} from "vitest";
import {calculateSchedule3} from "@/engine/schedules/schedule-3.js";
import {calculateFederalTax} from "@/engine/federal.js";
import {TaxYearInputSchema} from "@/models/inputs.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
import {d} from "@/utils/decimal.js";
describe("Schedule 3 official credit and payment routing",()=>{
  it("uses the printed line identities and separate line6 subtotal",()=>{
    const r=calculateSchedule3(simpleW2Fixture,{foreignTaxCredit:d(100),priorYearMinimumTaxCredit:d(200),generalBusinessCredit:d(300),netPremiumTaxCredit:d(400),excessSocialSecurityWithholding:d(500)});
    for(const [id,amount] of [["6a","300"],["6b","200"],["7","500"],["8","600"],["9","400"],["11","500"],["15","900"]]) expect(r.lines.find(l=>l.line===id)?.value.toString()).toBe(amount);
  });
  it("keeps legacy direct1040 refund inputs out of Schedule3 totals",()=>{
    const r=calculateSchedule3(simpleW2Fixture,{additionalChildTaxCredit:d(1700),aocRefundablePortion:d(1000),netPremiumTaxCredit:d(50)});
    expect(r.totalRefundableCredits.toString()).toBe("50");
    expect(r.lines.some(l=>l.line==="14a"||l.line==="14b")).toBe(false);
    expect(r.additionalChildTaxCredit.toString()).toBe("1700");
    expect(r.aocRefundablePortion.toString()).toBe("1000");
  });
  it("credits actual federal extension and prior-return applied payments once",()=>{
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,adjustments:{extensionPayments:[{date:"2026-04-15",amount:"1000",type:"federal"},{date:"2026-04-15",amount:"900",type:"state",state:"CA"}],priorYearAppliedCredits:[{sourceTaxYear:2024,amount:"700",type:"federal"}]}});
    const r=calculateFederalTax(input);const base=calculateFederalTax(TaxYearInputSchema.parse(simpleW2Fixture));
    expect(r.schedule3?.lines.find(l=>l.line==="10")?.value.toString()).toBe("1000");
    expect(r.estimatedTaxPayments.toString()).toBe("700");
    expect(r.totalPayments.minus(base.totalPayments).toString()).toBe("1700");
  });
  it("rejects a mismatched prior-return credit year",()=>{
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,adjustments:{priorYearAppliedCredits:[{sourceTaxYear:2025,amount:"700",type:"federal"}]}});
    expect(()=>calculateFederalTax(input)).toThrow(/prior.*credit.*year/i);
  });
  it("treats excess Social Security as withholding in Form2210",()=>{
    const w2={...simpleW2Fixture.w2s[0],wages:"200000",federalWithheld:"0",socialSecurityWages:"176100",socialSecurityWithheld:"10918.20",medicareWages:"200000",medicareWithheld:"2900"};
    const r=calculateFederalTax(TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[w2,{...w2,employer:{name:"Second synthetic",ein:"98-7654321"}}]}));
    expect(r.form2210?.totalPayments.toString()).toBe("10918.2");
    expect(r.form2210?.requiredAnnualPayment.eq(r.totalTax.times("0.9").toDecimalPlaces(0))).toBe(true);
  });

});
