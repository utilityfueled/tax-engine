import { expect, it } from "vitest";
import { emptyGuidedW2StateLocalSources, confirmGuidedW2StateLocalSources, buildGuidedW2StateLocalSources, updateGuidedW2StateLocalSources } from "@/lib/guided-w2-state-local-facts";
import { w2StateLocalFixture } from "../../fixtures/w2-state-local.js";
// Spec: spec/federal/w2-state-local.yaml guide-confirmation.
it("W2 state local guide - confirms actual originals and invalidates edits", () => {
  const empty = emptyGuidedW2StateLocalSources(); expect(empty.sourceTaxYear).toBeNull(); expect(empty.sourceFactsConfirmed).toBeNull(); expect(empty.stateRows).toEqual([]); expect(empty.localRows).toEqual([]);
  const f = w2StateLocalFixture(); const confirmed = confirmGuidedW2StateLocalSources(f.input, 0, { ...f.sources, sourceFactsConfirmed: null });
  expect(confirmed.sourceFactsConfirmed).toBe(true); expect(confirmed.originalW2).toEqual(f.input.w2s[0]);
  expect(buildGuidedW2StateLocalSources(f.input, 0, confirmed)).toEqual(confirmed);
  const changed = updateGuidedW2StateLocalSources(confirmed, { sourceReference: "changed-actual-original-reference" });
  expect(changed.sourceFactsConfirmed).toBeNull(); expect(changed.stateRows).toEqual(confirmed.stateRows); expect(changed.localRows).toEqual(confirmed.localRows);
  f.input.w2s[0].employer.name = "A Different Actual Employer";
  expect(() => buildGuidedW2StateLocalSources(f.input, 0, confirmed)).toThrow(/source|original/i);
});
