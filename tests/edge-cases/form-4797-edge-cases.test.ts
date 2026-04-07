/**
 * Edge case tests for Form 4797 — Sales of Business Property.
 * Spec: spec/federal/form-4797.yaml
 *
 * Part 1: Unit-level routing tests (Form 4797 only)
 * Part 2: End-to-end federal integration tests verifying the full pipeline:
 *         Form 4797 → Schedule 1 Line 4 → AGI → QDCG worksheet → correct tax
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm4797 } from "@/engine/forms/form-4797.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Part 1: Unit-level routing tests (existing)
// ═══════════════════════════════════════════════════════════

describe("Form 4797 section 1231 edge cases", () => {
  it("uses a validated Line 7 override instead of attached K-1 defaults while preserving the supported subtotals in the audit trail", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Gain LP",
          partnershipEIN: "11-1111111",
          ordinaryIncome: "0",
          section1231Gain: "9000",
          isPassiveActivity: true,
        },
        {
          partnershipName: "Operating LLC",
          partnershipEIN: "22-2222222",
          ordinaryIncome: "0",
          section1231Gain: "-2000",
          isPassiveActivity: false,
        },
        {
          partnershipName: "Passive Loss LP",
          partnershipEIN: "33-3333333",
          ordinaryIncome: "0",
          section1231Gain: "-1500",
          isPassiveActivity: true,
        },
      ],
      form4797: {
        netSection1231GainOrLoss: "1200",
        nonrecapturedNetSection1231Losses: "0",
      },
    });

    expect(result.line7.toNumber()).toBe(1200);
    expect(result.line9.toNumber()).toBe(1200);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.supportedK1Section1231Gains.toNumber()).toBe(9000);
    expect(result.supportedK1Section1231NonpassiveLosses.toNumber()).toBe(-2000);
    expect(result.deferredPassiveK1Section1231Losses.toNumber()).toBe(-1500);

    const line7 = result.lines.find((line) => line.form === "Form 4797" && line.line === "7");
    expect(String(line7?.inputs["Validated Form 4797 line 7 amount"])).toBe("1200");
    expect(String(line7?.inputs["Supported attached Schedule K-1 box 10 gains"])).toBe("9000");
    expect(String(line7?.inputs["Supported attached nonpassive Schedule K-1 box 10 losses"])).toBe("-2000");
    expect(String(line7?.inputs["Deferred passive Schedule K-1 box 10 losses"])).toBe("-1500");
  });

  it("keeps passive-only K-1 section 1231 losses deferred instead of defaulting an ordinary loss", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Passive Loss LP",
          partnershipEIN: "44-4444444",
          ordinaryIncome: "0",
          section1231Gain: "-5000",
          isPassiveActivity: true,
        },
      ],
    });

    expect(result.line7.toNumber()).toBe(0);
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.longTermCapitalGain.toNumber()).toBe(0);
    expect(result.ordinaryGainOrLoss.toNumber()).toBe(0);
    expect(result.supportedK1Section1231Gains.toNumber()).toBe(0);
    expect(result.supportedK1Section1231NonpassiveLosses.toNumber()).toBe(0);
    expect(result.deferredPassiveK1Section1231Losses.toNumber()).toBe(-5000);

    const line7 = result.lines.find((line) => line.form === "Form 4797" && line.line === "7");
    expect(String(line7?.inputs["Deferred passive Schedule K-1 box 10 losses"])).toBe("-5000");
  });
});

// ═══════════════════════════════════════════════════════════
// Part 2: End-to-end federal integration tests for property sales
// ═══════════════════════════════════════════════════════════

describe("Form 4797 property sale federal integration — section 1245 equipment", () => {
  // Scenario: Single filer with $85K wages sells fully depreciated equipment for $12K.
  // All gain is section 1245 ordinary recapture → flows through Schedule 1 Line 4.
  const fixture: TaxYearInput = {
    ...simpleW2Fixture,
    form4797: {
      propertySales: [{
        description: "Office laptop and monitors",
        costOrBasis: "30000",
        depreciationAllowed: "30000",
        grossSalesPrice: "12000",
        propertyType: "section1245",
        heldMoreThanOneYear: true,
      }],
    },
  };
  const result = calculateFederalTax(fixture);
  const baseResult = calculateFederalTax(simpleW2Fixture);

  it("Schedule 1 Line 4 carries the full section 1245 recapture as ordinary income", () => {
    // Adjusted basis = 30000 - 30000 = 0, gain = 12000
    // Recapture = min(12000, 30000) = 12000 (all ordinary)
    // No section 1231 gain (all recaptured)
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(12000);
  });

  it("total income includes the equipment sale recapture", () => {
    expect(result.totalIncome.toNumber()).toBe(
      baseResult.totalIncome.toNumber() + 12000
    );
  });

  it("AGI increases by the recapture amount", () => {
    expect(result.agi.toNumber()).toBe(
      baseResult.agi.toNumber() + 12000
    );
  });

  it("total tax increases due to the additional ordinary income", () => {
    expect(result.totalTax.greaterThan(baseResult.totalTax)).toBe(true);
  });

  it("capital gain on Schedule D is $0 since all gain was recaptured", () => {
    expect(result.capitalGainLoss.toNumber()).toBe(0);
  });

  it("Form 4797 sub-result shows the property recapture details", () => {
    expect(result.form4797).toBeDefined();
    expect(result.form4797!.partIIRecapture.toNumber()).toBe(12000);
    expect(result.form4797!.partIIOrdinaryTotal.toNumber()).toBe(12000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(0);
  });

  it("audit trail records Schedule 1 Line 4 with Part II recapture breakdown", () => {
    const sched1Line4 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "4"
    );
    expect(sched1Line4).toBeDefined();
    expect(sched1Line4!.value.toNumber()).toBe(12000);
    expect(String(sched1Line4!.inputs["Form 4797 Part II ordinary"])).toBe("12000");
  });
});

describe("Form 4797 property sale federal integration — section 1250 rental building", () => {
  // Scenario: Single filer with $85K wages sells a rental building held >1 year.
  // Post-1986 MACRS: $0 ordinary recapture, unrecaptured §1250 at 25% max rate.
  const fixture: TaxYearInput = {
    ...simpleW2Fixture,
    form4797: {
      propertySales: [{
        description: "Residential rental property",
        costOrBasis: "200000",
        depreciationAllowed: "50000",
        grossSalesPrice: "280000",
        propertyType: "section1250",
        heldMoreThanOneYear: true,
      }],
    },
  };
  const result = calculateFederalTax(fixture);
  const baseResult = calculateFederalTax(simpleW2Fixture);

  it("Schedule 1 Line 4 is $0 — no ordinary recapture on post-1986 MACRS real property", () => {
    // §1250 recapture = $0 (SL = total depreciation for post-1986 MACRS)
    // All gain is section 1231 → Schedule D as LTCG
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(0);
  });

  it("capital gain includes the section 1231 long-term capital gain", () => {
    // Adjusted basis = 200000 - 50000 = 150000
    // Total gain = 280000 - 150000 = 130000
    // Entire gain is section 1231 → LTCG on Schedule D
    expect(result.capitalGainLoss.toNumber()).toBe(130000);
  });

  it("total income includes the capital gain", () => {
    expect(result.totalIncome.toNumber()).toBe(
      baseResult.totalIncome.toNumber() + 130000
    );
  });

  it("Form 4797 sub-result shows unrecaptured section 1250 gain", () => {
    expect(result.form4797).toBeDefined();
    expect(result.form4797!.partIIRecapture.toNumber()).toBe(0);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(130000);
    // Unrecaptured = min(gain after recapture, depreciation - recapture) = min(130000, 50000) = 50000
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(50000);
  });

  it("QDCG worksheet taxes unrecaptured §1250 gain at the 25% max rate — lower than all-ordinary", () => {
    // The $130K LTCG should be split: $50K at 25% max and $80K at 15% rate.
    // This produces lower tax than if taxed entirely at ordinary rates.
    // Verify via capitalGainsTax > 0 and ordinaryTax < what it would be if all income were ordinary.
    expect(result.capitalGainsTax.greaterThan(0)).toBe(true);

    // Also verify the total tax is less than if we had $130K more ordinary income
    // (i.e., the QDCG preferential rates are being applied)
    const ordinaryOnlyFixture: TaxYearInput = {
      ...simpleW2Fixture,
      adjustments: {
        ...simpleW2Fixture.adjustments,
      },
      form4797: {
        netSection1231GainOrLoss: "0",
        propertySales: [{
          description: "Hypothetical equipment (all ordinary)",
          costOrBasis: "200000",
          depreciationAllowed: "200000",
          grossSalesPrice: "330000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const ordinaryOnlyResult = calculateFederalTax(ordinaryOnlyFixture);
    // Same $130K gain but treated as ordinary should produce higher tax
    expect(result.totalTax.lessThan(ordinaryOnlyResult.totalTax)).toBe(true);
  });
});

describe("Form 4797 property sale federal integration — mixed equipment and building with lookback", () => {
  // Scenario: Single filer sells equipment (§1245) and a building (§1250) in the same year,
  // with $8K of prior nonrecaptured section 1231 losses triggering lookback recapture.
  const fixture: TaxYearInput = {
    ...simpleW2Fixture,
    form4797: {
      nonrecapturedNetSection1231Losses: "8000",
      propertySales: [
        {
          description: "CNC machine",
          costOrBasis: "100000",
          depreciationAllowed: "60000",
          grossSalesPrice: "120000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        },
        {
          description: "Workshop building",
          costOrBasis: "300000",
          depreciationAllowed: "75000",
          grossSalesPrice: "400000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        },
      ],
    },
  };
  const result = calculateFederalTax(fixture);

  it("correctly splits ordinary and capital gain across both property types", () => {
    // CNC machine (§1245): basis=40000, gain=80000, recapture=min(80000,60000)=60000, §1231=20000
    // Workshop (§1250): basis=225000, gain=175000, recapture=$0 (SL), §1231=175000
    //
    // Part I Line 7 = 20000 + 175000 = 195000
    // Line 8 = 8000 (lookback)
    // Line 9 = 195000 - 8000 = 187000 (LTCG)
    // Line 12 = min(195000, 8000) = 8000 (ordinary from lookback)
    //
    // Part II: recapture = 60000 + 0 = 60000, short-term = 0
    // Combined ordinary = (0 + 8000) + 60000 = 68000

    expect(result.form4797!.line7.toNumber()).toBe(195000);
    expect(result.form4797!.line12.toNumber()).toBe(8000);
    expect(result.form4797!.partIIRecapture.toNumber()).toBe(60000);
    expect(result.form4797!.ordinaryGainOrLoss.toNumber()).toBe(68000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(187000);
  });

  it("Schedule 1 Line 4 carries the combined ordinary amount", () => {
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(68000);
  });

  it("Schedule D receives the section 1231 LTCG", () => {
    expect(result.capitalGainLoss.toNumber()).toBe(187000);
  });

  it("unrecaptured section 1250 gain from the building flows through QDCG", () => {
    // Workshop: unrec §1250 = min(175000, 75000) = 75000
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(75000);
    // Preferential capital gains tax should be computed
    expect(result.capitalGainsTax.greaterThan(0)).toBe(true);
  });

  it("AGI includes both ordinary and capital gain amounts", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);
    // Total new income = 68000 ordinary + 187000 LTCG = 255000
    expect(result.agi.toNumber()).toBe(
      baseResult.agi.toNumber() + 68000 + 187000
    );
  });
});

describe("Form 4797 property sale federal integration — short-term property", () => {
  // Scenario: Equipment held less than one year. Entire gain is ordinary (no section 1231).
  const fixture: TaxYearInput = {
    ...simpleW2Fixture,
    form4797: {
      propertySales: [{
        description: "Recently purchased equipment",
        costOrBasis: "20000",
        depreciationAllowed: "5000",
        grossSalesPrice: "22000",
        propertyType: "section1245",
        heldMoreThanOneYear: false,
      }],
    },
  };
  const result = calculateFederalTax(fixture);

  it("entire gain is ordinary through Part II — no section 1231 treatment", () => {
    // Basis = 15000, gain = 7000
    // §1245 recapture = min(7000, 5000) = 5000
    // Non-recapture gain = 2000 (short-term → stays in Part II as ordinary)
    expect(result.form4797!.partIIRecapture.toNumber()).toBe(5000);
    expect(result.form4797!.partIIShortTermOrdinary.toNumber()).toBe(2000);
    expect(result.form4797!.partIIOrdinaryTotal.toNumber()).toBe(7000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
  });

  it("Schedule 1 Line 4 carries the full short-term ordinary amount", () => {
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(7000);
  });

  it("no capital gain on Schedule D from short-term property", () => {
    expect(result.capitalGainLoss.toNumber()).toBe(0);
  });
});

describe("Form 4797 property sale federal integration — loss reduces AGI", () => {
  // Scenario: Equipment sold at a loss. Loss flows through Schedule 1 Line 4, reducing AGI.
  const fixture: TaxYearInput = {
    ...simpleW2Fixture,
    form4797: {
      propertySales: [{
        description: "Obsolete manufacturing equipment",
        costOrBasis: "50000",
        depreciationAllowed: "15000",
        grossSalesPrice: "25000",
        propertyType: "section1245",
        heldMoreThanOneYear: true,
      }],
    },
  };
  const result = calculateFederalTax(fixture);
  const baseResult = calculateFederalTax(simpleW2Fixture);

  it("property loss flows as section 1231 ordinary loss through Schedule 1 Line 4", () => {
    // Adjusted basis = 50000 - 15000 = 35000
    // Sale price = 25000 → loss = -10000
    // No recapture (loss). Section 1231 loss → Part I Line 11 → ordinary.
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(-10000);
  });

  it("AGI decreases by the loss amount", () => {
    expect(result.agi.toNumber()).toBe(
      baseResult.agi.toNumber() - 10000
    );
  });

  it("total tax decreases due to the loss deduction", () => {
    expect(result.totalTax.lessThan(baseResult.totalTax)).toBe(true);
  });
});

describe("Form 4797 property sale federal integration — pre-1987 accelerated depreciation recapture", () => {
  // Scenario: Pre-1987 building with accelerated depreciation. The excess over straight-line
  // is recaptured as ordinary income under §1250; the straight-line portion becomes
  // unrecaptured §1250 gain at the 25% max rate.
  const fixture: TaxYearInput = {
    ...simpleW2Fixture,
    form4797: {
      propertySales: [{
        description: "Pre-1987 commercial building",
        costOrBasis: "300000",
        depreciationAllowed: "180000",
        straightLineDepreciation: "150000",
        grossSalesPrice: "350000",
        propertyType: "section1250",
        heldMoreThanOneYear: true,
      }],
    },
  };
  const result = calculateFederalTax(fixture);

  it("Part II carries the excess-over-straight-line recapture as ordinary income", () => {
    // Excess depreciation = 180000 - 150000 = 30000
    // §1250 ordinary recapture = min(230000 gain, 30000) = 30000
    expect(result.form4797!.partIIRecapture.toNumber()).toBe(30000);
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(30000);
  });

  it("non-recapture section 1231 gain flows as LTCG", () => {
    // Total gain = 350000 - 120000 = 230000
    // Non-recapture = 230000 - 30000 = 200000 (§1231 → LTCG)
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(200000);
    expect(result.capitalGainLoss.toNumber()).toBe(200000);
  });

  it("unrecaptured section 1250 gain equals the straight-line depreciation portion", () => {
    // Unrec §1250 = min(200000, 180000 - 30000) = min(200000, 150000) = 150000
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(150000);
  });

  it("AGI includes both the ordinary recapture and the LTCG", () => {
    const baseResult = calculateFederalTax(simpleW2Fixture);
    // Total income increase = 30000 ordinary + 200000 LTCG = 230000
    expect(result.agi.toNumber()).toBe(baseResult.agi.toNumber() + 230000);
  });
});

describe("Form 4797 property sale federal integration — K-1 section 1231 combined with property sale", () => {
  // Scenario: K-1 box 10 gain + direct equipment sale, both contributing to Part I.
  const fixture: TaxYearInput = {
    ...simpleW2Fixture,
    scheduleK1: [{
      partnershipName: "Industrial Fund LP",
      partnershipEIN: "55-6677889",
      ordinaryIncome: "0",
      section1231Gain: "15000",
      isPassiveActivity: false,
    }],
    form4797: {
      propertySales: [{
        description: "Delivery truck",
        costOrBasis: "45000",
        depreciationAllowed: "35000",
        grossSalesPrice: "30000",
        propertyType: "section1245",
        heldMoreThanOneYear: true,
      }],
    },
  };
  const result = calculateFederalTax(fixture);

  it("Part I Line 7 combines K-1 gain with property sale section 1231 amounts", () => {
    // Truck: basis=10000, gain=20000, recapture=min(20000,35000)=20000, §1231=0
    // K-1: §1231 gain=15000
    // Line 7 = 15000 + 0 = 15000
    expect(result.form4797!.line7.toNumber()).toBe(15000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(15000);
  });

  it("Schedule 1 Line 4 carries only the ordinary amounts (recapture)", () => {
    // Part I ordinary = 0 (no losses, no lookback)
    // Part II ordinary = 20000 (recapture from truck)
    // Combined = 20000
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(20000);
  });

  it("Schedule D receives the K-1 section 1231 LTCG", () => {
    expect(result.capitalGainLoss.toNumber()).toBe(15000);
  });

  it("total income sums wages, ordinary recapture, and LTCG correctly", () => {
    // Wages = 85000, ordinary = 20000, LTCG = 15000
    // Total income = 85000 + 20000 + 15000 = 120000
    expect(result.totalIncome.toNumber()).toBe(120000);
  });
});

describe("Form 4797 property sale federal integration — no property sales produces zero contributions", () => {
  it("Form 4797 sub-result shows zero Part II/III amounts when only K-1 section 1231 is present", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Operating LP",
        partnershipEIN: "11-2233445",
        ordinaryIncome: "3000",
        section1231Gain: "5000",
        isPassiveActivity: false,
      }],
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.propertyResults.length).toBe(0);
    expect(result.form4797!.partIIRecapture.toNumber()).toBe(0);
    expect(result.form4797!.partIIShortTermOrdinary.toNumber()).toBe(0);
    expect(result.form4797!.partIIOrdinaryTotal.toNumber()).toBe(0);
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(0);
    // K-1 §1231 gain flows through Part I to Schedule D
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════
// Part 3: Boundary and edge case tests
// ═══════════════════════════════════════════════════════════

describe("Form 4797 — zero gain (sale price equals adjusted basis)", () => {
  it("§1245 property sold at exactly adjusted basis produces no gain, no recapture, no loss", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Equipment sold at break-even",
          costOrBasis: "50000",
          depreciationAllowed: "20000",
          grossSalesPrice: "30000", // Exactly adjusted basis
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.partIIRecapture.toNumber()).toBe(0);
    expect(result.form4797!.partIIOrdinaryTotal.toNumber()).toBe(0);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(0);
  });

  it("§1250 property sold at exactly adjusted basis produces no unrecaptured §1250 gain", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Building sold at break-even",
          costOrBasis: "300000",
          depreciationAllowed: "75000",
          grossSalesPrice: "225000", // Exactly adjusted basis
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.partIIRecapture.toNumber()).toBe(0);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(0);
  });
});

describe("Form 4797 — §1245 gain exactly equals depreciation (full recapture boundary)", () => {
  it("gain equal to depreciation means 100% recapture, zero non-recapture, zero §1231", () => {
    // Adjusted basis = 80000 - 30000 = 50000, sale = 80000, gain = 30000
    // Recapture = min(30000, 30000) = 30000 — all ordinary
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Equipment with gain matching depreciation",
          costOrBasis: "80000",
          depreciationAllowed: "30000",
          grossSalesPrice: "80000", // Gain exactly = depreciation
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.partIIRecapture.toNumber()).toBe(30000);
    expect(result.form4797!.partIIOrdinaryTotal.toNumber()).toBe(30000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
    expect(result.capitalGainLoss.toNumber()).toBe(0);
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(30000);
  });
});

describe("Form 4797 — §1245 gain less than depreciation (partial recapture)", () => {
  it("small gain on heavily depreciated equipment is fully recaptured as ordinary", () => {
    // Adjusted basis = 100000 - 90000 = 10000, sale = 15000, gain = 5000
    // Recapture = min(5000, 90000) = 5000 — all ordinary but less than depreciation
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Heavily depreciated machinery",
          costOrBasis: "100000",
          depreciationAllowed: "90000",
          grossSalesPrice: "15000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.partIIRecapture.toNumber()).toBe(5000);
    expect(result.form4797!.partIIOrdinaryTotal.toNumber()).toBe(5000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
  });
});

describe("Form 4797 — lookback fully consumes §1231 gain", () => {
  it("lookback amount exceeding §1231 gain recaptures entire gain as ordinary with zero LTCG", () => {
    // §1231 gain = 10000, lookback = 15000
    // Line 12 = min(10000, 15000) = 10000 (all ordinary)
    // Line 9 = max(0, 10000 - 15000) = 0 (no LTCG)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        nonrecapturedNetSection1231Losses: "15000",
        propertySales: [{
          description: "Workshop building",
          costOrBasis: "200000",
          depreciationAllowed: "40000",
          grossSalesPrice: "170000", // Gain = 10000, all §1231 (§1250 recapture = 0)
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    // §1231 gain = 10000 (building gain after $0 recapture)
    expect(result.form4797!.line7.toNumber()).toBe(10000);
    // Line 8 = 15000 (lookback)
    expect(result.form4797!.line8.toNumber()).toBe(15000);
    // Line 9 = 0 (fully consumed by lookback)
    expect(result.form4797!.line9.toNumber()).toBe(0);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
    // Line 12 = min(10000, 15000) = 10000 (ordinary)
    expect(result.form4797!.line12.toNumber()).toBe(10000);
    // All goes to Schedule 1 as ordinary, nothing to Schedule D
    expect(result.capitalGainLoss.toNumber()).toBe(0);
  });
});

describe("Form 4797 — lookback exactly equals §1231 gain", () => {
  it("lookback amount matching §1231 gain recaptures all as ordinary, zero LTCG", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        nonrecapturedNetSection1231Losses: "10000",
        propertySales: [{
          description: "Office building",
          costOrBasis: "200000",
          depreciationAllowed: "40000",
          grossSalesPrice: "170000", // §1231 gain = 10000
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.line7.toNumber()).toBe(10000);
    expect(result.form4797!.line8.toNumber()).toBe(10000);
    expect(result.form4797!.line9.toNumber()).toBe(0);
    expect(result.form4797!.line12.toNumber()).toBe(10000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
  });
});

describe("Form 4797 — §1250 gain exactly equals depreciation", () => {
  it("all gain is unrecaptured §1250 when gain equals depreciation (post-1986 MACRS)", () => {
    // Adjusted basis = 400000 - 100000 = 300000, sale = 400000, gain = 100000
    // §1250 recapture = $0 (post-1986 SL), §1231 = 100000
    // Unrecaptured = min(100000, 100000) = 100000
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Rental property gain = depreciation",
          costOrBasis: "400000",
          depreciationAllowed: "100000",
          grossSalesPrice: "400000", // Gain exactly = depreciation
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.partIIRecapture.toNumber()).toBe(0);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(100000);
    // All LTCG is unrecaptured §1250 (taxed at max 25%)
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(100000);
  });
});

describe("Form 4797 — §1250 with zero depreciation", () => {
  it("no depreciation means no unrecaptured §1250, all gain is pure §1231 LTCG", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Vacant land held as business property",
          costOrBasis: "100000",
          depreciationAllowed: "0",
          grossSalesPrice: "150000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.partIIRecapture.toNumber()).toBe(0);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(50000);
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(0);
    expect(result.capitalGainLoss.toNumber()).toBe(50000);
  });
});

describe("Form 4797 — short-term §1250 property sale", () => {
  it("§1250 property held ≤1 year has gain treated as ordinary, not §1231", () => {
    // Adjusted basis = 200000 - 5000 = 195000, sale = 210000, gain = 15000
    // §1250 ordinary recapture = $0 (post-1986 SL)
    // Non-recapture = 15000, but held ≤1 year → short-term ordinary
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Recently purchased office condo",
          costOrBasis: "200000",
          depreciationAllowed: "5000",
          grossSalesPrice: "210000",
          propertyType: "section1250",
          heldMoreThanOneYear: false,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.partIIShortTermOrdinary.toNumber()).toBe(15000);
    expect(result.form4797!.partIIOrdinaryTotal.toNumber()).toBe(15000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
    // No unrecaptured §1250 on short-term property
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(0);
  });
});

describe("Form 4797 — multiple properties: gain and loss netting in §1231", () => {
  it("§1231 loss on one property offsets §1231 gain on another", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [
          {
            description: "Profitable building",
            costOrBasis: "200000",
            depreciationAllowed: "50000",
            grossSalesPrice: "250000", // Gain = 100000, all §1231
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
          {
            description: "Failed warehouse",
            costOrBasis: "300000",
            depreciationAllowed: "30000",
            grossSalesPrice: "200000", // Loss = -70000
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
        ],
      },
    };
    const result = calculateFederalTax(fixture);

    // Property 1: gain = 100000, §1250 recapture = 0, §1231 = 100000, unrec§1250 = 50000
    // Property 2: loss = -70000, §1231 = -70000
    // Net §1231 = 100000 + (-70000) = 30000 gain
    expect(result.form4797!.line7.toNumber()).toBe(30000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(30000);
    expect(result.capitalGainLoss.toNumber()).toBe(30000);
    // Unrecaptured §1250 from the profitable building
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(50000);
  });

  it("§1231 losses exceed gains producing net ordinary loss", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [
          {
            description: "Small building gain",
            costOrBasis: "100000",
            depreciationAllowed: "20000",
            grossSalesPrice: "90000", // Gain = 10000
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
          {
            description: "Large building loss",
            costOrBasis: "500000",
            depreciationAllowed: "50000",
            grossSalesPrice: "350000", // Loss = -100000
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
        ],
      },
    };
    const result = calculateFederalTax(fixture);

    // Property 1: gain = 10000, §1231 = 10000
    // Property 2: loss = -100000, §1231 = -100000
    // Net §1231 = -90000 → ordinary loss (Line 11)
    expect(result.form4797!.line7.toNumber()).toBe(-90000);
    expect(result.form4797!.line11.toNumber()).toBe(-90000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
  });
});

describe("Form 4797 — very small gain ($1) on §1245 property", () => {
  it("$1 gain is fully recaptured as ordinary when depreciation exceeds gain", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Laptop sold for $1 over basis",
          costOrBasis: "2000",
          depreciationAllowed: "1500",
          grossSalesPrice: "501", // Adjusted basis = 500, gain = 1
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.partIIRecapture.toNumber()).toBe(1);
    expect(result.form4797!.partIIOrdinaryTotal.toNumber()).toBe(1);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(1);
  });
});

describe("Form 4797 — §1231 gains exactly offset losses (net zero)", () => {
  it("net zero §1231 produces no ordinary gain/loss and no LTCG", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [
          {
            description: "Warehouse gain",
            costOrBasis: "200000",
            depreciationAllowed: "40000",
            grossSalesPrice: "185000", // Gain = 25000 (§1231)
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
          {
            description: "Office building loss",
            costOrBasis: "300000",
            depreciationAllowed: "75000",
            grossSalesPrice: "200000", // Loss = -25000 (§1231)
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
        ],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.line7.toNumber()).toBe(0);
    expect(result.form4797!.line9.toNumber()).toBe(0);
    expect(result.form4797!.line11.toNumber()).toBe(0);
    expect(result.form4797!.line12.toNumber()).toBe(0);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(0);
    expect(result.form4797!.ordinaryGainOrLoss.toNumber()).toBe(0);
  });
});

describe("Form 4797 — multiple §1250 properties accumulating unrecaptured gain", () => {
  it("unrecaptured §1250 gain sums across multiple properties", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [
          {
            description: "Rental house A",
            costOrBasis: "250000",
            depreciationAllowed: "60000",
            grossSalesPrice: "350000", // Gain=160000, unrec§1250=60000
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
          {
            description: "Rental house B",
            costOrBasis: "300000",
            depreciationAllowed: "45000",
            grossSalesPrice: "370000", // Gain=115000, unrec§1250=45000
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
        ],
      },
    };
    const result = calculateFederalTax(fixture);

    // Total unrecaptured = 60000 + 45000 = 105000
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(105000);
    // Total §1231 LTCG = 160000 + 115000 = 275000
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(275000);
    expect(result.capitalGainLoss.toNumber()).toBe(275000);
  });
});

describe("Form 4797 — §1245 with zero depreciation", () => {
  it("no depreciation means zero recapture; all gain is §1231 LTCG", () => {
    // Equipment never depreciated (e.g., just purchased and immediately sold)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Equipment flipped for profit",
          costOrBasis: "40000",
          depreciationAllowed: "0",
          grossSalesPrice: "55000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    // Recapture = min(15000, 0) = 0
    expect(result.form4797!.partIIRecapture.toNumber()).toBe(0);
    // All gain is §1231 → LTCG
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(15000);
    expect(result.capitalGainLoss.toNumber()).toBe(15000);
  });
});

describe("Form 4797 — partial lookback leaves residual LTCG", () => {
  it("lookback recaptures part of §1231 gain while remainder stays LTCG", () => {
    // §1231 gain = 50000, lookback = 20000
    // Line 9 = 50000 - 20000 = 30000 LTCG
    // Line 12 = min(50000, 20000) = 20000 ordinary
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        nonrecapturedNetSection1231Losses: "20000",
        propertySales: [{
          description: "Appreciated warehouse",
          costOrBasis: "400000",
          depreciationAllowed: "50000",
          grossSalesPrice: "400000", // Gain = 50000, all §1231
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.line7.toNumber()).toBe(50000);
    expect(result.form4797!.line8.toNumber()).toBe(20000);
    expect(result.form4797!.line9.toNumber()).toBe(30000);
    expect(result.form4797!.line12.toNumber()).toBe(20000);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(30000);
    // Ordinary = 20000 from lookback
    expect(result.schedule1!.otherGainsOrLosses.toNumber()).toBe(20000);
  });
});

describe("Form 4797 — §1250 gain less than depreciation (unrec §1250 limited to gain)", () => {
  it("when gain < depreciation, unrecaptured §1250 equals the gain, not the depreciation", () => {
    // Adjusted basis = 400000 - 120000 = 280000, sale = 300000, gain = 20000
    // Unrec §1250 = min(20000, 120000) = 20000
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Building with modest appreciation",
          costOrBasis: "400000",
          depreciationAllowed: "120000",
          grossSalesPrice: "300000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    };
    const result = calculateFederalTax(fixture);

    expect(result.form4797!.partIIRecapture.toNumber()).toBe(0);
    expect(result.form4797!.longTermCapitalGain.toNumber()).toBe(20000);
    // Unrecaptured = min(gain=20000, depreciation=120000) = 20000
    expect(result.form4797!.totalUnrecapturedSection1250Gain.toNumber()).toBe(20000);
  });
});
