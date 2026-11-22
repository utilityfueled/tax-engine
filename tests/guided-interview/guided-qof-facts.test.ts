// Spec: spec/federal/qof-disposition-facts.yaml.
import { expect, it } from "vitest";
import { buildGuidedQofFacts, emptyQofDispositionFacts, emptyQofInvestment, guidedQofDiscovery, qofDispositionFactErrors, type QofDispositionData } from "@/lib/guided-qof-facts";
import { collectGuidedReviewIssues, getGuidedSectionRoute, initialFlowState, resumeInterviewAtSection, setInterviewTaxYear, updateSectionData, validateSection, type GuidedFlowState } from "@/lib/guided-interview-flow";
import { investmentFactErrors, investmentRowsStarted, type InvestmentData } from "@/lib/guided-investment-facts";
import { buildGuidedSyntheticDocuments, buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { completeBrokerageSource, completeDividendSource, completeInterestSource, completePersonalInfo, completeW2Entry, startCompleteInterview } from "./complete-facts";

it("preserves actual QOF facts and revokes changed investment confirmation", () => {
  const facts = { sourceTaxYear: "2025", sourceReference: "Original brokerage and investment statements", sourceFactsConfirmed: true, allInvestmentsReviewed: true, disposedOfQofInvestment: false };
  expect(buildGuidedQofFacts(undefined, 2025)).toBeUndefined();
  expect(buildGuidedQofFacts(facts, 2025)).toMatchObject({ sourceTaxYear: 2025, disposedOfQofInvestment: false });
  for (const patch of [{ sourceTaxYear: "" }, { sourceTaxYear: "2026" }, { disposedOfQofInvestment: null }, { sourceFactsConfirmed: null }, { disposedOfQofInvestment: true }]) {
    expect(() => buildGuidedQofFacts({ ...facts, ...patch }, 2025)).toThrow(/QOF|year|unknown|confirm/);
  }
  const investment = { interestEntries: [], dividendEntries: [], brokerageEntries: [], qofDispositionFacts: facts };
  const state: GuidedFlowState = { ...initialFlowState, phase: "interview", taxYear: 2025,
    segmentation: { filingStatus: "single", incomeTypes: ["w2-wages", "investments"], lifeEvents: [], stateCode: null },
    sectionData: { "personal-info": completePersonalInfo, "income-w2": { entries: [{ ...completeW2Entry, wages: "50000" }] }, "income-investments": investment } };
  expect(buildTaxInputFromGuidedData(state)?.qofDispositionFacts).toMatchObject({ sourceTaxYear: 2025, disposedOfQofInvestment: false });
  const positiveState = { ...state, sectionData: { ...state.sectionData, "income-investments": { ...investment, qofDispositionFacts: { ...facts, disposedOfQofInvestment: true } } } };
  expect(buildTaxInputFromGuidedData(positiveState)).toBeNull();
  expect(positiveState.sectionData["income-investments"].qofDispositionFacts.disposedOfQofInvestment).toBe(true);
  const confirmed = updateSectionData(state, "income-investments", { ...investment, qofDispositionFacts: { ...facts, sourceFactsConfirmed: true } });
  expect(confirmed.sectionData["income-investments"]?.qofDispositionFacts?.sourceFactsConfirmed).toBe(true);
  const changed = updateSectionData(state, "income-investments", { ...investment, qofDispositionFacts: { ...facts, sourceReference: "Corrected original statement" } });
  expect(changed.sectionData["income-investments"]?.qofDispositionFacts).toMatchObject({ sourceFactsConfirmed: null, disposedOfQofInvestment: false, sourceReference: "Corrected original statement" });
  const household = updateSectionData(state, "personal-info", { ...completePersonalInfo, lastName: "Changed" });
  expect(household.sectionData["income-investments"]?.qofDispositionFacts?.sourceFactsConfirmed).toBeNull();
});

it("builds complete inclusion rows and keeps unknown answers unknown", () => {
  // Spec: spec/federal/qof-deferred-gain-inclusion.yaml guide.
  const row = { ...emptyQofInvestment, sourceId: "qof-1", sourceReference: "Fictional QOF records", sourceFactsConfirmed: true, qofEin: "98-7654321", description: "Fictional 25% interest",
    investmentDate: "2021-06-30", interestType: "corporation", gainCharacter: "long_term", originalDeferredGain: "100,000", remainingDeferredGain: "100,000", event: "december_31_2026",
    eventDate: "2026-12-31", entireInvestment: true, noSpecialGainCode: true, fairMarketValue: "0" };
  const facts: QofDispositionData = { sourceTaxYear: "2026", sourceReference: "Fictional complete records", sourceFactsConfirmed: true, allInvestmentsReviewed: true,
    disposedOfQofInvestment: false, deferredGainHeldAtYearEnd: true, investments: [row] };
  const built = buildGuidedQofFacts(facts, 2026)!;
  expect(built.investments![0]).toMatchObject({ remainingDeferredGain: "100000", fairMarketValue: "0", entireInvestment: true });
  expect(built.investments![0]).not.toHaveProperty("proceeds");
  for (const value of ["1,5", "100,00", "100.000,00", "1,2,3", ",100"]) {
    expect(() => buildGuidedQofFacts({ ...facts, investments: [{ ...row, fairMarketValue: value }] }, 2026), value).toThrow(/valid decimal/);
  }
  const investment = { interestEntries: [], dividendEntries: [], brokerageEntries: [], qofDispositionFacts: facts };
  const state = { ...initialFlowState, phase: "interview" as const, taxYear: 2026, sectionData: { "income-investments": investment } } as GuidedFlowState;
  const edited = updateSectionData(state, "income-investments", { ...investment, qofDispositionFacts: { ...facts, sourceReference: "Corrected" } });
  expect(edited.sectionData["income-investments"]?.qofDispositionFacts?.investments?.[0]?.sourceFactsConfirmed).toBeNull();
  for (const patch of [{ remainingDeferredGain: "" }, { fairMarketValue: "" }, { investmentDate: "" }, { sourceFactsConfirmed: null }, { entireInvestment: null }, { gainCharacter: "" }, { noSpecialGainCode: null }]) {
    expect(() => buildGuidedQofFacts({ ...facts, investments: [{ ...row, ...patch }] }, 2026), JSON.stringify(patch)).toThrow(/QOF/);
  }
  expect(() => buildGuidedQofFacts({ ...facts, deferredGainHeldAtYearEnd: null }, 2026)).toThrow(/year-end/);
  expect(() => buildGuidedQofFacts({ ...facts, investments: [] }, 2026)).toThrow(/year-end/);
  expect(buildGuidedQofFacts({ ...facts, deferredGainHeldAtYearEnd: false, investments: [] }, 2026)).toMatchObject({ deferredGainHeldAtYearEnd: false });
});

it("requires a QOF answer on a 2026 investment section", () => {
  expect(qofDispositionFactErrors(undefined, 2026)).toHaveProperty("qofDisposition");
  expect(qofDispositionFactErrors(undefined, 2025)).toEqual({});
  expect(qofDispositionFactErrors({ sourceTaxYear: "2026", sourceReference: "Fictional complete records", sourceFactsConfirmed: true, allInvestmentsReviewed: true, disposedOfQofInvestment: false, deferredGainHeldAtYearEnd: false }, 2026)).toEqual({});
});

function wageOnlyQofInterview(year = 2026): GuidedFlowState {
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null });
  state.taxYear = year;
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, sourceTaxYear: String(year), wages: "50000" }] };
  return state;
}

