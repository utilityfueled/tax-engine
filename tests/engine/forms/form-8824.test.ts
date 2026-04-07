/**
 * Tests for Form 8824 — Like-Kind Exchanges (§1031)
 * Spec: spec/federal/form-8824.yaml
 *
 * Covers Part III computation (Lines 12–25): boot calculation, realized
 * gain, boot-limited recognition, depreciation recapture allocation,
 * deferred gain, and replacement property basis.
 *
 * Ref: IRS Form 8824 Instructions (2025); IRC §1031; Pub 544.
 */

import { describe, expect, it } from "vitest";
import { calculateForm8824, calculateForm8824Aggregate } from "@/engine/forms/form-8824.js";
import type { Form8824Input } from "@/models/inputs.js";

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function makeExchange(overrides: Partial<Form8824Input> = {}): Form8824Input {
  return {
    description: "Rental property exchange",
    recognizedGainCharacter: "section1231",
    fmvOtherPropertyGivenUp: "0",
    adjustedBasisOtherPropertyGivenUp: "0",
    cashReceived: "0",
    fmvOtherPropertyReceived: "0",
    liabilitiesRelinquished: "0",
    liabilitiesAssumed: "0",
    exchangeExpenses: "0",
    fmvLikeKindPropertyReceived: "500000",
    adjustedBasisLikeKindPropertyGivenUp: "300000",
    depreciationRecapture: "0",
    isRelatedParty: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Line 14 — Gain/loss on other (non-like-kind) property
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — other property gain/loss (Line 14)", () => {
  it("Line 14 — gain on other property given up is fully recognized", () => {
    const result = calculateForm8824(makeExchange({
      fmvOtherPropertyGivenUp: "20000",
      adjustedBasisOtherPropertyGivenUp: "12000",
    }));
    // Gain = 20000 - 12000 = 8000
    expect(result.line14GainLossOtherProperty.toNumber()).toBe(8000);
  });

  it("Line 14 — loss on other property given up is recognized", () => {
    const result = calculateForm8824(makeExchange({
      fmvOtherPropertyGivenUp: "10000",
      adjustedBasisOtherPropertyGivenUp: "15000",
    }));
    // Loss = 10000 - 15000 = -5000
    expect(result.line14GainLossOtherProperty.toNumber()).toBe(-5000);
  });

  it("Line 14 — zero when no other property involved", () => {
    const result = calculateForm8824(makeExchange());
    expect(result.line14GainLossOtherProperty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 15 — Boot received
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — boot received (Line 15)", () => {
  it("Line 15 — cash boot received", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "50000",
    }));
    expect(result.line15BootReceived.toNumber()).toBe(50000);
  });

  it("Line 15 — net liability relief boot", () => {
    const result = calculateForm8824(makeExchange({
      liabilitiesRelinquished: "500000",
      liabilitiesAssumed: "300000",
    }));
    // Net liability relief = 500000 - 300000 = 200000
    expect(result.line15BootReceived.toNumber()).toBe(200000);
  });

  it("Line 15 — negative net liability relief does not reduce boot", () => {
    // Taxpayer assumed more debt than relinquished — no boot from liability
    const result = calculateForm8824(makeExchange({
      liabilitiesRelinquished: "200000",
      liabilitiesAssumed: "350000",
    }));
    // max(200000 - 350000, 0) = 0
    expect(result.line15BootReceived.toNumber()).toBe(0);
  });

  it("Line 15 — exchange expenses reduce boot", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "30000",
      exchangeExpenses: "8000",
    }));
    // 30000 - 8000 = 22000
    expect(result.line15BootReceived.toNumber()).toBe(22000);
  });

  it("Line 15 — exchange expenses cannot reduce boot below zero", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "5000",
      exchangeExpenses: "12000",
    }));
    // max(0, 5000 - 12000) = 0
    expect(result.line15BootReceived.toNumber()).toBe(0);
  });

  it("Line 15 — combined boot: cash + FMV other received + net liability relief - expenses", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "10000",
      fmvOtherPropertyReceived: "5000",
      liabilitiesRelinquished: "400000",
      liabilitiesAssumed: "380000",
      exchangeExpenses: "3000",
    }));
    // net liability relief = 20000
    // gross boot = 10000 + 5000 + 20000 = 35000
    // boot = 35000 - 3000 = 32000
    expect(result.line15BootReceived.toNumber()).toBe(32000);
  });
});

