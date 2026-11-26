import { expect, it } from "vitest";
import { confirmGuidedPAResidencySources, buildGuidedPAResidencySources, updateGuidedPAResidencySources } from "@/lib/guided-pa-residency-facts";
import { confirmGuidedPAOrdinaryReturnFacts } from "@/lib/guided-pa-ordinary-return-facts";
import { confirmGuidedPAOrdinaryReturnCompletionSources } from "@/lib/guided-pa-ordinary-return-completion";
import { buildGuidedStateOriginals } from "@/lib/guided-state-engine-inputs";
import { confirmGuidedW2StateLocalSources, emptyGuidedW2StateLocalSources } from "@/lib/guided-w2-state-local-facts";
import { buildGuidedPAOrdinarySourceInput, emptyStateReturnData, loadGuidedFlowState, saveGuidedFlowState, startInterview, validateSection, type GuidedFlowState, type StateReturnData } from "@/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculatePA2026OrdinaryDraft } from "@/engine/state/pa-ordinary-return.js";
import { pa2026FloridaMoveResidentFixture, pa2026OrdinaryDraftFixture, pa2026OutboundNonresidentFixture, pa2026TexasMoveResidentFixture, rebindPA2026Draft } from "../../fixtures/pa-2026-ordinary-draft.js";
import { paOrdinaryResidencyFixture } from "../../fixtures/pa-residency-sources.js";
import { completePersonalInfo, completeW2Entry } from "../../guided-interview/complete-facts.js";
// Spec: spec/state/pa-residency-sources.yaml guide-confirmation.

it("PA residency guide - binds actual originals and resets source confirmation", () => {
  const { input, sources } = paOrdinaryResidencyFixture("part_year");
  const confirmed = confirmGuidedPAResidencySources(input, { ...sources, sourceFactsConfirmed: null });
  expect(confirmed.sourceFactsConfirmed).toBe(true);
  const canonical = buildGuidedPAResidencySources(input, confirmed);
  expect(canonical.wages[0].original).toEqual(input.w2s[0]);
  const edited = updateGuidedPAResidencySources(confirmed, { sourceReference: "actual changed reference" });
  expect(edited.sourceFactsConfirmed).toBeNull();
  expect(edited.wages[0].payroll).toEqual(sources.wages[0].payroll);
  expect(() => buildGuidedPAResidencySources(input, edited)).toThrow(/confirm|PA.*source/i);
  input.w2s[0].employer.ein = "98-7654321";
  expect(() => buildGuidedPAResidencySources(input, confirmed)).toThrow(/original|PA.*source/i);
  // An explicit fresh confirmation sees the actual new original; no old saved result is blessed.
  expect(confirmGuidedPAResidencySources(input, { ...confirmed, sourceFactsConfirmed: null }).wages[0].original).toEqual(input.w2s[0]);
});

it("PA residency guide - actual typed and projected source amounts agree for all three residency classes", () => {
  for (const status of ["resident", "part_year", "nonresident"] as const) {
    const { input, sources } = paOrdinaryResidencyFixture(status);
    const confirmed = confirmGuidedPAResidencySources(input, { ...sources, sourceFactsConfirmed: null });
    expect(buildGuidedPAResidencySources(input, confirmed)).toEqual(confirmed);
  }
});

const ordinaryResidencyCases = [
  ["resident", "full-year", "nonresident", "2303"],
  ["part_year", "part-year", "full-year", "1197"],
  ["nonresident", "nonresident", "part-year", "276"],
] as const;

function reopenPennsylvaniaResidencyGuide(guide: GuidedFlowState) {
  const records = new Map<string, string>();
  const storage: Storage = {
    getItem: key => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); },
    removeItem: key => { records.delete(key); },
    clear: () => records.clear(),
    key: index => [...records.keys()][index] ?? null,
    get length() { return records.size; },
  };
  expect(saveGuidedFlowState(storage, "fictional-pa-ordinary-residency", guide)).toBe(true);
  const reopened = loadGuidedFlowState(storage, "fictional-pa-ordinary-residency");
  if (!reopened) throw new Error("Fictional saved Pennsylvania residency guide did not reopen");
  return reopened;
}

