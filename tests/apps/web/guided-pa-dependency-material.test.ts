import { expect, it } from "vitest";
import { updateSectionData } from "@/lib/guided-interview-flow";
import { guidedOhioBusinessFixture } from "../../fixtures/guided-ohio-business-sources";
import { guidedReciprocalWageFixture } from "../../fixtures/guided-oh-reciprocal-wages-complete";
import { guidedPAOrdinaryPanelFixture } from "../../fixtures/guided-pa-ordinary-panels";

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Explicit fictional original required");
  return value;
}

it("keeps unknown and explicit zero distinct without inventing PA packets", () => {
  const fixture = guidedPAOrdinaryPanelFixture();
  const previous = { stateEstimatedPayments: [], additionalStateWithholding: "" };
  fixture.state.sectionData["state-return"] = previous;
  const before = structuredClone(fixture.state);
  const incoming = { ...previous, additionalStateWithholding: "0" };

  const next = updateSectionData(fixture.state, "state-return", incoming);
  const saved = required(next.sectionData["state-return"]);

  expect(saved.additionalStateWithholding).toBe("0");
  expect(saved).not.toBe(incoming);
  expect(saved).not.toHaveProperty("paMarriedOrdinarySources");
  expect(saved).not.toHaveProperty("paOrdinaryReturnFacts");
  expect(saved).not.toHaveProperty("paOrdinaryReturnCompletionSources");
  expect(next.sectionData["personal-info"]).toBe(fixture.state.sectionData["personal-info"]);
  expect(fixture.state).toEqual(before);
});

it("removing ordinary PA facts retains unchanged completion confirmation and its originals", () => {
  const fixture = guidedPAOrdinaryPanelFixture();
  const before = structuredClone(fixture.state);
  const incoming = structuredClone(fixture.data);
  delete incoming.paOrdinaryReturnFacts;

  const next = updateSectionData(fixture.state, "state-return", incoming);
  const saved = required(next.sectionData["state-return"]);

  expect(saved).not.toHaveProperty("paOrdinaryReturnFacts");
  expect(saved.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBe(true);
  expect(saved.paOrdinaryReturnCompletionSources).toBe(incoming.paOrdinaryReturnCompletionSources);
  expect(saved).not.toBe(incoming);
  expect(fixture.state).toEqual(before);
});

it("an Ohio edit still invalidates retained cross-state PA completion evidence", () => {
  const fixture = guidedOhioBusinessFixture();
  const paFixture = guidedPAOrdinaryPanelFixture();
  const previous = required(fixture.state.sectionData["state-return"]);
  previous.paOrdinaryReturnCompletionSources = structuredClone(paFixture.data.paOrdinaryReturnCompletionSources);
  const before = structuredClone(fixture.state);
  const incoming = structuredClone(previous);
  required(incoming.ohioResidency).sourceReference += " revised original";

  const next = updateSectionData(fixture.state, "state-return", incoming);
  const saved = required(next.sectionData["state-return"]);

  expect(saved.paOrdinaryReturnCompletionSources?.sourceFactsConfirmed).toBeNull();
  expect(saved.paOrdinaryReturnCompletionSources?.originalFederalSources)
    .toBe(incoming.paOrdinaryReturnCompletionSources?.originalFederalSources);
  expect(saved.ohioResidency?.sourceFactsConfirmed).toBeNull();
  expect(fixture.state).toEqual(before);
});

it("preserves malformed saved primitive replacements for later validation", () => {
  const fixture = guidedReciprocalWageFixture();
  Reflect.set(fixture.state.sectionData, "state-return", 1);
  const before = structuredClone(fixture.state);

  const next = updateSectionData(fixture.state, "state-return", 2);

  expect(Reflect.get(next.sectionData, "state-return")).toBe(2);
  expect(fixture.state).toEqual(before);
});

it("preserves existing array-versus-record replacement copy behavior", () => {
  const fixture = guidedReciprocalWageFixture();
  Reflect.set(fixture.state.sectionData, "state-return", [1]);
  const before = structuredClone(fixture.state);
  const incoming = { "0": 1 };

  const next = updateSectionData(fixture.state, "state-return", incoming);

  expect(Reflect.get(next.sectionData, "state-return")).toBe(incoming);
  expect(fixture.state).toEqual(before);
});

it("does not silently discard a malformed old married packet during removal", () => {
  const fixture = guidedReciprocalWageFixture();
  const previous = required(fixture.state.sectionData["state-return"]);
  Reflect.set(previous, "paMarriedOrdinarySources", {});
  const before = structuredClone(fixture.state);
  const incoming = structuredClone(previous);
  delete incoming.paMarriedOrdinarySources;

  expect(() => updateSectionData(fixture.state, "state-return", incoming)).toThrow(TypeError);
  expect(fixture.state).toEqual(before);
});
