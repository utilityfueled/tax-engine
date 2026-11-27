// @vitest-environment jsdom
// Spec: spec/federal/guided-personal-ev-charger-8911.yaml.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionCredits } from "@/components/guided-interview/section-credits";
import { calculateForm8911 } from "@/engine/forms/form-8911";
import { TaxYearInputSchema } from "@/models/inputs";
import { d } from "@/utils/decimal";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import {
  buildSectionRoute, emptyCreditsData, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData, validateSection,
  type FilingStatus,
} from "@/lib/guided-interview-flow";
import { completePersonalInfo, startCompleteInterview } from "./complete-facts";

const original = {
  owner: "primary" as const,
  invoiceReference: "Synthetic original invoice",
  placedInServiceReference: "Synthetic commissioning record",
  censusTractSourceReference: "Synthetic geocoder location result",
  censusTractGeoid: "01001020100",
  placedInServiceDate: "2026-06-30",
  invoiceGrossCost: "4,000.55",
  nonqualifyingInvoiceCost: "0",
  rebatesAndOtherBasisReductions: "875.01",
  originalUseBeganWithTaxpayer: true,
  oneNewChargingPortConfirmed: true,
  domesticMainHomeConfirmed: true,
  personalUseOnlyConfirmed: true,
  invoiceReconciledConfirmed: true,
  censusTractMatchesLocationConfirmed: true,
  sourceFactsConfirmed: true,
  confirmedFilingStatus: "single" as FilingStatus,
};

function household(source?: Partial<NonNullable<typeof emptyCreditsData.personalEvCharger>>, year = 2026, filingStatus: FilingStatus = "single") {
  const state = startCompleteInterview({ filingStatus, incomeTypes: [], lifeEvents: [], stateCode: null });
  state.taxYear = year;
  if (year === 2026) state.sectionData.review = { qof2026Disclosure: false };
  state.sectionData.credits = { ...emptyCreditsData, ...(source ? { personalEvCharger: { ...original, ...source } } : {}) };
  return state;
}

beforeEach(() => vi.setSystemTime(new Date(2026, 10, 26, 12)));
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

it("passes one actual personal charging port from Credits to the federal input", () => {
  const state = household({});
  const { sourceFactsConfirmed: _sourceFactsConfirmed, confirmedFilingStatus: _confirmedFilingStatus, ...engineFacts } = original;
  expect(buildSectionRoute(state.segmentation).some(section => section.id === "credits")).toBe(true);
  expect(validateSection(state, "credits").status).toBe("complete");
  expect(buildTaxInputFromGuidedData(state)?.form8911).toEqual({ ...engineFacts, taxYear: 2026, invoiceGrossCost: "4000.55" });
  function resolveTract(censusTractGeoid: string) {
    const { form8911 } = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(household({ censusTractGeoid })));
    if (!form8911) throw new Error("Expected schema-certified Form 8911 sources");
    return calculateForm8911(form8911, {
      taxYear: 2026, filingStatus: "single", spousePresent: false, incomeTax: d(5000),
      schedule2PartIAdditions: d(0), foreignTaxCredit: d(0), priorAllowableCredits: d(0), tentativeMinimumTax: d(0),
    }).personalCredit.toFixed();
  }
  expect(resolveTract(original.censusTractGeoid)).toBe("938");
  expect(resolveTract("01001020300")).toBe("0");
  const spouse = household({ owner: "spouse", confirmedFilingStatus: "mfj" }, 2026, "mfj");
  expect(buildTaxInputFromGuidedData(spouse)?.form8911?.owner).toBe("spouse");
  expect(buildTaxInputFromGuidedData(household(undefined, 2025))).not.toHaveProperty("form8911");
});

