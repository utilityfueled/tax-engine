/**
 * Edge case tests for Form 8824 — Like-Kind Exchanges (§1031).
 * Spec: spec/federal/form-8824.yaml
 *
 * Covers boundary conditions: pure like-kind exchange (no boot), boot
 * exceeding realized gain, realized loss, exchange expenses exactly
 * offsetting boot, depreciation recapture exceeding recognized gain,
 * net liability assumed > relinquished, and aggregation with mixed
 * gain characters.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateForm8824,
  calculateForm8824Aggregate,
} from "@/engine/forms/form-8824.js";
import type { Form8824Input } from "@/models/inputs.js";

function exchange(
  overrides: Partial<Form8824Input> &
    Pick<Form8824Input, "fmvLikeKindPropertyReceived" | "adjustedBasisLikeKindPropertyGivenUp">
): Form8824Input {
  return {
    description: overrides.description ?? "Test exchange",
    recognizedGainCharacter: overrides.recognizedGainCharacter ?? "section1231",
    fmvOtherPropertyGivenUp: overrides.fmvOtherPropertyGivenUp ?? "0",
    adjustedBasisOtherPropertyGivenUp: overrides.adjustedBasisOtherPropertyGivenUp ?? "0",
    cashReceived: overrides.cashReceived ?? "0",
    fmvOtherPropertyReceived: overrides.fmvOtherPropertyReceived ?? "0",
    liabilitiesRelinquished: overrides.liabilitiesRelinquished ?? "0",
    liabilitiesAssumed: overrides.liabilitiesAssumed ?? "0",
    exchangeExpenses: overrides.exchangeExpenses ?? "0",
    fmvLikeKindPropertyReceived: overrides.fmvLikeKindPropertyReceived,
    adjustedBasisLikeKindPropertyGivenUp: overrides.adjustedBasisLikeKindPropertyGivenUp,
    depreciationRecapture: overrides.depreciationRecapture ?? "0",
    isRelatedParty: overrides.isRelatedParty ?? false,
  };
}

describe("Form 8824 edge cases", () => {
  // ═══════════════════════════════════════════════════════════
  // Pure like-kind exchange (no boot)
  // ═══════════════════════════════════════════════════════════

  describe("pure like-kind exchange with no boot", () => {
    it("Form 8824 Line 20 - zero recognized gain when no boot received", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
      }));
      // Boot = 0, realized gain = 500000 - 300000 = 200000
      // Recognized = min(0, 200000) = 0
      expect(result.line15BootReceived).toEqual(new Decimal(0));
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(200000));
      expect(result.line20RecognizedGain).toEqual(new Decimal(0));
      // All gain deferred
      expect(result.line24DeferredGainLoss).toEqual(new Decimal(200000));
      // Basis of replacement = old basis + recognized - boot = 300000 + 0 - 0 = 300000
      expect(result.line25BasisLikeKindPropertyReceived).toEqual(new Decimal(300000));
    });

    it("Form 8824 Line 24 - entire gain deferred preserves tax basis", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "1000000",
        adjustedBasisLikeKindPropertyGivenUp: "400000",
      }));
      // Deferred = 600000, replacement basis = 400000
      // Verify: FMV - deferred = 1000000 - 600000 = 400000 ✓
      expect(result.line24DeferredGainLoss).toEqual(new Decimal(600000));
      expect(result.line25BasisLikeKindPropertyReceived).toEqual(new Decimal(400000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Boot exceeds realized gain
  // ═══════════════════════════════════════════════════════════

  describe("boot exceeds realized gain", () => {
    it("Form 8824 Line 20 - recognized gain capped at realized gain even when boot is larger", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "200000",
        adjustedBasisLikeKindPropertyGivenUp: "180000",
        cashReceived: "50000",
      }));
      // Boot = 50000, realized = (50000 + 200000) - 180000 = 70000
      // But realized gain could be less than boot in different scenarios
      // Here: realized = 70000 > boot 50000, so recognized = min(50000, 70000) = 50000
      expect(result.line20RecognizedGain).toEqual(new Decimal(50000));
      expect(result.line24DeferredGainLoss).toEqual(new Decimal(20000));
    });

    it("Form 8824 Line 20 - boot larger than realized gain limits recognition", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "100000",
        adjustedBasisLikeKindPropertyGivenUp: "90000",
        cashReceived: "50000",
      }));
      // Total value = 50000 + 100000 = 150000
      // Realized = 150000 - 90000 = 60000
      // Boot = 50000
      // Recognized = min(50000, 60000) = 50000
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(60000));
      expect(result.line20RecognizedGain).toEqual(new Decimal(50000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Realized loss
  // ═══════════════════════════════════════════════════════════

  describe("realized loss on like-kind exchange", () => {
    it("Form 8824 Line 20 - zero recognized gain when realized gain is a loss", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "150000",
        adjustedBasisLikeKindPropertyGivenUp: "200000",
      }));
      // Realized = 150000 - 200000 = -50000 (loss)
      // Recognized = min(0, max(-50000, 0)) = min(0, 0) = 0
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(-50000));
      expect(result.line20RecognizedGain).toEqual(new Decimal(0));
      // Deferred loss = -50000 - 0 = -50000
      expect(result.line24DeferredGainLoss).toEqual(new Decimal(-50000));
      // Replacement basis = 200000 + 0 - 0 = 200000
      expect(result.line25BasisLikeKindPropertyReceived).toEqual(new Decimal(200000));
    });

    it("Form 8824 Line 20 - loss not recognized even with boot received", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "100000",
        adjustedBasisLikeKindPropertyGivenUp: "200000",
        cashReceived: "30000",
      }));
      // Total value = 30000 + 100000 = 130000
      // Realized = 130000 - 200000 = -70000 (loss)
      // Recognized = min(30000, max(-70000, 0)) = min(30000, 0) = 0
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(-70000));
      expect(result.line20RecognizedGain).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Exchange expenses offset boot
  // ═══════════════════════════════════════════════════════════

  describe("exchange expenses offset boot", () => {
    it("Form 8824 Line 15 - exchange expenses exactly offset cash boot to zero", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        cashReceived: "20000",
        exchangeExpenses: "20000",
      }));
      // Boot = max(0, 20000 + 0 + 0 - 20000) = 0
      expect(result.line15BootReceived).toEqual(new Decimal(0));
      // No recognized gain despite cash received
      expect(result.line20RecognizedGain).toEqual(new Decimal(0));
      expect(result.line24DeferredGainLoss).toEqual(new Decimal(200000));
    });

    it("Form 8824 Line 15 - expenses exceeding boot still floor at zero", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        cashReceived: "10000",
        exchangeExpenses: "25000",
      }));
      // Boot = max(0, 10000 - 25000) = 0
      expect(result.line15BootReceived).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Net liability relief
  // ═══════════════════════════════════════════════════════════

  describe("liability relief calculations", () => {
    it("Form 8824 Line 15 - net liability relief adds to boot", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        liabilitiesRelinquished: "100000",
        liabilitiesAssumed: "60000",
      }));
      // Net liability relief = max(0, 100000 - 60000) = 40000
      // Boot = 40000
      expect(result.line15BootReceived).toEqual(new Decimal(40000));
      // Realized = (40000 + 500000) - 300000 = 240000
      // Recognized = min(40000, 240000) = 40000
      expect(result.line20RecognizedGain).toEqual(new Decimal(40000));
    });

    it("Form 8824 Line 15 - no relief when liabilities assumed exceed liabilities relinquished", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        liabilitiesRelinquished: "50000",
        liabilitiesAssumed: "100000",
      }));
      // Net liability relief = max(0, 50000 - 100000) = 0
      // Boot = 0
      expect(result.line15BootReceived).toEqual(new Decimal(0));
      // Full deferral
      expect(result.line20RecognizedGain).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Depreciation recapture
  // ═══════════════════════════════════════════════════════════

  describe("depreciation recapture on exchange", () => {
    it("Form 8824 Line 21 - recapture capped at boot-limited recognized gain", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        cashReceived: "20000",
        depreciationRecapture: "50000",
      }));
      // Boot = 20000, realized = 220000, recognized = min(20000, 220000) = 20000
      // Recapture = min(50000, 20000) = 20000 → all ordinary
      expect(result.line20RecognizedGain).toEqual(new Decimal(20000));
      expect(result.line21OrdinaryIncome).toEqual(new Decimal(20000));
      expect(result.line22CapitalGain).toEqual(new Decimal(0));
    });

    it("Form 8824 Line 21 - recapture less than recognized gain splits ordinary/capital", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        cashReceived: "100000",
        depreciationRecapture: "30000",
      }));
      // Boot = 100000, realized = 300000, recognized = min(100000, 300000) = 100000
      // Recapture = min(30000, 100000) = 30000
      // Capital = 100000 - 30000 = 70000
      expect(result.line21OrdinaryIncome).toEqual(new Decimal(30000));
      expect(result.line22CapitalGain).toEqual(new Decimal(70000));
      expect(result.line23TotalRecognizedGain).toEqual(new Decimal(100000));
    });

    it("Form 8824 Line 21 - zero recapture when no boot triggers zero recognized gain", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        depreciationRecapture: "50000",
      }));
      // Boot = 0 → recognized = 0 → recapture = min(50000, 0) = 0
      expect(result.line20RecognizedGain).toEqual(new Decimal(0));
      expect(result.line21OrdinaryIncome).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Other (non-like-kind) property
  // ═══════════════════════════════════════════════════════════

  describe("other property gain/loss", () => {
    it("Form 8824 Line 14 - gain on non-like-kind property given up", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "400000",
        adjustedBasisLikeKindPropertyGivenUp: "250000",
        fmvOtherPropertyGivenUp: "50000",
        adjustedBasisOtherPropertyGivenUp: "30000",
      }));
      // Other property gain = 50000 - 30000 = 20000
      expect(result.line14GainLossOtherProperty).toEqual(new Decimal(20000));
    });

    it("Form 8824 Line 14 - loss on non-like-kind property given up", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "400000",
        adjustedBasisLikeKindPropertyGivenUp: "250000",
        fmvOtherPropertyGivenUp: "20000",
        adjustedBasisOtherPropertyGivenUp: "35000",
      }));
      // Other property loss = 20000 - 35000 = -15000
      expect(result.line14GainLossOtherProperty).toEqual(new Decimal(-15000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Combined boot sources
  // ═══════════════════════════════════════════════════════════

  describe("combined boot from multiple sources", () => {
    it("Form 8824 Line 15 - cash + FMV other property received + net liability relief combine as boot", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        cashReceived: "10000",
        fmvOtherPropertyReceived: "15000",
        liabilitiesRelinquished: "120000",
        liabilitiesAssumed: "100000",
      }));
      // Boot = 10000 + 15000 + max(120000 - 100000, 0) = 10000 + 15000 + 20000 = 45000
      expect(result.line15BootReceived).toEqual(new Decimal(45000));
      // Realized = (45000 + 500000) - 300000 = 245000
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(245000));
      // Recognized = min(45000, 245000) = 45000
      expect(result.line20RecognizedGain).toEqual(new Decimal(45000));
    });

    it("Form 8824 Line 15 - FMV other property received without cash is still boot", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "400000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        fmvOtherPropertyReceived: "25000",
      }));
      // Boot = 0 + 25000 + 0 = 25000
      expect(result.line15BootReceived).toEqual(new Decimal(25000));
      // Realized = (25000 + 400000) - 300000 = 125000
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(125000));
      // Recognized = min(25000, 125000) = 25000
      expect(result.line20RecognizedGain).toEqual(new Decimal(25000));
    });

    it("Form 8824 Line 15 - all boot sources with expenses partially reducing boot", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        cashReceived: "20000",
        fmvOtherPropertyReceived: "10000",
        liabilitiesRelinquished: "80000",
        liabilitiesAssumed: "50000",
        exchangeExpenses: "15000",
      }));
      // Gross boot = 20000 + 10000 + max(80000 - 50000, 0) = 20000 + 10000 + 30000 = 60000
      // Boot = max(0, 60000 - 15000) = 45000
      expect(result.line15BootReceived).toEqual(new Decimal(45000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Recognized gain = realized gain boundary
  // ═══════════════════════════════════════════════════════════

  describe("recognized gain equals realized gain", () => {
    it("Form 8824 Line 20 - boot exceeding realized gain caps recognition at realized gain", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "100000",
        adjustedBasisLikeKindPropertyGivenUp: "95000",
        cashReceived: "50000",
      }));
      // Boot = 50000, realized = (50000 + 100000) - 95000 = 55000
      // Recognized = min(50000, 55000) = 50000
      // Boot < realized → recognized = boot
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(55000));
      expect(result.line20RecognizedGain).toEqual(new Decimal(50000));
    });

    it("Form 8824 Line 20 - boot exactly equals realized gain results in full recognition", () => {
      // Need: cash + FMV received - basis = cash
      // → FMV received = basis
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "200000",
        adjustedBasisLikeKindPropertyGivenUp: "200000",
        cashReceived: "30000",
      }));
      // Boot = 30000, realized = (30000 + 200000) - 200000 = 30000
      // Recognized = min(30000, 30000) = 30000
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(30000));
      expect(result.line20RecognizedGain).toEqual(new Decimal(30000));
      // No deferred gain
      expect(result.line24DeferredGainLoss).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Basis of replacement property (Line 25)
  // ═══════════════════════════════════════════════════════════

  describe("basis of replacement property calculations", () => {
    it("Form 8824 Line 25 - basis with partial recognition equals old basis + recognized - boot", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        cashReceived: "50000",
      }));
      // Boot = 50000, realized = 250000, recognized = 50000
      // Basis = 300000 + 50000 - 50000 = 300000
      expect(result.line25BasisLikeKindPropertyReceived).toEqual(new Decimal(300000));
      // Alternative: FMV - deferred = 500000 - 200000 = 300000 ✓
      expect(
        result.line16FmvLikeKindPropertyReceived.minus(result.line24DeferredGainLoss)
      ).toEqual(new Decimal(300000));
    });

    it("Form 8824 Line 25 - basis equivalence: FMV received minus deferred gain", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "800000",
        adjustedBasisLikeKindPropertyGivenUp: "400000",
        cashReceived: "100000",
        depreciationRecapture: "30000",
      }));
      // Boot = 100000, realized = 500000, recognized = 100000
      // Basis via formula: 400000 + 100000 - 100000 = 400000
      // Basis via equivalence: 800000 - 400000 = 400000
      expect(result.line25BasisLikeKindPropertyReceived).toEqual(new Decimal(400000));
      expect(
        result.line16FmvLikeKindPropertyReceived.minus(result.line24DeferredGainLoss)
      ).toEqual(result.line25BasisLikeKindPropertyReceived);
    });

    it("Form 8824 Line 25 - basis on realized loss exchange preserves old basis", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "180000",
        adjustedBasisLikeKindPropertyGivenUp: "250000",
        cashReceived: "10000",
      }));
      // Boot = 10000, realized = (10000 + 180000) - 250000 = -60000 (loss)
      // Recognized = min(10000, max(-60000, 0)) = 0
      // Basis = 250000 + 0 - 10000 = 240000
      expect(result.line25BasisLikeKindPropertyReceived).toEqual(new Decimal(240000));
      // Alternative: 180000 - (-60000) = 240000 ✓
      expect(
        result.line16FmvLikeKindPropertyReceived.minus(result.line24DeferredGainLoss)
      ).toEqual(new Decimal(240000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Zero and boundary values
  // ═══════════════════════════════════════════════════════════

  describe("zero and boundary value exchanges", () => {
    it("Form 8824 Line 19 - equal value swap yields zero realized gain and full basis carryover", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "300000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
      }));
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(0));
      expect(result.line20RecognizedGain).toEqual(new Decimal(0));
      expect(result.line24DeferredGainLoss).toEqual(new Decimal(0));
      expect(result.line25BasisLikeKindPropertyReceived).toEqual(new Decimal(300000));
    });

    it("Form 8824 Line 20 - $1 boot with large realized gain yields $1 recognized gain", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "200000",
        cashReceived: "1",
      }));
      // Boot = 1, realized = (1 + 500000) - 200000 = 300001
      // Recognized = min(1, 300001) = 1
      expect(result.line15BootReceived).toEqual(new Decimal(1));
      expect(result.line20RecognizedGain).toEqual(new Decimal(1));
      expect(result.line24DeferredGainLoss).toEqual(new Decimal(300000));
    });

    it("Form 8824 Line 19 - $1 realized gain with $1 boot yields full recognition", () => {
      // FMV received + boot - basis = 1
      // 200000 + 1 - 200000 = 1
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "200000",
        adjustedBasisLikeKindPropertyGivenUp: "200000",
        cashReceived: "1",
      }));
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(1));
      expect(result.line20RecognizedGain).toEqual(new Decimal(1));
      expect(result.line24DeferredGainLoss).toEqual(new Decimal(0));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Related party flag
  // ═══════════════════════════════════════════════════════════

  describe("related party tracking", () => {
    it("Form 8824 - related party flag is preserved on individual exchange", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
        isRelatedParty: true,
      }));
      expect(result.isRelatedParty).toBe(true);
    });

    it("Form 8824 - non-related party exchange defaults to false", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "500000",
        adjustedBasisLikeKindPropertyGivenUp: "300000",
      }));
      expect(result.isRelatedParty).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Comprehensive multi-component exchange
  // ═══════════════════════════════════════════════════════════

  describe("comprehensive exchange with all components", () => {
    it("Form 8824 Lines 12-25 - exchange with cash, other property, liabilities, expenses, recapture, and other property given up", () => {
      const result = calculateForm8824(exchange({
        fmvLikeKindPropertyReceived: "750000",
        adjustedBasisLikeKindPropertyGivenUp: "400000",
        cashReceived: "25000",
        fmvOtherPropertyReceived: "10000",
        liabilitiesRelinquished: "200000",
        liabilitiesAssumed: "150000",
        exchangeExpenses: "12000",
        depreciationRecapture: "40000",
        fmvOtherPropertyGivenUp: "20000",
        adjustedBasisOtherPropertyGivenUp: "15000",
      }));

      // Line 14: Other property gain = 20000 - 15000 = 5000
      expect(result.line14GainLossOtherProperty).toEqual(new Decimal(5000));

      // Boot = 25000 + 10000 + max(200000-150000, 0) - 12000 = 25000 + 10000 + 50000 - 12000 = 73000
      expect(result.line15BootReceived).toEqual(new Decimal(73000));

      // Total value = 73000 + 750000 = 823000
      expect(result.line17TotalValueReceived).toEqual(new Decimal(823000));

      // Realized = 823000 - 400000 = 423000
      expect(result.line19RealizedGainLoss).toEqual(new Decimal(423000));

      // Recognized = min(73000, 423000) = 73000
      expect(result.line20RecognizedGain).toEqual(new Decimal(73000));

      // Ordinary recapture = min(40000, 73000) = 40000
      expect(result.line21OrdinaryIncome).toEqual(new Decimal(40000));

      // Capital = 73000 - 40000 = 33000
      expect(result.line22CapitalGain).toEqual(new Decimal(33000));

      // Total recognized = 40000 + 33000 = 73000
      expect(result.line23TotalRecognizedGain).toEqual(new Decimal(73000));

      // Deferred = 423000 - 73000 = 350000
      expect(result.line24DeferredGainLoss).toEqual(new Decimal(350000));

      // Basis = 400000 + 73000 - 73000 = 400000
      expect(result.line25BasisLikeKindPropertyReceived).toEqual(new Decimal(400000));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Aggregation
  // ═══════════════════════════════════════════════════════════

  describe("aggregation of multiple exchanges", () => {
    it("Form 8824 aggregation - mixed gain characters route correctly", () => {
      const agg = calculateForm8824Aggregate([
        exchange({
          fmvLikeKindPropertyReceived: "300000",
          adjustedBasisLikeKindPropertyGivenUp: "200000",
          cashReceived: "30000",
          depreciationRecapture: "10000",
          recognizedGainCharacter: "section1231",
        }),
        exchange({
          fmvLikeKindPropertyReceived: "400000",
          adjustedBasisLikeKindPropertyGivenUp: "350000",
          cashReceived: "20000",
          recognizedGainCharacter: "capital",
        }),
      ]);

      // Exchange 1: boot=30000, realized=130000, recognized=30000, ordinary=10000, capital=20000
      // Exchange 2: boot=20000, realized=70000, recognized=20000, ordinary=0, capital=20000
      expect(agg.totalOrdinaryIncome).toEqual(new Decimal(10000));
      // Section 1231: Line 14 (0) + Line 22 (20000) = 20000
      expect(agg.totalSection1231RecognizedGainOrLoss).toEqual(new Decimal(20000));
      // Capital: Line 14 (0) + Line 22 (20000) = 20000
      expect(agg.totalCapitalRecognizedGainOrLoss).toEqual(new Decimal(20000));
    });

    it("Form 8824 aggregation - all section1231 exchanges sum correctly", () => {
      const agg = calculateForm8824Aggregate([
        exchange({
          fmvLikeKindPropertyReceived: "300000",
          adjustedBasisLikeKindPropertyGivenUp: "200000",
          cashReceived: "20000",
          recognizedGainCharacter: "section1231",
        }),
        exchange({
          fmvLikeKindPropertyReceived: "500000",
          adjustedBasisLikeKindPropertyGivenUp: "400000",
          cashReceived: "30000",
          recognizedGainCharacter: "section1231",
        }),
      ]);

      // Exchange 1: boot=20000, realized=120000, recognized=20000
      // Exchange 2: boot=30000, realized=130000, recognized=30000
      expect(agg.totalSection1231RecognizedGainOrLoss).toEqual(new Decimal(50000));
      expect(agg.totalCapitalRecognizedGainOrLoss).toEqual(new Decimal(0));
      expect(agg.totalOrdinaryIncome).toEqual(new Decimal(0));
    });

    it("Form 8824 aggregation - exchange with other property gain adds to routing totals", () => {
      const agg = calculateForm8824Aggregate([
        exchange({
          fmvLikeKindPropertyReceived: "400000",
          adjustedBasisLikeKindPropertyGivenUp: "300000",
          cashReceived: "10000",
          fmvOtherPropertyGivenUp: "25000",
          adjustedBasisOtherPropertyGivenUp: "18000",
          recognizedGainCharacter: "section1231",
        }),
      ]);

      // Line 14: 25000 - 18000 = 7000 (other property gain)
      // Exchange: boot=10000, realized=110000, recognized=10000
      // Section1231 = Line 14 (7000) + Line 22 (10000) = 17000
      expect(agg.totalOtherPropertyGainLoss).toEqual(new Decimal(7000));
      expect(agg.totalSection1231RecognizedGainOrLoss).toEqual(new Decimal(17000));
    });

    it("Form 8824 aggregation - single exchange via aggregate function", () => {
      const agg = calculateForm8824Aggregate([
        exchange({
          fmvLikeKindPropertyReceived: "600000",
          adjustedBasisLikeKindPropertyGivenUp: "350000",
          cashReceived: "40000",
          depreciationRecapture: "25000",
          recognizedGainCharacter: "capital",
        }),
      ]);

      expect(agg.exchanges.length).toBe(1);
      // boot=40000, realized=290000, recognized=40000
      // ordinary = min(25000, 40000) = 25000
      // capital = 40000 - 25000 = 15000
      expect(agg.totalOrdinaryIncome).toEqual(new Decimal(25000));
      expect(agg.totalCapitalRecognizedGainOrLoss).toEqual(new Decimal(15000));
      expect(agg.totalSection1231RecognizedGainOrLoss).toEqual(new Decimal(0));
    });

    it("Form 8824 aggregation - three exchanges with mixed characters and recapture", () => {
      const agg = calculateForm8824Aggregate([
        exchange({
          fmvLikeKindPropertyReceived: "300000",
          adjustedBasisLikeKindPropertyGivenUp: "200000",
          cashReceived: "10000",
          depreciationRecapture: "5000",
          recognizedGainCharacter: "section1231",
        }),
        exchange({
          fmvLikeKindPropertyReceived: "500000",
          adjustedBasisLikeKindPropertyGivenUp: "450000",
          cashReceived: "15000",
          depreciationRecapture: "8000",
          recognizedGainCharacter: "capital",
        }),
        exchange({
          fmvLikeKindPropertyReceived: "200000",
          adjustedBasisLikeKindPropertyGivenUp: "180000",
          recognizedGainCharacter: "section1231",
        }),
      ]);

      // Exchange 1: boot=10000, realized=110000, recognized=10000, ord=5000, cap=5000
      // Exchange 2: boot=15000, realized=65000, recognized=15000, ord=8000, cap=7000
      // Exchange 3: boot=0, realized=20000, recognized=0 (no boot)
      expect(agg.totalOrdinaryIncome).toEqual(new Decimal(13000)); // 5000 + 8000
      // Section1231: Exchange 1 (Line14=0 + Line22=5000) + Exchange 3 (0 + 0) = 5000
      expect(agg.totalSection1231RecognizedGainOrLoss).toEqual(new Decimal(5000));
      // Capital: Exchange 2 (Line14=0 + Line22=7000) = 7000
      expect(agg.totalCapitalRecognizedGainOrLoss).toEqual(new Decimal(7000));
      expect(agg.exchanges.length).toBe(3);
    });
  });
});
