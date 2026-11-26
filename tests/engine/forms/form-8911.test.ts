// Spec: spec/federal/form-8911.yaml.
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { calculateForm8911 } from "@/engine/forms/form-8911.js";
import { form8911AppendixBByCounty } from "@/models/irs-30c-appendix-b.js";
import { Form8911Sources2026Schema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";

const source = {
  taxYear: 2026, owner: "primary", invoiceReference: "Paid charger invoice", placedInServiceReference: "Installer commissioning record",
  censusTractSourceReference: "2020 Census main-home tract result", censusTractGeoid: "01001020100", placedInServiceDate: "2026-06-30",
  invoiceGrossCost: "2000", nonqualifyingInvoiceCost: "0", rebatesAndOtherBasisReductions: "0",
  originalUseBeganWithTaxpayer: true, oneNewChargingPortConfirmed: true, domesticMainHomeConfirmed: true,
  personalUseOnlyConfirmed: true, invoiceReconciledConfirmed: true, censusTractMatchesLocationConfirmed: true,
} as const;

const tax = {
  taxYear: 2026, filingStatus: "single", spousePresent: false, incomeTax: d("10000"), schedule2PartIAdditions: d("0"),
  foreignTaxCredit: d("0"), priorAllowableCredits: d("0"), tentativeMinimumTax: d("0"),
} as const;

it("bounds the 2026 personal charger by the actual service date, verified tract and invoice basis", () => {
  const result = calculateForm8911({ ...source, invoiceGrossCost: "1500.00", nonqualifyingInvoiceCost: "198.33", rebatesAndOtherBasisReductions: "300.00" }, tax);
  // $1,001.67 of eligible basis gives $300.501 before whole-dollar rounding.
  expect(result.qualifiedCost.toFixed(2)).toBe("1001.67");
  expect(result.personalCredit.toFixed()).toBe("301");
  expect(result.remainingBasis.toFixed(2)).toBe("700.67");
  expect(calculateForm8911({ ...source, invoiceGrossCost: "1001.66" }, tax).personalCredit.toFixed()).toBe("300");
  // IRS Pub. 6027: $1,500 charger and labor + $500 mount + $1,000 dedicated wiring and panel.
  expect(calculateForm8911({ ...source, invoiceGrossCost: "3000" }, tax).personalCredit.toFixed()).toBe("900");
  expect(calculateForm8911({ ...source, invoiceGrossCost: "4500" }, tax).personalCredit.toFixed()).toBe("1000");
  expect(calculateForm8911({ ...source, placedInServiceDate: "2026-01-01" }, tax).personalCredit.toFixed()).toBe("600");
  expect(calculateForm8911({ ...source, placedInServiceDate: "2026-07-01" }, tax).personalCredit.toFixed()).toBe("0");
  // Autauga's real 2020 Census Tract 203 is absent from IRS Appendix B.
  expect(calculateForm8911({ ...source, censusTractGeoid: "01001020300" }, tax).personalCredit.toFixed()).toBe("0");
  expect(calculateForm8911({ ...source, censusTractGeoid: "01001020200" }, tax).personalCredit.toFixed()).toBe("600");
  expect(() => calculateForm8911({ ...source, censusTractGeoid: "78030990000" }, tax)).toThrow(/possession/i);
  expect(calculateForm8911({ ...source, rebatesAndOtherBasisReductions: "2000" }, tax).personalCredit.toFixed()).toBe("0");
});

it("subtracts prior allowable credits and actual tentative minimum tax before using the credit", () => {
  const limited = { ...tax, incomeTax: d("800"), schedule2PartIAdditions: d("100"), foreignTaxCredit: d("50"),
    priorAllowableCredits: d("150"), tentativeMinimumTax: d("625") };
  const result = calculateForm8911(source, limited);
  const values = Object.fromEntries(result.lines.filter(line => line.form === "Form 8911").map(line => [line.line, line.value.toFixed()]));
  expect(values).toMatchObject({ 4: "600", 5: "900", "6a": "50", "6b": "150", "6c": "200", 7: "700", 8: "625", 9: "75", 10: "75" });
  expect(result.remainingBasis.toFixed()).toBe("1400");
  expect(calculateForm8911(source, { ...limited, tentativeMinimumTax: d("750") }).personalCredit.toFixed()).toBe("0");
});

it("holds missing, contradictory and out-of-scope source evidence", () => {
  const invalid = [
    { taxYear: 2025 }, { placedInServiceDate: "2025-12-31" }, { placedInServiceDate: "2026-02-29" },
    { censusTractGeoid: "1001020100" }, { censusTractSourceReference: " " }, { censusTractMatchesLocationConfirmed: undefined },
    { invoiceReference: " " }, { placedInServiceReference: "" }, { invoiceGrossCost: "0" }, { personalUseOnlyConfirmed: false },
    { oneNewChargingPortConfirmed: false }, { originalUseBeganWithTaxpayer: false }, { domesticMainHomeConfirmed: false },
    { invoiceReconciledConfirmed: undefined }, { nonqualifyingInvoiceCost: undefined }, { nonqualifyingInvoiceCost: "-1" },
    { invoiceGrossCost: "unknown" }, { nonqualifyingInvoiceCost: "unknown" }, { rebatesAndOtherBasisReductions: "unknown" },
    { nonqualifyingInvoiceCost: "0.001" }, { nonqualifyingInvoiceCost: "1.00", rebatesAndOtherBasisReductions: "1999.01" },
  ];
  for (const patch of invalid) {
    expect(Form8911Sources2026Schema.safeParse({ ...source, ...patch }).success).toBe(false);
  }
  expect(() => calculateForm8911(source, { ...tax, taxYear: 2025 })).toThrow(/year/i);
  expect(() => calculateForm8911({ ...source, owner: "spouse" }, tax)).toThrow(/spouse/i);
  expect(calculateForm8911({ ...source, owner: "spouse" }, { ...tax, filingStatus: "married_filing_jointly", spousePresent: true }).personalCredit.toFixed()).toBe("600");
});

it("round-trips the complete IRS Appendix B tract list with an exact dataset fingerprint", () => {
  const expanded = Object.entries(form8911AppendixBByCounty).flatMap(([county, suffixes]) =>
    suffixes.slice(1, -1).split(",").map(suffix => county + suffix)).sort();
  expect(expanded.length).toBe(55_474);
  expect(new Set(expanded).size).toBe(55_474);
  const sha = createHash("sha256").update(expanded.join("\n") + "\n").digest("hex");
  expect(sha).toBe("077deed805e28860a8077391081d75a10df520ca09bf7d0a893354036b3cb4f9");
});
