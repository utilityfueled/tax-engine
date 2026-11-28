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