// ═══════════════════════════════════════════════════════════
// No boot exchange — full deferral
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — no boot (pure like-kind swap)", () => {
  it("pure like-kind swap defers entire realized gain", () => {
    const result = calculateForm8824(makeExchange({
      fmvLikeKindPropertyReceived: "500000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
    }));
    // Realized gain = 500000 - 300000 = 200000
    expect(result.line19RealizedGainLoss.toNumber()).toBe(200000);
    // No boot → recognized gain = 0
    expect(result.line20RecognizedGain.toNumber()).toBe(0);
    // Deferred = 200000 - 0 = 200000
    expect(result.line24DeferredGainLoss.toNumber()).toBe(200000);
    // Basis = 300000 + 0 + 0 - 0 = 300000 (carries old basis)
    expect(result.line25BasisLikeKindPropertyReceived.toNumber()).toBe(300000);
  });

  it("pure swap — basis equals old basis (deferred gain embedded)", () => {
    const result = calculateForm8824(makeExchange({
      fmvLikeKindPropertyReceived: "800000",
      adjustedBasisLikeKindPropertyGivenUp: "250000",
    }));
    // No boot → basis = old basis = 250000
    expect(result.line25BasisLikeKindPropertyReceived.toNumber()).toBe(250000);
    // Deferred gain = 550000
    expect(result.line24DeferredGainLoss.toNumber()).toBe(550000);
    // Verify: FMV - deferred = 800000 - 550000 = 250000 ✓
  });
});

// ═══════════════════════════════════════════════════════════
// Cash boot received — partial recognition
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — cash boot triggers partial recognition", () => {
  it("recognized gain equals boot when boot < realized gain", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "50000",
      fmvLikeKindPropertyReceived: "450000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
    }));
    // Total value received = 50000 + 450000 = 500000
    // Realized gain = 500000 - 300000 = 200000
    // Recognized = min(50000, 200000) = 50000
    expect(result.line19RealizedGainLoss.toNumber()).toBe(200000);
    expect(result.line20RecognizedGain.toNumber()).toBe(50000);
    expect(result.line24DeferredGainLoss.toNumber()).toBe(150000);
    // Basis = 300000 + 0 + 50000 - 50000 = 300000
    expect(result.line25BasisLikeKindPropertyReceived.toNumber()).toBe(300000);
  });
});

// ═══════════════════════════════════════════════════════════
// Boot exceeds realized gain
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — boot exceeds realized gain", () => {
  it("recognized gain limited to realized gain, not boot amount", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "50000",
      fmvLikeKindPropertyReceived: "280000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
    }));
    // Total value = 50000 + 280000 = 330000
    // Realized gain = 330000 - 300000 = 30000
    // Recognized = min(50000, 30000) = 30000
    expect(result.line19RealizedGainLoss.toNumber()).toBe(30000);
    expect(result.line20RecognizedGain.toNumber()).toBe(30000);
    expect(result.line24DeferredGainLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Realized loss
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — realized loss", () => {
  it("realized loss is deferred, not recognized", () => {
    const result = calculateForm8824(makeExchange({
      fmvLikeKindPropertyReceived: "250000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
    }));
    // Realized = 250000 - 300000 = -50000
    expect(result.line19RealizedGainLoss.toNumber()).toBe(-50000);
    // No gain recognized on a loss
    expect(result.line20RecognizedGain.toNumber()).toBe(0);
    // Deferred loss = -50000 - 0 = -50000
    expect(result.line24DeferredGainLoss.toNumber()).toBe(-50000);
    // Basis = 300000 + 0 + 0 - 0 = 300000 (inflated basis embeds the deferred loss)
    expect(result.line25BasisLikeKindPropertyReceived.toNumber()).toBe(300000);
  });

  it("realized loss with boot — loss still deferred, boot still zero recognition", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "20000",
      fmvLikeKindPropertyReceived: "250000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
    }));
    // Total value = 20000 + 250000 = 270000
    // Realized = 270000 - 300000 = -30000
    expect(result.line19RealizedGainLoss.toNumber()).toBe(-30000);
    // min(20000, max(-30000, 0)) = min(20000, 0) = 0
    expect(result.line20RecognizedGain.toNumber()).toBe(0);
    // Deferred = -30000 - (0 + 0) = -30000
    expect(result.line24DeferredGainLoss.toNumber()).toBe(-30000);
    // Basis = 300000 + 0 + 0 - 20000 = 280000
    expect(result.line25BasisLikeKindPropertyReceived.toNumber()).toBe(280000);
  });
});

