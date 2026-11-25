// Specs: spec/federal/guided-federal-payment-receipts.yaml and spec/federal/guided-federal-estimate-receipts-2026.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { buildEstimatedPaymentsInput, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyPaymentData, goToNextSection, jumpToSection, shouldPromptBeforeAdvance, startInterview, updateSectionData, validateSection, type PaymentData } from "@/lib/guided-interview-flow";
import { completePersonalInfo, completeW2Entry } from "./complete-facts";

const firstReceipt = { date: "2025-04-15", amount: "500.00" };
const repeatedRow = { date: "2025-04-15", amount: "500" };
const firstOriginal = { ...firstReceipt, receiptReference: "Synthetic receipt A" };
const secondOriginal = { ...repeatedRow, receiptReference: "Synthetic receipt B" };

function guidedWithPayments(estimatedPayments: PaymentData["estimatedPayments"], extensionPayments?: PaymentData["extensionPayments"], taxYear = 2025) {
  const state = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null }, taxYear);
  const person = updateSectionData(state, "personal-info", structuredClone(completePersonalInfo));
  const wages = updateSectionData(person, "income-w2", { entries: [{ ...completeW2Entry, sourceTaxYear: String(taxYear), wages: "50000",
    federalWithheld: taxYear === 2025 ? "0" : "5000", socialSecurityWages: "50000", medicareWages: "50000" }] });
  return updateSectionData(wages, "payments", { ...emptyPaymentData, estimatedPayments, extensionPayments });
}

function federalFromGuided(state: ReturnType<typeof guidedWithPayments>) {
  return calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)));
}

it("holds an ambiguous repeated estimated payment and admits two actual originals", () => {
  const single = federalFromGuided(guidedWithPayments([firstReceipt]));
  expect(single.estimatedTaxPayments.toFixed()).toBe("500");
  expect(single.form2210?.penalty.toFixed()).toBe("127");

  const repeats = guidedWithPayments([firstReceipt, repeatedRow]);
  expect(validateSection(repeats, "payments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(repeats)).toBeNull();
  expect(() => buildEstimatedPaymentsInput({ ...emptyPaymentData, estimatedPayments: [firstReceipt, repeatedRow] }, 2025)).toThrow(/distinct actual receipt/);
  expect(validateSection(guidedWithPayments([firstOriginal, repeatedRow]), "payments").fieldErrors).toHaveProperty("payment-1-receipt-reference");

  const twoActual = guidedWithPayments([firstOriginal, secondOriginal]);
  expect(validateSection(twoActual, "payments").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(twoActual)?.adjustments?.estimatedTaxPayments)
    .toEqual([{ ...firstReceipt, type: "federal" }, { ...repeatedRow, type: "federal" }]);
  const federal = federalFromGuided(twoActual);
  expect(federal.estimatedTaxPayments.toFixed()).toBe("1000");
  expect(federal.form2210?.penalty.toFixed()).toBe("94");
});

it("holds reused and ambiguous receipt evidence across estimates and extensions", () => {
  const januaryEstimate = { ...firstReceipt, date: "2026-01-15", application: { taxYear: "2025", confirmed: true } };
  const januaryExtension = { ...repeatedRow, date: "2026-01-15" };
  const repeats = guidedWithPayments([januaryEstimate], [januaryExtension]);
  expect(validateSection(repeats, "payments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(repeats)).toBeNull();

  const reused = guidedWithPayments([firstOriginal], [{ date: "2026-04-15", amount: "500.01", receiptReference: " synthetic   RECEIPT a " }]);
  expect(validateSection(reused, "payments").fieldErrors).toEqual({
    "payment-0-receipt-reference": expect.stringMatching(/more than one federal payment/),
    "extension-payment-0-receipt-reference": expect.stringMatching(/more than one federal payment/),
  });
  expect(buildTaxInputFromGuidedData(reused)).toBeNull();

  const twoActual = guidedWithPayments([{ ...januaryEstimate, receiptReference: firstOriginal.receiptReference }],
    [{ ...januaryExtension, receiptReference: secondOriginal.receiptReference }]);
  const input = buildTaxInputFromGuidedData(twoActual);
  expect(input?.adjustments?.extensionPayments).toEqual([{ ...januaryExtension, type: "federal" }]);
  const federal = federalFromGuided(twoActual);
  expect(federal.estimatedTaxPayments.toFixed()).toBe("500");
  expect(federal.totalPayments.toFixed()).toBe("1000");
  expect(federal.form2210?.penalty.toFixed()).toBe("145");
});

it("keeps exact cents and the existing return-year admission", () => {
  const differentCents = guidedWithPayments([firstReceipt, { ...repeatedRow, amount: "500.01" }]);
  expect(validateSection(differentCents, "payments").status).toBe("complete");
  expect(federalFromGuided(differentCents).estimatedTaxPayments.toFixed()).toBe("1000.01");

  const followingYear = guidedWithPayments([{ ...firstOriginal, date: "2026-01-15" }]);
  expect(validateSection(followingYear, "payments").fieldErrors).toHaveProperty("payment-0-application-year");
  expect(buildTaxInputFromGuidedData(followingYear)).toBeNull();
});

it("admits a saved extension-only draft through Continue and the bridge", () => {
  const extension = { date: "2026-04-15", amount: "500" };
  const state = guidedWithPayments([], [extension]);
  const savedPayments = state.sectionData.payments;
  if (!savedPayments) throw new Error("Expected saved payment data");
  Reflect.deleteProperty(savedPayments, "estimatedPayments");
  const onPayments = jumpToSection(state, "payments");
  expect(shouldPromptBeforeAdvance(onPayments)).toBeNull();
  expect(goToNextSection(onPayments).completedSections).toContain("payments");
  expect(buildEstimatedPaymentsInput(savedPayments, 2025)).toEqual([]);
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(onPayments));
  expect(input.adjustments?.estimatedTaxPayments).toEqual([]);
  expect(input.adjustments?.extensionPayments).toEqual([{ ...extension, type: "federal" }]);
  expect(calculateFederalTax(input).totalPayments.toFixed()).toBe("500");
});

it("requires distinct actual references for matching 2026 estimates", () => {
  const first = { ...firstReceipt, date: "2026-04-15" };
  const repeated = { ...repeatedRow, date: "2026-04-15" };
  const single = guidedWithPayments([first], undefined, 2026);
  expect(validateSection(single, "payments").status).toBe("complete");
  expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(single)).adjustments?.estimatedTaxPayments)
    .toEqual([{ ...first, type: "federal" }]);

  const ambiguous = guidedWithPayments([first, repeated], undefined, 2026);
  expect(validateSection(ambiguous, "payments").status).toBe("partial");
  expect(buildTaxInputFromGuidedData(ambiguous)).toBeNull();

  const twoActual = guidedWithPayments([{ ...first, receiptReference: firstOriginal.receiptReference },
    { ...repeated, receiptReference: secondOriginal.receiptReference }], undefined, 2026);
  expect(validateSection(twoActual, "payments").status).toBe("complete");
  expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(twoActual)).adjustments?.estimatedTaxPayments)
    .toEqual([{ ...first, type: "federal" }, { ...repeated, type: "federal" }]);
});

