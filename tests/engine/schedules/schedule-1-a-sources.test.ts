// Spec: spec/federal/schedule-1-a-sources.yaml.
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { Schedule1ASchema, TaxYearInputSchema } from "@/models/inputs.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { calculateSchedule1AReturn } from "@/engine/forms/schedule-1-a-return.js";
import { calculateUnreportedTipPayroll } from "@/engine/forms/unreported-tip-payroll.js";
import { calculateSchedule1A } from "@/engine/schedules/schedule-1-a.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
const facts = Schedule1ASchema.parse({ primarySsnEligible: true, spouseSsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", employeeTips: [], businessTips: [], overtime: [], vehicleLoans: [], seniorOwners: ["primary"] });
function calculate(death: string | null | undefined, dob = "1960-02-14", year = 2025, verified = false) {
  return calculateSchedule1A({ taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: dob } },
    agi: new Decimal("50000"), foreignExcludedIncome: new Decimal(0), facts: { ...facts, ...(verified ? { sourceFactsConfirmed: true, sourceTaxYear: year, sourceReference: "Actual senior source records", allSourcesIncluded: true } : {}) },
    standardDeductionFacts: { primaryDeathDate: death } });
}
it("uses actual senior death dates and preserves unknown status", () => {
  expect(calculate("2025-02-12").seniorDeduction.toFixed()).toBe("0");
  expect(calculate("2025-02-13").seniorDeduction.toFixed()).toBe("6000");
  expect(calculate(null).seniorDeduction.toFixed()).toBe("6000");
  expect(calculate("2025-12-31", "1961-01-01").seniorDeduction.toFixed()).toBe("6000");
  expect(calculate("2025-12-30", "1961-01-01").seniorDeduction.toFixed()).toBe("0");
  expect(() => calculate(undefined, "1960-02-14", 2026)).toThrow(/death|unknown/i);
  expect(calculate(null, "1960-02-29").seniorDeduction.toFixed()).toBe("6000");
  expect(calculate("2025-02-27", "1960-02-29").seniorDeduction.toFixed()).toBe("0");
  expect(() => calculate("2025-02-28", "1960-02-29")).toThrow(/leap-day/i);
  for (const date of ["2025-02-30", "2024-12-31", "2026-01-01", "1959-02-14"]) expect(() => calculate(date)).toThrow(/date|death|year/i);
  expect(() => calculate(undefined, "1960-02-14", 2025, true)).toThrow(/death|unknown/i);
  expect(calculate(undefined).seniorDeduction.toFixed()).toBe("6000"); // Unverified historical2025 preview compatibility.
});
it("binds senior eligibility to the canonical household death record", () => {
  const base = TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, primary: { ...simpleW2Fixture.taxpayer.primary, dateOfBirth: "1960-02-14" } }, w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", socialSecurityWages: "50000", medicareWages: "50000" }], standardDeductionFacts: { primaryDeathDate: "2025-02-12" }, schedule1A: facts });
  const result = calculateFederalTax(base);
  expect(result.schedule1A?.seniorDeduction.toFixed()).toBe("0");
  const reached65 = calculateFederalTax({ ...base, standardDeductionFacts: { primaryDeathDate: "2025-02-13" } });
  expect(reached65.schedule1A?.seniorDeduction.toFixed()).toBe("6000");
  expect(reached65.agi.toFixed()).toBe(result.agi.toFixed());
});

const statement = {
  taxYear: 2026, sourceReference: "Fictional VLI Copy B", factsConfirmed: true, corrected: false,
  payer: "primary", lenderName: "Fictional original lender", loanAccountReference: "Fictional loan",
  vin: "1HGCM82633A004352", originationDate: "2025-01-09", lenderAcquisitionDate: null,
  reportedInterest: "900.25", directThirdPartyInterest: "300.00", reimbursedBorrowerInterest: "0.00",
  priorYearInterestRefund: "0.00", originalUseChecked: true, usAssemblyChecked: true,
} as const;

const vehicleLoan = {
  owner: statement.payer, lenderName: statement.lenderName, loanAccountReference: statement.loanAccountReference,
  sourceTaxYear: 2026, sourceReference: "Fictional payment records", borrowerQualificationConfirmed: true,
  vin: statement.vin, acquiredDate: "2025-01-09", loanOriginationDate: statement.originationDate,
  interestPaid: "600.25", businessInterestDeducted: "50.00", nonqualifyingInterest: "0.00", firstLien: true,
  originalUse: true, finalAssemblyUnitedStates: true, personalUse: true, vehicleType: "car",
  grossVehicleWeightRating: 4000, relatedParty: false, lease: false, fleet: false, salvageOrScrap: false, refinanced: false,
  form1098Vli: statement,
} as const;

