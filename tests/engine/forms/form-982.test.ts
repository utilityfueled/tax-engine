/**
 * Tests for Form 982 — Reduction of Tax Attributes Due to Discharge of Indebtedness.
 * Spec: spec/federal/form-982.yaml
 *
 * Covers: general attribute reduction order (IRC §108(b)(2)), credit one-third
 * reduction rule (§108(b)(3)(B)), qualified principal residence basis-only
 * reduction (§108(h)(1)), qualified real property business basis-only reduction
 * (§108(c)(1)(A)), §108(b)(5) election to reduce depreciable basis first,
 * qualified farm indebtedness, edge cases, and audit trail.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm982, type Form982Attributes } from "@/engine/forms/form-982.js";

const ZERO = new Decimal(0);

function attrs(overrides: Partial<Form982Attributes> = {}): Form982Attributes {
  return {
    nolCarryforward: overrides.nolCarryforward ?? ZERO,
    generalBusinessCreditCarryforward: overrides.generalBusinessCreditCarryforward ?? ZERO,
    minimumTaxCreditCarryforward: overrides.minimumTaxCreditCarryforward ?? ZERO,
    capitalLossCarryforward: overrides.capitalLossCarryforward ?? ZERO,
    aggregateBasisOfProperty: overrides.aggregateBasisOfProperty ?? ZERO,
    passiveActivityLossCarryforward: overrides.passiveActivityLossCarryforward ?? ZERO,
    foreignTaxCreditCarryforward: overrides.foreignTaxCreditCarryforward ?? ZERO,
    basisOfDepreciableProperty: overrides.basisOfDepreciableProperty ?? ZERO,
    basisOfPrincipalResidence: overrides.basisOfPrincipalResidence ?? ZERO,
    basisOfDepreciableRealProperty: overrides.basisOfDepreciableRealProperty ?? ZERO,
  };
}

describe("Form 982 Reduction of Tax Attributes", () => {
  // ── General Reduction Order (IRC §108(b)(2)) ───────────────────────

  describe("General Reduction Order", () => {
    it("Form 982 general reduction order - NOL reduced first", () => {
      const result = calculateForm982({
        bankruptcyExclusion: new Decimal(10000),
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({ nolCarryforward: new Decimal(25000) }),
      });
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(15000));
      expect(result.totalReduction).toEqual(new Decimal(10000));
    });

    it("Form 982 general reduction order - NOL fully consumed then moves to GBC", () => {
      const result = calculateForm982({
        bankruptcyExclusion: new Decimal(15000),
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(5000),
          generalBusinessCreditCarryforward: new Decimal(10000),
        }),
      });
      expect(result.reducedAttributes.nolCarryforward).toEqual(ZERO);
      // GBC reduced by 1/3 per dollar: 10000 remaining * 0.3333... = ~3333
      expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(
        new Decimal(10000).minus(new Decimal(10000).times("0.3333333333333333").toDecimalPlaces(2))
      );
    });

    it("Form 982 general reduction order - GBC reduced at 33.33 cents per dollar", () => {
      const result = calculateForm982({
        insolvencyExclusion: new Decimal(9000),
        bankruptcyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          generalBusinessCreditCarryforward: new Decimal(5000),
        }),
      });
      // 9000 * 1/3 = 3000 credit reduction, but only 5000 available
      // 3000 < 5000, so GBC reduced by 3000
      expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(new Decimal(2000));
    });

    it("Form 982 general reduction order - MTC reduced at 33.33 cents per dollar", () => {
      const result = calculateForm982({
        insolvencyExclusion: new Decimal(6000),
        bankruptcyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          minimumTaxCreditCarryforward: new Decimal(5000),
        }),
      });
      // 6000 * 1/3 = 2000 credit reduction
      expect(result.reducedAttributes.minimumTaxCreditCarryforward).toEqual(new Decimal(3000));
    });

    it("Form 982 general reduction order - capital loss reduced after credits", () => {
      const result = calculateForm982({
        insolvencyExclusion: new Decimal(8000),
        bankruptcyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          capitalLossCarryforward: new Decimal(10000),
        }),
      });
      // No NOL, no credits → full 8000 hits capital loss dollar-for-dollar
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(new Decimal(2000));
    });

    it("Form 982 general reduction order - basis reduced after capital loss", () => {
      const result = calculateForm982({
        insolvencyExclusion: new Decimal(12000),
        bankruptcyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          capitalLossCarryforward: new Decimal(5000),
          aggregateBasisOfProperty: new Decimal(50000),
        }),
      });
      // Capital loss eats 5000, remaining 7000 hits basis
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(ZERO);
      expect(result.reducedAttributes.aggregateBasisOfProperty).toEqual(new Decimal(43000));
    });

    it("Form 982 general reduction order - passive losses reduced after basis", () => {
      const result = calculateForm982({
        insolvencyExclusion: new Decimal(20000),
        bankruptcyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          aggregateBasisOfProperty: new Decimal(10000),
          passiveActivityLossCarryforward: new Decimal(15000),
        }),
      });
      // Basis eats 10000, remaining 10000 hits passive losses
      expect(result.reducedAttributes.aggregateBasisOfProperty).toEqual(ZERO);
      expect(result.reducedAttributes.passiveActivityLossCarryforward).toEqual(new Decimal(5000));
    });

    it("Form 982 general reduction order - FTC reduced last", () => {
      const result = calculateForm982({
        insolvencyExclusion: new Decimal(9000),
        bankruptcyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          foreignTaxCreditCarryforward: new Decimal(12000),
        }),
      });
      // 9000 * 1/3 = 3000 credit reduction
      expect(result.reducedAttributes.foreignTaxCreditCarryforward).toEqual(new Decimal(9000));
    });

    it("Form 982 general reduction order - full waterfall across all attributes", () => {
      const result = calculateForm982({
        bankruptcyExclusion: new Decimal(50000),
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(10000),
          generalBusinessCreditCarryforward: new Decimal(6000),
          minimumTaxCreditCarryforward: new Decimal(3000),
          capitalLossCarryforward: new Decimal(8000),
          aggregateBasisOfProperty: new Decimal(20000),
          passiveActivityLossCarryforward: new Decimal(5000),
          foreignTaxCreditCarryforward: new Decimal(9000),
        }),
      });
      // NOL: 50000 → 10000 consumed, 40000 remaining
      expect(result.reducedAttributes.nolCarryforward).toEqual(ZERO);
      // GBC: 40000 * 1/3 = 13333.33, but only 6000 available → 6000 consumed
      //   Excluded income consumed by this: 6000 / (1/3) = 18000
      expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(ZERO);
      // Remaining after GBC: 40000 - 18000 = 22000
      // MTC: 22000 * 1/3 = 7333.33, but only 3000 available → 3000 consumed
      //   Excluded income consumed: 3000 / (1/3) = 9000
      expect(result.reducedAttributes.minimumTaxCreditCarryforward).toEqual(ZERO);
      // Remaining after MTC: 22000 - 9000 = 13000
      // Capital loss: 13000, but only 8000 available → 8000 consumed
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(ZERO);
      // Remaining: 5000
      // Basis: 5000, 20000 available → 5000 consumed
      expect(result.reducedAttributes.aggregateBasisOfProperty).toEqual(new Decimal(15000));
      // Remaining: 0 → no further reductions
      expect(result.reducedAttributes.passiveActivityLossCarryforward).toEqual(new Decimal(5000));
      expect(result.reducedAttributes.foreignTaxCreditCarryforward).toEqual(new Decimal(9000));
    });

    it("excluded amount exhausted before reaching later attributes", () => {
      const result = calculateForm982({
        insolvencyExclusion: new Decimal(3000),
        bankruptcyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(10000),
          capitalLossCarryforward: new Decimal(5000),
          foreignTaxCreditCarryforward: new Decimal(2000),
        }),
      });
      // NOL absorbs all 3000
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(7000));
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(new Decimal(5000));
      expect(result.reducedAttributes.foreignTaxCreditCarryforward).toEqual(new Decimal(2000));
    });
  });

  // ── Combined Bankruptcy + Insolvency ───────────────────────────────

  describe("Combined Exclusions", () => {
    it("bankruptcy and insolvency exclusions are summed for general reduction", () => {
      const result = calculateForm982({
        bankruptcyExclusion: new Decimal(20000),
        insolvencyExclusion: new Decimal(5000),
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(30000),
        }),
      });
      // 25000 total general exclusion → reduce NOL by 25000
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(5000));
    });
  });

  // ── Qualified Principal Residence (§108(h)(1)) ─────────────────────

  describe("Qualified Principal Residence Exclusion", () => {
    it("Form 982 qualified principal residence - reduces only residence basis", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: new Decimal(80000),
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(50000),
          capitalLossCarryforward: new Decimal(20000),
          basisOfPrincipalResidence: new Decimal(200000),
        }),
      });
      // Only residence basis is reduced — other attributes untouched
      expect(result.reducedAttributes.basisOfPrincipalResidence).toEqual(new Decimal(120000));
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(50000));
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(new Decimal(20000));
    });

    it("qualified principal residence exclusion exceeds basis - no spillover", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: new Decimal(150000),
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(50000),
          basisOfPrincipalResidence: new Decimal(100000),
        }),
      });
      // Basis goes to zero, excess 50000 does NOT reduce NOL
      expect(result.reducedAttributes.basisOfPrincipalResidence).toEqual(ZERO);
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(50000));
    });

    it("qualified principal residence with zero basis", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: new Decimal(50000),
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          basisOfPrincipalResidence: ZERO,
          nolCarryforward: new Decimal(30000),
        }),
      });
      // No reduction possible
      expect(result.reducedAttributes.basisOfPrincipalResidence).toEqual(ZERO);
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(30000));
    });

    it("qualified principal residence combined with insolvency exclusion", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: new Decimal(15000),
        qualifiedPrincipalResidenceExclusion: new Decimal(40000),
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          basisOfPrincipalResidence: new Decimal(200000),
          nolCarryforward: new Decimal(20000),
        }),
      });
      // QPR: reduce residence basis by 40000 → 160000
      // Insolvency: reduce NOL by 15000 → 5000
      expect(result.reducedAttributes.basisOfPrincipalResidence).toEqual(new Decimal(160000));
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(5000));
    });
  });

  // ── Qualified Real Property Business (§108(c)(1)(A)) ───────────────

  describe("Qualified Real Property Business Exclusion", () => {
    it("Form 982 qualified real property business - reduces only depreciable real property basis", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: new Decimal(30000),
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(50000),
          basisOfDepreciableRealProperty: new Decimal(100000),
        }),
      });
      expect(result.reducedAttributes.basisOfDepreciableRealProperty).toEqual(new Decimal(70000));
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(50000));
    });

    it("qualified real property business exclusion exceeds depreciable real property basis - no spillover", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: new Decimal(120000),
        electBasisReductionFirst: false,
        attributes: attrs({
          basisOfDepreciableRealProperty: new Decimal(80000),
          nolCarryforward: new Decimal(50000),
        }),
      });
      expect(result.reducedAttributes.basisOfDepreciableRealProperty).toEqual(ZERO);
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(50000));
    });
  });

  // ── Qualified Farm (§108(g)) ───────────────────────────────────────

  describe("Qualified Farm Exclusion", () => {
    it("Form 982 qualified farm - reduces depreciable property basis then general order", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: new Decimal(25000),
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          basisOfDepreciableProperty: new Decimal(15000),
          nolCarryforward: new Decimal(20000),
        }),
      });
      // Farm: reduce depreciable property basis first by 15000
      // Then remaining 10000 goes through general order → NOL
      expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(ZERO);
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(10000));
    });

    it("qualified farm exclusion fully absorbed by depreciable basis", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: new Decimal(10000),
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          basisOfDepreciableProperty: new Decimal(50000),
          nolCarryforward: new Decimal(20000),
        }),
      });
      expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(new Decimal(40000));
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(20000));
    });
  });

  // ── §108(b)(5) Election ────────────────────────────────────────────

  describe("Section 108(b)(5) Election", () => {
    it("Form 982 section 108(b)(5) election - depreciable basis reduced first", () => {
      const result = calculateForm982({
        insolvencyExclusion: new Decimal(30000),
        bankruptcyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: true,
        attributes: attrs({
          basisOfDepreciableProperty: new Decimal(50000),
          nolCarryforward: new Decimal(20000),
          capitalLossCarryforward: new Decimal(10000),
        }),
      });
      // Election: depreciable basis first → absorbs 30000
      expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(new Decimal(20000));
      // Other attributes untouched
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(20000));
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(new Decimal(10000));
    });

    it("section 108(b)(5) election with insufficient depreciable basis - remainder to general order", () => {
      const result = calculateForm982({
        bankruptcyExclusion: new Decimal(20000),
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: true,
        attributes: attrs({
          basisOfDepreciableProperty: new Decimal(8000),
          nolCarryforward: new Decimal(15000),
        }),
      });
      // Election: depreciable basis absorbs 8000, remaining 12000 to general order
      expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(ZERO);
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(3000));
    });

    it("section 108(b)(5) election does not apply to qualified principal residence exclusion", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: new Decimal(50000),
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: true,
        attributes: attrs({
          basisOfDepreciableProperty: new Decimal(100000),
          basisOfPrincipalResidence: new Decimal(200000),
        }),
      });
      // QPR still goes to residence basis only, regardless of election
      expect(result.reducedAttributes.basisOfPrincipalResidence).toEqual(new Decimal(150000));
      expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(new Decimal(100000));
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("zero excluded amount produces no reductions", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(10000),
          capitalLossCarryforward: new Decimal(5000),
        }),
      });
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(10000));
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(new Decimal(5000));
      expect(result.totalReduction).toEqual(ZERO);
    });

    it("all attributes are zero - nothing to reduce", () => {
      const result = calculateForm982({
        bankruptcyExclusion: new Decimal(50000),
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs(),
      });
      expect(result.totalReduction).toEqual(ZERO);
      expect(result.unreducedExclusion).toEqual(new Decimal(50000));
    });

    it("excluded amount exceeds all attributes - attributes go to zero with unreduced remainder", () => {
      const result = calculateForm982({
        insolvencyExclusion: new Decimal(100000),
        bankruptcyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(5000),
          capitalLossCarryforward: new Decimal(3000),
          aggregateBasisOfProperty: new Decimal(10000),
        }),
      });
      expect(result.reducedAttributes.nolCarryforward).toEqual(ZERO);
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(ZERO);
      expect(result.reducedAttributes.aggregateBasisOfProperty).toEqual(ZERO);
      expect(result.unreducedExclusion.greaterThan(0)).toBe(true);
    });

    it("attributes never go below zero", () => {
      const result = calculateForm982({
        bankruptcyExclusion: new Decimal(999999),
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(100),
          generalBusinessCreditCarryforward: new Decimal(50),
          minimumTaxCreditCarryforward: new Decimal(25),
          capitalLossCarryforward: new Decimal(200),
          aggregateBasisOfProperty: new Decimal(300),
          passiveActivityLossCarryforward: new Decimal(150),
          foreignTaxCreditCarryforward: new Decimal(75),
        }),
      });
      expect(result.reducedAttributes.nolCarryforward.isNegative()).toBe(false);
      expect(result.reducedAttributes.generalBusinessCreditCarryforward.isNegative()).toBe(false);
      expect(result.reducedAttributes.minimumTaxCreditCarryforward.isNegative()).toBe(false);
      expect(result.reducedAttributes.capitalLossCarryforward.isNegative()).toBe(false);
      expect(result.reducedAttributes.aggregateBasisOfProperty.isNegative()).toBe(false);
      expect(result.reducedAttributes.passiveActivityLossCarryforward.isNegative()).toBe(false);
      expect(result.reducedAttributes.foreignTaxCreditCarryforward.isNegative()).toBe(false);
    });

    it("audit trail records each reduction step", () => {
      const result = calculateForm982({
        insolvencyExclusion: new Decimal(20000),
        bankruptcyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(8000),
          capitalLossCarryforward: new Decimal(5000),
        }),
      });
      const lineNames = result.lines.map((l) => l.line);
      expect(lineNames).toContain("part2-line4");
      expect(lineNames).toContain("part2-line7");
    });

    it("multiple exclusion types each apply their own reduction rules", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: new Decimal(10000),
        qualifiedPrincipalResidenceExclusion: new Decimal(50000),
        qualifiedFarmExclusion: new Decimal(15000),
        qualifiedRealPropertyBusinessExclusion: new Decimal(20000),
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(30000),
          basisOfPrincipalResidence: new Decimal(300000),
          basisOfDepreciableProperty: new Decimal(100000),
          basisOfDepreciableRealProperty: new Decimal(80000),
        }),
      });
      // QPR: residence basis 300000 → 250000
      expect(result.reducedAttributes.basisOfPrincipalResidence).toEqual(new Decimal(250000));
      // QRPB: depreciable real property 80000 → 60000
      expect(result.reducedAttributes.basisOfDepreciableRealProperty).toEqual(new Decimal(60000));
      // Farm: depreciable property 100000 → 85000
      expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(new Decimal(85000));
      // Insolvency: NOL 30000 → 20000
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(20000));
    });
  });

  // ── Realistic Scenarios ────────────────────────────────────────────

  describe("Realistic Scenarios", () => {
    it("bankruptcy filer with multiple carryforwards", () => {
      const result = calculateForm982({
        bankruptcyExclusion: new Decimal(45000),
        insolvencyExclusion: ZERO,
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          nolCarryforward: new Decimal(12000),
          generalBusinessCreditCarryforward: new Decimal(3000),
          capitalLossCarryforward: new Decimal(7000),
          aggregateBasisOfProperty: new Decimal(100000),
        }),
      });
      // NOL: 45000 → 12000 consumed, 33000 remaining
      expect(result.reducedAttributes.nolCarryforward).toEqual(ZERO);
      // GBC: 33000 * 1/3 = 11000, but only 3000 available
      //   Income consumed: 3000 / (1/3) = 9000
      expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(ZERO);
      // Remaining: 33000 - 9000 = 24000
      // Capital loss: 24000, only 7000 available
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(ZERO);
      // Remaining: 17000 → basis
      expect(result.reducedAttributes.aggregateBasisOfProperty).toEqual(new Decimal(83000));
    });

    it("insolvent homeowner with mortgage modification", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: new Decimal(30000),
        qualifiedPrincipalResidenceExclusion: new Decimal(45000),
        qualifiedFarmExclusion: ZERO,
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          basisOfPrincipalResidence: new Decimal(250000),
          nolCarryforward: new Decimal(10000),
          capitalLossCarryforward: new Decimal(5000),
        }),
      });
      // QPR: residence basis 250000 → 205000
      expect(result.reducedAttributes.basisOfPrincipalResidence).toEqual(new Decimal(205000));
      // Insolvency: NOL 10000 → 0, remaining 20000
      expect(result.reducedAttributes.nolCarryforward).toEqual(ZERO);
      // Capital loss: 5000 → 0, remaining 15000
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(ZERO);
    });

    it("farmer with both farm and insolvency exclusions", () => {
      const result = calculateForm982({
        bankruptcyExclusion: ZERO,
        insolvencyExclusion: new Decimal(20000),
        qualifiedPrincipalResidenceExclusion: ZERO,
        qualifiedFarmExclusion: new Decimal(35000),
        qualifiedRealPropertyBusinessExclusion: ZERO,
        electBasisReductionFirst: false,
        attributes: attrs({
          basisOfDepreciableProperty: new Decimal(60000),
          nolCarryforward: new Decimal(25000),
          capitalLossCarryforward: new Decimal(10000),
        }),
      });
      // Farm: depreciable basis 60000 → 25000
      expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(new Decimal(25000));
      // Insolvency: NOL 25000 → 5000
      expect(result.reducedAttributes.nolCarryforward).toEqual(new Decimal(5000));
      expect(result.reducedAttributes.capitalLossCarryforward).toEqual(new Decimal(10000));
    });
  });
});
