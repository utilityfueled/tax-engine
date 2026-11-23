// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SectionCredits } from "@/components/guided-interview/section-credits";
import { emptyCreditsData, type CreditsData, type FilingStatus } from "@/lib/guided-interview-flow";

const lastSixMonths = "Did you live apart from your spouse for the last six months of the year?";
const householdCosts = "Did you pay more than half the cost of keeping up that home for the year?";
const qualifyingMainHome = "Was your home the qualifying person's main home for more than half the year?";

let container: HTMLDivElement;
let root: Root;
let latest: CreditsData;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(data: CreditsData, filingStatus: FilingStatus, taxYear: number) {
  latest = data;
  function Harness() {
    const [credits, setCredits] = useState(data);
    return <SectionCredits data={credits} filingStatus={filingStatus} taxYear={taxYear} hasDependents
      onDataChange={next => { latest = next; setCredits(next); }} />;
  }
  await act(async () => root.render(<Harness />));
}

function select(label: string) {
  return [...container.querySelectorAll("label")].find(item => item.querySelector(".guided-field-label")?.textContent === label)?.querySelector("select");
}

async function change(label: string, answer: string) {
  const input = select(label);
  if (!input) throw new Error(`Missing Form 2441 question ${label}`);
  await act(async () => {
    input.value = answer;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("guided Form 2441 Part II living-apart answers", () => {
  it.each([2025, 2026])("preserves independent %d yes, no and unanswered controls and clears source confirmation", async year => {
    await render({ ...emptyCreditsData, dependentCare: { ...emptyCreditsData.dependentCare, sourceFactsConfirmed: true } }, "mfs", year);
    expect([lastSixMonths, householdCosts, qualifyingMainHome].map(label => select(label)?.value)).toEqual(["", "", ""]);
    await change(lastSixMonths, "true");
    await change(householdCosts, "false");
    await change(qualifyingMainHome, "true");
    await change(qualifyingMainHome, "");
    expect(latest.dependentCare).toMatchObject({ sourceFactsConfirmed: false,
      mfsLivingApart: { spouseLivedApartLast6Months: true, paidOverHalfHomeCost: false, qualifyingPersonMainHomeOverHalfYear: null } });
  });

  it("keeps Part III's existing questions and shows saved Part II answers for reconciliation", async () => {
    const withBenefits = { ...emptyCreditsData, dependentCareBenefits: {} };
    await render(withBenefits, "mfs", 2025);
    expect(select(lastSixMonths)).toBeUndefined();
    expect(select("Did your spouse live apart from you throughout the last six months of the year?")).toBeDefined();
    await render({ ...withBenefits, dependentCare: { ...withBenefits.dependentCare, mfsLivingApart: { spouseLivedApartLast6Months: false } } }, "mfs", 2025);
    expect(select(lastSixMonths)?.value).toBe("false");
  });

  it.each([["mfs", 2024], ["mfj", 2025], ["mfj", 2026]] as const)("does not display the Part II facts for %s in %d", async (status, year) => {
    await render(emptyCreditsData, status, year);
    expect(select(lastSixMonths)).toBeUndefined();
  });

  it("uses the existing Part III questions for a 2026 benefit worksheet", async () => {
    await render({ ...emptyCreditsData, dependentCareBenefits: {}, dependentCare: {
      ...emptyCreditsData.dependentCare, mfsLivingApart: { spouseLivedApartLast6Months: false },
    } }, "mfs", 2026);
    expect(select(lastSixMonths)).toBeUndefined();
    expect(select("Did your spouse live apart from you throughout the last six months of the year?")).toBeDefined();
  });
});
