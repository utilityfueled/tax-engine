// @vitest-environment jsdom
// Spec: spec/federal/guided-input.yaml, federal-payment-application
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionPayments } from "@/components/guided-interview/section-payments";
import { emptyPaymentData, type PaymentData } from "@/lib/guided-interview-flow";
import { allPaymentFactErrors } from "@/lib/guided-required-facts";

it("isolates exact-year confirmation by payment and revokes it after a source edit", async () => {
  const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: PaymentData = {
    ...emptyPaymentData,
    estimatedPayments: [{ date: "2026-04-15", amount: "1000" }],
    extensionPayments: [{ date: "2027-04-15", amount: "0" }],
  };
  function Harness() {
    const [data, setData] = useState(latest);
    return <SectionPayments data={data} taxYear={2025} onDataChange={next => {
      latest = next;
      setData(next);
    }} />;
  }
  function field(label: string) {
    return [...container.querySelectorAll("label")].find(entry =>
      entry.querySelector(".guided-field-label")?.textContent === label
    )?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
  }
  async function change(label: string, value: string) {
    const control = field(label);
    if (!control) throw new Error(`Missing field ${label}`);
    const isSelect = control instanceof HTMLSelectElement;
    const prototype = isSelect ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setValue = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setValue) throw new Error(`Missing value setter for ${label}`);
    await act(async () => {
      setValue.call(control, value);
      control.dispatchEvent(new Event(isSelect ? "change" : "input", { bubbles: true }));
    });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(field("Estimated payment #1 IRS application tax year")).toBeUndefined();
    expect(field("Extension payment #1 IRS application tax year")?.value).toBe("");
    expect(field("Extension payment #1 applies to this return")?.value).toBe("");
    await change("Extension payment #1 IRS application tax year", "2025");
    await change("Extension payment #1 applies to this return", "false");
    expect(latest.extensionPayments?.[0]?.application?.confirmed).toBe(false);
    expect(allPaymentFactErrors(latest, 2025)).toHaveProperty("extension-payment-0-application-confirmation");
    await change("Extension payment #1 applies to this return", "true");
    expect(allPaymentFactErrors(latest, 2025)).toEqual({});

    await change("Date paid", "2027-01-15");
    expect(field("Estimated payment #1 applies to this return")?.value).toBe("");
    await change("Estimated payment #1 IRS application tax year", "2025");
    await change("Estimated payment #1 applies to this return", "true");
    await change("Amount paid", "1,000");
    expect(latest.estimatedPayments[0]?.application?.confirmed).toBe(true);
    await change("Amount paid", "1000.01");
    expect(latest.estimatedPayments[0]?.application).toEqual({ taxYear: "2025", confirmed: null });
    expect(latest.extensionPayments?.[0]?.application?.confirmed).toBe(true);
    await change("Estimated payment #1 applies to this return", "true");
    await change("Date paid", "2027-01-16");
    expect(latest.estimatedPayments[0]?.application?.confirmed).toBeNull();
    await change("Estimated payment #1 applies to this return", "true");
    await change("Estimated payment #1 IRS application tax year", "2024");
    expect(latest.estimatedPayments[0]?.application).toEqual({ taxYear: "2024", confirmed: null });
    await change("Extension payment #1 amount", "0.01");
    expect(latest.extensionPayments?.[0]?.application).toEqual({ taxYear: "2025", confirmed: null });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