function vehicleSourceFacts(loan: Record<string, unknown>, taxYear: number) {
  return Schedule1ASchema.parse({ ...facts, sourceFactsConfirmed: true, sourceTaxYear: taxYear,
    sourceReference: "Fictional Schedule 1-A originals", allSourcesIncluded: true, vehicleLoans: [loan], seniorOwners: [] });
}

function calculateVehicleSource(loan: Record<string, unknown>, taxYear = 2026) {
  return calculateSchedule1A({
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear },
    agi: new Decimal("50000"), foreignExcludedIncome: new Decimal(0),
    facts: vehicleSourceFacts(loan, taxYear),
  });
}

function vehicleReturnInput(loan: Record<string, unknown>) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    schedule1A: vehicleSourceFacts(loan, 2026),
  });
}

function resolveVehicleReturn(input: ReturnType<typeof vehicleReturnInput>) {
  return calculateSchedule1AReturn({
    input, agi: new Decimal("85000"), foreignExcludedIncome: new Decimal(0),
    tipPayroll: calculateUnreportedTipPayroll(input, FEDERAL_2026_CONSTANTS),
    scheduleC: calculateScheduleC(input, input.scheduleC),
    businessSources: [], adjustedBusinessSources: [], businessDeductionsVerified: true,
  });
}

it("reconciles current 1098-VLI interest before applying the existing vehicle deduction", () => {
  const result = calculateVehicleSource(vehicleLoan);
  expect(result.vehicleInterestDeduction.toFixed()).toBe("550");
  const reimbursed = calculateVehicleSource({ ...vehicleLoan, interestPaid: "500.25",
    form1098Vli: { ...statement, reimbursedBorrowerInterest: "100.00" } });
  expect(reimbursed.vehicleInterestDeduction.toFixed()).toBe("450");
  // Stress exact source comparison beyond the default arithmetic precision.
  const precisionControl = calculateVehicleSource({ ...vehicleLoan, interestPaid: "100000000000000000000.11",
    form1098Vli: { ...statement, reportedInterest: "100000000000000000000.13",
      directThirdPartyInterest: "0.01", reimbursedBorrowerInterest: "0.01" } });
  expect(precisionControl.vehicleInterestDeduction.toFixed()).toBe("10000");
  expect(JSON.stringify(result.lines)).not.toMatch(/Fictional|1HGCM82633A004352/u);
  expect(() => calculateVehicleSource({ ...vehicleLoan, interestPaid: "900.25" })).toThrow(/1098-VLI/u);

  const returnInput = vehicleReturnInput(vehicleLoan);
  expect(resolveVehicleReturn(returnInput).schedule1A.vehicleInterestDeduction.toFixed()).toBe("550");
  expect(() => resolveVehicleReturn({ ...returnInput,
    schedule1A: vehicleSourceFacts({ ...vehicleLoan, interestPaid: "900.25" }, 2026) })).toThrow(/1098-VLI/u);
  expect(() => calculateFederalTax(returnInput)).toThrow(/rule pack.*incomplete/u);
});

it("holds mismatched or exceptional 1098-VLI facts without disturbing manual payment records", () => {
  for (const changed of [
    { taxYear: 2025 }, { factsConfirmed: false }, { corrected: true }, { payer: "spouse" },
    { lenderName: "Other lender" }, { loanAccountReference: "Other account" }, { vin: "1HGCM82633A004350" },
    { originationDate: "2025-01-10" }, { lenderAcquisitionDate: "2025-06-14" },
    { priorYearInterestRefund: "0.01" }, { directThirdPartyInterest: undefined },
    { directThirdPartyInterest: "900.26" }, { reportedInterest: "900.251" },
    { originalUseChecked: false }, { usAssemblyChecked: false },
  ]) {
    expect(() => calculateVehicleSource({ ...vehicleLoan, form1098Vli: { ...statement, ...changed } })).toThrow();
  }
  expect(() => calculateVehicleSource({ ...vehicleLoan, refinanced: true })).toThrow(/1098-VLI/u);
  expect(() => calculateVehicleSource({ ...vehicleLoan, sourceTaxYear: 2025 }, 2025)).toThrow(/1098-VLI/u);
  expect(() => calculateVehicleSource({ ...vehicleLoan, nonqualifyingInterest: "100" })).toThrow(/1098-VLI/u);
  const belowThreshold = { ...vehicleLoan, form1098Vli: undefined, interestPaid: "599.25" };
  expect(calculateVehicleSource(belowThreshold).vehicleInterestDeduction.toFixed()).toBe("549");
});

