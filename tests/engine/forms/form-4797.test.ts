/**
 * Tests for Form 4797 — Sales of Business Property
 * Spec: spec/federal/form-4797.yaml
 *
 * Part I:   Section 1231 gains and losses
 * Part II:  Ordinary gains and losses (recapture + short-term)
 * Part III: Per-property depreciation recapture (§§1245, 1250)
 */

import { describe, expect, it } from "vitest";
import { calculateForm4797 } from "@/engine/forms/form-4797.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

// ── Part I: Section 1231 (existing tests, preserved) ────────────

describe("Form 4797 Part I section 1231 summary", () => {
  it("Form 4797 Line 7 - supported Schedule K-1 box 10 gains and nonpassive losses default into Part I", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      scheduleK1: [
        {
          partnershipName: "Gain LP",
          partnershipEIN: "11-1111111",
          ordinaryIncome: "0",
          section1231Gain: "7000",
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
    });

    expect(result.line7.toNumber()).toBe(5000);
    expect(result.line11.toNumber()).toBe(0);

    const line7 = result.lines.find((line) => line.line === "7");
    expect(String(line7?.inputs["Supported attached Schedule K-1 box 10 gains"])).toBe("7000");
    expect(String(line7?.inputs["Supported attached nonpassive Schedule K-1 box 10 losses"])).toBe("-2000");
    expect(String(line7?.inputs["Deferred passive Schedule K-1 box 10 losses"])).toBe("-1500");
  });

  it("Form 4797 Line 8 - prior-year nonrecaptured section 1231 losses limit the current-year capital-gain treatment", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        netSection1231GainOrLoss: "12000",
        nonrecapturedNetSection1231Losses: "4000",
      },
    });

    expect(result.line8.toNumber()).toBe(4000);
    expect(result.line12.toNumber()).toBe(4000);
  });

  it("Form 4797 Line 9 - the remaining section 1231 gain becomes long-term capital gain after the lookback recapture", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        netSection1231GainOrLoss: "12000",
        nonrecapturedNetSection1231Losses: "4000",
      },
    });

    expect(result.line9.toNumber()).toBe(8000);
    expect(result.longTermCapitalGain.toNumber()).toBe(8000);
  });

  it("Form 4797 Line 11 - net section 1231 losses remain ordinary losses", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        netSection1231GainOrLoss: "-3500",
        nonrecapturedNetSection1231Losses: "0",
      },
    });

    expect(result.line11.toNumber()).toBe(-3500);
    expect(result.ordinaryGainOrLoss.toNumber()).toBe(-3500);
  });

  it("Form 4797 Line 12 - net section 1231 gains are recaptured as ordinary income up to prior nonrecaptured losses", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        netSection1231GainOrLoss: "6000",
        nonrecapturedNetSection1231Losses: "9000",
      },
    });

    expect(result.line9.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(6000);
    expect(result.ordinaryGainOrLoss.toNumber()).toBe(6000);
  });
});

// ── Part III: Section 1245 recapture ────────────────────────────

