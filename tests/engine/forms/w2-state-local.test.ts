import { expect, it } from "vitest";
import { calculateW2StateLocalSources } from "@/engine/forms/w2-state-local.js";
import { w2StateLocalFixture } from "../../fixtures/w2-state-local.js";
// Spec: spec/federal/w2-state-local.yaml. Literal originals precede outputs.
it("W2 actual rows - preserves one federal original and overlapping PA OH wages", () => {
  for (const year of [2025, 2026]) {
    const f = w2StateLocalFixture(year), before = structuredClone(f);
    const r = calculateW2StateLocalSources(f.input, 0, f.sources);
    expect(r.federalWages.toString()).toBe("50000"); expect(r.federalWithheld.toString()).toBe("5000");
    expect(r.stateRows.map(row => [row.state, row.wages.toString(), row.withheld.toString()])).toEqual([["PA", "50000", "1535"], ["OH", "50000", "1000"]]);
    expect(r.totalStateWithheld.toString()).toBe("2535"); expect(f.input.w2s).toHaveLength(1); expect(f).toEqual(before);
    const audit = JSON.stringify(r);
    for (const privateValue of ["900-70-0311", "12-3456789", "PA-actual-employer-ID", "OH-actual-employer-ID", "fictional-private", "Philadelphia", "Columbus"]) expect(audit).not.toContain(privateValue);
  }
});
it("W2 actual rows - preserves known blank IDs and rejects unknown missing contradictory rows", () => {
  const f = w2StateLocalFixture(); f.sources.stateRows[1].employerStateIDStatus = "blank_original"; f.sources.stateRows[1].employerStateID = "";
  expect(calculateW2StateLocalSources(f.input, 0, f.sources).totalStateWithheld.toString()).toBe("2535");
  const mutations = [
    (g: ReturnType<typeof w2StateLocalFixture>) => { g.sources.stateRows[1].employerStateIDStatus = ""; },
    (g: ReturnType<typeof w2StateLocalFixture>) => { g.sources.stateRows[1].employerStateID = ""; },
    (g: ReturnType<typeof w2StateLocalFixture>) => { g.sources.stateRows[1].employerStateIDStatus = "blank_original"; },
    (g: ReturnType<typeof w2StateLocalFixture>) => { g.sources.stateRows[1].withheld = ""; },
    (g: ReturnType<typeof w2StateLocalFixture>) => { g.sources.stateRows[1].withheld = "-0.01"; },
    (g: ReturnType<typeof w2StateLocalFixture>) => { g.sources.stateRows[1].wages = "-1"; },
    (g: ReturnType<typeof w2StateLocalFixture>) => { g.sources.stateRows[1].printedRow = 1; },
    (g: ReturnType<typeof w2StateLocalFixture>) => { g.sources.stateRows[1].state = "PA"; },
    (g: ReturnType<typeof w2StateLocalFixture>) => { g.sources.stateRows.pop(); },
    (g: ReturnType<typeof w2StateLocalFixture>) => { g.sources.sourceTaxYear = null; },
  ];
  for (const mutate of mutations) { const g = w2StateLocalFixture(); mutate(g); expect(() => calculateW2StateLocalSources(g.input, 0, g.sources)).toThrow(/W.?2.*source|W.?2.*row/i); }
});
it("W2 actual rows - retains local rows independently without guessing jurisdiction", () => {
  const f = w2StateLocalFixture();
  const r = calculateW2StateLocalSources(f.input, 0, f.sources);
  expect(r.localRows.map(row => [row.printedRow, row.wages.toString(), row.withheld.toString()])).toEqual([[1, "50000", "1875"], [2, "50000", "1250"]]);
  expect(r.totalLocalWithheld.toString()).toBe("3125"); expect(r.localRows.some(row => "state" in row || "psd" in row || "rate" in row)).toBe(false);
  f.sources.localRows[1].localityNameStatus = "blank_original"; f.sources.localRows[1].localityName = "";
  expect(calculateW2StateLocalSources(f.input, 0, f.sources).totalLocalWithheld.toString()).toBe("3125");
  for (const value of ["", "-0.01"]) { const g = w2StateLocalFixture(); g.sources.localRows[0].withheld = value; expect(() => calculateW2StateLocalSources(g.input, 0, g.sources)).toThrow(/source|row/i); }
});
it("W2 actual rows - rejects scalar conflicts and counts explicit projections once", () => {
  const f = w2StateLocalFixture(); f.input.w2s[0].stateTaxWithheld = "1535.01"; f.sources.originalW2 = structuredClone(f.input.w2s[0]);
  expect(() => calculateW2StateLocalSources(f.input, 0, f.sources)).toThrow(/scalar|projection|source/i);
  const g = w2StateLocalFixture(); g.sources.legacyScalarProjection = "unused";
  expect(() => calculateW2StateLocalSources(g.input, 0, g.sources)).toThrow(/scalar|projection|source/i);
  Object.assign(g.input.w2s[0], { state: undefined, stateWages: "0", stateTaxWithheld: "0", localWages: "0", localTaxWithheld: "0", localityName: undefined, locality: undefined });
  g.sources.originalW2 = structuredClone(g.input.w2s[0]);
  const r = calculateW2StateLocalSources(g.input, 0, g.sources);
  expect(r.totalStateWithheld.toString()).toBe("2535"); expect(r.totalLocalWithheld.toString()).toBe("3125");
});
it("W2 actual rows - binds full current originals and rejects duplicate or stale source proof", () => {
  const f = w2StateLocalFixture(); const old = calculateW2StateLocalSources(f.input, 0, f.sources);
  f.input.w2s[0].employer.ein = "98-7654321";
  expect(() => calculateW2StateLocalSources(f.input, 0, f.sources)).toThrow(/original|source/i);
  f.sources.originalW2 = structuredClone(f.input.w2s[0]);
  const fresh = calculateW2StateLocalSources(f.input, 0, f.sources);
  expect(fresh.totalStateWithheld.toString()).toBe("2535"); expect(fresh.sourceCommitment).not.toBe(old.sourceCommitment);
  const g = w2StateLocalFixture(); g.input.w2s.push(structuredClone(g.input.w2s[0]));
  expect(() => calculateW2StateLocalSources(g.input, 0, g.sources)).toThrow(/duplicate|original|source/i);
  for (const key of ["sourceFactsConfirmed", "currentUncorrectedNonvoidOriginalConfirmed", "allOriginalBoxesKnownConfirmed", "singleOriginalWithoutContinuationConfirmed", "allOriginalPagesAndCopiesCheckedConfirmed"] as const) {
    const h = w2StateLocalFixture(); h.sources[key] = null; expect(() => calculateW2StateLocalSources(h.input, 0, h.sources)).toThrow(/source|original/i);
  }
});