// ═══════════════════════════════════════════════════════════
// Depreciation recapture (Line 21)
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — depreciation recapture (Line 21)", () => {
  it("recapture is limited to boot-limited gain", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "40000",
      fmvLikeKindPropertyReceived: "460000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
      depreciationRecapture: "60000",
    }));
    // Realized = 500000 - 300000 = 200000
    // Recognized = min(40000, 200000) = 40000
    // Recapture = min(60000, 40000) = 40000
    expect(result.line21OrdinaryIncome.toNumber()).toBe(40000);
    // Capital = 40000 - 40000 = 0
    expect(result.line22CapitalGain.toNumber()).toBe(0);
  });

  it("recapture less than recognized gain — remainder is capital gain", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "80000",
      fmvLikeKindPropertyReceived: "420000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
      depreciationRecapture: "25000",
    }));
    // Realized = 500000 - 300000 = 200000
    // Recognized = min(80000, 200000) = 80000
    // Recapture = min(25000, 80000) = 25000
    expect(result.line21OrdinaryIncome.toNumber()).toBe(25000);
    // Capital = 80000 - 25000 = 55000
    expect(result.line22CapitalGain.toNumber()).toBe(55000);
  });

  it("no recapture when recognized gain is zero", () => {
    const result = calculateForm8824(makeExchange({
      depreciationRecapture: "50000",
      // No boot, so recognized gain = 0
    }));
    expect(result.line21OrdinaryIncome.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 23 — Total recognized gain
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — total recognized gain (Line 23)", () => {
  it("Line 23 — equals ordinary recapture plus remaining recognized exchange gain", () => {
    const result = calculateForm8824(makeExchange({
      fmvOtherPropertyGivenUp: "20000",
      adjustedBasisOtherPropertyGivenUp: "12000",
      cashReceived: "30000",
      fmvLikeKindPropertyReceived: "470000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
      depreciationRecapture: "5000",
    }));
    // Other property gain = 20000 - 12000 = 8000
    // Total value = 30000 + 470000 = 500000
    // Realized = 500000 - 300000 = 200000
    // Recognized = min(30000, 200000) = 30000
    // Recapture = min(5000, 30000) = 5000
    // Capital = 30000 - 5000 = 25000
    // Line 23 = 5000 + 25000 = 30000
    expect(result.line23TotalRecognizedGain.toNumber()).toBe(30000);
  });

  it("Line 24 — deferred exchange gain ignores separately recognized Line 14 gain", () => {
    const result = calculateForm8824(makeExchange({
      fmvOtherPropertyGivenUp: "20000",
      adjustedBasisOtherPropertyGivenUp: "12000",
      cashReceived: "30000",
      fmvLikeKindPropertyReceived: "470000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
      depreciationRecapture: "5000",
    }));

    // Line 19 realized exchange gain = 200000
    // Line 23 recognized exchange gain = 30000
    // Deferred exchange gain = 200000 - 30000 = 170000
    expect(result.line24DeferredGainLoss.toNumber()).toBe(170000);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 25 — Basis of replacement property
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — basis of like-kind property received (Line 25)", () => {
  it("basis with partial recognition: old basis + recognized - boot", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "50000",
      fmvLikeKindPropertyReceived: "450000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
    }));
    // Line 25 = 300000 + 0 + 50000 - 50000 = 300000
    expect(result.line25BasisLikeKindPropertyReceived.toNumber()).toBe(300000);
    // Verify equivalence: FMV - deferred = 450000 - 150000 = 300000
    expect(
      result.line16FmvLikeKindPropertyReceived
        .minus(result.line24DeferredGainLoss)
        .toNumber()
    ).toBe(300000);
  });

  it("basis cross-check: FMV received minus deferred gain", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "100000",
      fmvLikeKindPropertyReceived: "600000",
      adjustedBasisLikeKindPropertyGivenUp: "400000",
    }));
    // Total value = 700000; Realized = 300000
    // Recognized = min(100000, 300000) = 100000
    // Deferred = 300000 - 100000 = 200000
    // Basis = 400000 + 0 + 100000 - 100000 = 400000
    // Cross-check: 600000 - 200000 = 400000 ✓
    expect(result.line25BasisLikeKindPropertyReceived.toNumber()).toBe(400000);
    expect(
      result.line16FmvLikeKindPropertyReceived
        .minus(result.line24DeferredGainLoss)
        .toNumber()
    ).toBe(400000);
  });

  it("basis with other property and recapture", () => {
    const result = calculateForm8824(makeExchange({
      fmvOtherPropertyGivenUp: "15000",
      adjustedBasisOtherPropertyGivenUp: "10000",
      cashReceived: "25000",
      fmvLikeKindPropertyReceived: "475000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
      depreciationRecapture: "10000",
    }));
    // Other gain = 5000; Total value = 25000 + 475000 = 500000
    // Realized = 200000; Recognized = min(25000, 200000) = 25000
    // Recapture = min(10000, 25000) = 10000
    // Line 23 = 10000 + 15000 = 25000
    // Line 25 = 300000 + 25000 - 25000 = 300000
    expect(result.line25BasisLikeKindPropertyReceived.toNumber()).toBe(300000);
  });
});

