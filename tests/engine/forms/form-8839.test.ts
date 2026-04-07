import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8839 } from "@/engine/forms/form-8839.js";
import { TAX_CONSTANTS } from "@/models/constants.js";
import type { FilingStatus } from "@/models/constants.js";
import type { Form8839Child } from "@/models/inputs.js";

const constants2025 = TAX_CONSTANTS[2025].adoptionCredit;
const ZERO = new Decimal(0);

function makeParams(overrides: {
  filingStatus?: FilingStatus;
  agi?: number;
  children: Partial<Form8839Child>[];
  foreignEarnedIncomeExclusion?: number;
  foreignHousingExclusion?: number;
}) {
  return {
    filingStatus: overrides.filingStatus ?? "married_filing_jointly",
    agi: new Decimal(overrides.agi ?? 100000),
    children: overrides.children.map((c) => ({
      childName: c.childName ?? "",
      isSpecialNeeds: c.isSpecialNeeds ?? false,
      isForeignAdoption: c.isForeignAdoption ?? false,
      adoptionBecameFinal: c.adoptionBecameFinal ?? true,
      qualifiedExpenses: c.qualifiedExpenses ?? "0",
      employerBenefits: c.employerBenefits ?? "0",
      priorYearCreditsClaimed: c.priorYearCreditsClaimed ?? "0",
      priorYearExclusionsClaimed: c.priorYearExclusionsClaimed ?? "0",
    })),
    foreignEarnedIncomeExclusion: new Decimal(overrides.foreignEarnedIncomeExclusion ?? 0),
    foreignHousingExclusion: new Decimal(overrides.foreignHousingExclusion ?? 0),
    constants: constants2025,
  };
}

