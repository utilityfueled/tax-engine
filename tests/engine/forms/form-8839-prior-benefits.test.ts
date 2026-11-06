// Spec: spec/federal/form-8839-prior-benefits.yaml
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8839 } from "@/engine/forms/form-8839.js";
import { Form8839ChildSchema } from "@/models/inputs.js";
import { foreignAdoptionHistoryChild, foreignAdoptionHistoryParams } from "../../fixtures/form-8839-prior-benefits.js";

const history = (child: ReturnType<typeof foreignAdoptionHistoryChild>) => {
  const value = child.priorYearForeignBenefitHistory;
  if (!value || !value.records) throw new Error("Synthetic history fixture is incomplete");
  return Object.assign(value, { records: value.records });
};
const line = (result: ReturnType<typeof calculateForm8839>, id: string) => result.lines.find(entry => entry.line === id)?.value.toString();
describe("actual prior foreign adoption benefits", () => {
  it("excludes actual prior benefits in the year foreign adoption becomes final", () => {
    const params = foreignAdoptionHistoryParams();
    const result = calculateForm8839(params);
    expect(result.totalEmployerBenefits.toString()).toBe("10000");
    expect(result.allowableExclusion.toString()).toBe("10000");
    expect(result.taxableEmployerBenefits.toString()).toBe("0");
    expect(result.priorYearExcludedBenefits.toString()).toBe("8000");
    expect(result.adoptionIncomeAdjustment.toString()).toBe("-8000");
    expect(line(result, "19-child-1")).toBe("10000");
    expect(line(result, "20-child-1")).toBe("0");
    expect(line(result, "22-child-1")).toBe("10000");
    expect(line(result, "prior-benefits-9")).toBe("8000");
    expect(params.children[0].priorYearForeignBenefits).toBe("8000");
  });
  it("separates physical taxable benefits from the signed prior-year adjustment", () => {
    const params = foreignAdoptionHistoryParams();
    params.children[0].employerBenefits = "20000";
    const result = calculateForm8839(params);
    expect(result.allowableExclusion.toString()).toBe("17280");
    expect(result.taxableEmployerBenefits.toString()).toBe("2720");
    expect(result.priorYearExcludedBenefits.toString()).toBe("0");
    expect(result.adoptionIncomeAdjustment.toString()).toBe("2720");
    params.children[0].employerBenefits = "0";
    const priorOnly = calculateForm8839(params);
    expect(priorOnly.taxableEmployerBenefits.toString()).toBe("0");
    expect(priorOnly.adoptionIncomeAdjustment.toString()).toBe("-8000");
    params.eligibilityConfirmed = false;
    expect(calculateForm8839(params).adoptionIncomeAdjustment.toString()).toBe("0");
  });
  it("applies the finality year limit and current MAGI to historical benefits", () => {
    const params = foreignAdoptionHistoryParams(2026);
    params.children[0].priorYearForeignBenefits = "20000";
    const record = history(params.children[0]).records[0];
    record.originalEmployerBenefits = record.benefitsAllocatedToChild = "20000";
    params.exclusionMagi = new Decimal(285080); // halfway through 2026 phaseout
    const result = calculateForm8839(params);
    expect(result.allowableExclusion.toString()).toBe("8835");
    expect(result.priorYearExcludedBenefits.toString()).toBe("6835");
    expect(result.adoptionIncomeAdjustment.toString()).toBe("-6835");
    params.exclusionMagi = new Decimal(305080);
    expect(calculateForm8839(params).adoptionIncomeAdjustment.toString()).toBe("2000");
    params.children[0].adoptionFinalizedYear = 2025;
    expect(() => calculateForm8839(params)).toThrow(/finality/i);
  });
  it("binds every actual historical benefit source before calculating", () => {
    const params = foreignAdoptionHistoryParams();
    const source = history(params.children[0]);
    const mutations = [
      () => { source.sourceTaxYear = 2024; },
      () => { source.childNameOnSource = "Different Child"; },
      () => { source.childIdentifyingNumberLast4 = "0000"; },
      () => { source.records[0].recipientName = "Different Person"; },
      () => { source.records[0].recipientTaxpayerIdLast4 = "0000"; },
      () => { source.records[0].accountHolder = "spouse"; },
      () => { source.records[0].taxYear = 2025; },
      () => { source.records[0].employerEin = "not-an-ein"; },
      () => { source.records[0].allocatedBenefitsIncludedInPriorIncome = false; },
      () => { source.records[0].employerPlanQualified = false; },
      () => { source.otherAdopterReceivedBenefits = true; },
      () => { source.priorExclusionLimitUsed = "1"; },
      () => { params.children[0].priorYearForeignBenefits = "7999.99"; },
    ];
    const saved = structuredClone(source);
    for (const mutate of mutations) {
      Object.assign(source, structuredClone(saved));
      params.children[0].priorYearForeignBenefits = "8000";
      mutate();
      expect(() => calculateForm8839(params)).toThrow();
    }
  });
  it("conserves shared original statements across children and owners", () => {
    const params = foreignAdoptionHistoryParams();
    const first = params.children[0], second = foreignAdoptionHistoryChild();
    first.priorYearForeignBenefits = "3000.10";
    history(first).records[0].benefitsAllocatedToChild = "3000.10";
    second.childName = history(second).childNameOnSource = "Alex Example";
    second.childFirstName = "Alex"; second.childIdentifyingNumber = "456-78-9012";
    history(second).childIdentifyingNumberLast4 = "9012";
    second.priorYearForeignBenefits = "4999.90";
    history(second).records[0].benefitsAllocatedToChild = "4999.90";
    params.children.push(second);
    expect(calculateForm8839(params).priorYearExcludedBenefits.toString()).toBe("8000");
    second.priorYearForeignBenefits = "5000";
    history(second).records[0].benefitsAllocatedToChild = "5000";
    expect(() => calculateForm8839(params)).toThrow(/allocat|original/i);
    second.priorYearForeignBenefits = "4999.90";
    history(second).records[0].benefitsAllocatedToChild = "4999.90";
    history(second).records[0].originalEmployerBenefits = "9000";
    expect(() => calculateForm8839(params)).toThrow(/original|snapshot/i);
    params.children.pop();
    history(first).records.push({ ...history(first).records[0] });
    expect(() => calculateForm8839(params)).toThrow(/duplicate/i);
  });
  it("preserves unknown source fields and rejects incomplete histories", () => {
    const raw = { ...foreignAdoptionHistoryChild(), priorYearForeignBenefitHistory: {} };
    expect(Form8839ChildSchema.parse(raw).priorYearForeignBenefitHistory).toEqual({});
    for (const field of ["sourceFactsConfirmed", "allPriorBenefitsIncluded", "returnMembershipUnchangedConfirmed", "priorExclusionHistoryConfirmed", "priorExclusionLimitUsed", "otherAdopterReceivedBenefits", "records"] as const) {
      const params = foreignAdoptionHistoryParams();
      Reflect.deleteProperty(history(params.children[0]), field);
      expect(() => calculateForm8839(params)).toThrow();
    }
    for (const field of ["originalEmployerBenefits", "benefitsAllocatedToChild", "accountHolder", "employerName", "recipientName", "recipientTaxpayerIdLast4", "allocatedBenefitsIncludedInPriorIncome", "employerPlanQualified"] as const) {
      const params = foreignAdoptionHistoryParams();
      Reflect.deleteProperty(history(params.children[0]).records[0], field);
      expect(() => calculateForm8839(params)).toThrow();
    }
    const params = foreignAdoptionHistoryParams();
    Reflect.deleteProperty(params, "sourceTaxpayer");
    expect(() => calculateForm8839(params)).toThrow(/identity|taxpayer/i);
  });
  it("retains separate joint owners and exact cents without exposing source identities", () => {
    const base = foreignAdoptionHistoryParams();
    const params = { ...base, filingStatus: "married_filing_jointly" as const,
      sourceTaxpayer: { ...base.sourceTaxpayer, spouse: { firstName: "Morgan", lastName: "Example", ssn: "234-56-7890" } } };
    const child = params.children[0], sourceHistory = history(child);
    child.priorYearForeignBenefits = "8000.10";
    sourceHistory.records[0].originalEmployerBenefits = sourceHistory.records[0].benefitsAllocatedToChild = "3000.10";
    sourceHistory.records.push({ ...sourceHistory.records[0], sourceId: "fictional-spouse-prior-source", accountHolder: "spouse",
      recipientName: "Morgan Example", recipientTaxpayerIdLast4: "7890", originalEmployerBenefits: "5000", benefitsAllocatedToChild: "5000" });
    const result = calculateForm8839(params);
    expect(result.priorYearExcludedBenefits.toString()).toBe("8000");
    expect(line(result, "prior-benefits-source-child-1")).toBe("10000.1");
    expect(sourceHistory.records[0].benefitsAllocatedToChild).toBe("3000.10");
    const audit = JSON.stringify(result.lines);
    for (const privateValue of ["fictional-spouse-prior-source", "Jordan Example", "Morgan Example", "12-3456789", "8901"]) expect(audit).not.toContain(privateValue);
    sourceHistory.records[1].recipientTaxpayerIdLast4 = "6789";
    expect(() => calculateForm8839(params)).toThrow(/identity|owner/i);
  });
  it("rounds each target line while retaining original cents across children", () => {
    const params = foreignAdoptionHistoryParams();
    const first = params.children[0];
    first.employerBenefits = first.priorYearForeignBenefits = "100.40";
    const record = history(first).records[0];
    record.originalEmployerBenefits = record.benefitsAllocatedToChild = "100.40";
    const single = calculateForm8839(params);
    expect(line(single, "prior-benefits-source-child-1")).toBe("200.8");
    expect(line(single, "22-child-1")).toBe("201");
    expect(line(single, "30")).toBe("201");
    expect(line(single, "prior-benefits-8")).toBe("100");
    expect(line(single, "prior-benefits-9")).toBe("101");
    expect(record.benefitsAllocatedToChild).toBe("100.40");
    record.originalEmployerBenefits = "200.80";
    const second = structuredClone(first);
    second.childName = history(second).childNameOnSource = "Alex Example";
    second.childFirstName = "Alex"; second.childIdentifyingNumber = "456-78-9012";
    history(second).childIdentifyingNumberLast4 = "9012";
    params.children.push(second);
    const combined = calculateForm8839(params);
    expect(line(combined, "23")).toBe("402");
    expect(line(combined, "prior-benefits-5")).toBe("201");
    expect(line(combined, "prior-benefits-8")).toBe("201");
    expect(combined.adoptionIncomeAdjustment.toString()).toBe("-201");
  });
});
