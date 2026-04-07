/**
 * Tests for New Jersey NJ-1040 personal exemptions.
 * Spec: spec/state/nj-1040-exemptions.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateNJ1040Exemptions } from "@/engine/state/nj-1040-exemptions.js";

describe("NJ-1040 personal exemptions", () => {
  // --- Line 30: Self exemption ---

  it("NJ-1040 exemptions Line 30 - self exemption is $1,000 for all filing statuses", () => {
    for (const fs of [
      "single",
      "married_filing_jointly",
      "married_filing_separately",
      "head_of_household",
      "qualifying_surviving_spouse",
    ] as const) {
      const result = calculateNJ1040Exemptions({ filingStatus: fs, taxYear: 2025 });
      expect(result.selfExemption.toNumber()).toBe(1000);
    }
  });

  // --- Line 31: Spouse exemption ---

  it("NJ-1040 exemptions Line 31 - spouse exemption only for MFJ", () => {
    const mfj = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
    });
    expect(mfj.spouseExemption.toNumber()).toBe(1000);
  });

  it("NJ-1040 exemptions Line 31 - no spouse exemption for single", () => {
    const single = calculateNJ1040Exemptions({
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(single.spouseExemption.toNumber()).toBe(0);
  });

  it("NJ-1040 exemptions Line 31 - no spouse exemption for MFS", () => {
    const mfs = calculateNJ1040Exemptions({
      filingStatus: "married_filing_separately",
      taxYear: 2025,
    });
    expect(mfs.spouseExemption.toNumber()).toBe(0);
  });

  it("NJ-1040 exemptions Line 31 - no spouse exemption for QSS (spouse is deceased)", () => {
    const qss = calculateNJ1040Exemptions({
      filingStatus: "qualifying_surviving_spouse",
      taxYear: 2025,
    });
    expect(qss.spouseExemption.toNumber()).toBe(0);
  });

  it("NJ-1040 exemptions Line 31 - no spouse exemption for HOH", () => {
    const hoh = calculateNJ1040Exemptions({
      filingStatus: "head_of_household",
      taxYear: 2025,
    });
    expect(hoh.spouseExemption.toNumber()).toBe(0);
  });

  // --- Line 32: Age 65+ exemption ---

  it("NJ-1040 exemptions Line 32 - age 65 exemption for taxpayer only", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "single",
      taxYear: 2025,
      taxpayerAge65OrOlder: true,
    });
    expect(result.age65Exemption.toNumber()).toBe(1000);
  });

  it("NJ-1040 exemptions Line 32 - age 65 exemption for both taxpayer and spouse", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      taxpayerAge65OrOlder: true,
      spouseAge65OrOlder: true,
    });
    expect(result.age65Exemption.toNumber()).toBe(2000);
  });

  it("NJ-1040 exemptions Line 32 - spouse age 65 exemption ignored for non-MFJ", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "single",
      taxYear: 2025,
      taxpayerAge65OrOlder: false,
      spouseAge65OrOlder: true, // should be ignored
    });
    expect(result.age65Exemption.toNumber()).toBe(0);
  });

  it("NJ-1040 exemptions Line 32 - no age exemption when neither qualifies", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      taxpayerAge65OrOlder: false,
      spouseAge65OrOlder: false,
    });
    expect(result.age65Exemption.toNumber()).toBe(0);
  });

  // --- Line 33: Blind or disabled exemption ---

  it("NJ-1040 exemptions Line 33 - blind exemption for taxpayer", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "single",
      taxYear: 2025,
      taxpayerBlindOrDisabled: true,
    });
    expect(result.blindDisabledExemption.toNumber()).toBe(1000);
  });

  it("NJ-1040 exemptions Line 33 - blind exemption for both on MFJ", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      taxpayerBlindOrDisabled: true,
      spouseBlindOrDisabled: true,
    });
    expect(result.blindDisabledExemption.toNumber()).toBe(2000);
  });

  it("NJ-1040 exemptions Line 33 - spouse blind exemption ignored for non-MFJ", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "head_of_household",
      taxYear: 2025,
      spouseBlindOrDisabled: true,
    });
    expect(result.blindDisabledExemption.toNumber()).toBe(0);
  });

  // --- Line 34: Veteran exemption ---

  it("NJ-1040 exemptions Line 34 - veteran exemption is $6,000", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "single",
      taxYear: 2025,
      isVeteran: true,
    });
    expect(result.veteranExemption.toNumber()).toBe(6000);
  });

  it("NJ-1040 exemptions Line 34 - no veteran exemption when not a veteran", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "single",
      taxYear: 2025,
      isVeteran: false,
    });
    expect(result.veteranExemption.toNumber()).toBe(0);
  });

  it("NJ-1040 exemptions Line 34 - joint return counts both taxpayer and spouse veterans", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      isVeteran: true,
      spouseIsVeteran: true,
    });
    expect(result.veteranExemption.toNumber()).toBe(12000);
  });

  // --- Line 35: Dependent exemption ---

  it("NJ-1040 exemptions Line 35 - each dependent gets $1,500", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "head_of_household",
      taxYear: 2025,
      dependentCount: 3,
    });
    expect(result.dependentExemption.toNumber()).toBe(4500);
  });

  it("NJ-1040 exemptions Line 35 - zero dependents yields zero", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "single",
      taxYear: 2025,
      dependentCount: 0,
    });
    expect(result.dependentExemption.toNumber()).toBe(0);
  });

  // --- Line 36: College dependent exemption ---

  it("NJ-1040 exemptions Line 36 - college dependent adds $1,000", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      dependentCount: 2,
      collegeDependentCount: 1,
    });
    expect(result.collegeDependentExemption.toNumber()).toBe(1000);
    // Plus $3,000 from dependents, $2,000 from self+spouse
    expect(result.totalExemptions.toNumber()).toBe(6000);
  });

  it("NJ-1040 exemptions Line 36 - multiple college dependents", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      collegeDependentCount: 2,
    });
    expect(result.collegeDependentExemption.toNumber()).toBe(2000);
  });

  // --- Line 37: Total exemptions ---

  it("NJ-1040 exemptions Line 37 - single filer with no extras gets $1,000", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.totalExemptions.toNumber()).toBe(1000);
  });

  it("NJ-1040 exemptions Line 37 - total exemptions sum all categories", () => {
    // MFJ couple, both 65+, 2 dependents (1 in college), veteran
    // Self: $1,000 + Spouse: $1,000 + Age(2): $2,000 + Blind: $0 + Vet: $6,000
    // + Deps(2): $3,000 + College(1): $1,000 = $14,000
    const result = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      taxpayerAge65OrOlder: true,
      spouseAge65OrOlder: true,
      isVeteran: true,
      dependentCount: 2,
      collegeDependentCount: 1,
    });
    expect(result.totalExemptions.toNumber()).toBe(14000);
  });

  it("NJ-1040 exemptions Line 37 - spouse veteran exemption contributes on a joint return", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      spouseIsVeteran: true,
    });
    expect(result.totalExemptions.toNumber()).toBe(8000);
  });

  it("NJ-1040 exemptions Line 37 - MFJ couple with all exemptions maxed", () => {
    // Self: $1,000 + Spouse: $1,000 + Age(2): $2,000 + Blind(2): $2,000
    // + Vet: $6,000 + Deps(4): $6,000 + College(2): $2,000 = $20,000
    const result = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      taxpayerAge65OrOlder: true,
      spouseAge65OrOlder: true,
      taxpayerBlindOrDisabled: true,
      spouseBlindOrDisabled: true,
      isVeteran: true,
      dependentCount: 4,
      collegeDependentCount: 2,
    });
    expect(result.totalExemptions.toNumber()).toBe(20000);
  });

  // --- Audit trail ---

  it("NJ-1040 exemptions - audit trail records lines 30-37", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "married_filing_jointly",
      taxYear: 2025,
      dependentCount: 1,
    });
    expect(result.lines).toHaveLength(8);
    expect(result.lines.map((l) => l.line)).toEqual([
      "30", "31", "32", "33", "34", "35", "36", "37",
    ]);
  });

  // --- Default values ---

  it("NJ-1040 exemptions - omitted optional inputs default to zero/false", () => {
    const result = calculateNJ1040Exemptions({
      filingStatus: "single",
      taxYear: 2025,
    });
    expect(result.age65Exemption.toNumber()).toBe(0);
    expect(result.blindDisabledExemption.toNumber()).toBe(0);
    expect(result.veteranExemption.toNumber()).toBe(0);
    expect(result.dependentExemption.toNumber()).toBe(0);
    expect(result.collegeDependentExemption.toNumber()).toBe(0);
  });
});
