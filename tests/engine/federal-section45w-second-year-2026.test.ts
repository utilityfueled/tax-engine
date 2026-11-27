// Spec: spec/federal/schedule-c-section45w-second-year-2026.yaml
import { afterEach, expect, it, vi } from "vitest";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { parseInput } from "@/ingest/loader.js";
import { section45WSecondYearOriginals as workpaper } from "../fixtures/section45w-second-year.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

afterEach(() => vi.useRealTimers());

function actualReturn() {
  const { taxpayerReference, activityReference, assetReference, vin, placedInServiceDate } = workpaper.originalAsset;
  const primary = { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true };
  const sourceReference = "Fictional 2026 Schedule C source";
  const principalBusinessActivity = "Commercial cleaning";
  const businessCode = "561720";
  const grossReceipts = "166265.00";
  const expenses = { advertising: "125.25", officeExpense: "40.25", supplies: "19.50" };
  return {
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, primary, taxYear: 2026 },
    w2s: [],
    form2210: {
      calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false,
      waiverRequested: false, calculationMethod: "regular", withholdingMethod: "equal-installments",
      priorYearTaxStatus: "return-filed", priorYearFullYear: true, priorYearResidentAllYear: true,
      priorYearTaxForForm2210: "3000", priorYearAgiForForm2210: "55000", priorYearTaxComputationConfirmed: true,
    },
    scheduleC: {
      accountHolder: "primary", accountingMethod: "cash", allInvestmentAtRisk: true, qbiMateriallyParticipated: true,
      grossReceipts, expenses, principalBusinessActivity, businessCode,
      sourceFacts: {
        sourceTaxYear: 2026, sourceFactsConfirmed: true, sourceReference,
        accountHolder: "primary", ownerName: `${primary.firstName} ${primary.lastName}`,
        businessNameStatus: "blank_original", businessEINStatus: "not_issued",
        address: { method: "home_at_return_address", homeAtReturnAddressConfirmed: true, homeReturnAddress: simpleW2Fixture.taxpayer.address },
        section45WSecondYear: {
          workpaper,
          owner: { firstName: primary.firstName, lastName: primary.lastName, tin: primary.ssn, taxpayerReference,
            originalRecordReference: "Fictional primary holder original", identityComparedToVehicleAndTaxReturnConfirmed: true },
          ledger: { originalRecordReference: "Fictional 2026 cash ledger", activityReference, businessName: null, businessEin: null,
            grossReceipts, expenses, completeAndReconciledConfirmed: true, excludesVehicleCostsAndOtherActivitiesConfirmed: true },
          activity: { taxpayerReference, activityReference, originalRecordReference: sourceReference,
            principalBusinessActivity, businessCode, currentAssetRecordReference: workpaper.currentAsset.sourceReference,
            originalComparedAndConfirmed: true },
          participation: { taxpayerReference, activityReference, sourceReference: "Fictional actual 2026 work log",
            fromDate: "2026-01-01", throughDate: "2026-12-31", actualHours: "654.25", originalComparedAndConfirmed: true },
          amt: { taxpayerReference, activityReference, assetReference, vin, placedInServiceDate, sourceReference: "Fictional actual original AMT worksheet",
            priorAssetRecordReference: workpaper.priorDepreciation.sourceReference, currentAssetRecordReference: workpaper.currentAsset.sourceReference,
            priorTableBasis: "19000", priorAllowedDepreciation: "3800", priorAllowableDepreciation: "3800", currentOpeningBasis: "15200",
            originalQualifiedSection168PropertyConfirmed: true, originalAndCurrentAmtRecordsComparedConfirmed: true },
        },
      },
    },
  };
}

function observe(year: number, month: number, day: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(year, month - 1, day, 12));
}

it("uses the retained vehicle once after the actual closed year", () => {
  observe(2027, 1, 1);
  const original = parseInput(JSON.parse(JSON.stringify(actualReturn())));
  const result = calculateFederalTax(original);
  expect(result.scheduleC?.depreciationAndSection179Deduction.toFixed()).toBe("6080");
  expect(result.scheduleC?.netProfit.toFixed()).toBe("160000");
  expect(result.selfEmploymentTax.toFixed()).toBe("22607");
  expect(result.agi.toFixed()).toBe("148696");
  expect(result.form8995?.qbiDeduction.toFixed()).toBe("26519");
  expect(result.taxableIncome.toFixed()).toBe("106077");
  expect(result.form6251?.tentativeMinimumTax.toFixed()).toBe("8340");
  expect(result.totalTax.toFixed()).toBe("40663");
  expect(result.form3800).toBeUndefined();
  expect(JSON.stringify(result.scheduleC?.lines)).not.toMatch(/Fictional|1HGCM82633A004352/u);
});

