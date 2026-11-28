// Spec: spec/federal/schedule-e.yaml, 280A-2026-actual-residence-worksheet
import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/public-federal-return.js";
import { calculateScheduleE } from "@/engine/schedules/schedule-e.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

// Exercise the calculation boundary without enabling the public 2026 rule pack.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

function rentalInput(taxYear: 2025 | 2026, personalUseDays: number) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear },
    rentalProperties: [{ description: "Synthetic dwelling", accountHolder: "primary", allInvestmentAtRisk: true,
      sourceFactsConfirmed: true, personalUseDays, rentalDays: 90, rents: "2000", insurance: "1000" }],
  });
}

function verifiedRental() {
  const propertyAddress = "800 Example Avenue";
  const receipt = (sourceReference: string, category: string, use: string, amount: string) =>
    ({ sourceReference, propertyAddress, datePaid: "2026-08-20", category, use, amount });
  const allocation = {
    taxYear: 2026,
    propertyAddress,
    occupancySourceReference: "Synthetic complete dwelling calendar",
    rentSourceReference: "Synthetic reconciled annual rent ledger",
    expenseSourceReference: "Synthetic reconciled annual paid-bill ledger",
    confirmedCompleteOrdinaryUse: true,
    confirmedOrdinaryTenantRelationship: true,
    periods: [
      { sourceReference: "Tenant lease 1", use: "fair_rental", start: "2026-06-01", end: "2026-08-29" },
      { sourceReference: "Owner occupancy log 1", use: "personal", start: "2026-09-01", end: "2026-09-10" },
    ],
    rentReceipts: [
      { sourceReference: "Rent deposit 1", propertyAddress, leaseReference: "Tenant lease 1", datePaid: "2026-06-01", amount: "2000.00" },
      { sourceReference: "Rent deposit 2", propertyAddress, leaseReference: "Tenant lease 1", datePaid: "2026-07-01", amount: "500.27" },
    ],
    expenseReceipts: [
      receipt("Paid advertising 1", "advertising", "rental_only", "100.05"),
      receipt("Paid insurance 1", "insurance", "shared", "1000.10"),
      receipt("Paid utilities 1", "utilities", "shared", "100.20"),
      receipt("Private utilities 1", "utilities", "personal", "50.00"),
      receipt("Paid property tax 1", "taxes", "shared", "100.00"),
    ],
    depreciation: {
      propertyAddress, sourceReference: "Prior same-dwelling closed asset register", confirmedCompleteWithoutCurrentAssets: true,
      assets: [{ sourceReference: "Building prior basis and recovery record", kind: "building", placedInServiceDate: "1995-02-01",
        basisFullyRecoveredDate: "2023-01-31", depreciableBasis: "60000", priorAllowableDepreciation: "60000" }],
    },
  };
  const property = {
    description: propertyAddress, propertyType: "single_family", accountHolder: "primary", ownershipPercentage: "100",
    sourceFactsConfirmed: true, allInvestmentAtRisk: true, personalUseDays: 10, rentalDays: 90, rents: "2500.27",
    advertising: "100.05", insurance: "1000.10", utilities: "100.20", taxes: "100.00", depreciation: "0",
    autoTravel: "0", cleaning: "0", commissions: "0", legalProfessional: "0", managementFees: "0", mortgageInterest: "0",
    otherInterest: "0", repairs: "0", supplies: "0", otherExpenses: "0", rentalUseAllocationSources: allocation,
  };
  const raw = { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    deductionElection: "standard", rentalProperties: [property] };
  return { allocation, property, raw };
}

const evaluationDate = { asOfDate: "2026-10-01" };

