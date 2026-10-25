/**
 * Form 1099-OID — Original Issue Discount
 * Spec: spec/federal/form-1099-oid.yaml
 *
 * Tests verify that OID interest flows through Schedule B to Form 1040 Line 2b,
 * acquisition premium offsets reduce taxable OID, bond premium offsets reduce
 * stated interest, early withdrawal penalties route to Schedule 1 Line 18,
 * tax-exempt OID routes to Line 2a, and federal withholding aggregates correctly.
 */

import { describe, test, expect } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleB } from "@/engine/schedules/schedule-b.js";
import type { TaxYearInput, Form1099OID } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import Decimal from "decimal.js";

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function makeInput(overrides: Partial<TaxYearInput> = {}): TaxYearInput {
  return {
    ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000", federalWithheld: "7500" }],
    ...overrides,
  };
}

function findLine(result: ReturnType<typeof calculateFederalTax>, form: string, line: string) {
  return result.allLines.find((l) => l.form === form && l.line === line);
}

function makeOID(payer: string, overrides: Partial<Form1099OID> = {}): Form1099OID {
  return {
    payer,
    originalIssueDiscount: "0",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// Schedule B integration: OID flows to interest income
// ═══════════════════════════════════════════════════════

describe("Form 1099-OID Schedule B integration", () => {
  test("Box 1 OID flows to Schedule B Part I as interest income", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Treasury Direct", { originalIssueDiscount: "1200" })],
    }));

    const line2b = findLine(result, "1040", "2b");
    expect(line2b).toBeDefined();
    expect(new Decimal(line2b!.value).toNumber()).toBe(1200);
  });

  test("Box 2 other periodic interest flows to Schedule B", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Corp Bond Fund", {
        originalIssueDiscount: "500",
        otherPeriodicInterest: "800",
      })],
    }));

    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(1300); // 500 OID + 800 coupon
  });

  test("multiple 1099-OID forms aggregate correctly", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [
        makeOID("T-Bill A", { originalIssueDiscount: "600" }),
        makeOID("CD Bank", { originalIssueDiscount: "300", otherPeriodicInterest: "200" }),
        makeOID("Zero Coupon", { originalIssueDiscount: "900" }),
      ],
    }));

    // Total interest = 600 + 300 + 200 + 900 = 2000
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(2000);
  });

  test("1099-OID interest aggregates with 1099-INT interest", () => {
    const result = calculateFederalTax(makeInput({
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "Bank", interestIncome: "1500" }],
      form1099OID: [makeOID("T-Bill", { originalIssueDiscount: "800" })],
    }));

    // Total: 1500 (INT) + 800 (OID) = 2300
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(2300);
  });

  test("OID interest increases AGI", () => {
    const baseline = calculateFederalTax(makeInput());
    const withOID = calculateFederalTax(makeInput({
      form1099OID: [makeOID("T-Bill", { originalIssueDiscount: "5000" })],
    }));

    expect(withOID.agi.toNumber()).toBe(baseline.agi.toNumber() + 5000);
  });

  test("Schedule B payer list includes OID sources", () => {
    const input = makeInput({
      form1099OID: [makeOID("Treasury STRIP", { originalIssueDiscount: "2000" })],
    });
    const schedB = calculateScheduleB(input);

    const oidPayer = schedB.interestPayers.find((p) => p.name.includes("Treasury STRIP"));
    expect(oidPayer).toBeDefined();
    expect(oidPayer!.amount.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════
// Acquisition premium (Box 6) reduces taxable OID
// ═══════════════════════════════════════════════════════

describe("Form 1099-OID acquisition premium offset", () => {
  test("acquisition premium reduces Box 1 OID", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Corp Bond", {
        originalIssueDiscount: "1000",
        acquisitionPremium: "400",
      })],
    }));

    // Net OID = 1000 - 400 = 600
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(600);
  });

  test("acquisition premium capped at OID amount (no negative)", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Corp Bond", {
        originalIssueDiscount: "500",
        acquisitionPremium: "800", // exceeds OID
      })],
    }));

    // Net OID = max(0, 500 - 800) = 0; no negative interest
    const baseline = calculateFederalTax(makeInput());
    expect(result.agi.toNumber()).toBe(baseline.agi.toNumber());
  });

  test("acquisition premium equals OID exactly → zero net OID", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Bond", {
        originalIssueDiscount: "1200",
        acquisitionPremium: "1200",
      })],
    }));

    const baseline = calculateFederalTax(makeInput());
    expect(result.agi.toNumber()).toBe(baseline.agi.toNumber());
  });

  test("acquisition premium does not affect other periodic interest (Box 2)", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Bond", {
        originalIssueDiscount: "500",
        acquisitionPremium: "500", // fully offsets OID
        otherPeriodicInterest: "1000", // unaffected
      })],
    }));

    // Net OID = 0, but Box 2 interest = 1000
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════
// Bond premium (Box 11) offsets stated interest
// ═══════════════════════════════════════════════════════

