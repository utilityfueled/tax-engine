// Spec: spec/federal/schedule-b.yaml, part-three-state-originals.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal";
import { calculateOhioCanonicalBusinessSource } from "@/engine/state/oh-business-source";
import { calculateOhio2026ReturnDraftFromSources } from "@/engine/state/oh-engine";
import { buildOhioResidentReturnInput } from "@/engine/state/oh-input-adapter";
import { calculatePA2026OrdinaryDraft, calculatePAOrdinaryReturn } from "@/engine/state/pa-ordinary-return";
import { calculatePAReciprocalCompensation } from "@/engine/state/pa-reciprocity";
import { calculatePAResidencySources } from "@/engine/state/pa-residency-sources";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildGuidedOhio2026SchoolSource, captureGuidedOhio2026SchoolOriginals, confirmGuidedOhio2026SchoolSource } from "@/lib/guided-ohio-2026-school-sources";
import { updateGuidedScheduleBPartThree } from "@/lib/guided-schedule-b-part-three";
import { buildGuidedStateOriginals } from "@/lib/guided-state-engine-inputs";
import { TaxYearInputSchema } from "@/models/inputs";
import type { GuidedFlowState } from "@/lib/guided-interview-flow";
import { enteredOhio2026SchoolDraft, ohio2026NativeOriginalFixture } from "../../fixtures/guided-oh-2026-school-native";
import { guidedOhioBusinessFixture } from "../../fixtures/guided-ohio-business-sources";
import { guidedOhioNavigationFixture } from "../../fixtures/guided-ohio-source-navigation";
import { guidedPAOrdinaryPanelFixture } from "../../fixtures/guided-pa-ordinary-panels";
import { ohio2026OrdinaryFixture } from "../../fixtures/oh-2026-ordinary-return";
import { ohio2026PaReciprocalFixture } from "../../fixtures/oh-2026-pa-reciprocal-return";
import { ohio2026VaResidentCreditFixture } from "../../fixtures/oh-2026-va-resident-credit-return";
import { reciprocalOhioWageFixture } from "../../fixtures/oh-reciprocal-wage-sources";
import { ohioResidentCreditFixture } from "../../fixtures/oh-resident-credit-sources";
import { pa2026OrdinaryDraftFixture } from "../../fixtures/pa-2026-ordinary-draft";
import { paReciprocityFixture } from "../../fixtures/pa-reciprocity";
import { paOrdinaryResidencyFixture } from "../../fixtures/pa-residency-sources";

function replay(state: GuidedFlowState) {
  return buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), state);
}

const disclosure = { hasForeignAccounts: false, hasForeignTrust: false };

it("keeps confirmed Pennsylvania originals usable after editing Schedule B Part III", () => {
  const { state } = guidedPAOrdinaryPanelFixture();
  const before = replay(state);
  const after = replay(updateGuidedScheduleBPartThree(state, disclosure));

  expect(after.scheduleBPartThree).toEqual(disclosure);
  expect(calculatePAOrdinaryReturn(after, after.paOrdinaryReturnFacts, after.paOrdinaryReturnCompletionSources))
    .toEqual(calculatePAOrdinaryReturn(before, before.paOrdinaryReturnFacts, before.paOrdinaryReturnCompletionSources));

  const edited = structuredClone(after);
  edited.w2s[0].wages = "50001";
  expect(() => calculatePAOrdinaryReturn(edited, edited.paOrdinaryReturnFacts, edited.paOrdinaryReturnCompletionSources))
    .toThrow(/originals differ|original snapshot is stale/);
});

it("keeps confirmed Ohio originals usable after editing Schedule B Part III", () => {
  const { state } = guidedOhioNavigationFixture();
  const before = replay(state);
  const after = replay(updateGuidedScheduleBPartThree(state, disclosure));

  expect(after.scheduleBPartThree).toEqual(disclosure);
  const previousOhio = buildOhioResidentReturnInput(before, calculateFederalTax(before));
  const currentOhio = buildOhioResidentReturnInput(after, calculateFederalTax(after));
  expect(currentOhio).toEqual(previousOhio);

  const edited = structuredClone(after);
  edited.w2s[0].wages = "100001";
  expect(() => buildOhioResidentReturnInput(edited, calculateFederalTax(edited))).toThrow(/snapshot|originals.*changed/);
});

