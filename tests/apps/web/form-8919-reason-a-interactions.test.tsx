// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Form8919ReasonADetails } from "@/components/guided-interview/form-8919-reason-a-details";
import type { GuidedForm8919ReasonA } from "@/lib/guided-form-8919-reason-a";

it("keeps the original NEC confirmation separate from the no-1099 wage summary", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Interview() {
    const [data, setData] = useState<GuidedForm8919ReasonA | undefined>({
      taxYear: "2026", firmName: "Synthetic Services", employerEin: "65-4321098",
      determinationDate: "2026-02-12", wages: "1000.25", confirmed: true,
    });
    return <Form8919ReasonADetails data={data} taxYear={2026} onChange={setData} />;
  }

  function control(label: string) {
    const field = [...container.querySelectorAll("label")].find(entry => entry.textContent?.includes(label))?.querySelector("input");
    if (!field) throw new Error(`Missing ${label}`);
    return field;
  }

  async function click(label: string) {
    const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === label);
    if (!button) throw new Error(`Missing ${label}`);
    await act(async () => button.click());
  }

  try {
    await act(async () => root.render(<Interview />));
    expect(control("received no Form 1099").checked).toBe(true);
    await click("Add original Form 1099-NEC instead of Form W-2");
    expect(control("received this Form 1099-NEC instead").checked).toBe(false);
    expect(control("received this Form 1099-NEC instead").disabled).toBe(true);
    expect(control("Prepare the federal return only. State filing is separate.").checked).toBe(false);
    expect(control("Date you received the IRS determination").value).toBe("");
    expect(control("1099-NEC Box 4 federal withholding").value).toBe("");
    await click("Remove original Form 1099-NEC");
    expect(control("received no Form 1099").checked).toBe(false);
    expect(control("Form 8919 employer EIN").value).toBe("65-4321098");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