it("reopens separately invoiced ports with independent costs and service dates", () => {
  const first = { ...original, invoiceGrossCost: "4,000.00", rebatesAndOtherBasisReductions: "0" };
  const second = { ...first, portReference: "Synthetic port B", invoiceReference: "Second synthetic invoice", placedInServiceDate: "2026-07-01" };
  const additionalPortSources = { firstPortReference: "Synthetic port A", independentCostsConfirmed: true, ports: [second] };
  const state = household({ ...first, additionalPortSources });
  expect(saveGuidedFlowState(localStorage, "separate-ports", state)).toBe(true);
  const reopened = loadGuidedFlowState(localStorage, "separate-ports");
  if (!reopened) throw new Error("Reopen both original ports");
  expect(reopened.sectionData.credits?.personalEvCharger?.additionalPortSources).toEqual(additionalPortSources);
  expect(validateSection(reopened, "credits").status).toBe("complete");
  const { form8911 } = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(reopened));
  if (!form8911) throw new Error("Missing actual port sources");
  expect(form8911.additionalPortSources?.ports).toMatchObject([{ portReference: second.portReference, placedInServiceDate: "2026-07-01", invoiceGrossCost: "4000" }]);
  expect(calculateForm8911(form8911, {
    taxYear: 2026, filingStatus: "single", spousePresent: false, incomeTax: d(5000),
    schedule2PartIAdditions: d(0), foreignTaxCredit: d(0), priorAllowableCredits: d(0), tentativeMinimumTax: d(0),
  }).personalCredit.toFixed()).toBe("1000");
  for (const packet of [
    { ...additionalPortSources, independentCostsConfirmed: false },
    { ...additionalPortSources, ports: [{ ...second, invoiceReference: first.invoiceReference }] },
    { ...additionalPortSources, ports: [{ ...second, placedInServiceDate: "2026-12-01" }] },
    { ...additionalPortSources, ports: [{ ...second, personalUseOnlyConfirmed: false }] },
  ]) {
    const held = household({ ...first, additionalPortSources: packet });
    expect(validateSection(held, "credits").status).toBe("partial");
    expect(buildTaxInputFromGuidedData(held)).toBeNull();
  }
});

it("holds incomplete and unsupported records while preserving known facts", () => {
  for (const patch of [
    { invoiceReference: "" }, { placedInServiceReference: "" }, { censusTractSourceReference: "" },
    { censusTractGeoid: "1001020100" }, { censusTractGeoid: "01O01020100" }, { censusTractGeoid: "78030990000" },
    { placedInServiceDate: "2026-02-30" }, { placedInServiceDate: "2025-06-30" }, { placedInServiceDate: "2026-12-01" },
    { invoiceGrossCost: "0" }, { invoiceGrossCost: "1000000000000" }, { nonqualifyingInvoiceCost: "" }, { rebatesAndOtherBasisReductions: "" },
    { nonqualifyingInvoiceCost: "-1" }, { nonqualifyingInvoiceCost: "0.001" }, { nonqualifyingInvoiceCost: "3125.55" },
    { oneNewChargingPortConfirmed: false }, { personalUseOnlyConfirmed: false }, { originalUseBeganWithTaxpayer: null },
    { censusTractMatchesLocationConfirmed: null }, { sourceFactsConfirmed: null },
    { owner: "spouse" }, { confirmedFilingStatus: "mfj" },
  ] as const) {
    const state = household(patch);
    expect(validateSection(state, "credits").fieldErrors, JSON.stringify(patch)).toHaveProperty("personalEvCharger");
    expect(buildTaxInputFromGuidedData(state), JSON.stringify(patch)).toBeNull();
  }
  const late = household({ placedInServiceDate: "2026-07-01" });
  expect(buildTaxInputFromGuidedData(late)?.form8911?.placedInServiceDate).toBe("2026-07-01");
  const fullOffsets = household({ nonqualifyingInvoiceCost: "3125.54" });
  expect(buildTaxInputFromGuidedData(fullOffsets)?.form8911?.nonqualifyingInvoiceCost).toBe("3125.54");
});

it("retains actual records on reopen and revokes stale owner or year confirmation", () => {
  const state = household({ owner: "spouse", confirmedFilingStatus: "mfj" }, 2026, "mfj");
  saveGuidedFlowState(localStorage, "personal-charger", state);
  const reopened = loadGuidedFlowState(localStorage, "personal-charger");
  if (!reopened?.sectionData.credits?.personalEvCharger) throw new Error("Reopen the saved charging port records");
  if (!completePersonalInfo.spouse) throw new Error("Expected the joint owner's identity");
  const credits = reopened.sectionData.credits;
  const source = credits.personalEvCharger;
  expect(source).toEqual(state.sectionData.credits?.personalEvCharger);
  expect(buildTaxInputFromGuidedData(reopened)?.form8911?.owner).toBe("spouse");
  const edited = updateSectionData(reopened, "credits", { ...credits, personalEvCharger: { ...source, invoiceGrossCost: "4000.54" } });
  const changedOwner = updateSectionData(reopened, "personal-info", { ...completePersonalInfo, spouse: { ...completePersonalInfo.spouse, ssn: "222-33-5555" } });
  const changedYear = setInterviewTaxYear(setInterviewTaxYear(reopened, 2025), 2026);
  for (const changed of [edited, changedOwner, changedYear]) {
    expect(changed.sectionData.credits?.personalEvCharger).toMatchObject({ sourceFactsConfirmed: null, nonqualifyingInvoiceCost: "0", censusTractGeoid: "01001020100" });
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  }
  for (const unchanged of [
    updateSectionData(reopened, "personal-info", { ...completePersonalInfo, ssn: "111-22-3334" }),
    updateSectionData(reopened, "personal-info", { ...completePersonalInfo, addressLine1: "New mailing address" }),
    updateSectionData(reopened, "credits", { ...credits, personalEvCharger: { ...source, invoiceGrossCost: "4000.55" } }),
  ]) {
    expect(buildTaxInputFromGuidedData(unchanged)?.form8911?.owner).toBe("spouse");
  }
});