// ═══════════════════════════════════════════════════════════
// Net liability relief boot
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — net liability relief as boot", () => {
  it("mortgage relief creates debt boot triggering recognition", () => {
    const result = calculateForm8824(makeExchange({
      liabilitiesRelinquished: "500000",
      liabilitiesAssumed: "300000",
      fmvLikeKindPropertyReceived: "700000",
      adjustedBasisLikeKindPropertyGivenUp: "400000",
    }));
    // Boot = net liability relief = 200000
    // Total value = 200000 + 700000 = 900000
    // Realized = 900000 - 400000 = 500000
    // Recognized = min(200000, 500000) = 200000
    expect(result.line15BootReceived.toNumber()).toBe(200000);
    expect(result.line20RecognizedGain.toNumber()).toBe(200000);
    // Deferred = 500000 - 200000 = 300000
    expect(result.line24DeferredGainLoss.toNumber()).toBe(300000);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple exchanges
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — multiple exchanges (aggregate)", () => {
  it("each exchange computed independently; gains do not offset", () => {
    const result = calculateForm8824Aggregate([
      // Exchange 1: gain with boot
      makeExchange({
        cashReceived: "30000",
        fmvLikeKindPropertyReceived: "470000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        depreciationRecapture: "10000",
      }),
      // Exchange 2: smaller gain, no boot
      makeExchange({
        fmvLikeKindPropertyReceived: "200000",
        adjustedBasisLikeKindPropertyGivenUp: "150000",
      }),
    ]);
    expect(result.exchanges).toHaveLength(2);
    // Exchange 1: recognized = 30000, recapture = 10000, capital = 20000
    expect(result.exchanges[0].line20RecognizedGain.toNumber()).toBe(30000);
    expect(result.exchanges[0].line21OrdinaryIncome.toNumber()).toBe(10000);
    expect(result.exchanges[0].line22CapitalGain.toNumber()).toBe(20000);
    // Exchange 2: no boot → recognized = 0
    expect(result.exchanges[1].line20RecognizedGain.toNumber()).toBe(0);
    // Aggregate totals
    expect(result.totalOrdinaryIncome.toNumber()).toBe(10000);
    expect(result.totalCapitalGain.toNumber()).toBe(20000);
  });

  it("single exchange aggregate matches direct calculation", () => {
    const input = makeExchange({
      cashReceived: "20000",
      fmvLikeKindPropertyReceived: "480000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
    });
    const direct = calculateForm8824(input);
    const aggregate = calculateForm8824Aggregate([input]);
    expect(aggregate.exchanges[0].line20RecognizedGain.toNumber())
      .toBe(direct.line20RecognizedGain.toNumber());
    expect(aggregate.totalCapitalGain.toNumber())
      .toBe(direct.line22CapitalGain.toNumber());
  });

  it("aggregate routing totals split Form 8824 recognized gain or loss by section 1231 versus capital character", () => {
    const result = calculateForm8824Aggregate([
      makeExchange({
        cashReceived: "20000",
        fmvLikeKindPropertyReceived: "480000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        depreciationRecapture: "5000",
        // line 23 = 15000 after $5,000 ordinary recapture
      }),
      makeExchange({
        recognizedGainCharacter: "capital",
        fmvOtherPropertyGivenUp: "7000",
        adjustedBasisOtherPropertyGivenUp: "10000",
        cashReceived: "10000",
        fmvLikeKindPropertyReceived: "490000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        depreciationRecapture: "0",
        // line 14 = -3000, line 22 = 10000, line 23 = 7000
      }),
    ]);

    expect(result.totalOrdinaryIncome.toNumber()).toBe(5000);
    expect(result.totalSection1231RecognizedGainOrLoss.toNumber()).toBe(15000);
    expect(result.totalCapitalRecognizedGainOrLoss.toNumber()).toBe(7000);
  });
});

