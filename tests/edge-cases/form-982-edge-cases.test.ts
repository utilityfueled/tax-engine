/**
 * Edge case tests for Form 982 — Reduction of Tax Attributes Due to Discharge of Indebtedness
 * Spec: spec/federal/form-982.yaml
 *
 * Covers: 1/3 credit reduction rounding precision, farm + §108(b)(5) election
 * interaction on shared depreciable basis, QRPB + farm on different basis types,
 * PAL exhaustion mid-cascade, FTC as sole reducer, single-attribute isolation,
 * exclusion exactly equaling total attributes, very small amounts, income consumed
 * when credit is fully exhausted, and mixed exclusion type ordering.
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateForm982, type Form982Attributes, type Form982Input } from "@/engine/forms/form-982.js";

const ZERO = new Decimal(0);
const d = (v: string | number) => new Decimal(v);

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

function makeInput(overrides: Partial<Form982Input> = {}): Form982Input {
  return {
    bankruptcyExclusion: ZERO,
    insolvencyExclusion: ZERO,
    qualifiedPrincipalResidenceExclusion: ZERO,
    qualifiedFarmExclusion: ZERO,
    qualifiedRealPropertyBusinessExclusion: ZERO,
    electBasisReductionFirst: false,
    attributes: attrs(),
    ...overrides,
  };
}

// ── 1/3 Credit Reduction Rounding Precision ──────────────────────

describe("Form 982 - Credit reduction rounding precision", () => {
  it("Form 982 GBC - $1 excluded income produces $0.33 credit reduction (ROUND_HALF_UP)", () => {
    // 1 * (1/3) = 0.3333... → rounds to 0.33
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(1),
      attributes: attrs({
        generalBusinessCreditCarryforward: d(1000),
      }),
    }));
    expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(d("999.67"));
  });

  it("Form 982 GBC - $2 excluded income produces $0.67 credit reduction (ROUND_HALF_UP)", () => {
    // 2 * (1/3) = 0.6666... → rounds to 0.67
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(2),
      attributes: attrs({
        generalBusinessCreditCarryforward: d(1000),
      }),
    }));
    expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(d("999.33"));
  });

  it("Form 982 GBC - $3 excluded income produces exactly $1.00 credit reduction", () => {
    // 3 * (1/3) = 1.00 exactly
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(3),
      attributes: attrs({
        generalBusinessCreditCarryforward: d(1000),
      }),
    }));
    expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(d(999));
  });

  it("Form 982 GBC - $9001 excluded income: 1/3 reduction = $3000.33", () => {
    // 9001 * (1/3) = 3000.3333... → rounds to 3000.33
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(9001),
      attributes: attrs({
        generalBusinessCreditCarryforward: d(5000),
      }),
    }));
    expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(d("1999.67"));
  });

  it("Form 982 MTC - $5 excluded income produces $1.67 credit reduction (ROUND_HALF_UP)", () => {
    // 5 * (1/3) = 1.6666... → rounds to 1.67 (ROUND_HALF_UP)
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(5),
      attributes: attrs({
        minimumTaxCreditCarryforward: d(500),
      }),
    }));
    expect(result.reducedAttributes.minimumTaxCreditCarryforward).toEqual(d("498.33"));
  });

  it("Form 982 FTC - $7 excluded income produces $2.33 credit reduction", () => {
    // 7 * (1/3) = 2.3333... → rounds to 2.33
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(7),
      attributes: attrs({
        foreignTaxCreditCarryforward: d(100),
      }),
    }));
    expect(result.reducedAttributes.foreignTaxCreditCarryforward).toEqual(d("97.67"));
  });
});

// ── Credit fully consumed before remaining exclusion ─────────────

describe("Form 982 - Credit fully consumed (income consumed calculation)", () => {
  it("Form 982 GBC - credit fully consumed, income consumed = credit * 3", () => {
    // GBC $1000 available, exclusion $30000
    // Max credit reduction: 30000 * 1/3 = 10000 > 1000 → credit fully consumed
    // Income consumed: 1000 / (1/3) = 3000
    // Remaining: 30000 - 3000 = 27000 → flows to next attributes
    const result = calculateForm982(makeInput({
      bankruptcyExclusion: d(30000),
      attributes: attrs({
        generalBusinessCreditCarryforward: d(1000),
        capitalLossCarryforward: d(50000),
      }),
    }));
    expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(ZERO);
    // Capital loss absorbs remaining 27000
    expect(result.reducedAttributes.capitalLossCarryforward).toEqual(d(23000));
  });

  it("Form 982 MTC - credit fully consumed with awkward amount, income consumed rounds", () => {
    // MTC $777 available, exclusion $50000
    // Max credit reduction: 50000 * 1/3 = 16666.67 > 777 → credit fully consumed
    // Income consumed: 777 / (1/3) = 2331.00
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(50000),
      attributes: attrs({
        minimumTaxCreditCarryforward: d(777),
        capitalLossCarryforward: d(100000),
      }),
    }));
    expect(result.reducedAttributes.minimumTaxCreditCarryforward).toEqual(ZERO);
    // Remaining after MTC: 50000 - 2331 = 47669
    expect(result.reducedAttributes.capitalLossCarryforward).toEqual(d(52331));
  });

  it("Form 982 FTC - last in waterfall, credit fully consumed", () => {
    // FTC $500, exclusion $10000 (all prior attributes zero)
    // Max credit reduction: 10000 * 1/3 = 3333.33 > 500 → fully consumed
    // Income consumed: 500 / (1/3) = 1500
    // Unreduced: 10000 - 1500 = 8500
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(10000),
      attributes: attrs({
        foreignTaxCreditCarryforward: d(500),
      }),
    }));
    expect(result.reducedAttributes.foreignTaxCreditCarryforward).toEqual(ZERO);
    expect(result.unreducedExclusion).toEqual(d(8500));
  });
});

// ── Farm + §108(b)(5) interaction on shared depreciable basis ────

describe("Form 982 - Farm + §108(b)(5) interaction", () => {
  it("Form 982 farm + insolvency §108(b)(5) - both reduce depreciable property sequentially", () => {
    // Farm $20000 reduces depreciable property first (farm rule)
    // Then insolvency $30000 with election also targets depreciable property
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(30000),
      qualifiedFarmExclusion: d(20000),
      electBasisReductionFirst: true,
      attributes: attrs({
        basisOfDepreciableProperty: d(40000),
        nolCarryforward: d(50000),
      }),
    }));
    // Farm takes 20000 from depreciable (40000 → 20000)
    // §108(b)(5) takes remaining 20000 from depreciable (20000 → 0)
    // Remaining insolvency: 10000 → general order → NOL
    expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(ZERO);
    expect(result.reducedAttributes.nolCarryforward).toEqual(d(40000));
    expect(result.totalReduction).toEqual(d(50000));
  });

  it("Form 982 farm exhausts depreciable basis, §108(b)(5) finds nothing left", () => {
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(15000),
      qualifiedFarmExclusion: d(25000),
      electBasisReductionFirst: true,
      attributes: attrs({
        basisOfDepreciableProperty: d(25000),
        nolCarryforward: d(20000),
      }),
    }));
    // Farm: 25000 → depreciable fully consumed
    // Insolvency with election: depreciable = 0, so all 15000 to general order → NOL
    expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(ZERO);
    expect(result.reducedAttributes.nolCarryforward).toEqual(d(5000));
  });
});

// ── QRPB + Farm on different basis types ─────────────────────────

describe("Form 982 - QRPB + Farm basis type isolation", () => {
  it("Form 982 QRPB targets depreciable real property, farm targets depreciable property", () => {
    const result = calculateForm982(makeInput({
      qualifiedFarmExclusion: d(25000),
      qualifiedRealPropertyBusinessExclusion: d(30000),
      attributes: attrs({
        basisOfDepreciableRealProperty: d(50000),
        basisOfDepreciableProperty: d(40000),
        nolCarryforward: d(10000),
      }),
    }));
    // QRPB: depreciable real property 50000 → 20000
    // Farm: depreciable property 40000 → 15000 (25000 fully absorbed by depreciable)
    expect(result.reducedAttributes.basisOfDepreciableRealProperty).toEqual(d(20000));
    expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(d(15000));
    expect(result.reducedAttributes.nolCarryforward).toEqual(d(10000));
    expect(result.unreducedExclusion).toEqual(ZERO);
  });

  it("Form 982 QRPB exceeds real property basis - no spillover to depreciable property", () => {
    const result = calculateForm982(makeInput({
      qualifiedRealPropertyBusinessExclusion: d(60000),
      attributes: attrs({
        basisOfDepreciableRealProperty: d(40000),
        basisOfDepreciableProperty: d(100000),
        nolCarryforward: d(50000),
      }),
    }));
    // QRPB: 40000 reduced, 20000 unreduced (no spillover)
    expect(result.reducedAttributes.basisOfDepreciableRealProperty).toEqual(ZERO);
    expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(d(100000));
    expect(result.reducedAttributes.nolCarryforward).toEqual(d(50000));
    expect(result.unreducedExclusion).toEqual(d(20000));
  });
});

// ── PAL exhaustion mid-cascade ───────────────────────────────────

describe("Form 982 - Passive activity loss mid-cascade", () => {
  it("Form 982 PAL exhausted mid-waterfall, remainder flows to FTC", () => {
    // Skip NOL/GBC/MTC/capital loss/basis → PAL absorbs some, FTC takes rest
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(15000),
      attributes: attrs({
        passiveActivityLossCarryforward: d(10000),
        foreignTaxCreditCarryforward: d(9000),
      }),
    }));
    // PAL absorbs 10000, remaining 5000 → FTC at 1/3 rate
    // FTC reduction: 5000 * 1/3 = 1666.67
    expect(result.reducedAttributes.passiveActivityLossCarryforward).toEqual(ZERO);
    expect(result.reducedAttributes.foreignTaxCreditCarryforward).toEqual(d("7333.33"));
  });

  it("Form 982 PAL is sole attribute - fully consumed with unreduced remainder", () => {
    const result = calculateForm982(makeInput({
      bankruptcyExclusion: d(25000),
      attributes: attrs({
        passiveActivityLossCarryforward: d(8000),
      }),
    }));
    expect(result.reducedAttributes.passiveActivityLossCarryforward).toEqual(ZERO);
    expect(result.unreducedExclusion).toEqual(d(17000));
    expect(result.totalReduction).toEqual(d(8000));
  });
});

// ── Single-attribute isolation ───────────────────────────────────

describe("Form 982 - Single attribute as sole reducer", () => {
  it("Form 982 only NOL available - absorbs exclusion", () => {
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(5000),
      attributes: attrs({ nolCarryforward: d(8000) }),
    }));
    expect(result.reducedAttributes.nolCarryforward).toEqual(d(3000));
    expect(result.unreducedExclusion).toEqual(ZERO);
  });

  it("Form 982 only capital loss available - absorbs exclusion", () => {
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(5000),
      attributes: attrs({ capitalLossCarryforward: d(8000) }),
    }));
    expect(result.reducedAttributes.capitalLossCarryforward).toEqual(d(3000));
    expect(result.unreducedExclusion).toEqual(ZERO);
  });

  it("Form 982 only aggregate basis available - absorbs exclusion", () => {
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(5000),
      attributes: attrs({ aggregateBasisOfProperty: d(8000) }),
    }));
    expect(result.reducedAttributes.aggregateBasisOfProperty).toEqual(d(3000));
    expect(result.unreducedExclusion).toEqual(ZERO);
  });

  it("Form 982 only GBC available - 1/3 reduction, partial income consumed", () => {
    // GBC $8000, exclusion $5000
    // Credit reduction: 5000 * 1/3 = 1666.67
    // Credit available > reduction → all $5000 income consumed
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(5000),
      attributes: attrs({ generalBusinessCreditCarryforward: d(8000) }),
    }));
    expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(d("6333.33"));
    expect(result.unreducedExclusion).toEqual(ZERO);
  });

  it("Form 982 only FTC available - 1/3 reduction, insufficient credit", () => {
    // FTC $100, exclusion $5000
    // Max reduction: 5000 * 1/3 = 1666.67 > 100 → credit fully consumed
    // Income consumed: 100 / (1/3) = 300
    // Unreduced: 4700
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(5000),
      attributes: attrs({ foreignTaxCreditCarryforward: d(100) }),
    }));
    expect(result.reducedAttributes.foreignTaxCreditCarryforward).toEqual(ZERO);
    expect(result.unreducedExclusion).toEqual(d(4700));
  });
});

// ── Exclusion exactly equals total attributes ────────────────────

describe("Form 982 - Exclusion exactly equals total attributes", () => {
  it("Form 982 exclusion exactly matches single dollar-for-dollar attribute", () => {
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(10000),
      attributes: attrs({ nolCarryforward: d(10000) }),
    }));
    expect(result.reducedAttributes.nolCarryforward).toEqual(ZERO);
    expect(result.unreducedExclusion).toEqual(ZERO);
    expect(result.totalReduction).toEqual(d(10000));
  });

  it("Form 982 exclusion exactly matches combined dollar-for-dollar attributes", () => {
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(15000),
      attributes: attrs({
        nolCarryforward: d(5000),
        capitalLossCarryforward: d(3000),
        aggregateBasisOfProperty: d(7000),
      }),
    }));
    expect(result.reducedAttributes.nolCarryforward).toEqual(ZERO);
    expect(result.reducedAttributes.capitalLossCarryforward).toEqual(ZERO);
    expect(result.reducedAttributes.aggregateBasisOfProperty).toEqual(ZERO);
    expect(result.unreducedExclusion).toEqual(ZERO);
  });

  it("Form 982 QPR exclusion exactly equals residence basis", () => {
    const result = calculateForm982(makeInput({
      qualifiedPrincipalResidenceExclusion: d(200000),
      attributes: attrs({ basisOfPrincipalResidence: d(200000) }),
    }));
    expect(result.reducedAttributes.basisOfPrincipalResidence).toEqual(ZERO);
    expect(result.unreducedExclusion).toEqual(ZERO);
    expect(result.totalReduction).toEqual(d(200000));
  });
});

// ── Very small amounts ───────────────────────────────────────────

describe("Form 982 - Very small amounts", () => {
  it("Form 982 $1 exclusion against $1 NOL", () => {
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(1),
      attributes: attrs({ nolCarryforward: d(1) }),
    }));
    expect(result.reducedAttributes.nolCarryforward).toEqual(ZERO);
    expect(result.unreducedExclusion).toEqual(ZERO);
  });

  it("Form 982 $1 exclusion against $1 GBC - 1/3 rate leaves 67 cents", () => {
    // 1 * 1/3 = 0.33 credit reduction; GBC 1.00 → 0.67
    // All $1 of income is consumed (credit not fully exhausted)
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(1),
      attributes: attrs({ generalBusinessCreditCarryforward: d(1) }),
    }));
    expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(d("0.67"));
    expect(result.unreducedExclusion).toEqual(ZERO);
  });

  it("Form 982 $1 QPR exclusion against $1 residence basis", () => {
    const result = calculateForm982(makeInput({
      qualifiedPrincipalResidenceExclusion: d(1),
      attributes: attrs({ basisOfPrincipalResidence: d(1) }),
    }));
    expect(result.reducedAttributes.basisOfPrincipalResidence).toEqual(ZERO);
    expect(result.totalReduction).toEqual(d(1));
  });
});

// ── Ordering: QPR → QRPB → Farm → General ───────────────────────

describe("Form 982 - Processing order across all exclusion types", () => {
  it("Form 982 all five exclusion types applied in statutory order", () => {
    const result = calculateForm982(makeInput({
      qualifiedPrincipalResidenceExclusion: d(10000),
      qualifiedRealPropertyBusinessExclusion: d(15000),
      qualifiedFarmExclusion: d(20000),
      bankruptcyExclusion: d(5000),
      insolvencyExclusion: d(5000),
      attributes: attrs({
        basisOfPrincipalResidence: d(50000),
        basisOfDepreciableRealProperty: d(50000),
        basisOfDepreciableProperty: d(30000),
        nolCarryforward: d(20000),
      }),
    }));
    // QPR: residence 50000 → 40000
    expect(result.reducedAttributes.basisOfPrincipalResidence).toEqual(d(40000));
    // QRPB: depreciable real property 50000 → 35000
    expect(result.reducedAttributes.basisOfDepreciableRealProperty).toEqual(d(35000));
    // Farm: depreciable property 30000 → 10000 (20000 consumed)
    expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(d(10000));
    // General (bankruptcy 5000 + insolvency 5000 = 10000): NOL 20000 → 10000
    expect(result.reducedAttributes.nolCarryforward).toEqual(d(10000));
    expect(result.unreducedExclusion).toEqual(ZERO);
  });

  it("Form 982 farm remainder spills to general order after depreciable basis", () => {
    const result = calculateForm982(makeInput({
      qualifiedFarmExclusion: d(30000),
      attributes: attrs({
        basisOfDepreciableProperty: d(10000),
        nolCarryforward: d(5000),
        generalBusinessCreditCarryforward: d(6000),
        capitalLossCarryforward: d(10000),
      }),
    }));
    // Farm: depreciable 10000 consumed, 20000 remainder → general order
    // General: NOL 5000 consumed (remaining 15000)
    //   GBC: 15000 * 1/3 = 5000 < 6000 → GBC reduced by 5000 (all income consumed)
    expect(result.reducedAttributes.basisOfDepreciableProperty).toEqual(ZERO);
    expect(result.reducedAttributes.nolCarryforward).toEqual(ZERO);
    expect(result.reducedAttributes.generalBusinessCreditCarryforward).toEqual(d(1000));
    expect(result.reducedAttributes.capitalLossCarryforward).toEqual(d(10000));
    expect(result.unreducedExclusion).toEqual(ZERO);
  });
});

// ── unreducedExclusion tracking ──────────────────────────────────

describe("Form 982 - unreducedExclusion tracking", () => {
  it("Form 982 QPR + QRPB both have unreduced amounts", () => {
    const result = calculateForm982(makeInput({
      qualifiedPrincipalResidenceExclusion: d(50000),
      qualifiedRealPropertyBusinessExclusion: d(40000),
      attributes: attrs({
        basisOfPrincipalResidence: d(30000),
        basisOfDepreciableRealProperty: d(25000),
      }),
    }));
    // QPR: 30000 reduced, 20000 unreduced
    // QRPB: 25000 reduced, 15000 unreduced
    expect(result.unreducedExclusion).toEqual(d(35000));
    expect(result.totalReduction).toEqual(d(55000));
  });

  it("Form 982 general exclusion fully absorbed - zero unreduced", () => {
    const result = calculateForm982(makeInput({
      bankruptcyExclusion: d(10000),
      attributes: attrs({
        nolCarryforward: d(50000),
      }),
    }));
    expect(result.unreducedExclusion).toEqual(ZERO);
    expect(result.totalReduction).toEqual(d(10000));
  });

  it("Form 982 general exclusion exceeds all attributes - tracks unreduced", () => {
    const result = calculateForm982(makeInput({
      insolvencyExclusion: d(20000),
      attributes: attrs({
        nolCarryforward: d(3000),
        capitalLossCarryforward: d(2000),
      }),
    }));
    // 5000 absorbed, 15000 unreduced
    expect(result.unreducedExclusion).toEqual(d(15000));
  });
});