function verifiedResidence() {
  const { raw, allocation, property } = verifiedRental();
  allocation.periods[0].end = "2026-08-19";
  allocation.periods[1].end = "2026-09-20";
  allocation.rentReceipts.splice(1);
  allocation.rentReceipts[0].amount = "1000.00";
  allocation.expenseReceipts.splice(2);
  allocation.expenseReceipts[0].amount = "100.00";
  allocation.expenseReceipts[1].amount = "1250.00";
  Object.assign(property, { rentalDays: 80, personalUseDays: 20, rents: "1000.00", advertising: "100.00",
    insurance: "1250.00", utilities: "0", taxes: "0" });
  const history = { priorYear: 2025, propertyAddress: allocation.propertyAddress, sourceReference: "Complete 2025 same-dwelling carryover records",
    confirmedCompletePriorYear: true, priorOperatingCarryover: "0.00", priorDepreciationAndCasualtyCarryover: "0",
    currentCasualtyAndTheftLoss: "0" };
  const residence = { ...allocation, residenceWorksheet: history };
  return { raw: { ...raw, rentalProperties: [{ ...property, rentalUseAllocationSources: residence }] }, residence, history };
}

describe("2026 Schedule E personal-use admission", () => {
  it("holds subthreshold personal use in the direct 2026 Schedule E", () => {
    // $1,000 shared insurance for 90 rental and 10 personal days has a $900
    // rental share. The canonical amounts cannot distinguish shared costs.
    expect(() => calculateScheduleE(rentalInput(2026, 10))).toThrow(/Schedule E.*personal use.*expense allocation.*280A/i);
  });

  it("holds subthreshold personal use in the whole 2026 federal calculation", () => {
    expect(() => calculateFederalTax(rentalInput(2026, 10))).toThrow(/Schedule E.*personal use.*expense allocation.*280A/i);
  });

  it("preserves ordinary 2026 and historical 2025 calculation behavior", () => {
    const ordinary = rentalInput(2026, 0);
    expect(calculateScheduleE(ordinary).rentalProperties[0].totalExpenses.toFixed(2)).toBe("1000.00");
    expect(calculateFederalTax(ordinary).scheduleE?.rentalProperties[0].netRentalIncome.toFixed(2)).toBe("1000.00");
    const legacy = rentalInput(2025, 10);
    expect(calculateScheduleE(legacy).rentalProperties[0].totalExpenses.toFixed(2)).toBe("1000.00");
    expect(calculateFederalTax(legacy).scheduleE?.rentalProperties[0].netRentalIncome.toFixed(2)).toBe("1000.00");
  });

  it("allocates verified 2026 rental-only and shared categories exactly", () => {
    const { raw } = verifiedRental();
    const input = TaxYearInputSchema.parse(raw);
    expect(() => calculateScheduleE(input)).toThrow(/trusted calculation as-of date/i);
    const row = calculateScheduleE(input, undefined, evaluationDate).rentalProperties[0];
    expect(row.totalExpenses.toFixed(2)).toBe("1180.32");
    expect(row.netRentalIncome.toFixed(2)).toBe("1319.95");
    expect(row.allocatedExpenses?.advertising?.toFixed(2)).toBe("100.05");
    expect(row.allocatedExpenses?.insurance?.toFixed(2)).toBe("900.09");
    expect(row.allocatedExpenses?.utilities?.toFixed(2)).toBe("90.18");
  });

  it("transfers one verified profitable 2026 dwelling through the whole federal calculation", () => {
    const { raw } = verifiedRental();
    const result = calculateFederalTax(TaxYearInputSchema.parse(raw));
    expect(result.scheduleE?.rentalProperties[0].netRentalIncome.toFixed(2)).toBe("1319.95");
    expect(result.otherIncome.toFixed()).toBe("1320");
    expect(result.form8582?.requiresForm8582).toBe(false);
  });

  it("limits verified residence insurance and transfers no passive activity", () => {
    const input = TaxYearInputSchema.parse(verifiedResidence().raw);
    const schedule = calculateScheduleE(input, undefined, evaluationDate);
    const direct = schedule.rentalProperties[0];
    expect(direct.allocatedExpenses?.advertising?.toFixed(2)).toBe("100.00");
    expect(direct.allocatedExpenses?.insurance?.toFixed(2)).toBe("900.00");
    expect(direct.totalExpenses.toFixed(2)).toBe("1000.00");
    expect(direct.netRentalIncome.toFixed(2)).toBe("0.00");
    expect(direct.isPassive).toBe(false);
    expect(direct.residenceWorksheet?.operatingCarryover.toFixed(2)).toBe("100.00");
    expect(direct.residenceWorksheet?.depreciationAndCasualtyCarryover.toFixed(2)).toBe("0.00");
    expect(schedule.lines.filter(line => line.form === "Pub 527 Worksheet 5-1").map(line => [line.line, line.value.toFixed(2)])).toEqual([
      ["2d", "100.00"], ["3", "900.00"], ["4a", "1000.00"], ["4f", "900.00"], ["7a", "100.00"], ["7b", "0.00"],
    ]);
    const federal = calculateFederalTax(input, evaluationDate);
    expect(federal.scheduleE?.rentalProperties[0]).toEqual(direct);
    expect(federal.deductionUsed).toBe("standard");
    expect(federal.otherIncome.toFixed()).toBe("0");
    expect(federal.form8582?.activityRows).toEqual([]);
    expect(federal.form8582?.requiresForm8582).toBe(false);
  });

  it("transfers a verified break-even residence with no carryover", () => {
    const { raw, residence } = verifiedResidence();
    raw.rentalProperties[0].insurance = "1125.00";
    residence.expenseReceipts[1].amount = "1125.00";
    const federal = calculateFederalTax(TaxYearInputSchema.parse(raw), evaluationDate);
    const entry = federal.scheduleE?.rentalProperties[0];
    expect(entry?.allocatedExpenses?.insurance?.toFixed(2)).toBe("900.00");
    expect(entry?.netRentalIncome.toFixed(2)).toBe("0.00");
    expect(entry?.residenceWorksheet?.operatingCarryover.toFixed(2)).toBe("0.00");
    expect(federal.scheduleE?.lines.some(line => line.form === "Pub 527 Worksheet 5-1")).toBe(false);
    expect(federal.form8582?.activityRows).toEqual([]);
  });

  it("holds residence worksheet cases outside verified advertising and insurance", () => {
    type Fixture = ReturnType<typeof verifiedResidence>;
    const cases: Array<[(fixture: Fixture) => void, RegExp]> = [
      [({ history }) => { history.propertyAddress = "Other dwelling"; }, /same dwelling/i],
      [({ history }) => { history.confirmedCompletePriorYear = false; }, /confirmed.*2025/i],
      [({ history }) => { history.priorOperatingCarryover = "0.01"; }, /zero prior/i],
      [({ history }) => { history.priorDepreciationAndCasualtyCarryover = "0.01"; }, /zero prior/i],
      [({ history }) => { history.currentCasualtyAndTheftLoss = "0.01"; }, /zero.*current casualty/i],
      [({ raw }) => { raw.deductionElection = "automatic"; }, /explicit standard deduction/i],
      [({ raw, residence }) => {
        raw.rentalProperties[0].utilities = "10";
        residence.expenseReceipts.push({ ...residence.expenseReceipts[1], sourceReference: "Additional utility bill", category: "utilities", amount: "10" });
      }, /only.*advertising and.*insurance/i],
      [({ raw, residence }) => { raw.rentalProperties[0].insurance = "1000"; residence.expenseReceipts[1].amount = "1000"; }, /positive residence income/i],
      [({ raw, residence }) => { raw.rentalProperties[0].advertising = "1100"; residence.expenseReceipts[0].amount = "1100"; }, /advertising.*cannot exceed rent/i],
      [({ residence }) => { residence.expenseReceipts[1].datePaid = "2026-10-02"; }, /as-of date/i],
    ];
    for (const [change, issue] of cases) {
      const fixture = verifiedResidence();
      change(fixture);
      expect(() => calculateScheduleE(TaxYearInputSchema.parse(fixture.raw), undefined, evaluationDate)).toThrow(issue);
    }
    const { raw } = verifiedResidence();
    raw.rentalProperties[0].rentalUseAllocationSources.expenseReceipts[1].datePaid = evaluationDate.asOfDate;
    expect(calculateFederalTax(TaxYearInputSchema.parse(raw), evaluationDate).scheduleE?.totalRentalIncome.toFixed(2)).toBe("0.00");
  });

  it("holds unobserved 2026 rental receipts and periods at the explicit return as-of date", () => {
    const asOfDate = "2026-10-01";
    const cases = [
      (source: ReturnType<typeof verifiedRental>["allocation"], date: string) => { source.rentReceipts[0].datePaid = date; },
      (source: ReturnType<typeof verifiedRental>["allocation"], date: string) => { source.expenseReceipts[1].datePaid = date; },
      (source: ReturnType<typeof verifiedRental>["allocation"], date: string) => {
        source.periods[1].start = date === asOfDate ? "2026-09-22" : "2026-09-23";
        source.periods[1].end = date;
      },
    ];
    for (const change of cases) {
      const { raw, allocation } = verifiedRental();
      change(allocation, "2026-10-02");
      expect(() => calculateFederalTax(TaxYearInputSchema.parse(raw), { asOfDate })).toThrow(/as-of date/i);
      change(allocation, asOfDate);
      expect(calculateFederalTax(TaxYearInputSchema.parse(raw), { asOfDate }).scheduleE?.rentalProperties[0].netRentalIncome.toFixed(2)).toBe("1319.95");
    }
  });

  it("holds contradicted and unsupported actual 2026 rental packets", () => {
    const rejected: Array<[(fixture: ReturnType<typeof verifiedRental>) => void, RegExp]> = [
      [({ allocation }) => { allocation.periods[1].start = "2026-08-25"; }, /nonoverlapping/],
      [({ allocation }) => { allocation.rentReceipts[0].amount = "1999.99"; }, /match gross rents/],
      [({ allocation }) => { allocation.rentReceipts[0].leaseReference = "Different lease"; }, /same tenant lease/],
      [({ allocation }) => { allocation.rentReceipts[1].sourceReference = "  rent deposit 1  "; }, /must be distinct/],
      [({ allocation }) => { allocation.confirmedOrdinaryTenantRelationship = false; }, /without significant tenant services/],
      [({ allocation, property }) => { allocation.periods[0].end = "2026-06-30"; property.rentalDays = 30; }, /more than 30 days/],
      [({ allocation }) => {
        allocation.periods[0].end = "2026-07-15";
        allocation.periods.push({ sourceReference: "Other lease", use: "fair_rental", start: "2026-07-16", end: "2026-08-29" });
      }, /one original tenant lease/],
      [({ allocation }) => { allocation.expenseReceipts[3].use = "shared"; }, /utilities receipts must match/],
      [({ allocation }) => { allocation.depreciation.assets[0].priorAllowableDepreciation = "59999"; }, /fully recovered before 2026/],
      [({ property }) => { property.insurance = "900.09"; }, /insurance receipts must match/],
      [({ raw }) => { raw.deductionElection = "itemized"; }, /requires an explicit standard deduction/],
      [({ property, allocation }) => { property.personalUseDays = 15; allocation.periods[1].end = "2026-09-15"; }, /nonresidence method/],
      [({ property, allocation }) => { property.rents = "100"; allocation.rentReceipts.forEach(receipt => { receipt.amount = "50"; }); }, /only a positive result/i],
      [({ raw, property }) => { raw.rentalProperties.push({ ...property, description: "Second home" }); }, /other activities/i],
    ];
    for (const [change, message] of rejected) {
      const fixture = verifiedRental();
      change(fixture);
      expect(() => calculateScheduleE(TaxYearInputSchema.parse(fixture.raw), undefined, evaluationDate)).toThrow(message);
    }
  });
});