describe("Form 8839 — Qualified Adoption Expenses", () => {
  describe("Line 1 — Maximum credit per child", () => {
    it("Form 8839 Line 1 - maximum credit per child is $17,280 for 2025", () => {
      const result = calculateForm8839(makeParams({
        children: [{ qualifiedExpenses: "5000" }],
      }));
      expect(result.maxCreditPerChild.toNumber()).toBe(17280);
    });
  });

  describe("Line 2 — Per-child tentative credit", () => {
    it("Form 8839 Line 2 - domestic adoption uses lesser of expenses or maximum", () => {
      const result = calculateForm8839(makeParams({
        children: [{ qualifiedExpenses: "10000" }],
      }));
      expect(result.childResults[0].tentativeCredit.toNumber()).toBe(10000);
    });

    it("Form 8839 Line 2 - expenses exceeding maximum are capped at $17,280", () => {
      const result = calculateForm8839(makeParams({
        children: [{ qualifiedExpenses: "25000" }],
      }));
      expect(result.childResults[0].tentativeCredit.toNumber()).toBe(17280);
    });

    it("Form 8839 Line 2 - special needs child gets full credit when adoption is final", () => {
      const result = calculateForm8839(makeParams({
        children: [{ isSpecialNeeds: true, adoptionBecameFinal: true, qualifiedExpenses: "0" }],
      }));
      expect(result.childResults[0].tentativeCredit.toNumber()).toBe(17280);
    });

    it("Form 8839 Line 2 - special needs child without final adoption uses actual expenses", () => {
      const result = calculateForm8839(makeParams({
        children: [{ isSpecialNeeds: true, adoptionBecameFinal: false, qualifiedExpenses: "8000" }],
      }));
      expect(result.childResults[0].tentativeCredit.toNumber()).toBe(8000);
    });

    it("Form 8839 Line 2 - foreign adoption expenses cannot be claimed until final", () => {
      const result = calculateForm8839(makeParams({
        children: [{ isForeignAdoption: true, adoptionBecameFinal: false, qualifiedExpenses: "15000" }],
      }));
      expect(result.childResults[0].tentativeCredit.toNumber()).toBe(0);
    });

    it("Form 8839 Line 2 - foreign adoption expenses are allowed when adoption is final", () => {
      const result = calculateForm8839(makeParams({
        children: [{ isForeignAdoption: true, adoptionBecameFinal: true, qualifiedExpenses: "12000" }],
      }));
      expect(result.childResults[0].tentativeCredit.toNumber()).toBe(12000);
    });
  });

  describe("Line 3-5 — Aggregate credit and prior year reduction", () => {
    it("Form 8839 Line 3 - total tentative credit sums across children", () => {
      const result = calculateForm8839(makeParams({
        children: [
          { qualifiedExpenses: "10000" },
          { qualifiedExpenses: "8000" },
        ],
      }));
      expect(result.totalTentativeCredit.toNumber()).toBe(18000);
    });

    it("Form 8839 Line 4 - prior year credits reduce current year tentative credit", () => {
      const result = calculateForm8839(makeParams({
        children: [{ qualifiedExpenses: "17280", priorYearCreditsClaimed: "5000" }],
      }));
      expect(result.netTentativeCredit.toNumber()).toBe(12280);
    });

    it("Form 8839 Line 5 - net tentative credit is total minus prior year claims", () => {
      const result = calculateForm8839(makeParams({
        children: [
          { qualifiedExpenses: "10000", priorYearCreditsClaimed: "10000" },
          { qualifiedExpenses: "8000" },
        ],
      }));
      // Total tentative = 10000 + 8000 = 18000; prior = 10000; net = 8000
      expect(result.netTentativeCredit.toNumber()).toBe(8000);
    });

    it("Form 8839 Line 5 - prior year credits cannot make net credit negative", () => {
      const result = calculateForm8839(makeParams({
        children: [{ qualifiedExpenses: "5000", priorYearCreditsClaimed: "10000" }],
      }));
      expect(result.netTentativeCredit.toNumber()).toBe(0);
    });
  });

  describe("Line 6-9 — MAGI phase-out", () => {
    it("Form 8839 Line 6 - MAGI includes foreign earned income exclusions", () => {
      const result = calculateForm8839(makeParams({
        agi: 200000,
        children: [{ qualifiedExpenses: "10000" }],
        foreignEarnedIncomeExclusion: 50000,
        foreignHousingExclusion: 10000,
      }));
      expect(result.magi.toNumber()).toBe(260000);
    });

    it("Form 8839 Line 7 - phase-out threshold is $259,190 for 2025", () => {
      const result = calculateForm8839(makeParams({
        children: [{ qualifiedExpenses: "10000" }],
      }));
      expect(result.phaseOutThreshold.toNumber()).toBe(259190);
    });

    it("Form 8839 Line 8 - excess MAGI is zero when below threshold", () => {
      const result = calculateForm8839(makeParams({
        agi: 200000,
        children: [{ qualifiedExpenses: "10000" }],
      }));
      expect(result.excessMagi.toNumber()).toBe(0);
    });

    it("Form 8839 Line 8 - excess MAGI computed when above threshold", () => {
      const result = calculateForm8839(makeParams({
        agi: 270000,
        children: [{ qualifiedExpenses: "10000" }],
      }));
      expect(result.excessMagi.toNumber()).toBe(10810); // 270000 - 259190
    });

    it("Form 8839 Line 9 - phase-out fraction is capped at 1.000", () => {
      const result = calculateForm8839(makeParams({
        agi: 350000,
        children: [{ qualifiedExpenses: "10000" }],
      }));
      expect(result.phaseOutFraction.toNumber()).toBe(1);
    });

    it("Form 8839 Line 9 - partial phase-out fraction rounded to 3 decimal places", () => {
      // MAGI = 279190, excess = 20000, fraction = 20000/40000 = 0.500
      const result = calculateForm8839(makeParams({
        agi: 279190,
        children: [{ qualifiedExpenses: "10000" }],
      }));
      expect(result.phaseOutFraction.toNumber()).toBe(0.5);
    });
  });

  describe("Line 10-11 — Credit after phase-out", () => {
    it("Form 8839 Line 10 - phase-out reduces credit proportionally", () => {
      // AGI = 279190, excess = 20000, fraction = 0.500
      // Net tentative credit = 10000, reduction = 10000 * 0.5 = 5000
      const result = calculateForm8839(makeParams({
        agi: 279190,
        children: [{ qualifiedExpenses: "10000" }],
      }));
      expect(result.phaseOutReduction.toNumber()).toBe(5000);
      expect(result.adoptionCredit.toNumber()).toBe(5000);
    });

    it("Form 8839 Line 11 - credit flows to Schedule 3 Line 6c", () => {
      // Below phase-out, full credit
      const result = calculateForm8839(makeParams({
        agi: 100000,
        children: [{ qualifiedExpenses: "15000" }],
      }));
      expect(result.adoptionCredit.toNumber()).toBe(15000);
    });

    it("Form 8839 Line 11 - credit is zero when fully phased out", () => {
      const result = calculateForm8839(makeParams({
        agi: 300000,
        children: [{ qualifiedExpenses: "15000" }],
      }));
      expect(result.adoptionCredit.toNumber()).toBe(0);
    });

    it("Form 8839 credit at exact phase-out threshold boundary", () => {
      const result = calculateForm8839(makeParams({
        agi: 259190,
        children: [{ qualifiedExpenses: "10000" }],
      }));
      expect(result.excessMagi.toNumber()).toBe(0);
      expect(result.adoptionCredit.toNumber()).toBe(10000);
    });

    it("Form 8839 credit at exact full phase-out boundary ($299,190)", () => {
      const result = calculateForm8839(makeParams({
        agi: 299190,
        children: [{ qualifiedExpenses: "17280" }],
      }));
      expect(result.phaseOutFraction.toNumber()).toBe(1);
      expect(result.adoptionCredit.toNumber()).toBe(0);
    });

    it("Form 8839 credit $1 above threshold begins phase-out", () => {
      const result = calculateForm8839(makeParams({
        agi: 259191,
        children: [{ qualifiedExpenses: "17280" }],
      }));
      // excess = 1, fraction = 1/40000 = 0.000 (rounds to 0)
      // At $1 over, fraction rounds to 0.000, so no reduction
      expect(result.phaseOutFraction.toNumber()).toBe(0);
      expect(result.adoptionCredit.toNumber()).toBe(17280);
    });
  });

  describe("MFS ineligibility", () => {
    it("Form 8839 MFS - married filing separately cannot claim credit", () => {
      const result = calculateForm8839(makeParams({
        filingStatus: "married_filing_separately",
        agi: 50000,
        children: [{ qualifiedExpenses: "10000" }],
      }));
      expect(result.eligible).toBe(false);
      expect(result.adoptionCredit.toNumber()).toBe(0);
    });

    it("Form 8839 MFS - employer exclusion also unavailable", () => {
      const result = calculateForm8839(makeParams({
        filingStatus: "married_filing_separately",
        agi: 50000,
        children: [{ qualifiedExpenses: "10000", employerBenefits: "5000" }],
      }));
      expect(result.taxableEmployerBenefits.toNumber()).toBe(0);
      expect(result.allowableExclusion.toNumber()).toBe(0);
    });
  });

  describe("Filing status coverage", () => {
    it("Form 8839 single filer receives credit below phase-out", () => {
      const result = calculateForm8839(makeParams({
        filingStatus: "single",
        agi: 100000,
        children: [{ qualifiedExpenses: "12000" }],
      }));
      expect(result.adoptionCredit.toNumber()).toBe(12000);
    });

    it("Form 8839 head of household receives credit below phase-out", () => {
      const result = calculateForm8839(makeParams({
        filingStatus: "head_of_household",
        agi: 150000,
        children: [{ qualifiedExpenses: "12000" }],
      }));
      expect(result.adoptionCredit.toNumber()).toBe(12000);
    });

    it("Form 8839 qualifying surviving spouse receives credit", () => {
      const result = calculateForm8839(makeParams({
        filingStatus: "qualifying_surviving_spouse",
        agi: 100000,
        children: [{ qualifiedExpenses: "17280" }],
      }));
      expect(result.adoptionCredit.toNumber()).toBe(17280);
    });
  });

  describe("Multiple children", () => {
    it("Form 8839 two children both get credit below phase-out", () => {
      const result = calculateForm8839(makeParams({
        agi: 100000,
        children: [
          { childName: "Child A", qualifiedExpenses: "15000" },
          { childName: "Child B", qualifiedExpenses: "10000" },
        ],
      }));
      expect(result.totalTentativeCredit.toNumber()).toBe(25000);
      expect(result.adoptionCredit.toNumber()).toBe(25000);
    });

    it("Form 8839 special needs plus domestic child combination", () => {
      const result = calculateForm8839(makeParams({
        agi: 100000,
        children: [
          { childName: "Special", isSpecialNeeds: true, adoptionBecameFinal: true, qualifiedExpenses: "0" },
          { childName: "Domestic", qualifiedExpenses: "8000" },
        ],
      }));
      // Special needs: $17,280 (full max), Domestic: $8,000
      expect(result.totalTentativeCredit.toNumber()).toBe(25280);
      expect(result.adoptionCredit.toNumber()).toBe(25280);
    });

    it("Form 8839 mixed prior-year claims across children", () => {
      const result = calculateForm8839(makeParams({
        agi: 100000,
        children: [
          { qualifiedExpenses: "17280", priorYearCreditsClaimed: "17280" }, // fully claimed
          { qualifiedExpenses: "10000", priorYearCreditsClaimed: "3000" },  // 7000 remaining
        ],
      }));
      // Total tentative: 17280 + 10000 = 27280; total prior: 17280 + 3000 = 20280
      // Net: 27280 - 20280 = 7000
      expect(result.netTentativeCredit.toNumber()).toBe(7000);
      expect(result.adoptionCredit.toNumber()).toBe(7000);
    });
  });

  describe("Employer-provided adoption benefits", () => {
    it("Form 8839 employer exclusion - benefits below maximum are fully excludable", () => {
      const result = calculateForm8839(makeParams({
        agi: 100000,
        children: [{ qualifiedExpenses: "5000", employerBenefits: "10000" }],
      }));
      expect(result.allowableExclusion.greaterThan(ZERO)).toBe(true);
      expect(result.taxableEmployerBenefits.toNumber()).toBe(0);
    });

    it("Form 8839 employer exclusion - benefits exceeding excludable amount are taxable", () => {
      const result = calculateForm8839(makeParams({
        agi: 100000,
        children: [{ qualifiedExpenses: "5000", employerBenefits: "20000" }],
      }));
      // Per-child combined credit + exclusion cap = $17,280 (IRC §137)
      // Tentative credit = min(5000, 17280) = 5000
      // Remaining max for exclusion = 17280 - 5000 = 12280
      // Tentative exclusion = min(20000, 12280) = 12280
      // Taxable = 20000 - 12280 = 7720
      expect(result.taxableEmployerBenefits.toNumber()).toBe(7720);
    });

    it("Form 8839 employer exclusion - combined credit + exclusion respects $17,280 per-child cap", () => {
      // Child with $15,000 expenses and $10,000 employer benefits
      // Credit uses $15,000 of the $17,280 cap → only $2,280 remains for exclusion
      const result = calculateForm8839(makeParams({
        agi: 100000,
        children: [{ qualifiedExpenses: "15000", employerBenefits: "10000" }],
      }));
      expect(result.childResults[0].tentativeCredit.toNumber()).toBe(15000);
      expect(result.childResults[0].tentativeExclusion.toNumber()).toBe(2280);
      expect(result.taxableEmployerBenefits.toNumber()).toBe(7720); // 10000 - 2280
    });

    it("Form 8839 employer exclusion - zero expenses leaves full cap for exclusion", () => {
      const result = calculateForm8839(makeParams({
        agi: 100000,
        children: [{ qualifiedExpenses: "0", employerBenefits: "20000" }],
      }));
      // No credit used → full $17,280 available for exclusion
      // Tentative exclusion = min(20000, 17280) = 17280
      // Taxable = 20000 - 17280 = 2720
      expect(result.childResults[0].tentativeExclusion.toNumber()).toBe(17280);
      expect(result.taxableEmployerBenefits.toNumber()).toBe(2720);
    });

    it("Form 8839 employer exclusion - special needs child at max credit leaves zero for exclusion", () => {
      const result = calculateForm8839(makeParams({
        agi: 100000,
        children: [{
          isSpecialNeeds: true,
          adoptionBecameFinal: true,
          qualifiedExpenses: "0",
          employerBenefits: "5000",
        }],
      }));
      // Special needs gets full $17,280 credit → nothing left for exclusion
      expect(result.childResults[0].tentativeCredit.toNumber()).toBe(17280);
      expect(result.childResults[0].tentativeExclusion.toNumber()).toBe(0);
      expect(result.taxableEmployerBenefits.toNumber()).toBe(5000);
    });

    it("Form 8839 employer exclusion - phase-out reduces exclusion", () => {
      // MAGI = 279190, fraction = 0.500
      const result = calculateForm8839(makeParams({
        agi: 279190,
        children: [{ qualifiedExpenses: "0", employerBenefits: "10000" }],
      }));
      // Tentative exclusion = 10000, phase-out = 10000 * 0.5 = 5000
      // Allowable = 5000, taxable = 10000 - 5000 = 5000
      expect(result.allowableExclusion.toNumber()).toBe(5000);
      expect(result.taxableEmployerBenefits.toNumber()).toBe(5000);
    });

    it("Form 8839 employer exclusion - fully phased out means all benefits taxable", () => {
      const result = calculateForm8839(makeParams({
        agi: 300000,
        children: [{ qualifiedExpenses: "0", employerBenefits: "10000" }],
      }));
      expect(result.allowableExclusion.toNumber()).toBe(0);
      expect(result.taxableEmployerBenefits.toNumber()).toBe(10000);
    });
  });

  describe("Edge cases and rounding", () => {
    it("Form 8839 zero expenses produce zero credit", () => {
      const result = calculateForm8839(makeParams({
        children: [{ qualifiedExpenses: "0" }],
      }));
      expect(result.adoptionCredit.toNumber()).toBe(0);
    });

    it("Form 8839 exactly $17,280 expenses get full credit", () => {
      const result = calculateForm8839(makeParams({
        agi: 100000,
        children: [{ qualifiedExpenses: "17280" }],
      }));
      expect(result.adoptionCredit.toNumber()).toBe(17280);
    });

    it("Form 8839 phase-out rounding at 3 decimal boundary", () => {
      // AGI = 259210 → excess = 20, fraction = 20/40000 = 0.0005, rounds to 0.001
      const result = calculateForm8839(makeParams({
        agi: 259210,
        children: [{ qualifiedExpenses: "17280" }],
      }));
      expect(result.phaseOutFraction.toNumber()).toBe(0.001);
      // Reduction = 17280 * 0.001 = 17.28 → rounds to 17
      expect(result.phaseOutReduction.toNumber()).toBe(17);
      expect(result.adoptionCredit.toNumber()).toBe(17263);
    });

    it("Form 8839 phase-out rounding at 0.9995 boundary", () => {
      // excess = 39980 → fraction = 39980/40000 = 0.9995, rounds to 1.000
      const result = calculateForm8839(makeParams({
        agi: 299170, // 259190 + 39980
        children: [{ qualifiedExpenses: "17280" }],
      }));
      expect(result.phaseOutFraction.toNumber()).toBe(1);
      expect(result.adoptionCredit.toNumber()).toBe(0);
    });
  });
});