describe("Form 1099-OID bond premium offset", () => {
  test("bond premium reduces Box 2 stated interest", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Premium Bond", {
        otherPeriodicInterest: "2000",
        bondPremium: "600",
      })],
    }));

    // Net interest = 2000 - 600 = 1400
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(1400);
  });

  test("bond premium capped at stated interest (no negative)", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Deep Premium Bond", {
        otherPeriodicInterest: "500",
        bondPremium: "900",
      })],
    }));

    // Net interest = max(0, 500 - 900) = 0
    const baseline = calculateFederalTax(makeInput());
    expect(result.agi.toNumber()).toBe(baseline.agi.toNumber());
  });

  test("bond premium does not affect OID (Box 1)", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Mixed Bond", {
        originalIssueDiscount: "800",
        otherPeriodicInterest: "1200",
        bondPremium: "1200", // fully offsets Box 2 interest
      })],
    }));

    // OID = 800 (unaffected), Box 2 net = 0
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(800);
  });

  test("both acquisition premium and bond premium applied independently", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Complex Bond", {
        originalIssueDiscount: "1000",
        acquisitionPremium: "300",  // reduces OID
        otherPeriodicInterest: "1500",
        bondPremium: "500",         // reduces stated interest
      })],
    }));

    // Net OID = 1000 - 300 = 700
    // Net stated = 1500 - 500 = 1000
    // Total = 700 + 1000 = 1700
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(1700);
  });
});

// ═══════════════════════════════════════════════════════
// Early withdrawal penalty (Box 3) → Schedule 1 Line 18
// ═══════════════════════════════════════════════════════

describe("Form 1099-OID early withdrawal penalty", () => {
  test("Box 3 early withdrawal penalty flows to Schedule 1 Line 18", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("CD at Bank", {
        originalIssueDiscount: "300",
        earlyWithdrawalPenalty: "75",
      })],
    }));

    const line18 = findLine(result, "Sched 1", "18");
    expect(line18).toBeDefined();
    expect(new Decimal(line18!.value).toNumber()).toBe(75);
  });

  test("1099-OID penalty aggregates with 1099-INT penalty", () => {
    const result = calculateFederalTax(makeInput({
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "Bank A", interestIncome: "1000", earlyWithdrawalPenalty: "50" }],
      form1099OID: [makeOID("CD Bank B", {
        originalIssueDiscount: "200",
        earlyWithdrawalPenalty: "30",
      })],
    }));

    const line18 = findLine(result, "Sched 1", "18");
    expect(new Decimal(line18!.value).toNumber()).toBe(80); // 50 + 30
  });

  test("penalty reduces AGI as above-the-line deduction", () => {
    const withPenalty = calculateFederalTax(makeInput({
      form1099OID: [makeOID("CD", {
        originalIssueDiscount: "1000",
        earlyWithdrawalPenalty: "200",
      })],
    }));
    const withoutPenalty = calculateFederalTax(makeInput({
      form1099OID: [makeOID("CD", { originalIssueDiscount: "1000" })],
    }));

    expect(withPenalty.agi.toNumber()).toBe(withoutPenalty.agi.toNumber() - 200);
  });
});

// ═══════════════════════════════════════════════════════
// Tax-exempt OID (Box 14) → Form 1040 Line 2a
// ═══════════════════════════════════════════════════════