it("requires fresh confirmation after editing an additional port or its owner", () => {
  const additionalPort = {
    ...original, portReference: "Port B", invoiceReference: "Second invoice",
    owner: "spouse" as const, confirmedFilingStatus: "mfj" as const,
  };
  const state = household({
    confirmedFilingStatus: "mfj",
    additionalPortSources: { firstPortReference: "Port A", independentCostsConfirmed: true, ports: [additionalPort] },
  }, 2026, "mfj");
  const credits = state.sectionData.credits;
  const source = credits?.personalEvCharger;
  const additional = source?.additionalPortSources;
  if (!additional || !completePersonalInfo.spouse) throw new Error("Expected original records for both joint owners");
  expect(buildTaxInputFromGuidedData(state)?.form8911?.additionalPortSources?.ports[0]?.owner).toBe("spouse");
  const editSecondAmount = (invoiceGrossCost: string) => updateSectionData(state, "credits", {
    ...credits, personalEvCharger: { ...source, additionalPortSources: {
      ...additional, ports: [{ ...additionalPort, invoiceGrossCost }],
    } },
  });
  expect(buildTaxInputFromGuidedData(editSecondAmount("4000.55"))?.form8911?.additionalPortSources?.ports[0]?.invoiceGrossCost).toBe("4000.55");
  const edited = editSecondAmount("4,000.57");
  expect(edited.sectionData.credits?.personalEvCharger).toMatchObject({
    sourceFactsConfirmed: true,
    additionalPortSources: {
      independentCostsConfirmed: null,
      ports: [{ sourceFactsConfirmed: null, invoiceGrossCost: "4,000.57", invoiceReference: "Second invoice" }],
    },
  });
  for (const changed of [
    edited,
    updateSectionData(state, "personal-info", { ...completePersonalInfo, spouse: { ...completePersonalInfo.spouse, ssn: "222-33-5555" } }),
    setInterviewTaxYear(setInterviewTaxYear(state, 2025), 2026),
  ]) {
    expect(changed.sectionData.credits?.personalEvCharger?.additionalPortSources).toMatchObject({
      independentCostsConfirmed: null,
      ports: [{ sourceFactsConfirmed: null, portReference: "Port B" }],
    });
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  }
});

it("offers the worksheet through Credits and shows the unsupported-year hold on retained records", () => {
  const render = (state: ReturnType<typeof household>) => renderToStaticMarkup(createElement(SectionCredits, {
    data: state.sectionData.credits, filingStatus: state.segmentation.filingStatus, taxYear: state.taxYear,
    hasDependents: false, onDataChange: () => {},
  }));
  expect(render(household())).toContain("Add personal EV charger");
  expect(render(household({}, 2026))).toContain("2020 census tract GEOID");
  expect(render(household({}, 2026))).toContain("Add another separately invoiced charging port");
  const separate = render(household({ additionalPortSources: {
    firstPortReference: "Port A", independentCostsConfirmed: null,
    ports: [{ ...original, portReference: "Port B", invoiceReference: "Second invoice" }],
  } }));
  expect(separate).toContain("Original reference identifying charging port 1");
  expect(separate).toContain("Original reference identifying charging port 2");
  expect(separate).toContain("Each port has a separate invoice");
  expect(render(household({ placedInServiceDate: "2026-07-01" }))).toContain("Property placed in service after June 30, 2026 is ineligible");
  expect(render(household({ personalUseOnlyConfirmed: false }))).toContain("These records need separate review");
  expect(render(household(undefined, 2025))).not.toContain("Add personal EV charger");
  expect(render(household({}, 2025))).toContain("This worksheet covers 2026 records");
});
