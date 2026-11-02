import { expect, it } from "vitest";
import { confirmGuidedPAResidencySources, buildGuidedPAResidencySources, updateGuidedPAResidencySources } from "@/lib/guided-pa-residency-facts";
import { paOrdinaryResidencyFixture } from "../../fixtures/pa-residency-sources.js";
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