it("reconciles matching 2026 extension payments before transfer", () => {
  const first = { date: "2027-04-15", amount: "500.01" };
  const repeated = { ...first, amount: "500.010" };
  const single = guidedWithPayments([], [first], 2026);
  expect(validateSection(single, "payments").status).toBe("complete");
  expect(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(single)).adjustments?.extensionPayments)
    .toEqual([{ ...first, type: "federal" }]);

  const ambiguous = guidedWithPayments([], [first, repeated], 2026);
  expect(validateSection(ambiguous, "payments").fieldErrors).toEqual({
    "extension-payment-0-receipt-reference": expect.stringMatching(/distinct actual receipt/),
    "extension-payment-1-receipt-reference": expect.stringMatching(/distinct actual receipt/),
  });
  expect(buildTaxInputFromGuidedData(ambiguous)).toBeNull();

  const actual = guidedWithPayments([], [
    { ...first, receiptReference: firstOriginal.receiptReference },
    { ...repeated, receiptReference: secondOriginal.receiptReference },
  ], 2026);
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(JSON.parse(JSON.stringify(actual))));
  expect(input.adjustments?.extensionPayments).toEqual([
    { ...first, type: "federal" }, { ...repeated, type: "federal" },
  ]);
  expect(() => calculateFederalTax(input)).toThrow(/2026 rule pack .* calculation is unavailable/);
});

it("holds a reused 2026 payment reference across estimates and extensions", () => {
  const estimated = { ...firstOriginal, date: "2026-04-15" };
  const extension = { date: "2027-04-15", amount: "500.01", receiptReference: " synthetic  RECEIPT a " };
  const reused = guidedWithPayments([estimated], [extension], 2026);
  expect(validateSection(reused, "payments").fieldErrors).toEqual({
    "payment-0-receipt-reference": expect.stringMatching(/more than one federal payment/),
    "extension-payment-0-receipt-reference": expect.stringMatching(/more than one federal payment/),
  });
  expect(buildTaxInputFromGuidedData(reused)).toBeNull();
});
