// @vitest-environment jsdom
// Spec: spec/federal/guided-federal-payment-receipts.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionPayments } from "@/components/guided-interview/section-payments";
import { emptyPaymentData, type PaymentData } from "@/lib/guided-interview-flow";
import { allPaymentFactErrors } from "@/lib/guided-required-facts";

it("reconciles matching payment rows through the 2025 and 2026 Payments panel", async () => {
  const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let latest: PaymentData = {
    ...emptyPaymentData,
    estimatedPayments: [{ date: "2026-01-15", amount: "500", application: { taxYear: "2025", confirmed: true } }],
    extensionPayments: [{ date: "2026-01-15", amount: "500.00" }],
  };
  function Harness({ year = 2025 }: { year?: number }) {
    const [data, setData] = useState(latest);
    return <SectionPayments data={data} taxYear={year} onDataChange={next => { latest = next; setData(next); }} />;
  }
  function field(name: string) {
    return [...container.querySelectorAll("label")].find(label => label.querySelector(".guided-field-label")?.textContent === name)?.querySelector("input");
  }
  async function enter(name: string, value: string) {
    const input = field(name);
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!input || !setValue) throw new Error(`Missing field ${name}`);
    await act(async () => {
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(allPaymentFactErrors(latest, 2025)).toHaveProperty("payment-0-receipt-reference");
    const others = [...container.querySelectorAll("summary")].find(summary => summary.textContent === "Other payments");
    if (!others) throw new Error("Missing Other payments panel");
    await act(async () => others.click());
    await enter("Estimated payment #1 receipt reference", "Synthetic receipt A");
    await enter("Extension payment #1 receipt reference", "synthetic receipt a");
    await enter("Extension payment #1 date", "2026-04-15");
    expect(latest.extensionPayments?.[0]?.receiptReference).toBe("synthetic receipt a");
    expect(allPaymentFactErrors(latest, 2025)).toHaveProperty("extension-payment-0-receipt-reference");
    await enter("Extension payment #1 receipt reference", "Synthetic receipt B");
    expect(allPaymentFactErrors(latest, 2025)).toEqual({});

    await act(async () => root.render(<Harness year={2026} />));
    expect(field("Estimated payment #1 receipt reference")?.value).toBe("Synthetic receipt A");
    expect(field("Extension payment #1 receipt reference")?.value).toBe("Synthetic receipt B");
    await enter("Extension payment #1 receipt reference", "synthetic receipt a");
    expect(allPaymentFactErrors(latest, 2026)).toHaveProperty("extension-payment-0-receipt-reference");
    await act(async () => root.render(<Harness year={2024} />));
    expect(field("Estimated payment #1 receipt reference")).toBeUndefined();
    expect(field("Extension payment #1 receipt reference")).toBeUndefined();
    expect(latest.estimatedPayments[0]?.receiptReference).toBe("Synthetic receipt A");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