it("keeps confirmed 2026 ordinary state drafts usable after editing Schedule B Part III", () => {
  const pennsylvania = pa2026OrdinaryDraftFixture();
  const paBefore = calculatePA2026OrdinaryDraft(pennsylvania.input, pennsylvania.facts, pennsylvania.sources);
  const paAfter = calculatePA2026OrdinaryDraft({ ...pennsylvania.input, scheduleBPartThree: disclosure }, pennsylvania.facts, pennsylvania.sources);
  expect(paAfter.pa.pa40).toEqual(paBefore.pa.pa40);

  for (const fixture of [ohio2026OrdinaryFixture, ohio2026PaReciprocalFixture, ohio2026VaResidentCreditFixture]) {
    const { input, sources } = fixture();
    const ohioBefore = calculateOhio2026ReturnDraftFromSources({ taxInput: input, sources });
    const ohioAfter = calculateOhio2026ReturnDraftFromSources({
      taxInput: { ...input, scheduleBPartThree: disclosure }, sources,
    });
    expect(ohioAfter.incomeTax).toEqual(ohioBefore.incomeTax);
    expect(ohioAfter.refund).toEqual(ohioBefore.refund);
    expect(ohioAfter.sourceCommitment).toEqual(ohioBefore.sourceCommitment);
  }
});

it("keeps confirmed 2026 Ohio school sources usable after editing Schedule B Part III", () => {
  const { baseInput } = ohio2026NativeOriginalFixture();
  const captured = captureGuidedOhio2026SchoolOriginals(baseInput, enteredOhio2026SchoolDraft());
  const confirmed = confirmGuidedOhio2026SchoolSource(baseInput, captured);

  const edited = { ...baseInput, scheduleBPartThree: disclosure };
  expect(buildGuidedOhio2026SchoolSource(edited, confirmed)).toEqual(buildGuidedOhio2026SchoolSource(baseInput, confirmed));
  expect(captureGuidedOhio2026SchoolOriginals(edited, enteredOhio2026SchoolDraft()).originalFederalSources)
    .not.toHaveProperty("scheduleBPartThree");
});

it("keeps confirmed Ohio reciprocal wages and resident credit usable after editing Schedule B Part III", () => {
  for (const fixture of [reciprocalOhioWageFixture, ohioResidentCreditFixture]) {
    const { input } = fixture();
    const edited = { ...input, scheduleBPartThree: disclosure };
    expect(buildOhioResidentReturnInput(edited, calculateFederalTax(edited)))
      .toEqual(buildOhioResidentReturnInput(input, calculateFederalTax(input)));
  }
});

it("preserves the Ohio business source commitment after editing Schedule B Part III", () => {
  const { state } = guidedOhioBusinessFixture();
  const before = replay(state);
  const after = replay(updateGuidedScheduleBPartThree(state, disclosure));
  const source = (taxInput: typeof before) => calculateOhioCanonicalBusinessSource({
    taxInput, residencyFacts: taxInput.ohioResidency, federalResult: calculateFederalTax(taxInput),
  });

  expect(source(after)).toEqual(source(before));
});

it("preserves Pennsylvania residency and reciprocity commitments after editing Schedule B Part III", () => {
  const residency = paOrdinaryResidencyFixture("part_year");
  const reciprocity = paReciprocityFixture();

  expect(calculatePAResidencySources({ ...residency.input, scheduleBPartThree: disclosure }, residency.sources))
    .toEqual(calculatePAResidencySources(residency.input, residency.sources));
  expect(calculatePAReciprocalCompensation(
    { ...reciprocity.input, scheduleBPartThree: disclosure }, reciprocity.residencySources, reciprocity.reciprocalSources,
  )).toEqual(calculatePAReciprocalCompensation(reciprocity.input, reciprocity.residencySources, reciprocity.reciprocalSources));
});