describe("Form 4797 Part III section 1245 recapture", () => {
  it("Part III Line 25a - section 1245 recaptures all depreciation as ordinary income when gain exceeds depreciation", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Office equipment",
          costOrBasis: "100000",
          depreciationAllowed: "60000",
          grossSalesPrice: "120000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 100000 - 60000 = 40000
    // Total gain = 120000 - 40000 = 80000
    // Section 1245 recapture = min(80000, 60000) = 60000 (ordinary)
    // Non-recapture gain = 80000 - 60000 = 20000 (section 1231)
    const pr = result.propertyResults[0];
    expect(pr.adjustedBasis.toNumber()).toBe(40000);
    expect(pr.totalGain.toNumber()).toBe(80000);
    expect(pr.section1245Recapture.toNumber()).toBe(60000);
    expect(pr.nonRecaptureGain.toNumber()).toBe(20000);
    expect(pr.section1231Gain.toNumber()).toBe(20000);
    expect(pr.unrecapturedSection1250Gain.toNumber()).toBe(0);
  });

  it("Part III Line 25a - section 1245 recapture is limited to total gain when gain is less than depreciation", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Delivery van",
          costOrBasis: "50000",
          depreciationAllowed: "35000",
          grossSalesPrice: "30000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 50000 - 35000 = 15000
    // Total gain = 30000 - 15000 = 15000
    // Section 1245 recapture = min(15000, 35000) = 15000 (all gain is ordinary)
    // Non-recapture gain = 0
    const pr = result.propertyResults[0];
    expect(pr.totalGain.toNumber()).toBe(15000);
    expect(pr.section1245Recapture.toNumber()).toBe(15000);
    expect(pr.nonRecaptureGain.toNumber()).toBe(0);
    expect(pr.section1231Gain.toNumber()).toBe(0);
  });

  it("Part III Line 25a - section 1245 recapture equals gain exactly when gain equals depreciation", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Computer equipment",
          costOrBasis: "10000",
          depreciationAllowed: "10000",
          grossSalesPrice: "10000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 10000 - 10000 = 0
    // Total gain = 10000 - 0 = 10000
    // Section 1245 recapture = min(10000, 10000) = 10000
    const pr = result.propertyResults[0];
    expect(pr.adjustedBasis.toNumber()).toBe(0);
    expect(pr.totalGain.toNumber()).toBe(10000);
    expect(pr.section1245Recapture.toNumber()).toBe(10000);
    expect(pr.nonRecaptureGain.toNumber()).toBe(0);
  });

  it("Part III does not apply to section 1245 property sold at a loss — loss goes to Part I as section 1231 loss", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Manufacturing equipment",
          costOrBasis: "80000",
          depreciationAllowed: "20000",
          grossSalesPrice: "50000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 80000 - 20000 = 60000
    // Sale price = 50000 < 60000 → loss of -10000
    // Part III: total gain = 0, recapture = 0
    // Loss goes to Part I as section 1231 loss
    const pr = result.propertyResults[0];
    expect(pr.totalGain.toNumber()).toBe(0);
    expect(pr.totalGainOrLoss.toNumber()).toBe(-10000);
    expect(pr.section1245Recapture.toNumber()).toBe(0);
    expect(result.line7.toNumber()).toBe(-10000);
    expect(result.line11.toNumber()).toBe(-10000);
    expect(result.ordinaryGainOrLoss.toNumber()).toBe(-10000);
  });

  it("Part III - section 1245 property with zero depreciation has no recapture", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "New equipment (placed in service this year, no depreciation yet)",
          costOrBasis: "25000",
          depreciationAllowed: "0",
          grossSalesPrice: "28000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 25000 - 0 = 25000
    // Total gain = 28000 - 25000 = 3000
    // Recapture = min(3000, 0) = 0 → entire gain is section 1231
    const pr = result.propertyResults[0];
    expect(pr.section1245Recapture.toNumber()).toBe(0);
    expect(pr.section1231Gain.toNumber()).toBe(3000);
  });
});

// ── Part III: Section 1250 recapture ────────────────────────────

