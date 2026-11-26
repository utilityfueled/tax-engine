/** Spec: spec/state/guided-pa-ordinary-panels.yaml. Literal facts precede product. */
import { expect, it } from "vitest";
import * as flow from "@/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildGuidedStateOriginals } from "@/lib/guided-state-engine-inputs";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { confirmGuidedPAResidencySources, emptyGuidedPAOrdinaryNrk1Source } from "@/lib/guided-pa-residency-facts";
import { confirmGuidedPAOrdinaryReturnFacts } from "@/lib/guided-pa-ordinary-return-facts";
import { confirmGuidedPAOrdinaryReturnCompletionSources } from "@/lib/guided-pa-ordinary-return-completion";
import { computeGuidedPreview } from "@/lib/guided-preview-compute";
import { guidedPAOrdinaryPanelFixture, paPanelStatuses, required, type PAOrdinaryPanelData } from "../fixtures/guided-pa-ordinary-panels";
import { paCompletionOriginalRecordFixture } from "../fixtures/pa-ordinary-return-completion";
import { actualGuidedK1Sources } from "../fixtures/guided-k1-qbi-sources";
import { paOrdinaryCareFixture } from "../fixtures/pa-ordinary-care-sources";
import { completePersonalInfo } from "./complete-facts";
import {
  buildGuidedPACareSources, captureGuidedPACareOriginals, confirmGuidedPACareSources, emptyGuidedPA2026CarePayerReview,
  emptyGuidedPA2026OrdinaryCareReview,
} from "@/lib/guided-pa-care-sources";
function sourceInput(state: flow.GuidedFlowState): TaxYearInput | null {
  const method = (flow as unknown as { buildGuidedPAOrdinarySourceInput?: (state: flow.GuidedFlowState) => TaxYearInput | null }).buildGuidedPAOrdinarySourceInput;
  expect(typeof method).toBe("function"); return required(method)(state);
}
function data(state: flow.GuidedFlowState): PAOrdinaryPanelData { return required(state.sectionData["state-return"]); }

