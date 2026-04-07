/**
 * Tests for New York IT-201 standard deduction, dependent exemptions, and taxable income.
 * Spec: spec/state/ny-it201-standard-deduction.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNYIT201Deduction } from "@/engine/state/ny-it201-standard-deduction.js";

const d = (value: string | number) => new Decimal(value);

describe("NY IT-201 deduction and taxable income", () => {
  /* ---------- Line 34: Standard deduction by filing status ---------- */

  it("Line 34 - single filer (not dependent) standard deduction is $8,000", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 50000, filingStatus: "single", taxYear: 2025,
    });
    expect(result.standardDeduction.toNumber()).toBe(8000);
    expect(result.deductionUsed).toBe("standard");
    expect(result.deductionAmount.toNumber()).toBe(8000);
  });

  it("Line 34 - single filer who can be claimed as dependent gets $3,100", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 10000, filingStatus: "single", canBeClaimedAsDependent: true, taxYear: 2025,
    });
    expect(result.standardDeduction.toNumber()).toBe(3100);
    expect(result.deductionAmount.toNumber()).toBe(3100);
  });

  it("Line 34 - married filing jointly standard deduction is $16,050", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 100000, filingStatus: "married_filing_jointly", taxYear: 2025,
    });
    expect(result.standardDeduction.toNumber()).toBe(16050);
    expect(result.deductionAmount.toNumber()).toBe(16050);
  });

  it("Line 34 - married filing separately standard deduction is $8,000", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 60000, filingStatus: "married_filing_separately", taxYear: 2025,
    });
    expect(result.standardDeduction.toNumber()).toBe(8000);
    expect(result.deductionAmount.toNumber()).toBe(8000);
  });

  it("Line 34 - head of household standard deduction is $11,200", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 60000, filingStatus: "head_of_household", taxYear: 2025,
    });
    expect(result.standardDeduction.toNumber()).toBe(11200);
    expect(result.deductionAmount.toNumber()).toBe(11200);
  });

  it("Line 34 - qualifying surviving spouse standard deduction is $16,050", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 80000, filingStatus: "qualifying_surviving_spouse", taxYear: 2025,
    });
    expect(result.standardDeduction.toNumber()).toBe(16050);
    expect(result.deductionAmount.toNumber()).toBe(16050);
  });

  /* ---------- Line 34: Itemized deduction ---------- */

  it("Line 34 - itemized deduction used when greater than standard", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 100000, filingStatus: "single", nyItemizedDeduction: 15000, taxYear: 2025,
    });
    expect(result.deductionUsed).toBe("itemized");
    expect(result.deductionAmount.toNumber()).toBe(15000);
  });

  it("Line 34 - standard deduction used when itemized is smaller", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 100000, filingStatus: "single", nyItemizedDeduction: 5000, taxYear: 2025,
    });
    expect(result.deductionUsed).toBe("standard");
    expect(result.deductionAmount.toNumber()).toBe(8000);
  });

  it("Line 34 - no itemized deduction defaults to standard", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 50000, filingStatus: "married_filing_jointly", taxYear: 2025,
    });
    expect(result.deductionUsed).toBe("standard");
    expect(result.itemizedDeduction.toNumber()).toBe(0);
  });

  it("Line 34 validation - married filing separately itemized deduction over the standard amount requires spouse confirmation", () => {
    expect(() =>
      calculateNYIT201Deduction({
        nyAgi: 50000,
        filingStatus: "married_filing_separately",
        nyItemizedDeduction: 12000,
        taxYear: 2025,
      })
    ).toThrow(
      "NY IT-201 married filing separately returns may use an itemized deduction only if both spouses elect to itemize on their New York returns"
    );
  });

  it("Line 34 validation - married filing separately may still use the standard deduction without spouse confirmation when itemized is not larger", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 50000,
      filingStatus: "married_filing_separately",
      nyItemizedDeduction: 7000,
      taxYear: 2025,
    });

    expect(result.deductionUsed).toBe("standard");
    expect(result.deductionAmount.toNumber()).toBe(8000);
  });

  /* ---------- Line 35: AGI minus deduction ---------- */

  it("Line 35 - AGI $75,000 minus $8,000 standard deduction = $67,000", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 75000, filingStatus: "single", taxYear: 2025,
    });
    expect(result.agiMinusDeduction.toNumber()).toBe(67000);
  });

  it("Line 35 - AGI $100,000 minus $16,050 MFJ deduction = $83,950", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 100000, filingStatus: "married_filing_jointly", taxYear: 2025,
    });
    expect(result.agiMinusDeduction.toNumber()).toBe(83950);
  });

  /* ---------- Line 36: Dependent exemption ---------- */

  it("Line 36 - no dependents: exemption is $0", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 50000, filingStatus: "single", taxYear: 2025,
    });
    expect(result.dependentExemption.toNumber()).toBe(0);
    expect(result.numberOfDependents).toBe(0);
  });

  it("Line 36 - 2 dependents: exemption is $2,000", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 80000, filingStatus: "married_filing_jointly", numberOfDependents: 2, taxYear: 2025,
    });
    expect(result.dependentExemption.toNumber()).toBe(2000);
  });

  it("Line 36 - 5 dependents: exemption is $5,000", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 100000, filingStatus: "head_of_household", numberOfDependents: 5, taxYear: 2025,
    });
    expect(result.dependentExemption.toNumber()).toBe(5000);
  });

  /* ---------- Lines 37-38: Taxable income ---------- */

  it("Lines 37-38 - basic taxable income computation", () => {
    // AGI $75,000 - $8,000 deduction - $2,000 exemptions = $65,000
    const result = calculateNYIT201Deduction({
      nyAgi: 75000, filingStatus: "single", numberOfDependents: 2, taxYear: 2025,
    });
    expect(result.taxableIncome.toNumber()).toBe(65000);
  });

  it("Lines 37-38 - taxable income cannot go below zero when deduction exceeds AGI", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 5000, filingStatus: "single", taxYear: 2025,
    });
    // AGI $5,000 - $8,000 deduction = negative → 0
    expect(result.taxableIncome.toNumber()).toBe(0);
  });

  it("Lines 37-38 - taxable income zero when exemptions exceed remainder", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 20000, filingStatus: "married_filing_jointly", numberOfDependents: 5, taxYear: 2025,
    });
    // AGI $20,000 - $16,050 deduction = $3,950 - $5,000 exemptions → 0
    expect(result.taxableIncome.toNumber()).toBe(0);
  });

  it("Lines 37-38 - MFJ with 3 dependents", () => {
    // AGI $150,000 - $16,050 deduction = $133,950 - $3,000 exemptions = $130,950
    const result = calculateNYIT201Deduction({
      nyAgi: 150000, filingStatus: "married_filing_jointly", numberOfDependents: 3, taxYear: 2025,
    });
    expect(result.taxableIncome.toNumber()).toBe(130950);
  });

  /* ---------- Audit trail ---------- */

  it("audit trail records lines 34, 35, 36, 37-38", () => {
    const result = calculateNYIT201Deduction({
      nyAgi: 75000, filingStatus: "single", numberOfDependents: 1, taxYear: 2025,
    });
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("34");
    expect(lineNumbers).toContain("35");
    expect(lineNumbers).toContain("36");
    expect(lineNumbers).toContain("37-38");
  });

  /* ---------- Error handling ---------- */

  it("unsupported tax year throws a clear error", () => {
    expect(() =>
      calculateNYIT201Deduction({
        nyAgi: 50000, filingStatus: "single", taxYear: 2024,
      })
    ).toThrow("NY IT-201 deduction constants not available for tax year 2024");
  });
});