it("asks about 2026 QOF gain on the wage-only route and opens details only for Yes", () => {
  const state = wageOnlyQofInterview();
  const sections = (current: GuidedFlowState) => getGuidedSectionRoute(current).map(section => section.id);
  const qofIssues = (current: GuidedFlowState) => collectGuidedReviewIssues(current).filter(issue => /opportunity fund/i.test(issue.sectionLabel));
  const no = updateSectionData(state, "review", { qof2026Disclosure: false });
  const yes = updateSectionData(state, "review", { qof2026Disclosure: true });

  expect(sections(state)).not.toContain("income-investments");
  expect(qofIssues(state)).toMatchObject([{ sectionId: "personal-info", status: "needs-review" }]);
  expect(buildTaxInputFromGuidedData(state)?.qofDispositionFacts).toBeUndefined();
  expect(sections(no)).toEqual(sections(state));
  expect(validateSection(no, "personal-info").status).toBe("complete");
  expect(qofIssues(no)).toEqual([]);
  expect(buildTaxInputFromGuidedData(no)?.qofDispositionFacts).toBeUndefined();
  expect(sections(yes)).toContain("income-investments");
  expect(validateSection(yes, "income-investments").fieldErrors).toHaveProperty("qofDisposition");
  expect(buildTaxInputFromGuidedData(yes)).toBeNull();
  const switchedBack = setInterviewTaxYear(yes, 2025);
  expect(sections(switchedBack)).toEqual(sections(state));
  expect(qofIssues(switchedBack)).toEqual([]);
  expect(sections(setInterviewTaxYear(switchedBack, 2026))).toContain("income-investments");
});