it.each(ordinaryResidencyCases)("PA residency guide rejects contradictory 2026 declarations for %s on confirmation and saved replay", (status, _matching, declared) => {
  const f = pa2026OrdinaryDraftFixture(status);
  f.input.paResidencySources = confirmGuidedPAResidencySources(f.input, { ...f.input.paResidencySources, sourceFactsConfirmed: null });
  f.input.taxpayer.stateResidency = declared;
  rebindPA2026Draft(f);

  const guide = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "PA" }, 2026);
  guide.sectionData["personal-info"] = { ...completePersonalInfo, stateResidency: declared };
  guide.sectionData["state-return"] = { ...emptyStateReturnData, paResidencySources: f.input.paResidencySources,
    paOrdinaryReturnFacts: f.facts, paOrdinaryReturnCompletionSources: f.sources };
  const reopened = reopenPennsylvaniaResidencyGuide(guide);
  expect(reopened.sectionData["personal-info"]?.stateResidency).toBe(declared);
  expect(reopened.sectionData["state-return"]?.paResidencySources?.sourceFactsConfirmed).toBe(true);
  const conflict = /declared Pennsylvania residency conflicts with the confirmed domicile, abode and presence records/i;
  expect.soft(() => confirmGuidedPAResidencySources(f.input, f.input.paResidencySources)).toThrow(conflict);
  expect.soft(() => buildGuidedStateOriginals(f.input, reopened)).toThrow(conflict);

  reopened.segmentation.stateCode = "NY";
  expect(buildGuidedStateOriginals(f.input, reopened)).toBe(f.input);
});

it.each(ordinaryResidencyCases)("PA residency guide preserves matching and omitted 2026 declarations for %s", (status, matching, _conflicting, tax) => {
  for (const declared of [matching, undefined]) {
    const f = pa2026OrdinaryDraftFixture(status);
    f.input.taxpayer.stateResidency = declared;
    f.input.paResidencySources = confirmGuidedPAResidencySources(f.input, { ...f.input.paResidencySources, sourceFactsConfirmed: null });
    rebindPA2026Draft(f);
    const guide = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "PA" }, 2026);
    guide.sectionData["state-return"] = { ...emptyStateReturnData, paResidencySources: f.input.paResidencySources,
      paOrdinaryReturnFacts: f.facts, paOrdinaryReturnCompletionSources: f.sources };
    const actual = buildGuidedStateOriginals(f.input, reopenPennsylvaniaResidencyGuide(guide));
    const result = calculatePA2026OrdinaryDraft(actual, actual.paOrdinaryReturnFacts, actual.paOrdinaryReturnCompletionSources);
    expect(result.pa.residencyStatus).toBe(status);
    expect(result.pa.pa40.taxLiability.toFixed()).toBe(tax);
    expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
  }
});

