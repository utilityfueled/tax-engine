// @vitest-environment jsdom
// Spec: spec/federal/qof-disposition-facts.yaml.
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { QofDispositionDetails } from "@/components/guided-interview/qof-disposition-details";
import type { QofDispositionData } from "@/lib/guided-qof-facts";

it("collects the actual QOF answer and keeps unanswered sources unknown", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network expected"));
  let latest: QofDispositionData | undefined;
  function Harness() { const [data, setData] = useState<QofDispositionData>(); return <QofDispositionDetails data={data} onChange={value => { latest = value; setData(value); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find(row => row.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
    if (!field) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing field setter");
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />)); await click("Add actual QOF disposition answer");
    expect(latest?.sourceTaxYear).toBe(""); expect(latest?.disposedOfQofInvestment).toBeNull(); expect(latest?.allInvestmentsReviewed).toBeNull();
    await change("QOF source tax year", "2025"); await change("QOF investment record reference", "Actual broker and private investment records");
    await change("Disposed of a qualified opportunity fund investment during this year", "false");
    expect(latest?.disposedOfQofInvestment).toBe(false);
    await change("All actual investment records reviewed for QOF dispositions", "true"); await change("QOF sources checked after the last edit", "true");
    expect(latest?.sourceFactsConfirmed).toBe(true);
    await change("Disposed of a qualified opportunity fund investment during this year", "true");
    expect(latest?.disposedOfQofInvestment).toBe(true); expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Form 8997");
    expect(latest?.sourceReference).toBe("Actual broker and private investment records");
    await change("Disposed of a qualified opportunity fund investment during this year", ""); expect(latest?.disposedOfQofInvestment).toBeNull();
    await click("Remove QOF disposition worksheet"); expect(latest).toBeUndefined(); expect(network).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); network.mockRestore(); }
});

it("adds complete QOF investment rows and revokes changed confirmations", async () => {
  // Spec: spec/federal/qof-deferred-gain-inclusion.yaml guide-controls.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  const start: QofDispositionData = { sourceTaxYear: "2026", sourceReference: "Fictional records", sourceFactsConfirmed: true, allInvestmentsReviewed: true, disposedOfQofInvestment: false, deferredGainHeldAtYearEnd: true };
  let latest: QofDispositionData | undefined = start;
  function Harness() { const [data, setData] = useState<QofDispositionData | undefined>(start); return <QofDispositionDetails data={data} onChange={value => { latest = value; setData(value); }} />; }
  const click = async (label: string) => { const button = [...container.querySelectorAll("button")].find(row => row.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); };
  const field = (label: string) => [...container.querySelectorAll("label")].find(row => row.querySelector(".guided-field-label")?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select");
  const change = async (label: string, value: string) => {
    const target = field(label); if (!target) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(target.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    await act(async () => { setter?.call(target, value); target.dispatchEvent(new Event(target.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
  };
  try {
    await act(async () => root.render(<Harness />));
    expect(container.querySelector("[role=status]")?.textContent).toContain("Add each investment");
    await click("Add QOF investment");
    expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.investments).toHaveLength(1);
    expect(latest?.investments?.[0]).toMatchObject({ remainingDeferredGain: "", entireInvestment: null, sourceFactsConfirmed: null });
    await change("QOF investment 1: Interest type", "corporation");
    await change("QOF investment 1: Sources checked after the last edit", "true");
    expect(latest?.investments?.[0]?.sourceFactsConfirmed).toBe(true);
    await change("QOF investment 1: Fair market value on the event date", "0");
    expect(latest?.investments?.[0]).toMatchObject({ fairMarketValue: "0", sourceFactsConfirmed: null });
    expect(field("QOF investment 1: Sale proceeds")).toBeUndefined();
    await change("QOF investment 1: Inclusion event", "sale_or_exchange");
    expect(field("QOF investment 1: Sale proceeds")).toBeDefined();
    await click("Remove QOF investment 1");
    expect(latest?.investments).toEqual([]);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