it("preserves saved 2026 QOF originals and rejects conflicting discovery answers", () => {
  const state = wageOnlyQofInterview();
  const facts: QofDispositionData = {
    sourceTaxYear: "2026", sourceReference: "Fictional prior Form 8997 and current fund statement", sourceFactsConfirmed: true,
    allInvestmentsReviewed: true, disposedOfQofInvestment: false, deferredGainHeldAtYearEnd: true,
    investments: [{
      ...emptyQofInvestment, sourceId: "qof-held", sourceReference: "Fictional fund records", sourceFactsConfirmed: true,
      qofEin: "98-7654321", description: "Fictional corporation shares", investmentDate: "2021-06-30",
      interestType: "corporation", gainCharacter: "long_term", originalDeferredGain: "100000", remainingDeferredGain: "100000",
      event: "december_31_2026", eventDate: "2026-12-31", entireInvestment: true, noSpecialGainCode: true, fairMarketValue: "120000",
    }],
  };
  state.sectionData["income-investments"] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], qofDispositionFacts: facts };
  const current = buildGuidedQofFacts(facts, 2026);
  const explicitYes = updateSectionData(state, "review", { qof2026Disclosure: true });
  const conflictingNo = updateSectionData(state, "review", { qof2026Disclosure: false });

  for (const saved of [state, explicitYes]) {
    expect(getGuidedSectionRoute(saved).map(section => section.id)).toContain("income-investments");
    expect(validateSection(saved, "income-investments").status).toBe("complete");
    expect(buildTaxInputFromGuidedData(saved)?.qofDispositionFacts).toEqual(current);
  }
  expect(getGuidedSectionRoute(conflictingNo).map(section => section.id)).toContain("income-investments");
  expect(validateSection(conflictingNo, "income-investments").fieldErrors).toHaveProperty("qofDisposition");
  expect(buildTaxInputFromGuidedData(conflictingNo)).toBeNull();
  expect(conflictingNo.sectionData["income-investments"]?.qofDispositionFacts).toEqual(facts);

  const legacy = structuredClone(state);
  Reflect.deleteProperty(legacy.sectionData["income-investments"]!.qofDispositionFacts!, "sourceTaxYear");
  expect(getGuidedSectionRoute(legacy).map(section => section.id)).toContain("income-investments");
  expect(validateSection(legacy, "income-investments").fieldErrors.qofDisposition).toMatch(/source year/);
  expect(buildTaxInputFromGuidedData(legacy)).toBeNull();
});

it("builds ordinary 2026 wage and interest sources after a No disclosure", () => {
  const state = wageOnlyQofInterview();
  state.segmentation.incomeTypes.push("investments");
  state.sectionData["income-investments"] = {
    interestEntries: [{ ...completeInterestSource, sourceTaxYear: "2026", interestIncome: "25" }], dividendEntries: [], brokerageEntries: [],
  };
  expect(buildTaxInputFromGuidedData(state)).toBeNull();

  const no = updateSectionData(state, "review", { qof2026Disclosure: false });
  expect(buildTaxInputFromGuidedData(no)).toMatchObject({
    w2s: [{ wages: "50000" }], form1099Int: [{ interestIncome: "25" }],
  });
  expect(buildTaxInputFromGuidedData(no)?.qofDispositionFacts).toBeUndefined();
});