const cashRefundEvidence = {
  method: "cash_refund", originTaxYear: 2025, receiptTaxYear: 2026, cashRefundReceived: "125.06",
  refundSourceReference: "Fictional cash refund confirmation",
  priorPaymentSourceReference: "Fictional 2025 lender portal interest statement",
  filedReturnSourceReference: "Fictional 2025 filed return history",
  amendedReturnStatus: "none", loanSourcesMatchConfirmed: true, filedReturnHistoryCompleteConfirmed: true,
  factsConfirmed: true, schedule1ADeductedInterest: "0.00", businessDeductedInterest: "0.00", otherDeductedInterest: "0.00",
} as const;
const cashRefundProof = { ...cashRefundEvidence, borrowerBoreRecoveredPaymentConfirmed: true } as const;

it.each([
  { case: "omits confirmation", proof: cashRefundEvidence },
  { case: "denies confirmation", proof: { ...cashRefundEvidence, borrowerBoreRecoveredPaymentConfirmed: false } },
])("requires the borrower to have borne and recovered the prior payment when the proof $case", ({ proof }) => {
  const form1098Vli = { ...statement, priorYearInterestRefund: "125.06", priorYearRefundProof: proof };
  const result = Schedule1ASchema.safeParse({ ...facts, vehicleLoans: [{ ...vehicleLoan, form1098Vli }] });
  expect(result.error?.issues ?? []).toContainEqual(expect.objectContaining({
    path: ["vehicleLoans", 0, "form1098Vli", "priorYearRefundProof", "borrowerBoreRecoveredPaymentConfirmed"],
  }));
});

it("accepts only documented 1098-VLI cash refunds of interest never deducted", () => {
  const refundStatement = { ...statement, priorYearInterestRefund: "125.06", priorYearRefundProof: cashRefundProof };
  const cashRefundLoan = { ...vehicleLoan, form1098Vli: refundStatement };
  const input = vehicleReturnInput(cashRefundLoan);
  const result = resolveVehicleReturn(input).schedule1A;
  expect(result.vehicleInterestDeduction.toFixed()).toBe("550");
  expect(result.lines).toEqual(resolveVehicleReturn(vehicleReturnInput(vehicleLoan)).schedule1A.lines);
  expect(JSON.stringify(result.lines)).not.toMatch(/Fictional|1HGCM82633A004352/u);
  expect(() => calculateFederalTax(input)).toThrow(/rule pack.*incomplete/u);

  const amendedHistory = { ...refundStatement, priorYearRefundProof: { ...cashRefundProof, amendedReturnStatus: "reviewed" } };
  expect(resolveVehicleReturn(vehicleReturnInput({ ...cashRefundLoan, form1098Vli: amendedHistory })).schedule1A.vehicleInterestDeduction.toFixed()).toBe("550");

  for (const changed of [
    { method: "current_interest_credit" }, { originTaxYear: 2024 }, { receiptTaxYear: 2025 },
    { cashRefundReceived: "125.05" }, { cashRefundReceived: "0" }, { cashRefundReceived: "125.061" },
    { refundSourceReference: " " }, { priorPaymentSourceReference: undefined }, { filedReturnSourceReference: "" },
    { amendedReturnStatus: undefined }, { filedReturnHistoryCompleteConfirmed: false },
    { loanSourcesMatchConfirmed: false }, { factsConfirmed: false }, { schedule1ADeductedInterest: "0.01" },
    { businessDeductedInterest: "0.01" }, { otherDeductedInterest: "0.01" }, { otherDeductedInterest: undefined },
  ]) {
    const form1098Vli = { ...refundStatement, priorYearRefundProof: { ...cashRefundProof, ...changed } };
    expect(() => resolveVehicleReturn(vehicleReturnInput({ ...cashRefundLoan, form1098Vli })), JSON.stringify(changed)).toThrow();
  }
  expect(() => resolveVehicleReturn(vehicleReturnInput({ ...cashRefundLoan,
    interestPaid: "475.19" }))).toThrow(/box 1/i);
  expect(() => resolveVehicleReturn(vehicleReturnInput({ ...cashRefundLoan,
    form1098Vli: { ...refundStatement, priorYearInterestRefund: "0.00" } }))).toThrow(/box 5/i);
  expect(() => resolveVehicleReturn(vehicleReturnInput({ ...cashRefundLoan,
    acquiredDate: "2026-01-09", loanOriginationDate: "2026-01-09",
    form1098Vli: { ...refundStatement, originationDate: "2026-01-09" } }))).toThrow(/2025/u);
});