it("PA residency guide confirms and reopens the 2026 outbound statutory nonresident move", () => {
  const f = pa2026OutboundNonresidentFixture();
  const guide = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "PA" }, 2026);
  const { primary, address } = f.input.taxpayer;
  guide.sectionData["personal-info"] = { ...structuredClone(completePersonalInfo), firstName: primary.firstName, lastName: primary.lastName,
    ssn: primary.ssn, addressLine1: address.street, city: address.city, state: address.state, zip: address.zip, stateResidency: "nonresident" };
  guide.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, sourceTaxYear: "2026", wages: "75000", federalWithheld: "11600",
    socialSecurityWages: "75000", socialSecurityWithheld: "4650", medicareWages: "75000", medicareWithheld: "1087.50",
    allocatedTips: "0", box12CodeD: "0", box12CodeE: "0", box12CodeF: "0", box12CodeG: "0", box12CodeH: "0",
    box12CodeS: "0", box12CodeAA: "0", box12CodeBB: "0", box12CodeEE: "0", box12CodeT: "0",
    stateTaxReporting: "single", state: "PA", stateWages: "9000", stateWithheld: "276" }] };
  const wages = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(guide));
  const raw = { ...f.input.paResidencySources, sourceFactsConfirmed: null };
  const unknown = { ...raw, residency: { ...raw.residency, domicilePeriods: [raw.residency.domicilePeriods[0],
    { ...raw.residency.domicilePeriods[1], daysInPA: null }] } };
  expect(() => confirmGuidedPAResidencySources(wages, unknown)).toThrow(/physical.presence day worksheet/i);
  const tooManyDays = structuredClone(raw);
  tooManyDays.residency.domicilePeriods[1].daysInPA = 11;
  expect(() => confirmGuidedPAResidencySources(wages, tooManyDays)).toThrow(/separate actual source method/i);
  const njAbode = structuredClone(raw);
  Object.assign(njAbode.residency.outsidePAPermanentAbodePeriods[0], { state: "NJ", sourceReference: "Fictional original year-round New Jersey lease" });
  expect(() => confirmGuidedPAResidencySources(wages, njAbode)).toThrow(/actual New York state.*sole year-round outside-PA permanent abode/i);

  const residency = confirmGuidedPAResidencySources(wages, raw);
  const input = { ...wages, paResidencySources: residency };
  const facts = confirmGuidedPAOrdinaryReturnFacts(input, { ...f.facts, sourceFactsConfirmed: null });
  const completion = confirmGuidedPAOrdinaryReturnCompletionSources(input, { ...f.sources, sourceFactsConfirmed: null }, facts);
  const stateReturn: StateReturnData = { ...emptyStateReturnData, paResidencySources: residency, paOrdinaryReturnFacts: facts,
    paOrdinaryReturnCompletionSources: completion };
  guide.sectionData["state-return"] = stateReturn;
  expect(buildGuidedPAOrdinarySourceInput(guide)).toEqual(input);
  const saved: typeof guide = JSON.parse(JSON.stringify(guide));
  const restored = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(saved));
  expect(validateSection(saved, "state-return").status).toBe("complete");
  const actual = buildGuidedStateOriginals(restored, saved);
  expect(actual.paResidencySources?.wages[0].original).toEqual(restored.w2s[0]);
  expect(actual.paResidencySources?.residency.outboundTaxResidencePeriods).toEqual(raw.residency.outboundTaxResidencePeriods);
  const result = calculatePA2026OrdinaryDraft(actual, actual.paOrdinaryReturnFacts, actual.paOrdinaryReturnCompletionSources);
  expect(result.pa.residencyStatus).toBe("nonresident");
  expect(result.pa.pa40.compensation.toFixed()).toBe("9000");
  expect(result.pa.pa40.taxLiability.toFixed()).toBe("276");
  expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });

  const edited: typeof guide = structuredClone(saved);
  edited.sectionData["state-return"] = { ...stateReturn,
    paResidencySources: updateGuidedPAResidencySources(residency, { sourceReference: "Edited move worksheet reference" }) };
  expect(() => buildGuidedStateOriginals(restored, edited)).toThrow(/confirm/i);
  const contrary = { ...restored, taxpayer: { ...restored.taxpayer, stateResidency: "part-year" as const } };
  expect(() => buildGuidedStateOriginals(contrary, saved)).toThrow(/conflicting retained residency/i);

  const oldResidency = structuredClone(residency);
  oldResidency.residency.outsidePAPermanentAbodePeriods = [{ from: "2026-01-01", through: "2026-12-31" }];
  delete oldResidency.residency.outboundTaxResidencePeriods;
  const olderSaved: typeof guide = structuredClone(saved);
  olderSaved.sectionData["state-return"] = { ...stateReturn, paResidencySources: oldResidency };
  expect(validateSection(olderSaved, "state-return").fieldErrors?.paResidencySources).toMatch(/complete and confirm/i);
  expect(() => buildGuidedStateOriginals(restored, olderSaved)).toThrow(/sole year-round outside-PA permanent abode/i);

  const conflictingAccount = structuredClone(completion);
  conflictingAccount.otherStateTaxes.jurisdictions.push({ ...conflictingAccount.otherStateTaxes.jurisdictions[0],
    state: "NJ", sourceReference: "Fictional original zero-payment New Jersey jurisdiction account" });
  const conflictingSaved: typeof guide = structuredClone(saved);
  conflictingSaved.sectionData["state-return"] = { ...stateReturn, paOrdinaryReturnCompletionSources: conflictingAccount };
  const unresolvedAccount = /reciprocal.state jurisdiction account.*reconcile actual income.tax residency/i;
  expect(() => confirmGuidedPAOrdinaryReturnCompletionSources(input, conflictingAccount, facts)).toThrow(unresolvedAccount);
  expect(validateSection(conflictingSaved, "state-return").fieldErrors?.paOrdinaryReturnCompletionSources).toMatch(unresolvedAccount);
  expect(() => buildGuidedStateOriginals(restored, conflictingSaved)).toThrow(unresolvedAccount);
  restored.w2s[0].stateWages = "8999";
  expect(() => buildGuidedStateOriginals(restored, saved)).toThrow(/original/i);
});

it("PA residency guide - confirms and replays the Florida mover's original full-year resident facts", () => {
  checkInboundMoverGuide(pa2026FloridaMoveResidentFixture());
});

it("PA residency guide - confirms and replays the Texas mover's original full-year resident facts", () => {
  checkInboundMoverGuide(pa2026TexasMoveResidentFixture());
});

