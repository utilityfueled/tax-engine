/**
 * Tests for Schedule 3 — Additional Credits and Payments
 * Spec: spec/federal/schedule-3.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateSchedule3, calculateExcessSSWithholding } from "@/engine/schedules/schedule-3.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Part I: Nonrefundable Credits
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Part I - Nonrefundable Credits", () => {
  it("Schedule 3 Line 1 - foreign tax credit", () => {
    const result = calculateSchedule3(simpleW2Fixture, { foreignTaxCredit: d(250) });
    expect(result.foreignTaxCredit.toNumber()).toBe(250);
  });

  it("Schedule 3 Line 2 - dependent care credit", () => {
    const result = calculateSchedule3(simpleW2Fixture, { childDependentCareCredit: d(1200) });
    expect(result.childDependentCareCredit.toNumber()).toBe(1200);
  });

  it("Schedule 3 Line 3 - education credits", () => {
    const result = calculateSchedule3(simpleW2Fixture, { educationCredits: d(2500) });
    expect(result.educationCredits.toNumber()).toBe(2500);
  });

  it("Schedule 3 Line 5a - clean energy credit", () => {
    const result = calculateSchedule3(simpleW2Fixture, { residentialCleanEnergyCredit: d(8000) });
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(8000);
  });

  it("Schedule 3 Line 5b - energy improvement credit", () => {
    const result = calculateSchedule3(simpleW2Fixture, { energyImprovementCredit: d(3200) });
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
  });

  it("Schedule 3 Line 8 - total nonrefundable", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(150),
      educationCredits: d(2000),
      residentialCleanEnergyCredit: d(5000),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(7150);
  });

  it("Schedule 3 - zero credits when nothing provided", () => {
    const result = calculateSchedule3(simpleW2Fixture);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: Refundable Credits
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Part II - Refundable Credits", () => {
  it("Schedule 3 Line 9 - premium tax credit", () => {
    const result = calculateSchedule3(simpleW2Fixture, { netPremiumTaxCredit: d(3600) });
    expect(result.netPremiumTaxCredit.toNumber()).toBe(3600);
  });

  it("Schedule 3 Line 11 - excess SS withholding", () => {
    const result = calculateSchedule3(simpleW2Fixture, { excessSocialSecurityWithholding: d(1500) });
    expect(result.excessSSWithholding.toNumber()).toBe(1500);
  });

  it("Schedule 3 Line 15 - total refundable", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      netPremiumTaxCredit: d(2000),
      excessSocialSecurityWithholding: d(800),
    });
    expect(result.totalRefundableCredits.toNumber()).toBe(2800);
  });
});

// ═══════════════════════════════════════════════════════════
// Excess Social Security Withholding Calculation
// ═══════════════════════════════════════════════════════════

describe("Excess SS Withholding", () => {
  it("computes excess separately per owner and excludes employer overcollection", () => {
    const base = simpleW2Fixture.w2s[0];
    const w2 = (owner: "primary"|"spouse", ein: string, withheld: string) => ({ ...base, accountHolder: owner, employer: { name: "Synthetic", ein }, socialSecurityWithheld: withheld });
    const opts = { taxYear: 2026, filingStatus: "married_filing_jointly" as const };
    const cap = d("184500"), rate = d("0.062");
    expect(calculateExcessSSWithholding([w2("primary","11-1111111","11439"),w2("spouse","11-1111111","11439")],cap,rate,opts).toString()).toBe("0");
    expect(calculateExcessSSWithholding([w2("primary","11-1111111","12500")],cap,rate,opts).toString()).toBe("0");
    expect(calculateExcessSSWithholding([w2("primary","11-1111111","12500"),w2("primary","22-2222222","1000")],cap,rate,opts).toString()).toBe("1000");
    expect(calculateExcessSSWithholding([w2("primary","11-1111111","8000"),w2("primary","111111111","6000")],cap,rate,opts).toString()).toBe("0");
    expect(calculateExcessSSWithholding([w2("primary","11-1111111","8000"),w2("primary","22-2222222","6000"),w2("spouse","11-1111111","8000"),w2("spouse","22-2222222","6000")],cap,rate,opts).toString()).toBe("5122");
  });
  it("requires actual2026 owner and employer facts for excess withholding", () => {
    const cap = d("184500"), rate = d("0.062"), opts = { taxYear: 2026, filingStatus: "married_filing_jointly" as const };
    expect(() => calculateExcessSSWithholding([simpleW2Fixture.w2s[0]],cap,rate,opts)).toThrow(/owner.*unknown/i);
    expect(() => calculateExcessSSWithholding([{...simpleW2Fixture.w2s[0],accountHolder:"primary",employer:{name:"",ein:""}}],cap,rate,opts)).toThrow(/employer.*identity/i);
    expect(() => calculateExcessSSWithholding([{...simpleW2Fixture.w2s[0],accountHolder:"primary",socialSecurityWithheld:"-1"}],cap,rate,opts)).toThrow(/withholding.*nonnegative/i);
  });
  it("no excess with single employer", () => {
    const excess = calculateExcessSSWithholding(
      [{ employer: { name: "Corp", ein: "12-3" }, wages: "100000", federalWithheld: "0",
        socialSecurityWages: "100000", socialSecurityWithheld: "6200",
        medicareWages: "100000", medicareWithheld: "1450",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" }],
      d(176100),
      d(0.062)
    );
    expect(excess.toNumber()).toBe(0);
  });

  it("excess when multiple employers over-withhold", () => {
    // Two employers each withholding on $100K wages
    // Max = $176,100 × 6.2% = $10,918.20
    // Employer 1: $100K × 6.2% = $6,200
    // Employer 2: $100K × 6.2% = $6,200
    // Total: $12,400. Excess: $12,400 - $10,918.20 = $1,481.80
    const w2s = [
      { employer: { name: "Corp A", ein: "11-1" }, wages: "100000", federalWithheld: "0",
        socialSecurityWages: "100000", socialSecurityWithheld: "6200",
        medicareWages: "100000", medicareWithheld: "1450",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
      { employer: { name: "Corp B", ein: "22-2" }, wages: "100000", federalWithheld: "0",
        socialSecurityWages: "100000", socialSecurityWithheld: "6200",
        medicareWages: "100000", medicareWithheld: "1450",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBeGreaterThan(0);
    // $12,400 - $10,918.20 = $1,481.80
    expect(excess.toNumber()).toBe(1481.8);
  });

  it("no excess when under limit", () => {
    const w2s = [
      { employer: { name: "Corp", ein: "11-1" }, wages: "50000", federalWithheld: "0",
        socialSecurityWages: "50000", socialSecurityWithheld: "3100",
        medicareWages: "50000", medicareWithheld: "725",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(100),
      retirementSavingsCredit: d(250),
      netPremiumTaxCredit: d(500),
    });
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1");
    expect(lineIds).toContain("2");
    expect(lineIds).toContain("3");
    expect(lineIds).toContain("4");
    expect(lineIds).toContain("5a");
    expect(lineIds).toContain("5b");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("10");
    expect(lineIds).toContain("11");
    expect(lineIds).toContain("15");
  });

  it("audit trail values match result fields", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(500),
      educationCredits: d(2000),
      netPremiumTaxCredit: d(1200),
    });
    const line7 = result.lines.find((l) => l.line === "8");
    expect(line7?.value.toNumber()).toBe(result.totalNonrefundableCredits.toNumber());
    const line15 = result.lines.find((l) => l.line === "15");
    expect(line15?.value.toNumber()).toBe(result.totalRefundableCredits.toNumber());
  });

  it("each individual credit appears in audit trail", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(750),
      childDependentCareCredit: d(800),
      residentialCleanEnergyCredit: d(3000),
    });
    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1?.value.toNumber()).toBe(750);
    const line2 = result.lines.find((l) => l.line === "2");
    expect(line2?.value.toNumber()).toBe(800);
    const line5a = result.lines.find((l) => l.line === "5a");
    expect(line5a?.value.toNumber()).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Combined Scenarios
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - combined scenarios", () => {
  it("all five nonrefundable credits stack correctly", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(500),
      childDependentCareCredit: d(1200),
      educationCredits: d(2500),
      retirementSavingsCredit: d(1000),
      residentialCleanEnergyCredit: d(9000),
      energyImprovementCredit: d(3200),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(17400);
  });

  it("nonrefundable and refundable credits are independent", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      educationCredits: d(2000),
      residentialCleanEnergyCredit: d(5000),
      netPremiumTaxCredit: d(3600),
      excessSocialSecurityWithholding: d(1500),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(7000);
    expect(result.totalRefundableCredits.toNumber()).toBe(5100);
  });

  it("only refundable credits, no nonrefundable", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      netPremiumTaxCredit: d(3000),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
    expect(result.totalRefundableCredits.toNumber()).toBe(3000);
  });

  it("only nonrefundable credits, no refundable", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(500),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(500);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("very large credit values", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      residentialCleanEnergyCredit: d(50000),
      foreignTaxCredit: d(25000),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(75000);
  });

  it("zero-value credits don't affect totals", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(0),
      childDependentCareCredit: d(0),
      educationCredits: d(1000),
      residentialCleanEnergyCredit: d(0),
      energyImprovementCredit: d(0),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════
// Excess SS - Additional Scenarios
// ═══════════════════════════════════════════════════════════

describe("Excess SS Withholding - additional scenarios", () => {
  it("three employers with combined wages over SS base", () => {
    const w2s = [
      { employer: { name: "A", ein: "11-1" }, wages: "80000", federalWithheld: "0",
        socialSecurityWages: "80000", socialSecurityWithheld: "4960",
        medicareWages: "80000", medicareWithheld: "1160",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
      { employer: { name: "B", ein: "22-2" }, wages: "60000", federalWithheld: "0",
        socialSecurityWages: "60000", socialSecurityWithheld: "3720",
        medicareWages: "60000", medicareWithheld: "870",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
      { employer: { name: "C", ein: "33-3" }, wages: "50000", federalWithheld: "0",
        socialSecurityWages: "50000", socialSecurityWithheld: "3100",
        medicareWages: "50000", medicareWithheld: "725",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    // Total: $4,960 + $3,720 + $3,100 = $11,780. Max: $10,918.20. Excess: $861.80
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBe(861.8);
  });

  it("employer withheld at exact max rate — minimal rounding excess", () => {
    // $176,100 × 6.2% = $10,918.20 withheld
    // roundDollar(max) = $10,918. So $10,918.20 - $10,918 = $0.20 → rounds to $0
    // zeroFloor(0.20) = 0.20 (not rounded — excess is fractional)
    const w2s = [
      { employer: { name: "A", ein: "11-1" }, wages: "176100", federalWithheld: "0",
        socialSecurityWages: "176100", socialSecurityWithheld: "10918",
        medicareWages: "176100", medicareWithheld: "2553.45",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBe(0);
  });

  it("no W-2s yields zero excess", () => {
    const excess = calculateExcessSSWithholding([], d(176100), d(0.062));
    expect(excess.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases — Individual Credit Lines
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - individual credit edge cases", () => {
  it("Schedule 3 Line 1 - foreign tax credit only populates Line 8", () => {
    const result = calculateSchedule3(simpleW2Fixture, { foreignTaxCredit: d(300) });
    expect(result.foreignTaxCredit.toNumber()).toBe(300);
    expect(result.childDependentCareCredit.toNumber()).toBe(0);
    expect(result.educationCredits.toNumber()).toBe(0);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
    expect(result.energyImprovementCredit.toNumber()).toBe(0);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(300);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("Schedule 3 Line 2 - child/dependent care credit only populates Line 8", () => {
    const result = calculateSchedule3(simpleW2Fixture, { childDependentCareCredit: d(600) });
    expect(result.childDependentCareCredit.toNumber()).toBe(600);
    expect(result.foreignTaxCredit.toNumber()).toBe(0);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(600);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("Schedule 3 Line 3 - education credits only populates Line 8", () => {
    const result = calculateSchedule3(simpleW2Fixture, { educationCredits: d(2500) });
    expect(result.educationCredits.toNumber()).toBe(2500);
    expect(result.foreignTaxCredit.toNumber()).toBe(0);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(2500);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("Schedule 3 Line 4 - retirement savings credit flows into total nonrefundable credits", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(100),
      retirementSavingsCredit: d(250),
    });
    expect(result.retirementSavingsCredit.toNumber()).toBe(250);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(350);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("Schedule 3 Line 5 - combined energy credits (5a + 5b) flow to Line 8", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      residentialCleanEnergyCredit: d(9000),
      energyImprovementCredit: d(3200),
    });
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(9000);
    expect(result.energyImprovementCredit.toNumber()).toBe(3200);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(12200);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases — Totals, Capping, and Small Amounts
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - totals and boundary edge cases", () => {
  it("Schedule 3 Line 8 - all nonrefundable credits combined sum correctly", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(300),
      childDependentCareCredit: d(600),
      educationCredits: d(2500),
      retirementSavingsCredit: d(1000),
      residentialCleanEnergyCredit: d(9000),
      energyImprovementCredit: d(3200),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(16600);
  });

  it("Schedule 3 Line 8 - nonrefundable credits can exceed typical tax liability (no cap in Schedule 3)", () => {
    // Schedule 3 itself does not cap credits against tax liability;
    // the cap is applied on Form 1040 Line 22. Schedule 3 just sums.
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(50000),
      educationCredits: d(2500),
      residentialCleanEnergyCredit: d(30000),
      energyImprovementCredit: d(3200),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(85700);
  });

  it("Schedule 3 Line 15 - all refundable credits combined", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      netPremiumTaxCredit: d(4800),
      excessSocialSecurityWithholding: d(2200),
    });
    expect(result.totalRefundableCredits.toNumber()).toBe(7000);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
  });

  it("Schedule 3 - mix of refundable and nonrefundable keeps totals independent", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(200),
      childDependentCareCredit: d(500),
      educationCredits: d(1000),
      retirementSavingsCredit: d(750),
      residentialCleanEnergyCredit: d(4000),
      energyImprovementCredit: d(1500),
      netPremiumTaxCredit: d(3600),
      excessSocialSecurityWithholding: d(900),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(7950);
    expect(result.totalRefundableCredits.toNumber()).toBe(4500);
  });

  it("Schedule 3 - zero credits when all explicitly set to zero", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(0),
      childDependentCareCredit: d(0),
      educationCredits: d(0),
      residentialCleanEnergyCredit: d(0),
      energyImprovementCredit: d(0),
      netPremiumTaxCredit: d(0),
      excessSocialSecurityWithholding: d(0),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("Schedule 3 Line 9 - premium tax credit as refundable flows to Line 15", () => {
    const result = calculateSchedule3(simpleW2Fixture, { netPremiumTaxCredit: d(7200) });
    expect(result.netPremiumTaxCredit.toNumber()).toBe(7200);
    expect(result.totalRefundableCredits.toNumber()).toBe(7200);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
  });

  it("Schedule 3 Line 9 - net premium tax credit in excess APTC scenario", () => {
    // When APTC exceeds PTC, net PTC is negative on Form 8962 but
    // Schedule 3 receives it as 0 (repayment goes elsewhere).
    // Here we confirm a positive net PTC flows through.
    const result = calculateSchedule3(simpleW2Fixture, { netPremiumTaxCredit: d(1250) });
    expect(result.netPremiumTaxCredit.toNumber()).toBe(1250);
    expect(result.totalRefundableCredits.toNumber()).toBe(1250);
  });

  it("Schedule 3 Line 11 - excess SS withholding only flows to Line 15", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      excessSocialSecurityWithholding: d(1482),
    });
    expect(result.excessSSWithholding.toNumber()).toBe(1482);
    expect(result.totalRefundableCredits.toNumber()).toBe(1482);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
  });

  it("Schedule 3 - credits with very small amounts ($1 each)", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(1),
      childDependentCareCredit: d(1),
      educationCredits: d(1),
      residentialCleanEnergyCredit: d(1),
      energyImprovementCredit: d(1),
      netPremiumTaxCredit: d(1),
      excessSocialSecurityWithholding: d(1),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(5);
    expect(result.totalRefundableCredits.toNumber()).toBe(2);
  });

  it("Schedule 3 - fractional cent credits are preserved in Decimal", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d("100.33"),
      educationCredits: d("200.67"),
    });
    expect(result.totalNonrefundableCredits.toString()).toBe("301");
    expect(result.foreignTaxCredit.toString()).toBe("100.33");
    expect(result.educationCredits.toString()).toBe("200.67");
  });
});

// ═══════════════════════════════════════════════════════════
// Part I: Nonrefundable Credits — Targeted Flow-Through Tests
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Part I - nonrefundable credit flow-through", () => {
  it("foreign tax credit (Line 1) flows into Part I total (Line 8)", () => {
    const result = calculateSchedule3(simpleW2Fixture, { foreignTaxCredit: d(425) });
    expect(result.foreignTaxCredit.toNumber()).toBe(425);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(425);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("education credits (Line 3) — AOC + LLC combined amount flows into Part I total (Line 8)", () => {
    // AOC max nonrefundable portion = $1,500; LLC max = $2,000.
    // Combined education credits passed as a single field matching Form 8863 output.
    const result = calculateSchedule3(simpleW2Fixture, { educationCredits: d(3500) });
    expect(result.educationCredits.toNumber()).toBe(3500);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(3500);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("dependent care credit (Line 2) flows into Part I total (Line 8)", () => {
    // Form 2441 max credit for two or more qualifying persons is $1,200 at 20% rate.
    const result = calculateSchedule3(simpleW2Fixture, { childDependentCareCredit: d(1200) });
    expect(result.childDependentCareCredit.toNumber()).toBe(1200);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(1200);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("residential clean energy credit Form 5695 Part I (Line 5a) flows into Part I total (Line 8)", () => {
    // Form 5695 Part I: 30% of qualified solar, wind, geothermal expenditures
    const result = calculateSchedule3(simpleW2Fixture, { residentialCleanEnergyCredit: d(9600) });
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(9600);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(9600);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("energy efficiency improvement credit Form 5695 Part II (Line 5b) flows into Part I total (Line 8)", () => {
    // Form 5695 Part II: 30% of qualified energy-efficient improvements, max $1,200 aggregate
    const result = calculateSchedule3(simpleW2Fixture, { energyImprovementCredit: d(1200) });
    expect(result.energyImprovementCredit.toNumber()).toBe(1200);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(1200);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("all Part I nonrefundable credits combined produce correct Line 8 sum", () => {
    // 750 + 1200 + 2500 + 8000 + 3200 = 15650
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(750),
      childDependentCareCredit: d(1200),
      educationCredits: d(2500),
      residentialCleanEnergyCredit: d(8000),
      energyImprovementCredit: d(3200),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(15650);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Part II: Refundable Credits — Targeted Flow-Through Tests
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 Part II - refundable credit flow-through", () => {
  it("ACTC is retained for direct Form 1040 line 28 and excluded from Schedule 3", () => {
    // Additional Child Tax Credit is the refundable portion of the Child Tax Credit
    const result = calculateSchedule3(simpleW2Fixture, { additionalChildTaxCredit: d(1700) });
    expect(result.additionalChildTaxCredit.toNumber()).toBe(1700);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
  });

  it("net premium tax credit (Line 9) flows into Part II total (Line 15)", () => {
    const result = calculateSchedule3(simpleW2Fixture, { netPremiumTaxCredit: d(5400) });
    expect(result.netPremiumTaxCredit.toNumber()).toBe(5400);
    expect(result.totalRefundableCredits.toNumber()).toBe(5400);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
  });

  it("AOC refundable portion is retained for direct Form 1040 line 29 and excluded from Schedule 3", () => {
    // AOC allows 40% of up to $2,500 credit to be refundable = max $1,000
    const result = calculateSchedule3(simpleW2Fixture, { aocRefundablePortion: d(1000) });
    expect(result.aocRefundablePortion.toNumber()).toBe(1000);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
  });

  it("all Part II refundable credits combined produce correct Line 15 sum", () => {
    // Schedule 3 includes net PTC 3600 + excess SS 1482 = 5082; ACTC/AOC go directly to 1040.
    const result = calculateSchedule3(simpleW2Fixture, {
      netPremiumTaxCredit: d(3600),
      excessSocialSecurityWithholding: d(1482),
      additionalChildTaxCredit: d(1700),
      aocRefundablePortion: d(1000),
    });
    expect(result.totalRefundableCredits.toNumber()).toBe(5082);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Total Schedule 3 and Cross-Part Tests
// ═══════════════════════════════════════════════════════════

describe("Schedule 3 - total credits and cross-part scenarios", () => {
  it("total Schedule 3 = Part I (Line 8) plus Part II (Line 15) with all credits present", () => {
    // Nonrefundable: 500 + 1200 + 2500 + 9000 + 3200 = 16400
    // Schedule 3 payments: 3600 + 1482 = 5082; direct 1040 credits remain separate.
    const result = calculateSchedule3(simpleW2Fixture, {
      foreignTaxCredit: d(500),
      childDependentCareCredit: d(1200),
      educationCredits: d(2500),
      residentialCleanEnergyCredit: d(9000),
      energyImprovementCredit: d(3200),
      netPremiumTaxCredit: d(3600),
      excessSocialSecurityWithholding: d(1482),
      additionalChildTaxCredit: d(1700),
      aocRefundablePortion: d(1000),
    });
    expect(result.totalNonrefundableCredits.toNumber()).toBe(16400);
    expect(result.totalRefundableCredits.toNumber()).toBe(5082);
    const grandTotal = result.totalNonrefundableCredits.plus(result.totalRefundableCredits);
    expect(grandTotal.toNumber()).toBe(21482);
  });

  it("zero credits scenario — all totals are zero when no credits provided", () => {
    const result = calculateSchedule3(simpleW2Fixture);
    expect(result.foreignTaxCredit.toNumber()).toBe(0);
    expect(result.childDependentCareCredit.toNumber()).toBe(0);
    expect(result.educationCredits.toNumber()).toBe(0);
    expect(result.residentialCleanEnergyCredit.toNumber()).toBe(0);
    expect(result.energyImprovementCredit.toNumber()).toBe(0);
    expect(result.netPremiumTaxCredit.toNumber()).toBe(0);
    expect(result.excessSSWithholding.toNumber()).toBe(0);
    expect(result.additionalChildTaxCredit.toNumber()).toBe(0);
    expect(result.aocRefundablePortion.toNumber()).toBe(0);
    expect(result.totalNonrefundableCredits.toNumber()).toBe(0);
    expect(result.totalRefundableCredits.toNumber()).toBe(0);
  });

  it("audit trail excludes fabricated ACTC and AOC Schedule 3 entries", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      additionalChildTaxCredit: d(1700),
      aocRefundablePortion: d(1000),
    });
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).not.toContain("14a");
    expect(lineIds).not.toContain("14b");
  });

  it("direct1040 refundable fields remain separate from the Schedule3 audit", () => {
    const result = calculateSchedule3(simpleW2Fixture, {
      additionalChildTaxCredit: d(1700),
      aocRefundablePortion: d(500),
      netPremiumTaxCredit: d(2400),
    });
    const line14a = result.lines.find((l) => l.line === "14a");
    expect(line14a).toBeUndefined();
    expect(result.additionalChildTaxCredit.toNumber()).toBe(1700);
    const line14b = result.lines.find((l) => l.line === "14b");
    expect(line14b).toBeUndefined();
    expect(result.aocRefundablePortion.toNumber()).toBe(500);
    const line15 = result.lines.find((l) => l.line === "15");
    // Only PTC 2400 belongs on Schedule 3; ACTC 1700 and AOC 500 are direct 1040 credits.
    expect(line15?.value.toNumber()).toBe(2400);
  });
});

// ═══════════════════════════════════════════════════════════
// Excess SS Withholding — More Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Excess SS Withholding - boundary edge cases", () => {
  it("exactly at SS wage base with rounded withholding — no excess", () => {
    // Max withholding = roundDollar($176,100 × 6.2%) = roundDollar($10,918.20) = $10,918
    // Employer withheld exactly $10,918 → excess = 0
    const w2s = [
      { employer: { name: "A", ein: "11-1" }, wages: "176100", federalWithheld: "0",
        socialSecurityWages: "176100", socialSecurityWithheld: "10918",
        medicareWages: "176100", medicareWithheld: "2553.45",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBe(0);
  });

  it("exactly at SS wage base with exact withholding — no excess", () => {
    // Max withholding = $176,100 × 6.2% = $10,918.20 (exact, not rounded)
    // Employer withheld $10,918.20 → excess = $0
    const w2s = [
      { employer: { name: "A", ein: "11-1" }, wages: "176100", federalWithheld: "0",
        socialSecurityWages: "176100", socialSecurityWithheld: "10918.20",
        medicareWages: "176100", medicareWithheld: "2553.45",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBe(0);
  });

  it("two employers each at half of SS wage base — no excess when withheld matches max", () => {
    // Each withholds $5,459 → total $10,918 < $10,918.20 max → excess 0
    const w2s = [
      { employer: { name: "A", ein: "11-1" }, wages: "88050", federalWithheld: "0",
        socialSecurityWages: "88050", socialSecurityWithheld: "5459",
        medicareWages: "88050", medicareWithheld: "1276.73",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
      { employer: { name: "B", ein: "22-2" }, wages: "88050", federalWithheld: "0",
        socialSecurityWages: "88050", socialSecurityWithheld: "5459",
        medicareWages: "88050", medicareWithheld: "1276.73",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBe(0);
  });

  it("max withholding uses exact amount $10,918.20 — not rounded $10,918", () => {
    // IRS Form 1040 Instructions: "credit for the amount withheld in excess of $10,918.20"
    // Two employers: total $11,000 withheld
    // Old code (roundDollar max = $10,918): excess = $82 (WRONG)
    // Correct (exact max = $10,918.20): excess = $81.80
    const w2s = [
      { employer: { name: "A", ein: "11-1" }, wages: "100000", federalWithheld: "0",
        socialSecurityWages: "100000", socialSecurityWithheld: "6200",
        medicareWages: "100000", medicareWithheld: "1450",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
      { employer: { name: "B", ein: "22-2" }, wages: "80000", federalWithheld: "0",
        socialSecurityWages: "80000", socialSecurityWithheld: "4800",
        medicareWages: "80000", medicareWithheld: "1160",
        stateTaxWithheld: "0", stateWages: "0", localTaxWithheld: "0" },
    ];
    // Total: $11,000. Max: $10,918.20. Excess: $81.80
    const excess = calculateExcessSSWithholding(w2s, d(176100), d(0.062));
    expect(excess.toNumber()).toBe(81.8);
  });
});