describe("Form 1099-OID tax-exempt OID", () => {
  test("Box 14 tax-exempt OID flows to Form 1040 Line 2a", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Muni Bond Fund", { taxExemptOID: "2000" })],
    }));

    const line2a = findLine(result, "1040", "2a");
    expect(line2a).toBeDefined();
    expect(new Decimal(line2a!.value).toNumber()).toBe(2000);
  });

  test("tax-exempt bond premium (Box 13) reduces tax-exempt OID", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Premium Muni", {
        taxExemptOID: "1500",
        taxExemptBondPremium: "400",
      })],
    }));

    // Net tax-exempt OID = 1500 - 400 = 1100
    const line2a = findLine(result, "1040", "2a");
    expect(new Decimal(line2a!.value).toNumber()).toBe(1100);
  });

  test("tax-exempt bond premium cannot make tax-exempt OID negative", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Premium Muni", {
        taxExemptOID: "300",
        taxExemptBondPremium: "500", // exceeds OID
      })],
    }));

    const line2a = findLine(result, "1040", "2a");
    expect(new Decimal(line2a!.value).toNumber()).toBe(0);
  });

  test("tax-exempt OID aggregates with 1099-INT tax-exempt interest", () => {
    const result = calculateFederalTax(makeInput({
      form1099Int: [{ privateActivityBondInterest: "0", payer: "Muni Fund", interestIncome: "0", taxExemptInterest: "3000" }],
      form1099OID: [makeOID("Muni Bond", { taxExemptOID: "1000" })],
    }));

    // Total tax-exempt = 3000 + 1000 = 4000
    const line2a = findLine(result, "1040", "2a");
    expect(new Decimal(line2a!.value).toNumber()).toBe(4000);
  });

  test("tax-exempt OID does not affect taxable interest", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Muni Bond", { taxExemptOID: "2000" })],
    }));

    // No taxable interest — only tax-exempt
    const baseline = calculateFederalTax(makeInput());
    expect(result.agi.toNumber()).toBe(baseline.agi.toNumber());
  });
});

// ═══════════════════════════════════════════════════════
// Federal withholding (Box 4)
// ═══════════════════════════════════════════════════════

describe("Form 1099-OID federal withholding", () => {
  test("Box 4 backup withholding aggregates into total withholding", () => {
    const withWithholding = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Bond", {
        originalIssueDiscount: "5000",
        federalWithheld: "1200",
      })],
    }));
    const without = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Bond", { originalIssueDiscount: "5000" })],
    }));

    // Withholding reduces amount owed / increases refund
    expect(withWithholding.totalTax.toNumber()).toBe(without.totalTax.toNumber());
    // More withholding means larger refund or smaller amount owed
    const withNet = withWithholding.refund.minus(withWithholding.amountOwed);
    const withoutNet = without.refund.minus(without.amountOwed);
    expect(withNet.toNumber()).toBeGreaterThan(withoutNet.toNumber());
  });

  test("multiple 1099-OID withholding amounts aggregate", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [
        makeOID("Bond A", { originalIssueDiscount: "3000", federalWithheld: "720" }),
        makeOID("Bond B", { originalIssueDiscount: "2000", federalWithheld: "480" }),
      ],
    }));

    const line25d = findLine(result, "1040", "25d");
    expect(line25d).toBeDefined();
    // W-2 withholding (7500) + OID withholding (720 + 480) = 8700
    expect(new Decimal(line25d!.value).toNumber()).toBe(8700);
  });
});

// ═══════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════

describe("Form 1099-OID edge cases", () => {
  test("empty form1099OID array has no effect", () => {
    const baseline = calculateFederalTax(makeInput());
    const withEmpty = calculateFederalTax(makeInput({ form1099OID: [] }));

    expect(withEmpty.agi.toNumber()).toBe(baseline.agi.toNumber());
    expect(withEmpty.totalTax.toNumber()).toBe(baseline.totalTax.toNumber());
  });

  test("1099-OID with all zero amounts has no effect", () => {
    const baseline = calculateFederalTax(makeInput());
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Empty Bond", {
        originalIssueDiscount: "0",
        otherPeriodicInterest: "0",
        earlyWithdrawalPenalty: "0",
        taxExemptOID: "0",
      })],
    }));

    expect(result.agi.toNumber()).toBe(baseline.agi.toNumber());
  });

  test("zero-coupon bond: only OID, no stated interest", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Zero Coupon Corp", {
        originalIssueDiscount: "3500",
        // No Box 2 other periodic interest — zero-coupon
      })],
    }));

    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(3500);
  });

  test("Treasury STRIP: all return is OID, Box 8 equals Box 1", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Treasury STRIP", {
        originalIssueDiscount: "2500",
        treasuryOID: "2500", // informational for state returns
      })],
    }));

    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(2500);
  });

  test("very small OID amount (pennies) is handled correctly", () => {
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Small CD", { originalIssueDiscount: "0.47" })],
    }));

    // Should not crash; tiny amount flows through
    expect(result.agi.toNumber()).toBeGreaterThan(50000);
  });
});

// ═══════════════════════════════════════════════════════
// Realistic scenarios
// ═══════════════════════════════════════════════════════