it("requires actual federal and payer review and replays it from the saved 2026 Pennsylvania workspace", () => {
  const prior = paOrdinaryCareFixture();
  expect(confirmGuidedPACareSources(prior.input, prior.sources.care.careSources)).toEqual(prior.sources.care.careSources);
  const { input, facts, sources } = paOrdinaryCareFixture(2026);
  const annual = emptyGuidedPA2026OrdinaryCareReview();
  const payment = emptyGuidedPA2026CarePayerReview();
  const original = sources.care.careSources;
  const pending = { ...original, ordinaryDraft2026: annual, payments: [
    { ...required(original.payments[0]), payerReview2026: payment },
  ] };
  expect(annual).toEqual({
    sourceReference: "",
    singleNotEligibleForHeadOfHouseholdConfirmed: null,
    standardDeductionOnlyAndNoOtherFederalTaxReductionsConfirmed: null,
    directFederalDependentEligibilityConfirmed: null,
    unrelatedProviderEligibilityConfirmed: null,
    sameExpensesWillBeClaimedOnFederalReturnConfirmed: null,
  });
  expect(Object.values(payment)).toEqual(["", null, null]);
  expect(() => confirmGuidedPACareSources(input, pending)).toThrow(/2026.*federal/i);
  const reviewed = {
    ...pending,
    ordinaryDraft2026: {
      sourceReference: "Reviewed fictional federal filing-status, deduction, credit, child and provider originals",
      singleNotEligibleForHeadOfHouseholdConfirmed: true,
      standardDeductionOnlyAndNoOtherFederalTaxReductionsConfirmed: true,
      directFederalDependentEligibilityConfirmed: true,
      unrelatedProviderEligibilityConfirmed: true,
      sameExpensesWillBeClaimedOnFederalReturnConfirmed: true,
    },
  };
  expect(() => confirmGuidedPACareSources(input, {
    ...reviewed, ordinaryDraft2026: { ...reviewed.ordinaryDraft2026, unrelatedProviderEligibilityConfirmed: false },
  })).toThrow(/2026.*federal/i);
  expect(() => confirmGuidedPACareSources(input, reviewed)).toThrow(/payer/i);
  const confirmed = confirmGuidedPACareSources(input, { ...reviewed, payments: [{
    ...required(reviewed.payments[0]), payerReview2026: {
      sourceReference: "Reviewed fictional claimant bank statement and reimbursement records",
      claimantPaidWithOwnFundsConfirmed: true, noThirdPartyPaymentOrReimbursementConfirmed: true,
    },
  }] });
  expect(confirmed.payments[0]?.payerReview2026?.claimantPaidWithOwnFundsConfirmed).toBe(true);
  expect(captureGuidedPACareOriginals(input, confirmed, true).ordinaryDraft2026).toEqual(confirmed.ordinaryDraft2026);
  const corrected = { ...input, dependentCare: { ...input.dependentCare, expenses: "3100" } };
  const captured = captureGuidedPACareOriginals(corrected, confirmed, true);
  expect(captured.sourceFactsConfirmed).toBeNull();
  expect(captured.ordinaryDraft2026).toEqual({ ...annual, sourceReference: confirmed.ordinaryDraft2026?.sourceReference });
  expect(captured.payments[0]?.payerReview2026).toEqual({ ...payment, sourceReference: confirmed.payments[0]?.payerReview2026?.sourceReference });
  expect(() => confirmGuidedPACareSources(corrected, captured)).toThrow(/2026.*federal/i);

  const state = flow.startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "PA" }, 2026);
  state.sectionData["personal-info"] = {
    ...completePersonalInfo, firstName: input.taxpayer.primary.firstName, lastName: input.taxpayer.primary.lastName, ssn: input.taxpayer.primary.ssn,
  };
  const residency = confirmGuidedPAResidencySources(input, input.paResidencySources);
  const current = { ...input, paResidencySources: residency };
  const ordinary = confirmGuidedPAOrdinaryReturnFacts(current, facts);
  const completion = confirmGuidedPAOrdinaryReturnCompletionSources(current, { ...sources, care: { ...sources.care, careSources: confirmed } }, ordinary);
  state.sectionData["state-return"] = {
    stateEstimatedPayments: [], additionalStateWithholding: "",
    paResidencySources: residency, paOrdinaryReturnFacts: ordinary, paOrdinaryReturnCompletionSources: completion,
  };
  const reopened = required(flow.parseGuidedFlowState(JSON.stringify(state)));
  const rebuilt = buildGuidedStateOriginals(input, reopened);
  expect(rebuilt.paOrdinaryReturnCompletionSources?.care.careSources).toEqual(confirmed);
  const personal = required(reopened.sectionData["personal-info"]);
  const changed = flow.updateSectionData(reopened, "personal-info", { ...personal, lastName: "Changed actual owner" });
  const stale = data(changed).paOrdinaryReturnCompletionSources;
  expect(stale?.sourceFactsConfirmed).toBeNull();
  expect(stale?.care.careSources?.ordinaryDraft2026).toEqual(captured.ordinaryDraft2026);
  expect(stale?.care.careSources?.payments[0]?.payerReview2026).toEqual(captured.payments[0]?.payerReview2026);
  expect(stale?.care.originalCarePayments).toEqual(completion.care.originalCarePayments);
});