it("holds unreconciled annual AMT, taxable activity and duplicate claim sources", () => {
  observe(2027, 1, 1);
  const make = (change: (original: ReturnType<typeof actualReturn>) => unknown) => {
    const original = actualReturn();
    return parseInput(JSON.parse(JSON.stringify(change(original))));
  };
  const differentCash = make(original => ({
    ...original, scheduleC: { ...original.scheduleC, grossReceipts: "166264.99" },
  }));
  expect(() => calculateFederalTax(differentCash)).toThrow(/match the actual Schedule C receipts/u);
  const wrongPacket = (change: (packet: ReturnType<typeof actualReturn>["scheduleC"]["sourceFacts"]["section45WSecondYear"]) => void) =>
    make(original => {
      change(original.scheduleC.sourceFacts.section45WSecondYear);
      return original;
    });
  const priorAmt = wrongPacket(packet => { packet.amt.priorAllowedDepreciation = "3799.99"; });
  expect(() => calculateFederalTax(priorAmt)).toThrow(/AMT basis and depreciation/u);
  const otherDeduction = make(original => ({
    ...original, scheduleC: { ...original.scheduleC, expenses: { ...original.scheduleC.expenses, depreciation: "1" } },
  }));
  expect(() => calculateFederalTax(otherDeduction)).toThrow(/competing deductions/u);
  const currentCredit = make(original => ({
    ...original, form8936: { newCleanVehicles: [], previouslyOwnedCleanVehicles: [] },
  }));
  expect(() => calculateFederalTax(currentCredit)).toThrow(/competing vehicle credit/u);
  const unassignedBusinessCredit = make(original => ({ ...original, form3800: { currentYearCredits: "6000" } }));
  expect(() => calculateFederalTax(unassignedBusinessCredit)).toThrow(/competing vehicle credit/u);
  const staleAmt = wrongPacket(packet => { packet.amt.vin = "1HGCM82633A004353"; });
  expect(() => calculateFederalTax(staleAmt)).toThrow(/AMT basis and depreciation/u);
  const foreignAsset = wrongPacket(packet => { packet.activity.currentAssetRecordReference = "A different asset"; });
  expect(() => calculateFederalTax(foreignAsset)).toThrow(/match the retained asset/u);
  const insufficientHours = wrongPacket(packet => { packet.participation.actualHours = "500.00"; });
  expect(() => calculateFederalTax(insufficientHours)).toThrow(/owner participation record/u);
  const contradictoryPriorReturn = make(original => ({ ...original, form2210: { ...original.form2210, priorYearJointReturn: true } }));
  expect(() => calculateFederalTax(contradictoryPriorReturn)).toThrow(/recorded calendar-year return status/u);
  const annualized = make(original => ({ ...original, form2210: { ...original.form2210, calculationMethod: "annualized" } }));
  expect(() => calculateFederalTax(annualized)).toThrow(/staged tax-base computations/u);
});

it("uses the runtime clock and does not treat draft facts as an observation", () => {
  observe(2026, 12, 31);
  const input = parseInput(JSON.parse(JSON.stringify(actualReturn())));
  expect(() => calculateFederalTax(input)).toThrow(/completed 2026 calendar year/u);
  expect(() => calculateFederalTax(input, { asOfDate: "2027-01-01" })).toThrow(/on or before today/u);
  expect(() => calculateScheduleC(input, input.scheduleC)).toThrow(/valid calculation as-of date/u);
  expect(() => calculateScheduleC(input, input.scheduleC, { section45WSecondYearAsOfDate: "2027-01-01" })).toThrow(/on or before today/u);
  observe(2027, 1, 1);
  expect(() => calculateFederalTax(input, { asOfDate: "2026-12-31" })).toThrow(/completed 2026 calendar year/u);
  expect(calculateFederalTax(input, { asOfDate: "2027-01-01" }).scheduleC?.depreciationAndSection179Deduction.toFixed()).toBe("6080");
});

it("holds the retained expense when ordinary Form 8995 cannot handle the current trade", () => {
  observe(2027, 1, 1);
  const source = actualReturn();
  source.scheduleC.grossReceipts = "276265.00";
  source.scheduleC.sourceFacts.section45WSecondYear.ledger.grossReceipts = "276265.00";
  const input = parseInput(JSON.parse(JSON.stringify(source)));
  expect(() => calculateFederalTax(input)).toThrow(/separately reconciled Section 199A/u);
});

it("holds an unrelated QBI source even when the vehicle trade breaks even", () => {
  observe(2027, 1, 1);
  const source = actualReturn();
  source.scheduleC.grossReceipts = "6265";
  source.scheduleC.sourceFacts.section45WSecondYear.ledger.grossReceipts = "6265";
  const isolated = calculateFederalTax(parseInput(JSON.parse(JSON.stringify(source))));
  expect(isolated.scheduleC?.netProfit.toFixed()).toBe("0");
  expect(isolated.scheduleC?.depreciationAndSection179Deduction.toFixed()).toBe("6080");
  const mixed = {
    ...source, scheduleK1: [{ taxYear: 2026, partnershipName: "Fictional K-1", partnershipEIN: "12-3456789",
      accountHolder: "primary", ordinaryIncome: "40000", section199AQBI: "40000", entityType: "s_corporation",
      qbiMateriallyParticipated: true }],
  };
  expect(() => calculateFederalTax(parseInput(JSON.parse(JSON.stringify(mixed))))).toThrow(/separately reconciled Section 199A/u);
});
