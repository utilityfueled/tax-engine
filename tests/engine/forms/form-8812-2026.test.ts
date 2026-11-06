// Spec: spec/federal/form-8812.yaml, payroll-alternative-and-credit-reservation.
import { describe, it, expect } from "vitest";
import { calculateForm8812 } from "@/engine/forms/form-8812.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { d } from "@/utils/decimal.js";
const base = {taxYear:2026, qualifyingChildren:3, otherDependents:0, agi:d("10000"), earnedIncome:d("10000"), taxLiability:d(0), filingStatus:"single" as const, payrollTaxes:d("2500"), additionalPayrollTaxes:d(0), earnedIncomeCredit:d("500"), excessSocialSecurityWithholding:d("100")};
describe("Schedule 8812 payroll and reservation worksheets", () => {
  it("uses payroll net of EIC/excess SS when larger than the earned-income amount", () => {
    const r=calculateForm8812(base,FEDERAL_2026_CONSTANTS);
    // $2,500 payroll - $500 EIC - $100 excess SS = $1,900, above $1,125 earned amount.
    expect(r.actc.toString()).toBe("1900");
    expect(r.potentialActc.toString()).toBe("1900");
    expect(r.creditLimitWorksheetBReservation.toString()).toBe("4700");
    expect(r.lines.find(l=>l.line==="25")?.value.toString()).toBe("1900");
  });
  it("does not give the payroll alternative to a two-child mainland return", () => {
    expect(calculateForm8812({...base,qualifyingChildren:2},FEDERAL_2026_CONSTANTS).actc.toString()).toBe("1125");
  });
  it("allows a bona fide Puerto Rico resident with one qualifying child to use payroll taxes", () => {
    const r=calculateForm8812({...base,qualifyingChildren:1,bonaFidePuertoRicoResident:true,earnedIncome:d(0),payrollTaxes:d("900"),earnedIncomeCredit:d(0),excessSocialSecurityWithholding:d(0)},FEDERAL_2026_CONSTANTS);
    expect(r.actc.toString()).toBe("900");
  });
  it("keeps the refund zero when Form 2555 was filed", () => {
    const r=calculateForm8812({...base,filesForm2555:true},FEDERAL_2026_CONSTANTS);
    expect(r.actc.toString()).toBe("0");
    expect(r.creditLimitWorksheetBReservation.toString()).toBe("6600");
  });
  it("does not substitute zero for unknown 2026 payroll facts", () => {
    const {payrollTaxes,...unknown}=base;
    expect(()=>calculateForm8812(unknown,FEDERAL_2026_CONSTANTS)).toThrow(/payroll/i);
  });
  it("limits the alternative to unused credit and the indexed per-child refund cap", () => {
    const r=calculateForm8812({...base,payrollTaxes:d("20000"),taxLiability:d("6000")},FEDERAL_2026_CONSTANTS);
    expect(r.potentialActc.toString()).toBe("5100");
    expect(r.actc.toString()).toBe("600");
  });
  it("adds self-employment/unreported payroll taxes before subtracting other refundable amounts", () => {
    const r=calculateForm8812({...base,payrollTaxes:d("1000"),additionalPayrollTaxes:d("2000")},FEDERAL_2026_CONSTANTS);
    expect(r.actc.toString()).toBe("2400");
  });
  it("rejects fractional qualifying-child counts", () => {
    expect(()=>calculateForm8812({...base,qualifyingChildren:1.5},FEDERAL_2026_CONSTANTS)).toThrow(/count/i);
  });
});
