/** Spec: spec/state/oh-government-income.yaml. All identities and source amounts are synthetic. */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildOhioResidentReturnInput } from "@/engine/state/oh-input-adapter.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const source = (year = 2025, changes: Record<string, unknown> = {}) => ({
  payer: "Synthetic state program", payerTin: "12-3456789", accountHolder: "spouse",
  sourceId: "gov-1", accountReference: "source-1", taxYear: year,
  sourceFormRevision: year === 2026 ? "2026-12" : "2024-03", sourceFactsConfirmed: true,
  actualReceiptConfirmed: true, additionalWorksheetRequired: false,
  programType: "government-unemployment", unemploymentCompensation: "1000",
  federalWithheld: "100", stateOrLocalTaxRefund: "0", rtaaPayments: "0", taxableGrants: "0",
  agriculturePayments: "0", marketGain: "0", familyLeaveBenefits: "0", tradeOrBusinessRefund: false,
  currentYearRepaid: "0", priorYearRepaid: "0", unrecoveredAfterTaxContributions: "0",
  stateTaxReporting: "none", stateWithheld: "0", ...changes,
});
const history = { contributionProgramId: "synthetic-program", contributionHistoryReference: "synthetic-program-history",
  contributionBalanceReconciled: true, allProgramPaymentsIncluded: true };
function inputFor(year: number, forms: Record<string, unknown>[]) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year, filingStatus: "married_filing_jointly",
      spouse: { firstName: "Synthetic", lastName: "Spouse", ssn: "987-65-4321", dateOfBirth: "1990-01-01" } },
    w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", socialSecurityTips: "0" }], form1099G: forms });
}
function ohio(year: number, forms: Record<string, unknown>[]) {
  const input = inputFor(year, forms);
  return buildOhioResidentReturnInput(input, calculateFederalTax(input));
}

describe("Ohio government source qualifying income", () => {
  it("Ohio joint credit uses net unemployment after actual repayment and contributions", () => {
    const facts = { ...history, currentYearRepaid: "200", unemploymentReceivedBeforeRepayment: "1000",
      box1IncludesCurrentYearRepayment: true, repaymentSourceReference: "synthetic-repayment",
      unrecoveredAfterTaxContributions: "301" };
    const below = ohio(2025, [source(2025, facts)]);
    expect(d(below.spouseQualifyingIncome).toString()).toBe("499");
    expect(below.bothSpousesHaveQualifyingIncome).toBe(false);
    const at = ohio(2025, [source(2025, { ...facts, unrecoveredAfterTaxContributions: "300" })]);
    expect(d(at.spouseQualifyingIncome).toString()).toBe("500");
    expect(at.bothSpousesHaveQualifyingIncome).toBe(true);
    const alreadyNetted = ohio(2025, [source(2025, { ...facts, unemploymentCompensation: "800", box1IncludesCurrentYearRepayment: false })]);
    expect(d(alreadyNetted.spouseQualifyingIncome).toString()).toBe("499");
  });
  it("Ohio pools a shared government program once without moving spouse income", () => {
    const result = ohio(2025, [
      source(2025, { ...history, unemploymentCompensation: "600.10", unrecoveredAfterTaxContributions: "300" }),
      source(2025, { ...history, sourceId: "gov-2", accountReference: "source-2", unemploymentCompensation: "400.20", unrecoveredAfterTaxContributions: "300" }),
    ]);
    expect(d(result.primaryQualifyingIncome).toString()).toBe("85000");
    expect(d(result.spouseQualifyingIncome).toString()).toBe("700.3");
    expect(result.bothSpousesHaveQualifyingIncome).toBe(true);
  });
  it("Ohio counts actual other government income and preserves a zero overlay", () => {
    const forms = [source(2025, { programType: "other-government", unemploymentCompensation: "0",
      rtaaPayments: "249.90", taxableGrants: "250.10", grantIncomeCategory: "nonbusiness" })];
    const input = inputFor(2025, forms), federal = calculateFederalTax(input);
    const result = buildOhioResidentReturnInput(input, federal);
    expect(d(result.spouseQualifyingIncome).toString()).toBe("500");
    expect(result.bothSpousesHaveQualifyingIncome).toBe(true);
    const explicit = buildOhioResidentReturnInput(input, federal, { primaryQualifyingIncome: "85000", spouseQualifyingIncome: "0" });
    expect(d(explicit.spouseQualifyingIncome).toString()).toBe("0");
    expect(explicit.bothSpousesHaveQualifyingIncome).toBe(false);
    const family = ohio(2026, [source(2026, { programType: "other-government", unemploymentCompensation: "0",
      familyLeaveBenefits: "500", familyLeaveProgramType: "state-pfml-family" })]);
    expect(d(family.spouseQualifyingIncome).toString()).toBe("500");
    expect(family.bothSpousesHaveQualifyingIncome).toBe(true);
  });
});
