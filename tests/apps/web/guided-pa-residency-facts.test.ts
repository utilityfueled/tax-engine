import { expect, it } from "vitest";
import { confirmGuidedPAResidencySources, buildGuidedPAResidencySources, updateGuidedPAResidencySources } from "@/lib/guided-pa-residency-facts";
import { confirmGuidedPAOrdinaryReturnFacts } from "@/lib/guided-pa-ordinary-return-facts";
import { confirmGuidedPAOrdinaryReturnCompletionSources } from "@/lib/guided-pa-ordinary-return-completion";
import { buildGuidedStateOriginals } from "@/lib/guided-state-engine-inputs";
import { confirmGuidedW2StateLocalSources, emptyGuidedW2StateLocalSources } from "@/lib/guided-w2-state-local-facts";
import { buildGuidedPAOrdinarySourceInput, emptyStateReturnData, startInterview, validateSection, type StateReturnData } from "@/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculatePA2026OrdinaryDraft } from "@/engine/state/pa-ordinary-return.js";
import { pa2026FloridaMoveResidentFixture } from "../../fixtures/pa-2026-ordinary-draft.js";
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

it("PA residency guide - confirms and replays the Florida mover's original full-year resident facts", () => {
  const f = pa2026FloridaMoveResidentFixture();
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

  const saved = structuredClone(guide);
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
});