describe("Form 4797 Part III section 1250 recapture", () => {
  it("Part III Line 25b - post-1986 MACRS real property has $0 ordinary recapture (all straight-line)", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Rental building (post-1986 MACRS 27.5-year)",
          costOrBasis: "200000",
          depreciationAllowed: "50000",
          grossSalesPrice: "280000",
          propertyType: "section1250",
          // straightLineDepreciation defaults to depreciationAllowed
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 200000 - 50000 = 150000
    // Total gain = 280000 - 150000 = 130000
    // §1250 recapture = min(130000, excess over SL) = min(130000, 0) = 0
    // Non-recapture gain = 130000
    // Unrecaptured §1250 = min(130000, 50000 - 0) = 50000 (25% rate)
    // Section 1231 gain = 130000 (flows to Part I)
    const pr = result.propertyResults[0];
    expect(pr.section1250Recapture.toNumber()).toBe(0);
    expect(pr.totalRecapture.toNumber()).toBe(0);
    expect(pr.nonRecaptureGain.toNumber()).toBe(130000);
    expect(pr.unrecapturedSection1250Gain.toNumber()).toBe(50000);
    expect(pr.section1231Gain.toNumber()).toBe(130000);
  });

  it("Part III Line 25b - pre-1987 accelerated depreciation produces excess over straight-line recapture", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Commercial building (pre-1987 accelerated)",
          costOrBasis: "300000",
          depreciationAllowed: "180000",
          straightLineDepreciation: "150000",
          grossSalesPrice: "350000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 300000 - 180000 = 120000
    // Total gain = 350000 - 120000 = 230000
    // Excess depreciation = 180000 - 150000 = 30000
    // §1250 recapture = min(230000, 30000) = 30000 (ordinary)
    // Non-recapture gain = 230000 - 30000 = 200000
    // Unrecaptured §1250 = min(200000, 180000 - 30000) = min(200000, 150000) = 150000 (25% rate)
    // Section 1231 gain = 200000
    const pr = result.propertyResults[0];
    expect(pr.section1250Recapture.toNumber()).toBe(30000);
    expect(pr.nonRecaptureGain.toNumber()).toBe(200000);
    expect(pr.unrecapturedSection1250Gain.toNumber()).toBe(150000);
    expect(pr.section1231Gain.toNumber()).toBe(200000);
  });

  it("Part III - section 1250 unrecaptured gain is limited when gain is less than total depreciation", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Rental building sold for modest gain",
          costOrBasis: "200000",
          depreciationAllowed: "80000",
          grossSalesPrice: "150000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 200000 - 80000 = 120000
    // Total gain = 150000 - 120000 = 30000
    // §1250 recapture = 0 (post-1986 MACRS, SL = total)
    // Unrecaptured §1250 = min(30000, 80000) = 30000 (gain < depreciation)
    const pr = result.propertyResults[0];
    expect(pr.totalGain.toNumber()).toBe(30000);
    expect(pr.unrecapturedSection1250Gain.toNumber()).toBe(30000);
  });

  it("Part III - section 1250 property sold at a loss has no recapture and no unrecaptured gain", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Rental duplex",
          costOrBasis: "250000",
          depreciationAllowed: "40000",
          grossSalesPrice: "190000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 250000 - 40000 = 210000
    // Sale = 190000 → loss of -20000
    const pr = result.propertyResults[0];
    expect(pr.totalGain.toNumber()).toBe(0);
    expect(pr.totalGainOrLoss.toNumber()).toBe(-20000);
    expect(pr.section1250Recapture.toNumber()).toBe(0);
    expect(pr.unrecapturedSection1250Gain.toNumber()).toBe(0);
    expect(result.line7.toNumber()).toBe(-20000);
  });

  it("Part III - section 1250 with explicit straight-line equal to total depreciation yields $0 excess", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "39-year commercial building (SL MACRS)",
          costOrBasis: "500000",
          depreciationAllowed: "100000",
          straightLineDepreciation: "100000",
          grossSalesPrice: "650000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    });

    const pr = result.propertyResults[0];
    expect(pr.section1250Recapture.toNumber()).toBe(0);
    expect(pr.unrecapturedSection1250Gain.toNumber()).toBe(100000);
  });

  it("Part III - section 1250 gain exactly equal to excess depreciation recaptures fully with no unrecaptured remainder", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Pre-1987 building, small gain",
          costOrBasis: "100000",
          depreciationAllowed: "60000",
          straightLineDepreciation: "40000",
          grossSalesPrice: "60000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 100000 - 60000 = 40000
    // Total gain = 60000 - 40000 = 20000
    // Excess depreciation = 60000 - 40000 = 20000
    // §1250 recapture = min(20000, 20000) = 20000 (all ordinary)
    // Non-recapture gain = 0
    // Unrecaptured §1250 = min(0, 60000 - 20000) = 0
    const pr = result.propertyResults[0];
    expect(pr.section1250Recapture.toNumber()).toBe(20000);
    expect(pr.nonRecaptureGain.toNumber()).toBe(0);
    expect(pr.unrecapturedSection1250Gain.toNumber()).toBe(0);
  });
});

// ── Part II: Ordinary gains aggregation ─────────────────────────