// ═══════════════════════════════════════════════════════════
// Comprehensive IRS-style example
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — comprehensive IRS-style example", () => {
  it("rental property exchange with mortgage, cash boot, expenses, and recapture", () => {
    // Taxpayer exchanges a rental property:
    //   Adjusted basis: $200,000
    //   Mortgage on relinquished: $150,000
    // For replacement property:
    //   FMV: $600,000
    //   Mortgage assumed: $120,000
    //   Cash received: $10,000
    //   Exchange expenses: $5,000
    //   §1250 recapture: $15,000
    const result = calculateForm8824(makeExchange({
      adjustedBasisLikeKindPropertyGivenUp: "200000",
      fmvLikeKindPropertyReceived: "600000",
      liabilitiesRelinquished: "150000",
      liabilitiesAssumed: "120000",
      cashReceived: "10000",
      exchangeExpenses: "5000",
      depreciationRecapture: "15000",
    }));

    // Boot = 10000 + 0 + max(150000-120000, 0) - 5000
    //      = 10000 + 30000 - 5000 = 35000
    expect(result.line15BootReceived.toNumber()).toBe(35000);

    // Total value = 35000 + 600000 = 635000
    expect(result.line17TotalValueReceived.toNumber()).toBe(635000);

    // Realized = 635000 - 200000 = 435000
    expect(result.line19RealizedGainLoss.toNumber()).toBe(435000);

    // Recognized = min(35000, 435000) = 35000
    expect(result.line20RecognizedGain.toNumber()).toBe(35000);

    // Recapture = min(15000, 35000) = 15000
    expect(result.line21OrdinaryIncome.toNumber()).toBe(15000);

    // Capital = 35000 - 15000 = 20000
    expect(result.line22CapitalGain.toNumber()).toBe(20000);

    // Deferred = 435000 - (0 + 35000) = 400000
    expect(result.line24DeferredGainLoss.toNumber()).toBe(400000);

    // Basis = 200000 + 0 + 35000 - 35000 = 200000
    expect(result.line25BasisLikeKindPropertyReceived.toNumber()).toBe(200000);

    // Cross-check: FMV - deferred = 600000 - 400000 = 200000 ✓
    expect(
      result.line16FmvLikeKindPropertyReceived
        .minus(result.line24DeferredGainLoss)
        .toNumber()
    ).toBe(200000);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit trail
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — audit trail", () => {
  it("produces audit lines for all Part III lines", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "10000",
      fmvLikeKindPropertyReceived: "490000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
    }));
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("12");
    expect(lineNumbers).toContain("13");
    expect(lineNumbers).toContain("14");
    expect(lineNumbers).toContain("15");
    expect(lineNumbers).toContain("16");
    expect(lineNumbers).toContain("17");
    expect(lineNumbers).toContain("18");
    expect(lineNumbers).toContain("19");
    expect(lineNumbers).toContain("20");
    expect(lineNumbers).toContain("21");
    expect(lineNumbers).toContain("22");
    expect(lineNumbers).toContain("23");
    expect(lineNumbers).toContain("24");
    expect(lineNumbers).toContain("25");
  });

  it("multi-exchange aggregate includes summary lines", () => {
    const result = calculateForm8824Aggregate([
      makeExchange({ cashReceived: "10000", fmvLikeKindPropertyReceived: "490000", adjustedBasisLikeKindPropertyGivenUp: "300000" }),
      makeExchange({ fmvLikeKindPropertyReceived: "200000", adjustedBasisLikeKindPropertyGivenUp: "180000" }),
    ]);
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("agg-ord");
    expect(lineNumbers).toContain("agg-cap");
  });
});