it("keeps a prior-year QOF worksheet bound to its original year", () => {
  const prior = wageOnlyQofInterview(2025);
  const facts: QofDispositionData = { sourceTaxYear: "2025", sourceReference: "Fictional 2025 investment records",
    sourceFactsConfirmed: true, allInvestmentsReviewed: true, disposedOfQofInvestment: false };
  prior.sectionData["income-investments"] = { interestEntries: [], dividendEntries: [], brokerageEntries: [], qofDispositionFacts: facts };
  expect(buildTaxInputFromGuidedData(prior)?.qofDispositionFacts).toEqual(buildGuidedQofFacts(facts, 2025));

  const current = wageOnlyQofInterview();
  current.sectionData["income-investments"] = structuredClone(prior.sectionData["income-investments"]);
  expect(guidedQofDiscovery(current).answer).toBeNull();
  const no = updateSectionData(current, "review", { qof2026Disclosure: false });
  expect(getGuidedSectionRoute(no).map(section => section.id)).toContain("income-investments");
  const issue = collectGuidedReviewIssues(no).find(item => item.sectionLabel === "Qualified Opportunity Fund investments");
  expect(issue).toMatchObject({ sectionId: "income-investments", message: expect.stringMatching(/2026.*remove/i) });
  const resumed = resumeInterviewAtSection(no, "income-investments");
  expect(getGuidedSectionRoute(resumed)[resumed.currentSectionIndex].id).toBe("income-investments");
  expect(validateSection(no, "income-investments").fieldErrors.qofDisposition).toMatch(/year/);
  expect(buildTaxInputFromGuidedData(no)).toBeNull();
  expect(no.sectionData["income-investments"]?.qofDispositionFacts).toEqual(facts);

  const investment = no.sectionData["income-investments"]!;
  const corrected = updateSectionData(no, "income-investments", { ...investment, qofDispositionFacts: {
    ...facts, sourceTaxYear: "2026", sourceReference: "Fictional 2026 investment records", deferredGainHeldAtYearEnd: false,
  } });
  const updatedFacts = corrected.sectionData["income-investments"]!.qofDispositionFacts!;
  expect(updatedFacts.sourceFactsConfirmed).toBeNull();
  expect(getGuidedSectionRoute(corrected).map(section => section.id)).toContain("income-investments");
  expect(buildTaxInputFromGuidedData(corrected)).toBeNull();
  const confirmed = updateSectionData(corrected, "income-investments", { ...investment, qofDispositionFacts: { ...updatedFacts, sourceFactsConfirmed: true } });
  expect(buildTaxInputFromGuidedData(confirmed)?.qofDispositionFacts).toMatchObject({ sourceTaxYear: 2026, deferredGainHeldAtYearEnd: false });
  expect(getGuidedSectionRoute(confirmed).map(section => section.id)).not.toContain("income-investments");

  const removed = updateSectionData(resumed, "income-investments", { ...investment, qofDispositionFacts: undefined });
  expect(getGuidedSectionRoute(removed).map(section => section.id)).not.toContain("income-investments");
  expect(collectGuidedReviewIssues(removed)).not.toContainEqual(expect.objectContaining({ sectionLabel: "Qualified Opportunity Fund investments" }));
  expect(buildTaxInputFromGuidedData(removed)).toMatchObject({ w2s: [{ wages: "50000" }] });
  expect(buildTaxInputFromGuidedData(removed)?.qofDispositionFacts).toBeUndefined();

  const returned = updateSectionData(setInterviewTaxYear(confirmed, 2025), "personal-info", completePersonalInfo);
  returned.sectionData["income-w2"] = prior.sectionData["income-w2"];
  expect(guidedQofDiscovery(returned).answer).toBeNull();
  expect(getGuidedSectionRoute(returned).map(section => section.id)).toContain("income-investments");
  expect(collectGuidedReviewIssues(returned)).toContainEqual(expect.objectContaining({ sectionId: "income-investments", message: expect.stringMatching(/2025.*remove/i) }));
  expect(buildTaxInputFromGuidedData(returned)).toBeNull();
  const restoredPrior = updateSectionData(returned, "income-investments", { ...investment, qofDispositionFacts: facts });
  const priorDraft = restoredPrior.sectionData["income-investments"]!.qofDispositionFacts!;
  const reconfirmed = updateSectionData(restoredPrior, "income-investments", { ...investment, qofDispositionFacts: { ...priorDraft, sourceFactsConfirmed: true } });
  expect(buildTaxInputFromGuidedData(reconfirmed)?.qofDispositionFacts).toEqual(buildGuidedQofFacts(facts, 2025));
});

