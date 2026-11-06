// Spec: spec/federal/form-8839-other-adopter-history.yaml.
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateForm8839 } from "@/engine/forms/form-8839.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { Form8839ChildSchema, TaxYearInputSchema } from "@/models/inputs.js";
import { sharedAdoptionHistoryParams, sharedAdoptionCanonicalOriginals as simpleW2Fixture } from "../../fixtures/form-8839-other-adopter-history.js";
const line = (r: ReturnType<typeof calculateForm8839>, id: string) => r.lines.find(l => l.line === id)?.value.toFixed();
const agreement = (p: ReturnType<typeof sharedAdoptionHistoryParams>) => p.children[0].priorYearForeignBenefitHistory.otherAdopterAgreement;
const canonical = (year: 2025 | 2026) => {
  const p = sharedAdoptionHistoryParams(year);
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year, primary: { ...simpleW2Fixture.taxpayer.primary, firstName: "Jordan", lastName: "Example" } },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: year, accountHolder: "primary", wages: "100000",
      socialSecurityWages: "102000", socialSecurityWithheld: "6324", medicareWages: "102000", medicareWithheld: "1479", box12CodeT: "2000" }],
    form8839: { eligibilityConfirmed: true, children: p.children, exclusionMagi: "102000", possessionIncomeExclusion: "0",
      foreignEarnedIncomeExclusion: "0", foreignHousingExclusion: "0", carryforwards: [] },
  });
};
describe("Actual shared historical foreign adoption", () => {
  it("uses an actual agreed historical exclusion without treating outside benefits as own income", () => {
    for (const year of [2025, 2026] as const) {
      const p = sharedAdoptionHistoryParams(year), before = JSON.stringify(p), r = calculateForm8839(p);
      expect(r.totalEmployerBenefits.toFixed()).toBe("10000"); expect(r.allowableExclusion.toFixed()).toBe("6000");
      expect(r.taxableEmployerBenefits.toFixed()).toBe("0"); expect(r.priorYearExcludedBenefits.toFixed()).toBe("4000");
      expect(r.adoptionIncomeAdjustment.toFixed()).toBe("-4000"); expect(r.adoptionCredit.toFixed()).toBe("0");
      expect(line(r, "19-child-1")).toBe("6000"); expect(line(r, "20-child-1")).toBe("0"); expect(line(r, "22-child-1")).toBe("10000");
      expect(JSON.stringify(p)).toBe(before);
      const audit = JSON.stringify(r.lines);
      for (const secret of ["Casey", "Jordan", "9012", "456-78-9012", "23-4567890", "fictional-shared-adoption-agreement"]) expect(audit).not.toContain(secret);
    }
  });
  it("applies actual finality-year phaseout and keeps taxable current benefits separate", () => {
    const p = sharedAdoptionHistoryParams(); p.exclusionMagi = new Decimal("285080");
    const r = calculateForm8839(p); expect(r.allowableExclusion.toFixed()).toBe("3000"); expect(r.priorYearExcludedBenefits.toFixed()).toBe("1000"); expect(r.adoptionIncomeAdjustment.toFixed()).toBe("-1000");
    p.exclusionMagi = new Decimal("305080"); expect(calculateForm8839(p).adoptionIncomeAdjustment.toFixed()).toBe("2000");
    p.exclusionMagi = new Decimal("102000"); p.children[0].employerBenefits = "9000";
    const current = calculateForm8839(p); expect(current.totalEmployerBenefits.toFixed()).toBe("17000"); expect(current.taxableEmployerBenefits.toFixed()).toBe("3000"); expect(current.priorYearExcludedBenefits.toFixed()).toBe("0");
  });
  it("preserves source cents and applies line rounding with actual zero or full shares", () => {
    const p = sharedAdoptionHistoryParams(); agreement(p).taxpayerExclusionLimit = "0"; agreement(p).otherAdopterExclusionLimit = "17670";
    expect(calculateForm8839(p).adoptionIncomeAdjustment.toFixed()).toBe("2000");
    agreement(p).taxpayerExclusionLimit = "17670"; agreement(p).otherAdopterExclusionLimit = "0";
    expect(calculateForm8839(p).adoptionIncomeAdjustment.toFixed()).toBe("-8000");
    p.children[0].employerBenefits = "2000.50"; agreement(p).taxpayerExclusionLimit = "6000"; agreement(p).otherAdopterExclusionLimit = "11670";
    const r = calculateForm8839(p); expect(r.totalEmployerBenefits.toFixed()).toBe("10001"); expect(r.priorYearExcludedBenefits.toFixed()).toBe("3999"); expect(r.adoptionIncomeAdjustment.toFixed()).toBe("-3999"); expect(p.children[0].employerBenefits).toBe("2000.50");
  });
  it("rejects incomplete contradictory or unsupported shared historical facts", () => {
    const mutations: Array<(p: ReturnType<typeof sharedAdoptionHistoryParams>) => void> = [
      p => { agreement(p).sourceTaxYear = 2025; }, p => { agreement(p).taxpayerNameOnAgreement = "Other Person"; },
      p => { agreement(p).taxpayerIdentifyingNumberLast4 = "0000"; }, p => { agreement(p).otherAdopterIdentifyingNumber = "123-45-6789"; },
      p => { agreement(p).childNameOnAgreement = "Other Child"; }, p => { agreement(p).childIdentifyingNumberLast4 = "0000"; },
      p => { agreement(p).bothAdoptersAgreed = false; }, p => { agreement(p).allAdoptersIncluded = false; },
      p => { agreement(p).sourceFactsConfirmed = false; }, p => { agreement(p).creditExpenseHistoryConfirmed = false; },
      p => { agreement(p).taxpayerQualifiedCreditExpenses = "1"; }, p => { agreement(p).otherAdopterQualifiedCreditExpenses = "1"; },
      p => { agreement(p).taxpayerPriorCreditsClaimed = "1"; }, p => { agreement(p).otherAdopterPriorCreditsClaimed = "1"; },
      p => { agreement(p).otherAdopterPriorExclusionLimitUsed = "1"; }, p => { agreement(p).otherAdopterCurrentBenefits = "1"; },
      p => { agreement(p).taxpayerExclusionLimit = "6000.50"; agreement(p).otherAdopterExclusionLimit = "11669.50"; },
      p => { agreement(p).otherAdopterExclusionLimit = "11669"; }, p => { agreement(p).records = []; },
      p => { agreement(p).taxpayerExclusionLimit = "10000000000000000000000000000"; },
      p => { agreement(p).records[0].originalEmployerBenefits = "12000.001"; },
      p => { agreement(p).records[0].sourceId = "fictional-prior-employer-statement"; },
      p => { agreement(p).records[0].recipientName = "Other Person"; }, p => { agreement(p).records[0].recipientTaxpayerIdLast4 = "0000"; },
      p => { agreement(p).records[0].taxYear = 2026; }, p => { agreement(p).records[0].allocatedBenefitsIncludedInPriorIncome = false; },
      p => { agreement(p).records[0].employerPlanQualified = false; }, p => { agreement(p).records[0].benefitsAllocatedToChild = "12001"; },
      p => { agreement(p).records[0].benefitsAllocatedToChild = "0"; }, p => { agreement(p).records.push({ ...agreement(p).records[0] }); },
      p => { agreement(p).records.push({ ...agreement(p).records[0], sourceId: "alias-original" }); },
      p => { p.children[0].qualifiedExpenses = "1"; }, p => { p.children[0].expensesByYear = [{ year: 2025, amount: "1" }]; },
      p => { p.children[0].priorYearCreditsClaimed = "1"; }, p => { p.children[0].priorYearForeignBenefitHistory.otherAdopterReceivedBenefits = false; },
      p => { p.children.push(structuredClone(p.children[0])); },
    ];
    for (const mutate of mutations) { const p = sharedAdoptionHistoryParams(); mutate(p); expect(() => calculateForm8839(p)).toThrow(); }
    for (const key of Object.keys(agreement(sharedAdoptionHistoryParams()))) {
      const p = sharedAdoptionHistoryParams(); Reflect.deleteProperty(agreement(p), key); expect(() => calculateForm8839(p)).toThrow();
    }
  });
  it("keeps positive credit carry and alternate taxpayer ownership outside the finite agreement", () => {
    const p = sharedAdoptionHistoryParams();
    expect(() => calculateForm8839({ ...p, carryforwards: [{ originTaxYear: 2025, amount: new Decimal("1") }] })).toThrow(/credit carryforward/i);
    expect(() => calculateForm8839({ ...p, filingStatus: "married_filing_jointly" })).toThrow(/single-filer/i);
    expect(() => calculateForm8839({ ...p, sourceTaxpayer: { ...p.sourceTaxpayer, spouse: { firstName: "Casey", lastName: "Example", ssn: "456-78-9012" } } })).toThrow(/single-filer/i);
    const child = p.children[0]; child.childIdentifyingNumber = "123-45-6789";
    child.priorYearForeignBenefitHistory.childIdentifyingNumberLast4 = agreement(p).childIdentifyingNumberLast4 = "6789";
    expect(() => calculateForm8839(p)).toThrow(/identity/i);
  });
  it("retains canonical sources and transfers the actual signed adjustment once without opening 2026", () => {
    const input = canonical(2025), before = JSON.stringify(input), r = calculateFederalTax(input);
    expect(input.form8839?.children[0].priorYearForeignBenefitHistory).toHaveProperty("otherAdopterAgreement");
    expect(r.agi.toFixed()).toBe("96000"); expect(r.form8839?.adoptionIncomeAdjustment.toFixed()).toBe("-4000");
    expect(r.allLines.filter(l => l.form === "1040" && l.line === "1f").map(l => l.value.toFixed())).toEqual(["-4000"]);
    expect(JSON.stringify(input)).toBe(before); expect(() => calculateFederalTax(canonical(2026))).toThrow(/incomplete|not.*available|unsupported.*year/i);
    const raw = sharedAdoptionHistoryParams().children[0]; const child = Form8839ChildSchema.parse(raw);
    expect(child.priorYearForeignBenefitHistory).toEqual(raw.priorYearForeignBenefitHistory);
    const empty = Form8839ChildSchema.parse({ ...raw, priorYearForeignBenefitHistory: { ...raw.priorYearForeignBenefitHistory, otherAdopterAgreement: {} } });
    expect(empty.priorYearForeignBenefitHistory).toHaveProperty("otherAdopterAgreement", {});
  });
  it("keeps actual agreed limits consistent in documentary audit and returned totals", () => {
    // Spec: form-8839-other-adopter-history.yaml reporting-limit.
    for (const year of [2025, 2026] as const) {
      const indexed = year === 2026 ? "17670" : "17280";
      for (const [own, other, expected] of [["6000", year === 2026 ? "11670" : "11280", "6000"], ["0", indexed, "0"], [indexed, "0", "10000"]]) {
        const p = sharedAdoptionHistoryParams(year), original = agreement(p);
        original.taxpayerExclusionLimit = own; original.otherAdopterExclusionLimit = other;
        const input = { ...p, children: p.children.map(c => Form8839ChildSchema.parse(c)) }, before = JSON.stringify(input);
        const r = calculateForm8839(input);
        expect(line(r, "prior-benefits-2-child-1")).toBe(own);
        expect(line(r, "19-child-1")).toBe(expected);
        expect(r.childResults[0].tentativeExclusion.toFixed()).toBe(expected);
        expect(r.totalTentativeExclusion.toFixed()).toBe(expected);
        expect(r.netTentativeExclusion.toFixed()).toBe(expected);
        expect(r.allowableExclusion.toFixed()).toBe(expected);
        expect(JSON.stringify(input)).toBe(before);
      }
    }
  });

});
