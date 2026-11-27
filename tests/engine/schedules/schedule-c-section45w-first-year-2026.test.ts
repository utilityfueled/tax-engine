// Spec: spec/federal/schedule-c-section45w-first-year-2026.yaml
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { parseInput } from "@/ingest/loader.js";
import { section45WDepreciationOriginals } from "../../fixtures/section45w-first-year.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

// The provisional rule pack is used only to verify the separate downstream Form 3800 hold.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

function originalReturn() {
  const workpaper = section45WDepreciationOriginals();
  const primary = simpleW2Fixture.taxpayer.primary;
  const expenses = { advertising: "125.25", officeExpense: "40.25", supplies: "19.50" };
  return {
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    w2s: [],
    form8936: { commercialCleanVehicles: [workpaper.basis.vehicle] },
    scheduleC: {
      accountHolder: "primary", accountingMethod: "cash", allInvestmentAtRisk: true, qbiMateriallyParticipated: true,
      grossReceipts: "44500.25", expenses,
      principalBusinessActivity: workpaper.basis.activity.principalBusinessActivity,
      businessCode: workpaper.basis.activity.businessCode,
      sourceFacts: {
        accountHolder: "primary", sourceTaxYear: 2026, sourceFactsConfirmed: true,
        sourceReference: workpaper.basis.activity.originalRecordReference, ownerName: `${primary.firstName} ${primary.lastName}`,
        businessNameStatus: "blank_original", businessEINStatus: "not_issued",
        address: { method: "home_at_return_address", homeAtReturnAddressConfirmed: true, homeReturnAddress: simpleW2Fixture.taxpayer.address },
        section45WFirstYear: {
          workpaper,
          owner: { firstName: primary.firstName, lastName: primary.lastName, tin: primary.ssn,
            taxpayerReference: workpaper.basis.activity.taxpayerReference, originalRecordReference: "Actual primary owner record",
            identityComparedToVehicleAndTaxReturnConfirmed: true },
          ledger: { originalRecordReference: "Actual annual cash ledger", activityReference: workpaper.basis.activity.activityReference,
            businessName: null, businessEin: null,
            grossReceipts: "44500.25", expenses, completeAndReconciledConfirmed: true, excludesVehicleCostsAndOtherActivitiesConfirmed: true },
        },
      },
    },
  };
}

it("attributes verified Section 45W depreciation once through canonical Schedule C", () => {
  const input = parseInput(JSON.parse(JSON.stringify(originalReturn())));
  const calculated = calculateScheduleC(input, input.scheduleC);
  expect(calculated.depreciationAndSection179Deduction.toFixed()).toBe("19000");
  expect(calculated.totalExpenses.toFixed()).toBe("19185");
  expect(calculated.netProfit.toFixed()).toBe("25315.25");
  expect(calculateScheduleC(input).netProfit.toFixed()).toBe("25315.25");
  expect(calculated.lines.filter(line => line.form === "Sched C" && line.line === "13").map(line => line.value.toFixed())).toEqual(["19000"]);
  expect(calculated.lines.filter(line => line.form === "Form 4562" && line.line === "28").map(line => line.value.toFixed())).toEqual(["19000"]);
  expect(JSON.stringify(calculated)).not.toMatch(/1HGCM82633A004352|Actual primary owner record|Actual annual cash ledger|123-45-6789/u);
  expect(() => calculateFederalTax(input)).toThrow(/Business clean-vehicle credit requires supported Form 3800 attribution/u);
});

it("holds conflicting or incomplete Section 45W Schedule C evidence", () => {
  const original = originalReturn();
  const business = original.scheduleC;
  const proof = business.sourceFacts;
  const source = proof.section45WFirstYear;
  const withSource = (section45WFirstYear: unknown) => ({ ...business, sourceFacts: { ...proof, section45WFirstYear } });
  const changedIdentity = /actual taxpayer and Schedule C trade/u;
  const duplicate = /without competing deductions or activities/u;
  const staleLedger = /match the actual Schedule C receipts and operating expenses/u;
  const errors = [
    [{ taxpayer: { ...original.taxpayer, primary: { ...original.taxpayer.primary, ssn: "123-45-6788" } } }, changedIdentity],
    [{ taxpayer: { ...original.taxpayer, taxYear: 2025 } }, /actual primary Schedule C activity/u],
    [{ scheduleC: { ...business, businessCode: "541219" } }, changedIdentity],
    [{ scheduleC: { ...business, businessName: "Another trade", sourceFacts: { ...proof, businessNameStatus: "reported", businessName: "Another trade" } } }, changedIdentity],
    [{ scheduleC: { ...business, ein: "99-9999999", sourceFacts: { ...proof, businessEINStatus: "reported", businessEIN: "99-9999999" } } }, changedIdentity],
    [{ scheduleC: { ...business, sourceFacts: { ...proof, sourceReference: "Another Schedule C original" } } }, changedIdentity],
    [{ scheduleC: { ...business, grossReceipts: "44500.26" } }, staleLedger],
    [{ scheduleC: { ...business, expenses: { ...business.expenses, officeExpense: "40.26" } } }, staleLedger],
    [{ scheduleC: { ...business, expenses: { ...business.expenses, depreciation: "1.00" } } }, duplicate],
    [{ scheduleC: { ...business, expenses: { ...business.expenses, carAndTruck: "1.00" } } }, duplicate],
    [{ scheduleC: { ...business, w2WagesPaid: "1000.00" } }, duplicate],
    [{ scheduleC: withSource({ ...source, ledger: { ...source.ledger, activityReference: "Another actual business" } }) }, changedIdentity],
    [{ scheduleC: withSource({ ...source, workpaper: { ...source.workpaper, depreciation: {} } }) }, /original 2026 §45W depreciation evidence/iu],
    [{ form1099Nec: [{ payer: "Separate payer", taxYear: 2026, nonemployeeCompensation: "325" }] }, duplicate],
    [{ form4562: { taxYear: 2026 } }, duplicate],
    [{ form8936: { commercialCleanVehicles: [{ ...source.workpaper.basis.vehicle, paymentReference: "Other receipt" }] } }, /match the single prepared commercial vehicle/u],
    [{ form8936: undefined }, /one matching original commercial vehicle claim/u],
  ] as const;
  for (const [changed, message] of errors) {
    expect(() => {
      const input = parseInput(JSON.parse(JSON.stringify({ ...original, ...changed })));
      calculateScheduleC(input, input.scheduleC);
    }).toThrow(message);
  }
  const input = parseInput(original);
  expect(() => calculateScheduleC(input, {})).toThrow(/actual primary Schedule C activity/u);
});

it("identifies the original Section 45W cash ledger in the gross receipts audit", () => {
  const input = parseInput(originalReturn());
  const line = calculateScheduleC(input).lines.find(row => row.form === "Sched C" && row.line === "1");
  expect(line?.formula).toMatch(/verified cash receipts ledger/iu);
});
