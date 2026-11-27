// @vitest-environment jsdom
// Spec: spec/federal/guided-federal-payment-receipts.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SectionPayments } from "@/components/guided-interview/section-payments";
import { emptyPaymentData, startInterview, updateSectionData, type PaymentData } from "@/lib/guided-interview-flow";
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
      input.focus();
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.blur();
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

it("commits only the completed 2026 estimate and extension receipt edits", async () => {
  const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const payment = { date: "2026-01-15", amount: "100.25", application: { taxYear: "2026", confirmed: true } };
  const start = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null }, 2026);
  const initial = updateSectionData(start, "payments", {
    ...emptyPaymentData, estimatedPayments: [payment], extensionPayments: [{ ...payment, amount: "23.45" }],
  });
  let latest = initial;
  let continued: typeof initial | undefined;
  function Harness() {
    const [state, setState] = useState(initial);
    const [show, setShow] = useState(true);
    if (!show) return <p>Review</p>;
    return <>
      <SectionPayments data={state.sectionData.payments} taxYear={2026} onDataChange={data => {
        latest = updateSectionData(state, "payments", data);
        setState(latest);
      }} />
      <button type="button" onClick={() => { continued = state; setShow(false); }}>Continue</button>
    </>;
  }
  function receiptField(name: string) {
    const input = [...container.querySelectorAll("label")].find(label => label.querySelector(".guided-field-label")?.textContent === name)?.querySelector("input");
    if (!input) throw new Error(`Missing input ${name}`);
    return input;
  }
  async function write(input: HTMLInputElement, ...values: string[]) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("Missing native input setter");
    await act(async () => input.focus());
    for (const value of values) await act(async () => {
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  try {
    await act(async () => root.render(<Harness />));
    const others = [...container.querySelectorAll("summary")].find(summary => summary.textContent === "Other payments");
    if (!others) throw new Error("Missing Other payments panel");
    await act(async () => others.click());
    const estimate = receiptField("Estimated payment #1 receipt reference");
    const extension = receiptField("Extension payment #1 receipt reference");
    for (const [field, category, word] of [[estimate, "estimatedPayments", "Estimate"], [extension, "extensionPayments", "Extension"]] as const) {
      await write(field, "R", "Receipt ", `Receipt ${word}`);
      await act(async () => field.blur());
      expect(latest.sectionData.payments?.[category]?.[0]).toMatchObject({
        receiptReference: `Receipt ${word}`, application: { confirmed: true },
      });

      await write(field, "", " r", ` receipt  ${word.toLowerCase()} `);
      await act(async () => field.blur());
      expect(latest.sectionData.payments?.[category]?.[0]).toMatchObject({
        receiptReference: ` receipt  ${word.toLowerCase()} `, application: { confirmed: true },
      });
    }

    await write(estimate, "R", "Replacement estimate");
    expect(latest.sectionData.payments?.estimatedPayments[0]?.receiptReference).toBe(" receipt  estimate ");
    await act(async () => estimate.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(latest.sectionData.payments?.estimatedPayments[0]).toMatchObject({
      date: payment.date, amount: "100.25", receiptReference: "Replacement estimate", application: { taxYear: "2026", confirmed: null },
    });

    await write(extension, "R", "Replacement extension");
    const button = [...container.querySelectorAll("button")].find(item => item.textContent === "Continue");
    if (!button) throw new Error("Missing Continue button");
    await act(async () => button.focus());
    await act(async () => button.click());
    expect(continued?.sectionData.payments?.extensionPayments?.[0]).toMatchObject({
      date: payment.date, amount: "23.45", receiptReference: "Replacement extension", application: { taxYear: "2026", confirmed: null },
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