it("reconciles 1098-VLI interest credits once as borrower-paid current interest", () => {
  const creditProof = {
    ...cashRefundProof, method: "loan_credit", cashRefundReceived: "0.00",
    refundSourceReference: "Fictional 2026 lender credit applied to this loan's 2026 interest",
    currentYearInterestCreditApplied: "100.25", borrowerInterestExcludingCredit: "800.30",
    currentYearInterestCreditIncludedInBox1Confirmed: true,
  } as const;
  const creditStatement = { ...statement, reportedInterest: "900.55", directThirdPartyInterest: "0",
    reimbursedBorrowerInterest: "0", priorYearInterestRefund: "100.25", priorYearRefundProof: creditProof };
  const creditLoan = { ...vehicleLoan, interestPaid: "900.55", businessInterestDeducted: "0",
    form1098Vli: creditStatement };
  const input = vehicleReturnInput(creditLoan);
  const result = resolveVehicleReturn(input).schedule1A;
  expect(result.vehicleInterestDeduction.toFixed()).toBe("901");
  expect(result.lines).toEqual(resolveVehicleReturn(vehicleReturnInput({ ...creditLoan,
    form1098Vli: { ...creditStatement, priorYearInterestRefund: "0", priorYearRefundProof: undefined },
  })).schedule1A.lines);
  expect(JSON.stringify(result.lines)).not.toMatch(/Fictional|1HGCM82633A004352/u);
  expect(() => calculateFederalTax(input)).toThrow(/rule pack.*incomplete/u);
  expect(calculateVehicleSource({ ...creditLoan, businessInterestDeducted: "50.00" })
    .vehicleInterestDeduction.toFixed()).toBe("851");
  const creditOnlyStatement = { ...creditStatement, reportedInterest: "100.25",
    priorYearRefundProof: { ...creditProof, borrowerInterestExcludingCredit: "0" } };
  expect(calculateVehicleSource({ ...creditLoan, interestPaid: "100.25", form1098Vli: creditOnlyStatement })
    .vehicleInterestDeduction.toFixed()).toBe("100");

  for (const changed of [
    { method: "mixed" }, { method: "cash_refund" }, { cashRefundReceived: "0.01" },
    { currentYearInterestCreditApplied: "100.24" }, { currentYearInterestCreditApplied: "100.251" },
    { currentYearInterestCreditIncludedInBox1Confirmed: false },
    { currentYearInterestCreditIncludedInBox1Confirmed: undefined },
    { borrowerInterestExcludingCredit: "800.29" }, { borrowerInterestExcludingCredit: undefined },
    { borrowerBoreRecoveredPaymentConfirmed: false }, { loanSourcesMatchConfirmed: false },
    { filedReturnHistoryCompleteConfirmed: false }, { otherDeductedInterest: "0.01" },
  ]) {
    const form1098Vli = { ...creditStatement, priorYearRefundProof: { ...creditProof, ...changed } };
    expect(() => resolveVehicleReturn(vehicleReturnInput({ ...creditLoan, form1098Vli })), JSON.stringify(changed)).toThrow();
  }
  for (const change of [
    { directThirdPartyInterest: "0.01", reportedInterest: "900.56" },
    { reimbursedBorrowerInterest: "0.01", reportedInterest: "900.56" },
    { reportedInterest: "800.30" }, { priorYearInterestRefund: "0.00" },
  ]) {
    expect(() => resolveVehicleReturn(vehicleReturnInput({ ...creditLoan,
      form1098Vli: { ...creditStatement, ...change } })), JSON.stringify(change)).toThrow(/box 1|box 5/i);
  }
});
