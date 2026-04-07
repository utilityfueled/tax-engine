import { describe, expect, it } from "vitest";
import {
  getConfidenceTier,
  getConfidenceTierInfo,
  isValidatedState,
  isBestEffortState,
  isNoIncomeTaxState,
  VALIDATED_STATE_CODES,
  NO_INCOME_TAX_STATE_CODES,
  type ConfidenceTier,
} from "../../../apps/web/src/lib/confidence-tier";

describe("confidence tier classification", () => {
  const VALIDATED = ["CA", "NY", "NJ", "IL", "PA", "OH"];
  const NO_TAX = ["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"];
  const BEST_EFFORT = ["AL", "AR", "AZ", "CO", "CT", "DC", "DE", "GA", "HI",
    "IA", "ID", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO",
    "MS", "MT", "NC", "ND", "NE", "NM", "OK", "OR", "RI", "SC", "UT", "VA",
    "VT", "WI", "WV"];

  describe("getConfidenceTier", () => {
    it.each(VALIDATED)("returns validated for %s", (code) => {
      expect(getConfidenceTier(code)).toBe("validated");
    });

    it.each(NO_TAX)("returns not-applicable for %s", (code) => {
      expect(getConfidenceTier(code)).toBe("not-applicable");
    });

    it.each(BEST_EFFORT)("returns best-effort for %s", (code) => {
      expect(getConfidenceTier(code)).toBe("best-effort");
    });

    it("normalizes lowercase state codes", () => {
      expect(getConfidenceTier("ca")).toBe("validated");
      expect(getConfidenceTier("tx")).toBe("not-applicable");
      expect(getConfidenceTier("ga")).toBe("best-effort");
    });
  });

  describe("getConfidenceTierInfo", () => {
    it("validated states have label, no disclaimer", () => {
      const info = getConfidenceTierInfo("PA");
      expect(info.tier).toBe("validated");
      expect(info.label).toContain("Verified");
      expect(info.disclaimer).toBeNull();
      expect(info.missingCreditsNote).toBeNull();
    });

    it("best-effort states have label, disclaimer, and missing credits note", () => {
      const info = getConfidenceTierInfo("GA");
      expect(info.tier).toBe("best-effort");
      expect(info.label).toContain("Draft");
      expect(info.disclaimer).toContain("published tax rates");
      expect(info.missingCreditsNote).toContain("additional credits");
    });

    it("no-income-tax states have label, no disclaimer", () => {
      const info = getConfidenceTierInfo("FL");
      expect(info.tier).toBe("not-applicable");
      expect(info.label).toContain("No state income tax");
      expect(info.disclaimer).toBeNull();
      expect(info.missingCreditsNote).toBeNull();
    });
  });

  describe("boolean helpers", () => {
    it("isValidatedState returns true only for validated states", () => {
      expect(isValidatedState("CA")).toBe(true);
      expect(isValidatedState("GA")).toBe(false);
      expect(isValidatedState("FL")).toBe(false);
    });

    it("isBestEffortState returns true only for best-effort states", () => {
      expect(isBestEffortState("GA")).toBe(true);
      expect(isBestEffortState("CA")).toBe(false);
      expect(isBestEffortState("FL")).toBe(false);
    });

    it("isNoIncomeTaxState returns true only for no-income-tax states", () => {
      expect(isNoIncomeTaxState("FL")).toBe(true);
      expect(isNoIncomeTaxState("CA")).toBe(false);
      expect(isNoIncomeTaxState("GA")).toBe(false);
    });
  });

  describe("exported constants", () => {
    it("VALIDATED_STATE_CODES contains exactly the validated states", () => {
      expect([...VALIDATED_STATE_CODES].sort()).toEqual(VALIDATED.sort());
    });

    it("NO_INCOME_TAX_STATE_CODES contains exactly the no-income-tax states", () => {
      expect([...NO_INCOME_TAX_STATE_CODES].sort()).toEqual(NO_TAX.sort());
    });
  });

  describe("tier exhaustiveness", () => {
    it("every state gets one of three tiers", () => {
      const allStates = [...VALIDATED, ...NO_TAX, ...BEST_EFFORT];
      const tiers = new Set<ConfidenceTier>(["validated", "best-effort", "not-applicable"]);
      for (const code of allStates) {
        expect(tiers.has(getConfidenceTier(code))).toBe(true);
      }
    });

    it("validated, best-effort, and no-tax sets do not overlap", () => {
      const sets = [new Set(VALIDATED), new Set(NO_TAX), new Set(BEST_EFFORT)];
      for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
          const overlap = [...sets[i]].filter((s) => sets[j].has(s));
          expect(overlap).toEqual([]);
        }
      }
    });
  });
});
