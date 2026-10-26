// Spec: spec/federal/marketplace-health-owners.yaml. Isolated indexed method; not return qualification.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { twoOwnerMarketplaceHealthInput } from "../fixtures/marketplace-health-owners.js";

it("keeps each owner's deduction and2026 full repayment separate from the joint credit", () => {
  for (const advances of ["none", "full"] as const) {
    const input = twoOwnerMarketplaceHealthInput(2026, advances), result = calculateFederalTax(input);
    // 50000-3532-9000=37468;177% of21150,rate.0549 ->2057;
    // PTC6343; deduction2657 split1771.333.../885.666... before printing.
    // Final43811;207%,rate.0686 ->3005 contribution,5395 PTC.
    expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("6343");
    expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("2657");
    expect(result.agi.toFixed()).toBe("43811");
    expect(result.form8962?.ptcAllowed.toFixed()).toBe("5395");
    expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe(advances === "full" ? "3605" : "0");
    expect(result.form8962?.netPTC.toFixed()).toBe(advances === "full" ? "0" : "5395");
    const rows = result.allLines.filter(row => row.form === "QBI Source Deductions" && ["scheduleC", "scheduleF"].includes(row.line));
    expect(rows.map(row => row.inputs["SE health insurance"].toString())).toEqual(["1771", "886"]);
    expect(input.form7206?.plans?.[0]?.payments?.[0]?.ownerOrBusinessPaid).toBe(advances === "full" ? "0" : "500");
  }
  const high = twoOwnerMarketplaceHealthInput(2026, "full");
  if (!high.scheduleC || !high.scheduleF) throw new Error("Missing actual synthetic businesses");
  high.scheduleC.grossReceipts = "100000"; high.scheduleF.salesOfProductsRaised = "100000";
  const ordinary = calculateFederalTax(high);
  expect(ordinary.marketplaceHealthInsurance?.method).toBe("ordinary-no-ptc-2026");
  expect(ordinary.schedule1?.seHealthInsurance.toFixed()).toBe("9000");
  expect(ordinary.form8962?.ptcAllowed.toFixed()).toBe("0");
  expect(ordinary.form8962?.excessAPTCRepayment.toFixed()).toBe("9000");
  expect(ordinary.form7206?.businesses.map(row => [row.accountHolder, row.deduction?.toFixed()])).toEqual([["primary", "6000"], ["spouse", "3000"]]);
});