describe("Form 4797 Part II ordinary gains", () => {
  it("Part II Line 17 - aggregates recapture from multiple Part III properties", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [
          {
            description: "Equipment A",
            costOrBasis: "50000",
            depreciationAllowed: "30000",
            grossSalesPrice: "45000",
            propertyType: "section1245",
            heldMoreThanOneYear: true,
          },
          {
            description: "Equipment B",
            costOrBasis: "20000",
            depreciationAllowed: "15000",
            grossSalesPrice: "18000",
            propertyType: "section1245",
            heldMoreThanOneYear: true,
          },
        ],
      },
    });

    // Equipment A: basis=20000, gain=25000, recapture=min(25000,30000)=25000
    // Equipment B: basis=5000, gain=13000, recapture=min(13000,15000)=13000
    // Total recapture = 25000 + 13000 = 38000
    expect(result.partIIRecapture.toNumber()).toBe(38000);
  });

  it("Part II Line 18a - short-term property gain is entirely ordinary", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Equipment held 6 months",
          costOrBasis: "10000",
          depreciationAllowed: "3000",
          grossSalesPrice: "12000",
          propertyType: "section1245",
          heldMoreThanOneYear: false,
        }],
      },
    });

    // Adjusted basis = 10000 - 3000 = 7000
    // Total gain = 12000 - 7000 = 5000
    // Recapture (§1245) = min(5000, 3000) = 3000
    // Non-recapture gain = 2000 (but short-term, so stays in Part II)
    expect(result.partIIRecapture.toNumber()).toBe(3000);
    expect(result.partIIShortTermOrdinary.toNumber()).toBe(2000);
    expect(result.partIIOrdinaryTotal.toNumber()).toBe(5000);
    // No section 1231 treatment for short-term
    expect(result.propertyResults[0].section1231Gain.toNumber()).toBe(0);
    expect(result.line7.toNumber()).toBe(0);
  });

  it("Part II Line 18a - short-term property loss is ordinary", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Equipment held 3 months, sold at loss",
          costOrBasis: "15000",
          depreciationAllowed: "2000",
          grossSalesPrice: "10000",
          propertyType: "section1245",
          heldMoreThanOneYear: false,
        }],
      },
    });

    // Adjusted basis = 15000 - 2000 = 13000
    // Sale = 10000, loss = -3000
    // No recapture (loss), but loss is ordinary (short-term)
    expect(result.partIIRecapture.toNumber()).toBe(0);
    expect(result.partIIShortTermOrdinary.toNumber()).toBe(-3000);
    expect(result.partIIOrdinaryTotal.toNumber()).toBe(-3000);
    expect(result.ordinaryGainOrLoss.toNumber()).toBe(-3000);
  });

  it("Part II Line 18b - combines recapture and short-term amounts", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [
          {
            description: "Old equipment (long-term, gain)",
            costOrBasis: "40000",
            depreciationAllowed: "40000",
            grossSalesPrice: "15000",
            propertyType: "section1245",
            heldMoreThanOneYear: true,
          },
          {
            description: "New equipment (short-term, gain)",
            costOrBasis: "8000",
            depreciationAllowed: "1000",
            grossSalesPrice: "10000",
            propertyType: "section1245",
            heldMoreThanOneYear: false,
          },
        ],
      },
    });

    // Old: basis=0, gain=15000, recapture=min(15000,40000)=15000
    // New: basis=7000, gain=3000, recapture=min(3000,1000)=1000, ST non-recapture=2000
    expect(result.partIIRecapture.toNumber()).toBe(16000);
    expect(result.partIIShortTermOrdinary.toNumber()).toBe(2000);
    expect(result.partIIOrdinaryTotal.toNumber()).toBe(18000);
  });
});

// ── Integration: Part III flows to Part I ───────────────────────

