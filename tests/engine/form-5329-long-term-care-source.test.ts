// Spec: spec/federal/form-5329-long-term-care-source.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm5329LongTermCareProjection } from "@/engine/forms/form-5329-long-term-care.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const payerStatement = {
  taxYear: 2026,
  payer: "Fictional Private Employer 401(k)",
  accountHolder: "primary",
  accountReference: "employer-401k-a",
  distributionDate: "2026-08-01",
  distributionCode: "1",
  iraSepSimple: false,
  grossDistribution: "3300",
  taxableAmount: "3300",
  taxableAmountNotDetermined: false,
  employeeContributions: "0",
};

const source = {
  sourceTaxYear: 2026,
  owner: "primary",
  payer: payerStatement.payer,
  accountReference: payerStatement.accountReference,
  distributionDate: payerStatement.distributionDate,
  distributionAmount: payerStatement.grossDistribution,
  singleDistributionConfirmed: true,
  noRolloverConfirmed: true,
  noOtherQualifiedLongTermCareDistributionsConfirmed: true,
  noCompetingPartIExceptionConfirmed: true,
  plan: {
    kind: "private_qualified_401k",
    administratorRecordReference: "fictional-plan-actual-withdrawal-record",
    offersQualifiedLongTermCareDistributions: true,
    noAfterTaxContributionsInMatchedPaymentConfirmed: true,
    qualifiedPortionOfMatchedPayment: "2600",
    ordinaryPortionOfMatchedPayment: "700",
    vestedBenefitPresentValue: "38000",
  },
  premiumStatement: {
    reference: "fictional-certified-premium-statement-2026",
    calendarYear: 2026,
    filedWithPlanDate: "2026-07-17",
    issuerDisclosureAcknowledged: true,
    certifiedLongTermCareInsurance: true,
    employeeOwnCoverageConfirmed: true,
    premiumPaidOrAssessed: "3000",
  },
};

function input(
  statement: Record<string, unknown> = {},
  taxpayer: Partial<TaxYearInput["taxpayer"]> = {},
  other: Record<string, unknown> = {},
) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026, ...taxpayer },
    form1099R: [{ ...payerStatement, ...statement }],
    ...other,
  });
}

it("applies each verified annual cap with exact Decimal amounts", () => {
  for (const [premium, vested, qualified, ordinary, available, tax] of [
    ["2425.19", "38000", "2425.19", "874.81", "2425.19", "87.481"],
    ["3000", "24123.40", "2412.34", "887.66", "2412.34", "88.766"],
    ["3000", "38000", "2600", "700", "2600", "70"],
    ["3000", "38000", "725.50", "2574.50", "2600", "257.45"],
    ["3000", "24123.45", "2412.34", "887.66", "2412.345", "88.766"],
  ]) {
    const projected = calculateForm5329LongTermCareProjection(input(), {
      ...source,
      plan: { ...source.plan, vestedBenefitPresentValue: vested, qualifiedPortionOfMatchedPayment: qualified, ordinaryPortionOfMatchedPayment: ordinary },
      premiumStatement: { ...source.premiumStatement, premiumPaidOrAssessed: premium },
    });
    expect(projected.maximumQualifiedDistribution.toFixed()).toBe(available);
    expect(projected.exemptDistribution.eq(d(qualified))).toBe(true);
    expect(projected.additionalTax.toFixed()).toBe(tax);
  }
  const nearIndexedCap = {
    ...source, distributionAmount: "2700",
    plan: { ...source.plan, qualifiedPortionOfMatchedPayment: "2599.99", ordinaryPortionOfMatchedPayment: "100.01", vestedBenefitPresentValue: "25999.90" },
    premiumStatement: { ...source.premiumStatement, premiumPaidOrAssessed: "2600.01" },
  };
  const projected = calculateForm5329LongTermCareProjection(input({ grossDistribution: "2700", taxableAmount: "2700" }), nearIndexedCap);
  expect(projected.maximumQualifiedDistribution.toFixed()).toBe("2599.99");
  expect(projected.additionalTax.toFixed()).toBe("10.001");
});

it("holds missing or contradictory plan, coverage or annual proof", () => {
  for (const change of [
    { plan: { ...source.plan, offersQualifiedLongTermCareDistributions: false } },
    { plan: { ...source.plan, administratorRecordReference: "" } },
    { plan: { ...source.plan, noAfterTaxContributionsInMatchedPaymentConfirmed: undefined } },
    { plan: { ...source.plan, kind: "governmental_457b" } },
    { plan: { ...source.plan, vestedBenefitPresentValue: undefined } },
    { plan: { ...source.plan, ordinaryPortionOfMatchedPayment: undefined } },
    { plan: { ...source.plan, ordinaryPortionOfMatchedPayment: "699.99" } },
    { premiumStatement: { ...source.premiumStatement, employeeOwnCoverageConfirmed: false } },
    { premiumStatement: { ...source.premiumStatement, reference: "" } },
    { premiumStatement: { ...source.premiumStatement, calendarYear: 2025 } },
    { premiumStatement: { ...source.premiumStatement, filedWithPlanDate: "2026-08-02" } },
    { premiumStatement: { ...source.premiumStatement, filedWithPlanDate: "2026-02-30" } },
    { premiumStatement: { ...source.premiumStatement, issuerDisclosureAcknowledged: undefined } },
    { premiumStatement: { ...source.premiumStatement, certifiedLongTermCareInsurance: false } },
    { premiumStatement: { ...source.premiumStatement, premiumPaidOrAssessed: "" } },
    { noOtherQualifiedLongTermCareDistributionsConfirmed: undefined },
    { noOtherQualifiedLongTermCareDistributionsConfirmed: false },
    { singleDistributionConfirmed: false },
    { noRolloverConfirmed: false },
    { noCompetingPartIExceptionConfirmed: false },
  ]) {
    expect.soft(() => calculateForm5329LongTermCareProjection(input(), { ...source, ...change }), JSON.stringify(change))
      .toThrow(/long.term care/i);
  }
});

