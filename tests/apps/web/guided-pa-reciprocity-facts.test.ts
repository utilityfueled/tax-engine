import { expect, it } from "vitest";
import { emptyGuidedPAReciprocitySources, confirmGuidedPAReciprocitySources, updateGuidedPAReciprocitySources, buildGuidedPAReciprocitySources } from "@/lib/guided-pa-reciprocity-facts";
import { paReciprocityFixture } from "../../fixtures/pa-reciprocity.js";
// Spec: spec/state/pa-reciprocity.yaml guide-atomic-confirmation.
it("PA reciprocal guide - jointly confirms actual sources and preserves edits", () => {
  const empty = emptyGuidedPAReciprocitySources(); expect(empty.sourceTaxYear).toBeNull(); expect(empty.sourceFactsConfirmed).toBeNull(); expect(empty.originals).toEqual([]);
  const f = paReciprocityFixture();
  const both = confirmGuidedPAReciprocitySources(f.input, { ...f.residencySources, sourceFactsConfirmed: null }, { ...f.reciprocalSources, sourceFactsConfirmed: null });
  expect(both.residencySources.sourceFactsConfirmed).toBe(true); expect(both.reciprocitySources.sourceFactsConfirmed).toBe(true);
  expect(both.reciprocitySources.originals[0].originalW2).toEqual(f.input.w2s[0]);
  expect(buildGuidedPAReciprocitySources(f.input, both.residencySources, both.reciprocitySources)).toEqual(both);
  const changed = updateGuidedPAReciprocitySources(both.residencySources, both.reciprocitySources, { sourceReference: "actual-new-reference" });
  expect(changed.residencySources.sourceFactsConfirmed).toBeNull(); expect(changed.reciprocitySources.sourceFactsConfirmed).toBeNull();
  expect(changed.residencySources.wages).toEqual(both.residencySources.wages);
  f.input.w2s[0].employer.ein = "98-7654321";
  expect(() => buildGuidedPAReciprocitySources(f.input, both.residencySources, both.reciprocitySources)).toThrow(/original|source/i);
});