// ═══════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════

describe("Form 8824 — edge cases", () => {
  it("zero-for-zero exchange — all values zero except property FMV", () => {
    const result = calculateForm8824(makeExchange({
      fmvLikeKindPropertyReceived: "300000",
      adjustedBasisLikeKindPropertyGivenUp: "300000",
    }));
    expect(result.line19RealizedGainLoss.toNumber()).toBe(0);
    expect(result.line20RecognizedGain.toNumber()).toBe(0);
    expect(result.line24DeferredGainLoss.toNumber()).toBe(0);
    expect(result.line25BasisLikeKindPropertyReceived.toNumber()).toBe(300000);
  });

  it("large exchange — values in millions", () => {
    const result = calculateForm8824(makeExchange({
      cashReceived: "500000",
      fmvLikeKindPropertyReceived: "10000000",
      adjustedBasisLikeKindPropertyGivenUp: "3000000",
      liabilitiesRelinquished: "2000000",
      liabilitiesAssumed: "1500000",
      exchangeExpenses: "75000",
      depreciationRecapture: "200000",
    }));
    // Boot = 500000 + 0 + 500000 - 75000 = 925000
    expect(result.line15BootReceived.toNumber()).toBe(925000);
    // Total value = 925000 + 10000000 = 10925000
    // Realized = 10925000 - 3000000 = 7925000
    expect(result.line19RealizedGainLoss.toNumber()).toBe(7925000);
    // Recognized = min(925000, 7925000) = 925000
    expect(result.line20RecognizedGain.toNumber()).toBe(925000);
    // Recapture = min(200000, 925000) = 200000
    expect(result.line21OrdinaryIncome.toNumber()).toBe(200000);
    // Capital = 925000 - 200000 = 725000
    expect(result.line22CapitalGain.toNumber()).toBe(725000);
  });

  it("related party flag is preserved", () => {
    const result = calculateForm8824(makeExchange({
      isRelatedParty: true,
    }));
    expect(result.isRelatedParty).toBe(true);
  });

  it("description is preserved", () => {
    const result = calculateForm8824(makeExchange({
      description: "Office building 1031 exchange",
    }));
    expect(result.description).toBe("Office building 1031 exchange");
  });
});