describe("Form 1099-OID realistic scenarios", () => {
  test("investor with T-bills and savings account", () => {
    // Common scenario: investor has T-bills (all OID) plus bank savings interest
    const result = calculateFederalTax(makeInput({
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "Chase Savings", interestIncome: "1200" }],
      form1099OID: [
        makeOID("Treasury Direct — 26-week T-Bill", {
          originalIssueDiscount: "2400",
          treasuryOID: "2400",
        }),
        makeOID("Treasury Direct — 13-week T-Bill", {
          originalIssueDiscount: "1100",
          treasuryOID: "1100",
        }),
      ],
    }));

    // Total interest = 1200 (bank) + 2400 (26-wk) + 1100 (13-wk) = 4700
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(4700);
    expect(result.agi.toNumber()).toBe(54700);
  });

  test("corporate bond purchased at premium with OID", () => {
    // Bond purchased above par: bond premium offsets coupon interest
    // Also has small OID that's offset by acquisition premium
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("XYZ Corp 5% Bond", {
        originalIssueDiscount: "200",
        acquisitionPremium: "200",   // fully offsets OID
        otherPeriodicInterest: "2500", // 5% coupon on $50K face
        bondPremium: "350",          // premium amortization
      })],
    }));

    // Net OID = 200 - 200 = 0
    // Net stated = 2500 - 350 = 2150
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(2150);
  });

  test("muni bond with tax-exempt OID and taxable bank interest", () => {
    const result = calculateFederalTax(makeInput({
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "Bank", interestIncome: "800" }],
      form1099OID: [makeOID("City of Seattle GO Bond", {
        taxExemptOID: "1200",
      })],
    }));

    // Taxable interest = 800 (bank only)
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(800);

    // Tax-exempt = 1200
    const line2a = findLine(result, "1040", "2a");
    expect(new Decimal(line2a!.value).toNumber()).toBe(1200);
  });

  test("CD broken early: OID plus penalty deduction", () => {
    // 3-year CD broken after 18 months: OID accrued plus penalty
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Wells Fargo 3-Year CD", {
        originalIssueDiscount: "450",
        earlyWithdrawalPenalty: "90",
      })],
    }));

    // Interest income = 450
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(450);

    // Penalty deduction = 90
    const line18 = findLine(result, "Sched 1", "18");
    expect(new Decimal(line18!.value).toNumber()).toBe(90);

    // Net AGI increase = 450 - 90 = 360
    const baseline = calculateFederalTax(makeInput());
    expect(result.agi.toNumber()).toBe(baseline.agi.toNumber() + 360);
  });

  test("TIPS with inflation adjustment OID", () => {
    // TIPS generate OID from inflation adjustments
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("TIPS 2030 — Treasury Direct", {
        originalIssueDiscount: "1800", // inflation adjustment OID
        otherPeriodicInterest: "600",  // stated coupon
        treasuryOID: "1800",           // all OID is Treasury
      })],
    }));

    // Total = 1800 OID + 600 coupon = 2400
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(2400);
  });

  test("mixed portfolio: 1099-INT, 1099-OID, K-1 interest all aggregate", () => {
    const result = calculateFederalTax(makeInput({
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "Bank", interestIncome: "2000" }],
      form1099OID: [
        makeOID("T-Bill", { originalIssueDiscount: "1500" }),
        makeOID("Corp Bond", { originalIssueDiscount: "800", otherPeriodicInterest: "1200" }),
      ],
      scheduleK1: [{
        partnershipName: "Fund LP",
        partnershipEIN: "12-3456789",
        entityType: "partnership" as const,
        interestIncome: "500",
      }],
    }));

    // Total: 2000 (INT) + 1500 (OID) + 800 (OID) + 1200 (periodic) + 500 (K-1) = 6000
    const line2b = findLine(result, "1040", "2b");
    expect(new Decimal(line2b!.value).toNumber()).toBe(6000);
  });

  test("backup withholding on OID reduces balance owed", () => {
    // Taxpayer subject to backup withholding at 24% on OID
    const result = calculateFederalTax(makeInput({
      form1099OID: [makeOID("Noncompliant Bond", {
        originalIssueDiscount: "10000",
        federalWithheld: "2400", // 24% backup withholding
      })],
    }));

    // Verify withholding is captured
    const line25d = findLine(result, "1040", "25d");
    expect(new Decimal(line25d!.value).toNumber()).toBe(9900); // 7500 W-2 + 2400 OID
  });
});