function checkInboundMoverGuide(f: ReturnType<typeof pa2026FloridaMoveResidentFixture>) {
  const guide = startInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "PA" }, 2026);
  const owner = f.input.taxpayer.primary;
  guide.sectionData["personal-info"] = { ...structuredClone(completePersonalInfo), firstName: owner.firstName, lastName: owner.lastName,
    ssn: owner.ssn, addressLine1: f.input.taxpayer.address.street, city: "Pittsburgh", state: "PA", zip: "15222" };
  guide.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, sourceTaxYear: "2026", wages: "75000", federalWithheld: "11600",
    socialSecurityWages: "75000", socialSecurityWithheld: "4650", medicareWages: "75000", medicareWithheld: "1087.50",
    allocatedTips: "0", box12CodeD: "0", box12CodeE: "0", box12CodeF: "0", box12CodeG: "0", box12CodeH: "0",
    box12CodeS: "0", box12CodeAA: "0", box12CodeBB: "0", box12CodeEE: "0", box12CodeT: "0",
    stateTaxReporting: "single", state: "PA", stateWages: "75000", stateWithheld: "2303" }] };
  const beforeW2Confirmation = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(guide));
  const w2Rows = confirmGuidedW2StateLocalSources(beforeW2Confirmation, 0, { ...emptyGuidedW2StateLocalSources(), sourceTaxYear: 2026,
    sourceReference: "Fictional original complete 2026 W-2", owner: { accountHolder: "primary" },
    currentUncorrectedNonvoidOriginalConfirmed: true, allOriginalBoxesKnownConfirmed: true,
    singleOriginalWithoutContinuationConfirmed: true, allOriginalPagesAndCopiesCheckedConfirmed: true,
    stateReporting: "single", localReporting: "none", legacyScalarProjection: "first_entered_rows",
    stateRows: [{ printedRow: 1, sourceReference: "Fictional original PA Boxes 15–17", state: "PA", employerStateIDStatus: "reported", employerStateID: "Fictional PA account", wages: "75000", withheld: "2303" }] });
  guide.sectionData["income-w2"].entries[0].stateLocalSources = w2Rows;
  const wageInput = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(guide));
  const paResidencySources = f.input.paResidencySources;
  const residency = confirmGuidedPAResidencySources(wageInput, { ...paResidencySources, sourceFactsConfirmed: null });
  const input = { ...wageInput, paResidencySources: residency };
  const facts = confirmGuidedPAOrdinaryReturnFacts(input, { ...f.facts, sourceFactsConfirmed: null });
  const stateReturn: StateReturnData = { ...emptyStateReturnData, paResidencySources: residency, paOrdinaryReturnFacts: facts };
  guide.sectionData["state-return"] = stateReturn;
  expect(buildGuidedPAOrdinarySourceInput(guide)).toEqual(input);
  expect(validateSection(guide, "state-return").fieldErrors?.paOrdinaryReturnCompletionSources).toMatch(/completion records/i);
  expect(() => buildGuidedStateOriginals(wageInput, guide)).toThrow();
  stateReturn.paOrdinaryReturnCompletionSources = confirmGuidedPAOrdinaryReturnCompletionSources(input, { ...f.sources, sourceFactsConfirmed: null }, facts);

  const saved = reopenPennsylvaniaResidencyGuide(guide);
  expect(validateSection(saved, "state-return").status).toBe("complete");
  const current = buildGuidedStateOriginals(wageInput, saved);
  expect(current.paResidencySources?.residency).toEqual(paResidencySources.residency);
  expect(current.paResidencySources?.wages[0].original).toEqual(wageInput.w2s[0]);
  const result = calculatePA2026OrdinaryDraft(current, current.paOrdinaryReturnFacts, current.paOrdinaryReturnCompletionSources);
  expect(result.pa.residencyStatus).toBe("resident");
  expect(result.pa.pa40.compensation.toFixed()).toBe("75000");
  expect(result.pa.pa40.taxLiability.toFixed()).toBe("2303");
  expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });

  const twoStateRows = confirmGuidedW2StateLocalSources(beforeW2Confirmation, 0, { ...w2Rows, stateReporting: "multiple",
    stateRows: [w2Rows.stateRows[0], { ...w2Rows.stateRows[0], printedRow: 2, sourceReference: "Other original state row", state: "NJ", wages: "0", withheld: "0" }] });
  const twoStateInput = { ...beforeW2Confirmation, w2s: [{ ...beforeW2Confirmation.w2s[0], stateLocalSources: twoStateRows }] };
  expect(() => confirmGuidedPAResidencySources(twoStateInput, { ...paResidencySources, sourceFactsConfirmed: null })).toThrow(/one actual PA W-2 state row/i);

  const exactBoundary = structuredClone(residency);
  exactBoundary.residency.domicilePeriods[1].daysInPA = 143;
  expect(() => confirmGuidedPAResidencySources(wageInput, exactBoundary)).toThrow(/183.*separate residency method/i);
  stateReturn.paResidencySources = updateGuidedPAResidencySources(residency, { sourceReference: "Edited move reference" });
  expect(() => buildGuidedStateOriginals(wageInput, guide)).toThrow(/confirm/i);
  wageInput.w2s[0].stateWages = "74999";
  expect(() => buildGuidedStateOriginals(wageInput, saved)).toThrow(/original/i);
}