it("holds an asserted long-term-care payment above its statutory or taxable limit", () => {
  for (const [premium, vested, qualified, ordinary] of [
    ["2500", "38000", "2500.01", "799.99"],
    ["3000", "25000", "2500.01", "799.99"],
    ["3000", "38000", "2600.01", "699.99"],
  ]) {
    expect(() => calculateForm5329LongTermCareProjection(input(), {
      ...source,
      plan: { ...source.plan, vestedBenefitPresentValue: vested, qualifiedPortionOfMatchedPayment: qualified, ordinaryPortionOfMatchedPayment: ordinary },
      premiumStatement: { ...source.premiumStatement, premiumPaidOrAssessed: premium },
    })).toThrow(/statutory limit/i);
  }
  expect(() => calculateForm5329LongTermCareProjection(input({ grossDistribution: "500", taxableAmount: "500" }), {
    ...source, distributionAmount: "500", plan: { ...source.plan, qualifiedPortionOfMatchedPayment: "500.01", ordinaryPortionOfMatchedPayment: "0" },
  })).toThrow(/actual taxable payment/i);
});

it("holds outside the single actual 2026 primary early-distribution branch", () => {
  for (const change of [
    { distributionDate: "2026-08-02" }, { distributionDate: "2025-12-29" }, { distributionDate: undefined },
    { payer: "Different Employer" }, { accountReference: undefined }, { accountReference: "other-plan" },
    { accountHolder: "spouse" }, { taxYear: 2025 }, { iraSepSimple: true }, { iraSepSimple: undefined },
    { taxableAmount: undefined }, { taxableAmount: "3299.99" }, { taxableAmountNotDetermined: undefined },
    { employeeContributions: "0.01" }, { distributionCode: "2" }, { distributionCode: "1B" },
    { terminalIllnessExceptionApplies: true }, { separationFromServiceAfterAge55ExceptionApplies: true },
    { qualifiedDomesticRelationsOrderExceptionApplies: true },
    { qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: true },
    { eligibleGovernmental457bPlan: true }, { retiredPublicSafetyOfficerInsurancePremiums: "0.01" },
  ]) expect.soft(() => calculateForm5329LongTermCareProjection(input(change), source), JSON.stringify(change)).toThrow();
  for (const dateOfBirth of ["1967-02-01", "1966-02-01", "2026-08-02", "1980-02-30"]) {
    const older = input({}, { primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth } });
    expect(() => calculateForm5329LongTermCareProjection(older, source)).toThrow(/under age 59/);
  }
  const younger = input({}, { primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: "1967-02-02" } });
  expect(calculateForm5329LongTermCareProjection(younger, source).exemptDistribution.toFixed()).toBe("2600");
  expect(() => calculateForm5329LongTermCareProjection(input({}, { taxYear: 2025 }), source)).toThrow(/nonjoint 2026/);
  expect(() => calculateForm5329LongTermCareProjection(input({}, { filingStatus: "married_filing_jointly" }), source)).toThrow(/nonjoint 2026/);
  expect(() => calculateForm5329LongTermCareProjection(input({}, {}, { form1099R: [payerStatement, payerStatement] }), source)).toThrow(/one Form 1099-R/);
  expect(() => calculateForm5329LongTermCareProjection(input({}, {}, { form5329: {} }), source)).toThrow(/competing Part I/);
  expect(() => calculateForm5329LongTermCareProjection(input({}, {}, { scheduleA: { medicalExpenses: "5000" } }), source)).toThrow(/competing Part I/);
  const disaster = { disasterName: "Example disaster", disasterDate: "2026-04-01", grossDistribution: "3300" };
  const disasterInput = input({}, {}, { form8915F: { currentYearDistributions: [disaster] } });
  expect(() => calculateForm5329LongTermCareProjection(disasterInput, source)).toThrow(/current-year disaster/);
});

it("preserves income and the annual gate while projecting the actual exception", () => {
  const result = calculateForm5329LongTermCareProjection(input(), source);
  expect(result.taxablePensionDistribution.toFixed()).toBe("3300");
  expect(result.exemptDistribution.toFixed()).toBe("2600");
  expect(result.distributionSubjectToAdditionalTax.toFixed()).toBe("700");
  expect(result.additionalTax.toFixed()).toBe("70");
  expect(result).not.toHaveProperty("line2ExceptionNumber");
  expect(result.lines.find(line => line.line === "ltc-tax")?.value.toFixed()).toBe("70");
  expect(JSON.stringify(result.lines)).not.toContain(source.plan.administratorRecordReference);
  expect(JSON.stringify(result.lines)).not.toContain(source.premiumStatement.reference);
  expect(calculateForm5329LongTermCareProjection(input({ employeeContributions: undefined }), source).additionalTax.toFixed()).toBe("70");
  const entirelyQualified = calculateForm5329LongTermCareProjection(input({ grossDistribution: "2600", taxableAmount: "2600" }), {
    ...source, distributionAmount: "2600", plan: { ...source.plan, ordinaryPortionOfMatchedPayment: "0" },
  });
  expect(entirelyQualified.additionalTax.isZero()).toBe(true);
  expect(() => calculateFederalTax(input())).toThrow(/rule pack .* is incomplete/);
});
