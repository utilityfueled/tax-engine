// @vitest-environment jsdom
// Spec: spec/federal/guided-estimated-tax.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EstimatedTaxSourceDetails } from "@/components/guided-interview/estimated-tax-source-details";
import type { EstimatedTaxFactsData } from "@/lib/guided-estimated-tax-facts";
it("collects actual history and dates while preserving unknowns and exact amounts", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network expected"));
  let latest: EstimatedTaxFactsData | undefined;
  function Harness() { const [data, setData] = useState<EstimatedTaxFactsData>(); return <EstimatedTaxSourceDetails data={data} taxYear={2025} appliedCredits={[{ sourceTaxYear: "2024", amount: "9007199254740993.01" }]} onChange={value => { latest = value; setData(value); }} />; }
  const control = (label: string) => { const field = [...container.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select"); if (!field) throw new Error(`Missing${label}`); return field; };
  async function change(label: string, value: string) { const field = control(label); await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }); }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(row => row.textContent === label); if (!button) throw new Error(`Missing${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />)); await click("Add estimated-tax worksheet");
    expect(latest?.sourceTaxYear).toBe(""); expect(latest?.priorYearTaxForForm2210).toBe(""); expect(latest?.priorYearJointReturn).toBeNull();
    await change("Estimated-tax source year", "2025"); await change("Estimated-tax source reference", "Actual IRS ledger");
    await change("Prior-year return and tax status", "no-tax-liability");
    expect(latest?.priorYearTaxForForm2210).toBe("");
    expect(container.textContent).toContain("Enter the amount before the high-income 110% multiplier");
    await change("Actual prior-year tax before the 110% multiplier", "0"); await change("Actual prior-year AGI", "-123.45");
    expect(control("Actual prior-year AGI").getAttribute("aria-invalid")).toBeNull();
    await change("Prior return was joint", "false"); expect(latest?.priorYearJointReturn).toBe(false);
    await change("Withholding timing method", "actual-dates"); await click("Add withholding payment");
    expect(latest?.withholdingPayments[0]).toEqual({ date: "", amount: "" });
    await change("Withholding payment 1: Actual date", "2025-12-31"); await change("Withholding payment 1: Amount", "0");
    await click("Add applied-credit effective payment"); await change("Applied-credit history 1: Original applied refund", "0");
    expect(latest?.priorYearCreditPayments[0]?.date).toBe(""); expect(latest?.priorYearCreditPayments[0]?.amount).toBe("");
    await change("Applied-credit history 1: IRS-effective date", "2025-08-01"); await change("Applied-credit history 1: Amount", "9007199254740993.01");
    expect(latest?.priorYearCreditPayments[0]?.amount).toBe("9007199254740993.01");
    await click("Add return payment"); await change("Return payment 1: Actual date", "2026-01-31"); await change("Return payment 1: Amount", "25.01");
    await change("Filed and paid in full by the early-return exception deadline", "true");
    await change("Actual return filing date", "2026-01-31"); await change("Actual return paid-in-full date", "2026-01-31");
    await change("All payment records and applicable history are included", "true"); await change("Estimated-tax sources checked after the last edit", "true");
    expect(latest?.sourceFactsConfirmed).toBe(true);
    await change("Withholding payment 1: Amount", ""); expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.withholdingPayments[0]?.amount).toBe("");
    await change("Prior return was joint", ""); expect(latest?.priorYearJointReturn).toBeNull();
    await click("Withholding payment 1: Remove"); await click("Applied-credit history 1: Remove"); await click("Return payment 1: Remove");
    expect(latest?.withholdingPayments).toEqual([]); expect(latest?.priorYearCreditPayments).toEqual([]); expect(latest?.returnPayments).toEqual([]);
    await click("Remove estimated-tax worksheet"); expect(latest).toBeUndefined(); expect(network).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); network.mockRestore(); }
});
