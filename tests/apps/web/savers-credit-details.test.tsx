// @vitest-environment jsdom
// Spec: spec/federal/guided-savers-credit-2026.yaml, historical record collection
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { SaversCreditDetails } from "@/components/guided-interview/savers-credit-details";
import { emptyGuidedSaversCredit, type GuidedSaversCreditData } from "@/lib/guided-savers-credit";

it.each([2024, 2025] as const)("collects %i historical records without prefilling the original year", async taxYear => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  const initial: GuidedSaversCreditData = {
    ...emptyGuidedSaversCredit,
    testingPeriod: {
      ...emptyGuidedSaversCredit.testingPeriod,
      distributions: [{ sourceReference: "Issuer payment receipt", accountHolder: "primary", receivedDate: `${taxYear}-12-31`, amount: "500" }],
    },
  };
  const proofButton = () => [...container.querySelectorAll("button")].find(button => button.textContent === `Add ${taxYear} Form 1099-R and payment receipt details`);
  function Interview() {
    const [data, setData] = useState<GuidedSaversCreditData | undefined>(initial);
    return <SaversCreditDetails data={data} taxYear={2026} filingStatus="single" onChange={setData} />;
  }
  try {
    await act(async () => root.render(<Interview />));
    expect(proofButton()).toBeDefined();
    await act(async () => proofButton()?.click());
    expect([...container.querySelectorAll("legend")].map(legend => legend.textContent)).toContain("Historical traditional IRA payment records");
    const yearField = [...container.querySelectorAll("label")].find(label => label.textContent === "Year printed on Form 1099-R")?.querySelector("input");
    expect(yearField?.value).toBe("");
  } finally {
    await act(async () => root.unmount());
  }
});
