// Spec: spec/federal/form-7206-return.yaml.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateSchedule1 } from "@/engine/schedules/schedule-1.js";
import { getConstants } from "@/models/constants.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { healthFacts } from "../fixtures/form7206.js";

const base = { ...simpleW2Fixture,
  w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", wages: "50000", socialSecurityWages: "50000", socialSecurityTips: "0", medicareWages: "50000", federalWithheld: "30000" }],
  scheduleC: { accountHolder: "primary", businessName: "Actual proprietor", grossReceipts: "50000", qbiMateriallyParticipated: true },
};
const calculate = (value: unknown) => calculateFederalTax(TaxYearInputSchema.parse(value));
describe("Canonical Form7206 source handoff", () => {
  it("uses the actual health source once without reducing SE tax", () => {
    const original = calculate(base);
    const result = calculate({ ...base, form7206: healthFacts() });
    expect(result.schedule1?.seHealthInsurance.toString()).toBe("600");
    expect(original.agi.minus(result.agi).toString()).toBe("600");
    expect(result.scheduleSE.totalSETax.eq(original.scheduleSE.totalSETax)).toBe(true);
    expect(result.form7206?.deduction?.toString()).toBe("600.1");
    expect(result.allLines.filter(line => line.form === "Form 7206" && line.line === "14").map(line => line.value.toString())).toEqual(["600.1"]);
    expect(result.allLines.find(line => line.form === "QBI Source Deductions" && line.line === "scheduleC")?.inputs?.["SE health insurance"]?.toString()).toBe("600");
    expect(() => calculate({ ...base, form7206: healthFacts(), adjustments: { selfEmployedHealthInsurance: "600" } })).toThrow(/legacy|reconcile|duplicate/i);
  });
  it("rejects a substituted household age and unknown business source", () => {
    const facts = healthFacts(); facts.persons[0].attainedAgeAtYearEnd = 75;
    expect(() => calculate({ ...base, form7206: facts })).toThrow(/age|birth/i);
    expect(() => calculate({ ...base, form7206: healthFacts("scheduleF") })).toThrow(/business.*source|source.*business/i);
    const unknown = { ...healthFacts(), persons: [{ ...healthFacts().persons[0], attainedAgeAtYearEnd: undefined }] };
    expect(() => calculate({ ...base, form7206: unknown })).toThrow(/age|birth/i);
  });
  it("uses actual shareholder wages without allocating the deduction to another business", () => {
    const facts = healthFacts("formW2:0", "5000");
    const corporate = { ...facts, plans: facts.plans.map(plan => ({ ...plan, businessKind: "s_corporation", moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true,
      payments: plan.payments.map(payment => ({ ...payment, personAmounts: payment.personAmounts.map(person => ({ ...person, payer: "business_paid_or_reimbursed" })) })) })) };
    const result = calculate({ ...base, w2s: [{ ...base.w2s[0], wages: "9000", medicareWages: "4000", socialSecurityWages: "4000" }], form7206: corporate });
    expect(result.form7206?.deduction?.toString()).toBe("4000");
    expect(result.schedule1?.seHealthInsurance.toString()).toBe("4000");
    expect(result.allLines.find(line => line.form === "QBI Source Deductions" && line.line === "scheduleC")?.inputs?.["SE health insurance"]?.toString()).toBe("0");
    expect(() => calculate({ ...base, w2s: [{ ...base.w2s[0], wages: "4000" }], form7206: corporate })).toThrow(/wages|Box1/i);
  });
  it("requires actual2026 sources and a completed standalone handoff", () => {
    const current = { ...base, taxpayer: { ...base.taxpayer, taxYear: 2026 } };
    expect(() => calculate({ ...current, adjustments: { selfEmployedHealthInsurance: "600" } })).toThrow(/2026.*actual|actual.*2026/i);
    expect(() => calculateSchedule1(TaxYearInputSchema.parse({ ...base, form7206: healthFacts() }), getConstants(2025))).toThrow(/canonical.*context|completed.*context/i);
    const original = healthFacts();
    const facts = { ...original, sourceTaxYear: 2026, persons: original.persons.map(person => ({ ...person, attainedAgeAtYearEnd: 36 })),
      plans: original.plans.map(plan => ({ ...plan, payments: plan.payments.map(payment => ({ ...payment, datePaid: "2026-01-15", coverageTaxYear: 2026 })) })) };
    const actual = calculate({ ...current, form7206: facts });
    expect(actual.schedule1?.seHealthInsurance.toString()).toBe("600");
    expect(actual.form7206?.deduction?.toString()).toBe("600.1");
    expect(() => calculate({ ...base, w2s: [{ ...base.w2s[0], socialSecurityTips: undefined }], form7206: healthFacts() })).toThrow(/verified.*payroll|payroll.*sources/i);
  });

  it("rejects two index aliases for one shareholder income source", () => {
    const facts = healthFacts("formW2:0", "5000");
    const plans = ["formW2:0", "formW2:00"].map((id, index) => ({ ...facts.plans[0], planId: `corp-${index}`, businessSourceId: id,
      businessKind: "s_corporation", moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true,
      payments: facts.plans[0].payments.map(payment => ({ ...payment, sourceId: `premium-${index}`, personAmounts: payment.personAmounts.map(person => ({ ...person, payer: "business_paid_or_reimbursed" })) })) }));
    expect(() => calculate({ ...base, w2s: [{ ...base.w2s[0], wages: "20000", medicareWages: "4000", socialSecurityWages: "4000" }], form7206: { ...facts, plans } })).toThrow(/canonical.*identity|source.*identity|alias/i);
  });

});
