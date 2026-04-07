import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculatePA40, type PA40Input } from "@/engine/state/pa-40.js";
import { calculatePAScheduleA } from "@/engine/state/pa-schedule-a.js";
import { calculatePAScheduleB } from "@/engine/state/pa-schedule-b.js";
import { calculatePAScheduleC } from "@/engine/state/pa-schedule-c.js";
import { calculatePAScheduleD } from "@/engine/state/pa-schedule-d.js";
import { calculatePAScheduleF } from "@/engine/state/pa-schedule-f.js";
import { calculateScheduleJ } from "@/engine/state/pa-schedule-j.js";
import { calculatePAScheduleRK1 } from "@/engine/state/pa-schedule-rk1.js";
import { calculatePAScheduleO } from "@/engine/state/pa-schedule-o.js";
import { calculateScheduleDC } from "@/engine/state/pa-schedule-dc.js";
import { calculateScheduleUE } from "@/engine/state/pa-schedule-ue.js";
import { calculateScheduleSP } from "@/engine/state/pa-schedule-sp.js";
import { calculatePAUseTax } from "@/engine/state/pa-use-tax.js";
import { calculatePALocalEIT } from "@/engine/state/pa-local-eit.js";
import { calculateREV1630 } from "@/engine/state/pa-rev-1630.js";
import { calculatePAWorkingPennsylvaniansTaxCredit } from "@/engine/state/pa-working-pennsylvanians-tax-credit.js";

const d = (value: number | string) => new Decimal(value);

function makePA40Input(overrides: Partial<PA40Input> = {}): PA40Input {
  return {
    taxYear: 2026,
    compensation: d(0),
    unreimbursedExpenses: d(0),
    interest: d(0),
    dividends: d(0),
    netBusinessIncome: d(0),
    netGainOrLoss: d(0),
    netRentalIncome: d(0),
    estateTrustIncome: d(0),
    gamblingIncome: d(0),
    otherDeductions: d(0),
    taxForgivenessEligibilityIncome: d(0),
    useTax: d(0),
    stateWithholding: d(0),
    creditFromPriorYear: d(0),
    extensionPayment: d(0),
    estimatedPayments: d(0),
    nonresidentTaxWithheld: d(0),
    refundableCredits: d(0),
    taxForgivenessCredit: d(0),
    residentCredit: d(0),
    otherCredits: d(0),
    underpaymentPenalty: d(0),
    lateFilingOrPaymentPenalty: d(0),
    latePaymentInterest: d(0),
    ...overrides,
  };
}

describe("PA 2026 tax year support", () => {
  it("PA-40 supports tax year 2026 at 3.07% rate", () => {
    const result = calculatePA40(makePA40Input({ compensation: d(100000) }));
    expect(result.taxLiability.toNumber()).toBe(3070);
  });

  it("PA Schedule A through Schedule F support tax year 2026", () => {
    expect(calculatePAScheduleA({ taxYear: 2026 }).line16.toNumber()).toBe(0);
    expect(calculatePAScheduleB({ taxYear: 2026 }).line12.toNumber()).toBe(0);
    expect(calculatePAScheduleC({ taxYear: 2026 }).line39.toNumber()).toBe(0);
    expect(calculatePAScheduleD({ taxYear: 2026 }).reportableNetGainOrLoss.toNumber()).toBe(0);
    expect(calculatePAScheduleF({ taxYear: 2026 }).line39.toNumber()).toBe(0);
  });

  it("PA Schedule J, RK-1, O, DC, UE, SP, and WPTC support tax year 2026", () => {
    expect(calculateScheduleJ({ taxYear: 2026 }).totalEstateTrustIncome.toNumber()).toBe(0);
    expect(calculatePAScheduleRK1({ taxYear: 2026 }).totalBusinessIncome.toNumber()).toBe(0);
    expect(calculatePAScheduleO({
      taxYear: 2026,
      taxpayerPATaxableIncome: d(0),
      spousePATaxableIncome: d(0),
    }).totalOtherDeductions.toNumber()).toBe(0);
    expect(calculateScheduleDC({ taxYear: 2026, qualifyingPersons: 1, paTaxableIncome: d(0), federalCredit: d(0) }).credit.toNumber()).toBe(0);
    expect(calculateScheduleUE({ taxYear: 2026 }).netUnreimbursedExpenses.toNumber()).toBe(0);
    expect(calculateScheduleSP({
      taxYear: 2026,
      filingCategory: "unmarried",
      dependents: 0,
      paTaxableIncome: d(0),
      nontaxableIncome: d(0),
      taxLiability: d(0),
      taxPaidToOtherStates: d(0),
    }).taxForgivenessCredit.toNumber()).toBe(0);
    expect(calculatePAWorkingPennsylvaniansTaxCredit({
      taxYear: 2026,
      paEarnedIncome: d(0),
      federalEarnedIncomeCredit: d(0),
    }).credit.toNumber()).toBe(0);
  });

  it("PA Use Tax, Local EIT, and REV-1630 support tax year 2026", () => {
    expect(calculatePAUseTax({
      taxYear: 2026,
      paTaxableIncome: d(0),
      locality: "remainder_of_pa",
      taxableItemPurchases: d(0),
      taxableServicePurchases: d(0),
      electEstimatedTable: false,
      salesTaxAlreadyPaid: d(0),
    }).totalUseTaxLiability.toNumber()).toBe(0);

    expect(calculatePALocalEIT({
      taxYear: 2026,
      municipality: "PITTSBURGH",
      compensation: d(0),
      netSelfEmploymentIncome: d(0),
      localEITRate: d("0.01"),
      nonresidentCredits: [],
      localWithholding: d(0),
    }).netLocalTax.toNumber()).toBe(0);

    expect(calculateREV1630({
      taxYear: 2026,
      taxLiability: d(0),
      withholdingAndCredits: d(0),
      quarterlyEstimatedPayments: [d(0), d(0), d(0), d(0)],
    }).totalInterest.toNumber()).toBe(0);
  });
});