it("replays the actual 2026 PA care household worksheet and renews it after original edits", () => {
  const { input, facts, sources } = paOrdinaryCareFixture(2026);
  const { firstName, lastName, ssn, dateOfBirth } = input.taxpayer.primary;
  const child = required(input.taxpayer.dependents[0]);
  const residence = confirmGuidedPAResidencySources(input, input.paResidencySources);
  const actual: TaxYearInput = {
    ...input, paResidencySources: residence,
    taxpayer: { ...input.taxpayer, filingStatus: "head_of_household", primary: { ...input.taxpayer.primary, usResidencyMonths: 12 }, address: { street: "18 Fictional Household Way", city: "Pittsburgh", state: "PA", zip: "15201" } },
    standardDeductionFacts: { primaryCanBeClaimedAsDependent: false, nonresidentAlien: false, dualStatusAlien: false, shortTaxYear: false, primaryDeathDate: null },
  };
  const original = sources.care.careSources;
  const household = {
    taxYear: "2026", sourceReference: "Fictional household worksheet", primary: { firstName, lastName, ssn, dateOfBirth },
    homeAddress: actual.taxpayer.address,
    child: { firstName: child.firstName, lastName: child.lastName, ssn: child.ssn, dateOfBirth: child.dateOfBirth, dependentIndex: "0", relationship: "child", actualNightsInHome: "365" },
    totalEligibleHomeCosts: "10,000.00", paidByPrimary: "5,000.01",
    unmarriedAndNotSurvivingSpouseConfirmed: true, fullYearResidentAndNotDependentConfirmed: true,
    qualifyingChildTestsConfirmed: true, noOtherQualifyingClaimantConfirmed: true, noSpecialQualificationRulesConfirmed: true,
    eligibleUpkeepCostsAndPaymentsCompleteConfirmed: true, primaryPaymentsFromOwnFundsConfirmed: true,
  };
  const pending = {
    ...original, ordinaryDraft2026: {
      sourceReference: "Fictional federal care claim review", singleNotEligibleForHeadOfHouseholdConfirmed: null,
      standardDeductionOnlyAndNoOtherFederalTaxReductionsConfirmed: true, directFederalDependentEligibilityConfirmed: true,
      unrelatedProviderEligibilityConfirmed: true, sameExpensesWillBeClaimedOnFederalReturnConfirmed: true,
    },
    headOfHousehold2026: { actualAllYearPAMainHomeConfirmed: true, originalHousehold: household },
    payments: [{ ...required(original.payments[0]), payerReview2026: {
      sourceReference: "Fictional original claimant payment", claimantPaidWithOwnFundsConfirmed: true, noThirdPartyPaymentOrReimbursementConfirmed: true,
    } }],
  };
  const confirmed = confirmGuidedPACareSources(actual, pending);
  expect(confirmed.headOfHousehold2026?.originalHousehold).toEqual(household);
  const canonical = buildGuidedPACareSources(actual, confirmed);
  expect(canonical.headOfHousehold2026?.originalHousehold).toMatchObject({ taxYear: 2026, paidByPrimary: "5000.01", child: { dependentIndex: 0, actualNightsInHome: 365 } });
  expect(() => confirmGuidedPACareSources(actual, { ...pending, headOfHousehold2026: undefined })).toThrow(/household/i);
  for (const patch of [{ paidByPrimary: "5000.00" }, { child: { ...household.child, actualNightsInHome: "364" } }, { homeAddress: { ...household.homeAddress, state: "OH" } }]) {
    expect(() => confirmGuidedPACareSources(actual, { ...pending, headOfHousehold2026: { ...pending.headOfHousehold2026, originalHousehold: { ...household, ...patch } } })).toThrow(/household/i);
  }
  expect(() => confirmGuidedPACareSources({ ...actual, taxpayer: { ...actual.taxpayer, filingStatus: "single" } }, pending)).toThrow(/household|single/i);

  const state = flow.startInterview({ filingStatus: "hoh", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "PA" }, 2026);
  state.sectionData["personal-info"] = { ...completePersonalInfo, firstName, lastName, ssn, dateOfBirth };
  const ordinary = confirmGuidedPAOrdinaryReturnFacts(actual, facts);
  const completion = confirmGuidedPAOrdinaryReturnCompletionSources(actual, { ...sources, care: { ...sources.care, careSources: confirmed } }, ordinary);
  state.sectionData["state-return"] = { stateEstimatedPayments: [], additionalStateWithholding: "", paResidencySources: residence, paOrdinaryReturnFacts: ordinary, paOrdinaryReturnCompletionSources: completion };
  const reopened = required(flow.parseGuidedFlowState(JSON.stringify(state)));
  expect(buildGuidedStateOriginals(actual, reopened).paOrdinaryReturnCompletionSources?.care.careSources).toEqual(canonical);
  const personal = required(reopened.sectionData["personal-info"]);
  for (const edited of [flow.updateSectionData(reopened, "personal-info", { ...personal, addressLine1: "Changed original home" }), flow.setInterviewTaxYear(flow.setInterviewTaxYear(reopened, 2025), 2026)]) {
    const renewed = data(edited).paOrdinaryReturnCompletionSources;
    expect(renewed?.sourceFactsConfirmed).toBeNull();
    expect(renewed?.care.careSources?.sourceFactsConfirmed).toBeNull();
    expect(renewed?.care.careSources?.headOfHousehold2026).toMatchObject({ actualAllYearPAMainHomeConfirmed: null, originalHousehold: { sourceReference: household.sourceReference, paidByPrimary: "5,000.01", primaryPaymentsFromOwnFundsConfirmed: null } });
  }
  const editedHousehold = { ...pending.headOfHousehold2026, originalHousehold: { ...household, paidByPrimary: "6000" } };
  const edited = flow.updateSectionData(reopened, "state-return", { ...data(reopened), paOrdinaryReturnCompletionSources: { ...completion, care: { ...completion.care, careSources: { ...confirmed, headOfHousehold2026: editedHousehold } } } });
  expect(data(edited).paOrdinaryReturnCompletionSources?.care.careSources?.headOfHousehold2026).toMatchObject({ actualAllYearPAMainHomeConfirmed: null, originalHousehold: { paidByPrimary: "6000", primaryPaymentsFromOwnFundsConfirmed: null } });
  const reviewedAfterEdit = confirmGuidedPACareSources(actual, { ...confirmed, headOfHousehold2026: editedHousehold });
  const reviewOnly = flow.updateSectionData(edited, "state-return", { ...data(edited), paOrdinaryReturnCompletionSources: { ...completion, care: { ...completion.care, careSources: reviewedAfterEdit } } });
  expect(data(reviewOnly).paOrdinaryReturnCompletionSources?.care.careSources).toEqual(reviewedAfterEdit);
  expect(data(reviewOnly).paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
});

it("reopens and previews one confirmed PA partnership NRK-1", () => {
  const f = guidedPAOrdinaryPanelFixture("nonresident");
  const taxpayer = required(f.state.sectionData["personal-info"]);
  const taxpayerName = [taxpayer.firstName, taxpayer.lastName].join(" ");
  const last4 = taxpayer.ssn.slice(-4);
  const draft = actualGuidedK1Sources();
  const activity = required(required(draft.activities)[0]);
  Object.assign(activity, {
    entityName: "Fictional Keystone Partners", entityEIN: "00-1234567",
    recipientName: taxpayerName, recipientTaxpayerIdLast4: last4,
  });
  Object.assign(required(activity.statement), {
    ordinaryIncome: "10000", section199AQBI: "0", selfEmploymentEarnings: "0",
    isPassiveActivity: true, qbiMateriallyParticipated: false,
  });
  Object.assign(required(draft.priorQbiCarry), { primaryName: taxpayerName, primaryTaxpayerIdLast4: last4 });
  f.state.segmentation.lifeEvents.push("k1-loss-sources");
  f.state.sectionData.adjustments = { ...flow.emptyAdjustmentData, k1LossSources: draft };
  f.state.sectionData.deductions = { ...flow.emptyDeductionData, method: "standard" };
  const unboundResidency = required(f.data.paResidencySources);
  delete unboundResidency.owner.originalTaxpayer;
  for (const wage of unboundResidency.wages) delete wage.original;
  for (const interest of unboundResidency.interest) delete interest.original;
  unboundResidency.sourceFactsConfirmed = null;
  delete f.facts.owner.originalTaxpayer;
  delete f.facts.originalFederalSources;
  f.facts.sourceFactsConfirmed = null;
  f.sources.owner = { firstName: "", lastName: "", ssn: "" };
  f.sources.originalFederalSources = {};
  f.sources.sourceFactsConfirmed = null;

  const federal = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(f.state));
  const blank = emptyGuidedPAOrdinaryNrk1Source();
  expect(blank).toMatchObject({ sourceTaxYear: null, nonresidentWithholding: "", includedOnConsolidatedReturn: null });
  expect(blank).not.toHaveProperty("originalFederalK1");
  const inventoryFirst = flow.updateSectionData(f.state, "state-return", { ...f.data, paOrdinaryReturnCompletionSources: {
    ...f.sources, nrk1: { ...f.sources.nrk1, status: "actual_statements" },
  } });
  expect(inventoryFirst.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBe(true);
  const inventoryFirstData = data(inventoryFirst);
  const entered = flow.updateSectionData(inventoryFirst, "state-return", { ...inventoryFirstData, paResidencySources: {
    ...required(inventoryFirstData.paResidencySources), sourceFactsConfirmed: null,
    nrk1Source: {
      ...blank, sourceTaxYear: 2025, sourceReference: "Fictional original PA partnership statement",
      sourceFactsConfirmed: true, issuerName: activity.entityName, issuerEin: activity.entityEIN,
      issuerCity: "Pittsburgh", issuerState: "PA", issuerZip: "15219",
      recipientFirstName: taxpayer.firstName, recipientLastName: taxpayer.lastName, recipientSsn: taxpayer.ssn,
      ownerType: "I", entityType: "P", limitedPartner: true, calendarYear: true, amended: false, final: false,
      includedOnConsolidatedReturn: false, eligibleIndividualClaimConfirmed: true,
      allOtherReportableLinesZeroOrBlankConfirmed: true, whollyPennsylvaniaAndNoFederalStateDifferenceConfirmed: true,
      businessIncome: "10,000", nonresidentWithholding: "307.00",
    },
  } });
  expect(entered.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBe(true);
  const currentFederal = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(entered));
  expect(currentFederal.scheduleK1).toEqual(federal.scheduleK1);
  const enteredData = data(entered);
  const enteredResidency = required(enteredData.paResidencySources);
  const enteredNrk1 = required(enteredResidency.nrk1Source);
  const confirmWithholding = (nonresidentWithholding: string) => confirmGuidedPAResidencySources(currentFederal, {
    ...enteredResidency, nrk1Source: { ...enteredNrk1, nonresidentWithholding },
  });
  expect(() => confirmWithholding("")).toThrow(/whole-dollar amounts/);
  expect(() => confirmWithholding("0.01")).toThrow(/whole-dollar amounts/);
  expect(() => confirmWithholding("30,7")).toThrow();
  expect(confirmWithholding("0.00").nrk1Source?.nonresidentWithholding).toBe("0");
  const confirmed = flow.updateSectionData(entered, "state-return", {
    ...enteredData, paResidencySources: confirmGuidedPAResidencySources(currentFederal, enteredData.paResidencySources),
  });
  expect(confirmed.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBe(true);
  expect(data(confirmed).paResidencySources?.nrk1Source).toMatchObject({ businessIncome: "10000", nonresidentWithholding: "307" });
  const originals = required(sourceInput(confirmed));
  const confirmedData = data(confirmed);
  const inventoried = flow.updateSectionData(confirmed, "state-return", {
    ...confirmedData, paOrdinaryReturnCompletionSources: {
      ...required(confirmedData.paOrdinaryReturnCompletionSources), nrk1: { ...f.sources.nrk1,
        status: "actual_statements", sourceReference: "Reviewed actual partnership original" },
    },
  });
  expect(inventoried.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBe(true);
  const afterInventory = data(inventoried);
  const factsConfirmed = flow.updateSectionData(inventoried, "state-return", {
    ...afterInventory, paOrdinaryReturnFacts: confirmGuidedPAOrdinaryReturnFacts(originals, afterInventory.paOrdinaryReturnFacts),
  });
  expect(factsConfirmed.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBe(true);
  const afterFacts = data(factsConfirmed);
  const ready = flow.updateSectionData(factsConfirmed, "state-return", {
    ...afterFacts, paOrdinaryReturnCompletionSources: confirmGuidedPAOrdinaryReturnCompletionSources(originals,
      afterFacts.paOrdinaryReturnCompletionSources, afterFacts.paOrdinaryReturnFacts),
  });
  expect(ready.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBe(true);

  const entries = new Map<string, string>();
  const storage: Storage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
    removeItem: key => { entries.delete(key); },
    clear: () => entries.clear(),
    key: index => [...entries.keys()][index] ?? null,
    get length() { return entries.size; },
  };
  const target = { storageKey: "fictional-pa-ordinary-nrk1" };
  expect(flow.saveGuidedFlowState(storage, target, ready)).toBe(true);
  const reopened = required(flow.loadGuidedFlowState(storage, target));
  expect(flow.validateSection(reopened, "state-return").status).toBe("complete");
  expect(data(reopened).paResidencySources?.nrk1Source?.originalFederalK1).toEqual(federal.scheduleK1[0]);
  expect(computeGuidedPreview(reopened)?.state).toMatchObject({
    stateCode: "PA", stateTax: "491", stateWithholding: "491", stateRefund: "0", stateAmountOwed: "0",
  });

  const current = data(reopened);
  const residency = required(current.paResidencySources);
  const revised = flow.updateSectionData(reopened, "state-return", { ...current, paResidencySources: {
    ...residency, nrk1Source: { ...required(residency.nrk1Source), nonresidentWithholding: "0" },
  } });
  expect(data(revised).paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
  expect(revised.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBe(true);
  expect(flow.validateSection(revised, "state-return").status).toBe("partial");

  const stateEdit = flow.updateSectionData(reopened, "state-return", { ...current, paResidencySources: {
    ...residency, sourceReference: "A different PA residency original",
  } });
  expect(stateEdit.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBeNull();
  const federalEdit = flow.updateSectionData(reopened, "personal-info", { ...taxpayer, lastName: "Edited" });
  expect(federalEdit.sectionData.adjustments?.k1LossSources?.sourceFactsConfirmed).toBeNull();
});
it("PA ordinary source context is available before ordinary confirmation for all three residencies", () => {
  for (const status of paPanelStatuses) {
    const f = guidedPAOrdinaryPanelFixture(status); delete f.data.paOrdinaryReturnFacts; delete f.data.paOrdinaryReturnCompletionSources;
    const before = structuredClone(f.state), actual = sourceInput(f.state);
    expect(actual).toEqual(f.sourceInput); expect(actual?.w2s[0]?.wages).toBe("50000"); expect(actual?.form1099Int[0]?.interestIncome).toBe("120");
    expect(actual).not.toHaveProperty("paOrdinaryReturnFacts"); expect(actual).not.toHaveProperty("paOrdinaryReturnCompletionSources"); expect(f.state).toEqual(before);
    f.data.paResidencySources = { ...required(f.data.paResidencySources), sourceFactsConfirmed: null };
    expect(sourceInput(f.state)).toBeNull(); expect(buildTaxInputFromGuidedData(f.state)).not.toBeNull();
  }
});
it("PA state navigation requires both current complete ordinary packets", () => {
  for (const status of paPanelStatuses) for (const missing of ["paResidencySources", "paOrdinaryReturnFacts", "paOrdinaryReturnCompletionSources"] as const) {
    const f = guidedPAOrdinaryPanelFixture(status); delete f.data[missing];
    expect(flow.validateSection(f.state, "state-return").status, `${status}/${missing}`).toBe("partial");
  }
});
it.each(paPanelStatuses)("PA state navigation replays current actual sources", status => {
  const f = guidedPAOrdinaryPanelFixture(status), before = structuredClone(f.state);
  expect(flow.validateSection(f.state, "state-return").status).toBe("complete"); expect(f.state).toEqual(before);
  f.sources.sourceFactsConfirmed = null; expect(flow.validateSection(f.state, "state-return").status).toBe("partial");
});
it.each(["factsOwner", "factsYear", "completionOwner", "completionYear", "originalSnapshot", "unknownCompletion", "unknownFacts"] as const)("PA navigation blocks stale or unknown %s", kind => {
  const f = guidedPAOrdinaryPanelFixture();
  if (kind === "factsOwner") f.facts.owner.originalTaxpayer = { firstName: "Changed", lastName: "Owner", ssn: "900-00-0000" };
  if (kind === "factsYear") f.facts.sourceTaxYear = 2024;
  if (kind === "completionOwner") f.sources.owner.ssn = "900-00-0000";
  if (kind === "completionYear") f.sources.sourceTaxYear = 2024;
  if (kind === "originalSnapshot") f.sources.originalFederalSources = {};
  if (kind === "unknownCompletion") f.sources.care.status = "unknown";
  if (kind === "unknownFacts") f.facts.payments.allPaymentsIncludedConfirmed = null;
  expect(flow.validateSection(f.state, "state-return").status).toBe("partial");
});
it("PA source edits invalidate confirmation while preserving all original records", () => {
  for (const section of ["personal-info", "income-w2", "payments"] as const) {
    const f = guidedPAOrdinaryPanelFixture(); const next = section === "personal-info" ? { ...required(f.state.sectionData[section]), lastName: "Edited" } : section === "income-w2" ? { entries: required(f.state.sectionData[section]).entries.map(w => ({ ...w, employerName: "Same-money original changed" })) } : { ...flow.emptyPaymentData, ...f.state.sectionData[section], estimatedPayments: [{ date: "2025-04-15", amount: "25" }] };
    const updated = flow.updateSectionData(f.state, section, next), actual = data(updated);
    expect(actual.paOrdinaryReturnFacts?.sourceFactsConfirmed).toBeNull(); expect(actual.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
    expect(actual.paOrdinaryReturnFacts?.originalFederalSources).toEqual(f.facts.originalFederalSources); expect(actual.paOrdinaryReturnCompletionSources?.otherStateTaxes).toEqual(f.sources.otherStateTaxes);
    expect(flow.validateSection(updated, "state-return").status).toBe("partial");
  }
});
it("PA direct source edits clear affected headers without erasing positive records", () => {
  const f = guidedPAOrdinaryPanelFixture(); f.sources.care.status = "actual_expenses"; f.sources.care.originalCarePayments = [paCompletionOriginalRecordFixture("care_payment")];
  const care = { ...f.sources, sourceReference: "Edited source reference" };
  const updated = flow.updateSectionData(f.state, "state-return", { ...f.data, paOrdinaryReturnCompletionSources: care });
  expect(data(updated).paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull(); expect(data(updated).paOrdinaryReturnCompletionSources?.care.originalCarePayments).toEqual(f.sources.care.originalCarePayments);
  const changedResidency = { ...required(f.data.paResidencySources), sourceReference: "Changed actual PA source" };
  const changed = data(flow.updateSectionData(f.state, "state-return", { ...f.data, paResidencySources: changedResidency }));
  expect(changed.paOrdinaryReturnFacts?.sourceFactsConfirmed).toBeNull(); expect(changed.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
  const ledger = data(flow.updateSectionData(f.state, "state-return", { ...f.data, stateEstimatedPayments: [{ state: "PA", date: "2025-04-15", amount: "25" }] }));
  expect(ledger.paOrdinaryReturnFacts?.sourceFactsConfirmed).toBeNull(); expect(ledger.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
});
it("PA unchanged saves and explicit confirmation metadata preserve source records", () => {
  const f = guidedPAOrdinaryPanelFixture(); const unchanged = flow.updateSectionData(f.state, "state-return", structuredClone(f.data));
  expect(data(unchanged)).toEqual(f.data); expect(flow.validateSection(unchanged, "state-return").status).toBe("complete");
  const stored = JSON.parse(JSON.stringify(f.state)) as flow.GuidedFlowState;
  expect(flow.validateSection(stored, "state-return").status).toBe("complete"); expect(data(stored)).toEqual(f.data);
  const draft = structuredClone(f.state); required(data(draft).paOrdinaryReturnFacts).sourceFactsConfirmed = null;
  expect(data(flow.updateSectionData(draft, "state-return", f.data)).paOrdinaryReturnFacts?.sourceFactsConfirmed).toBe(true);
});
it("PA source context never invents missing federal facts and leaves Ohio flow unchanged", () => {
  const f = guidedPAOrdinaryPanelFixture(); required(f.state.sectionData["personal-info"]).ssn = "";
  expect(sourceInput(f.state)).toBeNull(); expect(flow.validateSection(f.state, "state-return").status).toBe("partial");
  const other = guidedPAOrdinaryPanelFixture().state; other.segmentation.stateCode = "OH"; expect(sourceInput(other)).toBeNull();
});