describe("Form 4797 Part III to Part I integration", () => {
  it("Part III non-recapture section 1231 gain adds to Part I line 7 alongside K-1 defaults", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Fund LP",
        partnershipEIN: "11-1111111",
        ordinaryIncome: "0",
        section1231Gain: "5000",
        isPassiveActivity: false,
      }],
      form4797: {
        propertySales: [{
          description: "Office equipment",
          costOrBasis: "100000",
          depreciationAllowed: "60000",
          grossSalesPrice: "120000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // K-1 §1231 gain = 5000
    // Property sale: gain=80000, recapture=60000, §1231 remainder=20000
    // Part I line 7 = 5000 + 20000 = 25000
    expect(result.line7.toNumber()).toBe(25000);
    expect(result.longTermCapitalGain.toNumber()).toBe(25000);
  });

  it("Part III section 1231 loss reduces Part I line 7", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [
          {
            description: "Equipment sold at gain",
            costOrBasis: "50000",
            depreciationAllowed: "30000",
            grossSalesPrice: "55000",
            propertyType: "section1245",
            heldMoreThanOneYear: true,
          },
          {
            description: "Equipment sold at loss",
            costOrBasis: "80000",
            depreciationAllowed: "10000",
            grossSalesPrice: "50000",
            propertyType: "section1245",
            heldMoreThanOneYear: true,
          },
        ],
      },
    });

    // Sale 1: basis=20000, gain=35000, recapture=min(35000,30000)=30000, §1231=5000
    // Sale 2: basis=70000, loss=-20000, §1231 loss=-20000
    // Line 7 = 5000 + (-20000) = -15000
    expect(result.line7.toNumber()).toBe(-15000);
    expect(result.line11.toNumber()).toBe(-15000);
    // Ordinary = Part I ordinary (-15000) + Part II recapture (30000) = 15000
    expect(result.ordinaryGainOrLoss.toNumber()).toBe(15000);
  });

  it("validated line 7 override takes precedence over property sale and K-1 defaults", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        netSection1231GainOrLoss: "50000",
        propertySales: [{
          description: "Equipment",
          costOrBasis: "100000",
          depreciationAllowed: "60000",
          grossSalesPrice: "120000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Override takes precedence for Part I Line 7
    expect(result.line7.toNumber()).toBe(50000);
    // But Part III recapture still computes and goes to Part II
    expect(result.partIIRecapture.toNumber()).toBe(60000);
    expect(result.partIIOrdinaryTotal.toNumber()).toBe(60000);
  });
});

// ── Integration: Unrecaptured §1250 gain ────────────────────────

describe("Form 4797 unrecaptured section 1250 gain", () => {
  it("aggregates unrecaptured §1250 gain from multiple section 1250 property sales", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [
          {
            description: "Rental building A",
            costOrBasis: "200000",
            depreciationAllowed: "50000",
            grossSalesPrice: "280000",
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
          {
            description: "Rental building B",
            costOrBasis: "300000",
            depreciationAllowed: "30000",
            grossSalesPrice: "350000",
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
        ],
      },
    });

    // Building A: gain=130000, unrec §1250=min(130000,50000)=50000
    // Building B: basis=270000, gain=80000, unrec §1250=min(80000,30000)=30000
    expect(result.totalUnrecapturedSection1250Gain.toNumber()).toBe(80000);
  });

  it("section 1245 property contributes $0 to unrecaptured section 1250 gain", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Equipment",
          costOrBasis: "100000",
          depreciationAllowed: "60000",
          grossSalesPrice: "120000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    expect(result.totalUnrecapturedSection1250Gain.toNumber()).toBe(0);
  });
});

// ── Combined ordinary routing ───────────────────────────────────

describe("Form 4797 combined ordinary gain or loss", () => {
  it("combines Part I ordinary with Part II recapture and short-term ordinary", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        nonrecapturedNetSection1231Losses: "5000",
        propertySales: [
          {
            description: "Equipment (long-term gain with recapture)",
            costOrBasis: "50000",
            depreciationAllowed: "30000",
            grossSalesPrice: "70000",
            propertyType: "section1245",
            heldMoreThanOneYear: true,
          },
          {
            description: "Furniture (short-term gain)",
            costOrBasis: "5000",
            depreciationAllowed: "1000",
            grossSalesPrice: "7000",
            propertyType: "section1245",
            heldMoreThanOneYear: false,
          },
        ],
      },
    });

    // Equipment: basis=20000, gain=50000, recapture=min(50000,30000)=30000, §1231=20000
    // Furniture: basis=4000, gain=3000, recapture=min(3000,1000)=1000, ST non-recapture=2000
    //
    // Part I: line 7 = 20000, lookback recapture = min(20000,5000)=5000 → line 12
    //   line 9 (LTCG) = 20000 - 5000 = 15000, line 12 (ordinary) = 5000
    // Part II: recapture = 30000+1000 = 31000, short-term = 2000 → total = 33000
    // Combined ordinary = (0 + 5000) + 33000 = 38000
    expect(result.partIIRecapture.toNumber()).toBe(31000);
    expect(result.partIIShortTermOrdinary.toNumber()).toBe(2000);
    expect(result.partIIOrdinaryTotal.toNumber()).toBe(33000);
    expect(result.line12.toNumber()).toBe(5000);
    expect(result.ordinaryGainOrLoss.toNumber()).toBe(38000);
    expect(result.longTermCapitalGain.toNumber()).toBe(15000);
  });
});

