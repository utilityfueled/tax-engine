// @vitest-environment jsdom
// Spec: spec/federal/guided-aotc-student-history.yaml, student-identity and return-year
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GuidedInterviewShell } from "@/components/guided-interview/guided-interview-shell";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { emptyCreditsData, getGuidedFlowStorageKey, loadGuidedFlowState, resumeInterviewAtSection, saveGuidedFlowState } from "@/lib/guided-interview-flow";
import { completeAocEligibility, completeDependent, completeEducationClaimant, completeW2Entry, startCompleteInterview } from "../../guided-interview/complete-facts";

it("requires current student sources in the real interview after identity or year edits", async () => {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  const personal = state.sectionData["personal-info"];
  if (!personal) throw new Error("Missing synthetic personal facts");
  state.sectionData["personal-info"] = { ...personal, dependentCount: "1", dependents: [
    { ...completeDependent, dateOfBirth: "2004-06-01", qualifiesForCTC: false, qualifiesForODC: true },
  ] };
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, wages: "50000", socialSecurityWages: "50000", socialSecurityWithheld: "3100", medicareWages: "50000", medicareWithheld: "725" }] };
  state.sectionData.credits = { ...emptyCreditsData, education: { ...emptyCreditsData.education, ...completeEducationClaimant,
    aocStudents: [{ ...completeAocEligibility, name: "Synthetic Primary", qualifiedExpenses: "4000", priorYearsClaimed: "3" }],
  } };
  const record = createWorkspaceRecord("synthetic-aotc-source-review");
  const storageKey = getGuidedFlowStorageKey(record.id);
  saveGuidedFlowState(localStorage, record.id, resumeInterviewAtSection(state, "credits"));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const elementScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { value: vi.fn(), configurable: true });

  function field(label: string) {
    return [...container.querySelectorAll("label")].find(element => element.querySelector(".guided-field-label")?.textContent === label)
      ?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
  }
  async function change(label: string, value: string) {
    const control = field(label);
    if (!control) throw new Error(`Missing field ${label}`);
    const select = control instanceof HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error(`Missing value setter for ${label}`);
    await act(async () => {
      setter.call(control, value);
      control.dispatchEvent(new Event(select ? "change" : "input", { bubbles: true }));
    });
  }

  const historyLabel = "Prior years AOTC was claimed";
  const reviewLabel = "Have you checked the actual records for this AOTC student and tax year?";
  function saved() {
    const restored = loadGuidedFlowState(localStorage, record.id);
    if (!restored) throw new Error("Missing saved synthetic interview");
    return restored;
  }
  try {
    await act(async () => root.render(<GuidedInterviewShell workspace={record} onExitGuided={() => {}} />));
    expect(field(historyLabel)?.value).toBe("3");
    const associatedLabel = field(historyLabel)?.closest("label")?.cloneNode(true) as HTMLLabelElement | undefined;
    associatedLabel?.querySelector("select")?.remove();
    expect(associatedLabel?.textContent?.trim()).toBe(historyLabel);
    const historyDescription = field(historyLabel)?.getAttribute("aria-describedby");
    expect(document.getElementById(historyDescription ?? "")?.textContent).toContain("Count each prior tax year anyone claimed the credit for this student.");
    expect(buildTaxInputFromGuidedData(saved())?.educationExpenses?.aocStudents[0]?.priorYearsClaimed).toBe(3);
    await change("Student name", "Synthetic Dependent");
    await change("Student's actual SSN, ITIN or ATIN", completeDependent.ssn);
    await change("Student's household role", "dependent");
    expect(field(historyLabel)?.value).toBe("");
    await change(historyLabel, "0");
    expect(field(reviewLabel)?.value).toBe("");
    const reviewDescription = field(reviewLabel)?.getAttribute("aria-describedby");
    expect(document.getElementById(reviewDescription ?? "")?.textContent).toContain("Check the saved expenses");
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await change(reviewLabel, "false");
    expect(field(reviewLabel)?.value).toBe("false");
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await change(reviewLabel, "true");
    expect(buildTaxInputFromGuidedData(saved())?.educationExpenses?.aocStudents[0]?.priorYearsClaimed).toBe(0);

    await change("Enrolled at least half-time for at least one academic period", "false");
    expect(field(reviewLabel)?.value).toBe("");
    expect(field(historyLabel)?.value).toBe("0");
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await change(reviewLabel, "true");
    expect(buildTaxInputFromGuidedData(saved())?.educationExpenses?.aocStudents[0]?.enrolledAtLeastHalfTime).toBe(false);

    await change("Tax year for this interview", "2026");
    expect(saved().taxYear).toBe(2026);
    expect(field(historyLabel)?.value).toBe("");
    expect(field(reviewLabel)?.value).toBe("");
    expect(field("Is an AOTC ban from a prior claim in effect?")?.value).toBe("");
    expect(field("Is Form 8862 required because of a prior AOTC disallowance?")?.value).toBe("");
    expect(buildTaxInputFromGuidedData(saved())).toBeNull();
    await act(async () => root.render(<GuidedInterviewShell key="reopened" workspace={record} onExitGuided={() => {}} />));
    expect(field(historyLabel)?.value).toBe("");
    expect(field(reviewLabel)?.value).toBe("");
    expect(field("Qualified tuition & expenses")?.value).toBe("4000");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    scroll.mockRestore();
    vi.unstubAllGlobals();
    if (elementScroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", elementScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    localStorage.removeItem(storageKey);
  }
});