it("keeps an incomplete QOF worksheet reachable after changing a 2026 Yes to No", () => {
  const yes = updateSectionData(wageOnlyQofInterview(), "review", { qof2026Disclosure: true });
  const investment = { interestEntries: [], dividendEntries: [], brokerageEntries: [], qofDispositionFacts: { ...emptyQofDispositionFacts, sourceTaxYear: "2026" } };
  const draft = updateSectionData(yes, "income-investments", investment);
  const no = updateSectionData(draft, "review", { qof2026Disclosure: false });

  expect(getGuidedSectionRoute(no).map(section => section.id)).toContain("income-investments");
  expect(collectGuidedReviewIssues(no)).toContainEqual(expect.objectContaining({ sectionId: "income-investments", message: expect.stringMatching(/remove/i) }));
  expect(buildTaxInputFromGuidedData(no)).toBeNull();

  const removed = updateSectionData(no, "income-investments", { ...investment, qofDispositionFacts: undefined });
  expect(getGuidedSectionRoute(removed).map(section => section.id)).not.toContain("income-investments");
  expect(buildTaxInputFromGuidedData(removed)).toMatchObject({ w2s: [{ wages: "50000" }] });
});

it("asks 2026 returns for QOF facts only once a row is started", () => {
  const blank = { interestEntries: [{}], dividendEntries: [], brokerageEntries: [] } as unknown as InvestmentData;
  const started = { ...blank, interestEntries: [{ payer: "Actual bank", taxableInterest: "10" }] } as unknown as InvestmentData;
  expect(investmentRowsStarted(blank)).toBe(false);
  expect(investmentRowsStarted(started)).toBe(true);
  expect(Object.keys(investmentFactErrors(blank, "single", 2026)).filter(key => /qof/i.test(key))).toEqual([]);
  expect(Object.keys(investmentFactErrors(started, "single", 2026)).filter(key => /qof/i.test(key)).length).toBeGreaterThan(0);
  expect(Object.keys(investmentFactErrors(started, "single", 2025)).filter(key => /qof/i.test(key))).toEqual([]);
  expect(investmentRowsStarted({ ...blank, digitalAssetEntries: [{ brokerName: "Actual exchange" }] })).toBe(true);
});

it("keeps 2026 source documents supported once QOF is answered", () => {
  const identity = { sourceTaxYear: "2026" };
  const stateWith = (qofDispositionFacts?: QofDispositionData) => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["investments"], lifeEvents: [], stateCode: null });
    state.taxYear = 2026;
    state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, ...identity }], dividendEntries: [{ ...completeDividendSource, ...identity }], brokerageEntries: [{ ...completeBrokerageSource, ...identity, sourceId: "Original brokerage statement", transactions: completeBrokerageSource.transactions.map(row => ({ ...row, dateAcquired: "2024-01-15", dateSold: "2026-03-01" })) }], qofDispositionFacts };
    return state;
  };
  const coverage = (state: GuidedFlowState) => ["1099-int", "1099-div", "1099-b"].map(kind => buildGuidedSyntheticDocuments(state).find(row => row.kind === kind)?.coverage);
  const answered = { sourceTaxYear: "2026", sourceReference: "Fictional complete records", sourceFactsConfirmed: true, allInvestmentsReviewed: true, disposedOfQofInvestment: false, deferredGainHeldAtYearEnd: false, investments: [] };
  expect(coverage(stateWith(answered))).toEqual(["supported", "supported", "supported"]);
  expect(coverage(stateWith())).toEqual(["partially-supported", "partially-supported", "partially-supported"]);
  const discoveryNo = updateSectionData(stateWith(), "review", { qof2026Disclosure: false });
  expect(coverage(discoveryNo)).toEqual(["supported", "supported", "supported"]);
  expect(validateSection(discoveryNo, "income-investments").fieldErrors).not.toHaveProperty("qofDisposition");
});