// ── Realistic scenarios ─────────────────────────────────────────

describe("Form 4797 realistic scenarios", () => {
  it("self-employed selling fully depreciated equipment — all gain is ordinary", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Laptop and monitors",
          costOrBasis: "3000",
          depreciationAllowed: "3000",
          grossSalesPrice: "800",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Basis = 0, gain = 800, recapture = min(800, 3000) = 800
    // All ordinary, no §1231
    const pr = result.propertyResults[0];
    expect(pr.totalGain.toNumber()).toBe(800);
    expect(pr.section1245Recapture.toNumber()).toBe(800);
    expect(pr.section1231Gain.toNumber()).toBe(0);
    expect(result.ordinaryGainOrLoss.toNumber()).toBe(800);
  });

  it("rental property sale — split between ordinary (recapture), 25% rate, and 15%/20% rate", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Residential rental property",
          costOrBasis: "250000",
          depreciationAllowed: "70000",
          grossSalesPrice: "320000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 250000 - 70000 = 180000
    // Total gain = 320000 - 180000 = 140000
    // §1250 recapture = $0 (post-1986 MACRS SL)
    // Non-recapture gain = 140000
    // Unrecaptured §1250 = min(140000, 70000) = 70000 (taxed at 25% max)
    // §1231 gain = 140000 → flows to Part I → Schedule D
    // Remaining LTCG after 25% rate = 140000 - 70000 = 70000 (taxed at 15%/20%)
    const pr = result.propertyResults[0];
    expect(pr.section1250Recapture.toNumber()).toBe(0);
    expect(pr.unrecapturedSection1250Gain.toNumber()).toBe(70000);
    expect(pr.section1231Gain.toNumber()).toBe(140000);
    expect(result.partIIRecapture.toNumber()).toBe(0);
    expect(result.line7.toNumber()).toBe(140000);
    expect(result.longTermCapitalGain.toNumber()).toBe(140000);
  });

  it("mixed portfolio — equipment sale, building sale, and K-1 section 1231", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      scheduleK1: [{
        partnershipName: "Industrial LP",
        partnershipEIN: "44-5566778",
        ordinaryIncome: "0",
        section1231Gain: "8000",
        isPassiveActivity: false,
      }],
      form4797: {
        nonrecapturedNetSection1231Losses: "3000",
        propertySales: [
          {
            description: "CNC machine (§1245)",
            costOrBasis: "120000",
            depreciationAllowed: "90000",
            grossSalesPrice: "80000",
            propertyType: "section1245",
            heldMoreThanOneYear: true,
          },
          {
            description: "Warehouse (§1250)",
            costOrBasis: "400000",
            depreciationAllowed: "100000",
            grossSalesPrice: "500000",
            propertyType: "section1250",
            heldMoreThanOneYear: true,
          },
        ],
      },
    });

    // CNC: basis=30000, gain=50000, recapture=min(50000,90000)=50000, §1231=0
    // Warehouse: basis=300000, gain=200000, §1250 recapture=0, unrec §1250=min(200000,100000)=100000, §1231=200000
    // K-1: §1231=8000
    //
    // Part I line 7 = 0 + 200000 + 8000 = 208000
    // Lookback: min(208000, 3000) = 3000 → line 12 = 3000
    // Line 9 (LTCG) = 208000 - 3000 = 205000
    //
    // Part II: recapture = 50000 + 0 = 50000
    // Combined ordinary = (0 + 3000) + 50000 = 53000
    expect(result.partIIRecapture.toNumber()).toBe(50000);
    expect(result.line7.toNumber()).toBe(208000);
    expect(result.line12.toNumber()).toBe(3000);
    expect(result.longTermCapitalGain.toNumber()).toBe(205000);
    expect(result.ordinaryGainOrLoss.toNumber()).toBe(53000);
    expect(result.totalUnrecapturedSection1250Gain.toNumber()).toBe(100000);
  });

  it("property sold at break-even — no gain, no loss, no recapture", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Equipment sold for adjusted basis",
          costOrBasis: "50000",
          depreciationAllowed: "20000",
          grossSalesPrice: "30000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    // Adjusted basis = 30000, sale = 30000, gain = 0
    const pr = result.propertyResults[0];
    expect(pr.totalGain.toNumber()).toBe(0);
    expect(pr.totalGainOrLoss.toNumber()).toBe(0);
    expect(pr.section1245Recapture.toNumber()).toBe(0);
    expect(result.ordinaryGainOrLoss.toNumber()).toBe(0);
  });

  it("no property sales — Part II and III contribute zero", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        netSection1231GainOrLoss: "10000",
        nonrecapturedNetSection1231Losses: "0",
      },
    });

    expect(result.propertyResults.length).toBe(0);
    expect(result.partIIRecapture.toNumber()).toBe(0);
    expect(result.partIIShortTermOrdinary.toNumber()).toBe(0);
    expect(result.partIIOrdinaryTotal.toNumber()).toBe(0);
    expect(result.totalUnrecapturedSection1250Gain.toNumber()).toBe(0);
    expect(result.longTermCapitalGain.toNumber()).toBe(10000);
  });
});

// ── Audit trail ─────────────────────────────────────────────────

describe("Form 4797 audit trail", () => {
  it("records per-property Part III lines in the audit trail", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Forklift",
          costOrBasis: "40000",
          depreciationAllowed: "25000",
          grossSalesPrice: "35000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    const costLine = result.lines.find((l) => l.line === "20 (Forklift)");
    expect(costLine).toBeDefined();
    expect(costLine!.value.toNumber()).toBe(40000);

    const deprecLine = result.lines.find((l) => l.line === "21 (Forklift)");
    expect(deprecLine).toBeDefined();
    expect(deprecLine!.value.toNumber()).toBe(25000);

    const recaptureLine = result.lines.find((l) => l.line === "25a (Forklift)");
    expect(recaptureLine).toBeDefined();
    // gain = 35000 - 15000 = 20000, recapture = min(20000, 25000) = 20000
    expect(recaptureLine!.value.toNumber()).toBe(20000);
  });

  it("records Part II aggregation lines in the audit trail", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Equipment",
          costOrBasis: "10000",
          depreciationAllowed: "6000",
          grossSalesPrice: "12000",
          propertyType: "section1245",
          heldMoreThanOneYear: true,
        }],
      },
    });

    const line17 = result.lines.find((l) => l.form === "Form 4797" && l.line === "17");
    expect(line17).toBeDefined();
    // gain = 12000 - 4000 = 8000, recapture = min(8000, 6000) = 6000
    expect(line17!.value.toNumber()).toBe(6000);
  });

  it("records unrecaptured section 1250 gain in audit trail for section 1250 property", () => {
    const result = calculateForm4797({
      ...simpleW2Fixture,
      form4797: {
        propertySales: [{
          description: "Rental building",
          costOrBasis: "200000",
          depreciationAllowed: "50000",
          grossSalesPrice: "280000",
          propertyType: "section1250",
          heldMoreThanOneYear: true,
        }],
      },
    });

    const unrec = result.lines.find((l) => l.line === "unrec1250 (Rental building)");
    expect(unrec).toBeDefined();
    expect(unrec!.value.toNumber()).toBe(50000);

    const unrecTotal = result.lines.find((l) => l.line === "unrec1250-total");
    expect(unrecTotal).toBeDefined();
    expect(unrecTotal!.value.toNumber()).toBe(50000);
  });
});
