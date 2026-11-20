/** Spec: state/guided-state-originals-integration.yaml. */
import { expect, it, vi } from "vitest";
import { updateSectionData, type GuidedFlowState, type StateReturnData } from "@/lib/guided-interview-flow";
import { confirmGuidedOhioReturnHeaderSources } from "@/lib/guided-ohio-return-header-sources";
import { guidedReciprocalWageFixture } from "../fixtures/guided-oh-reciprocal-wages-complete";
import { guidedSchoolDistrictFixture, required } from "../fixtures/guided-oh-school-district-complete";
import { julyEnteredHeader, julyNativeFixture } from "../fixtures/oh-business-part-year-header";

function projectEdit(state: GuidedFlowState, incoming: StateReturnData, ...references: string[]) {
  const stringify = vi.spyOn(JSON, "stringify");
  try {
    const updated = updateSectionData(state, "state-return", incoming);
    const projections = references.map(reference => stringify.mock.calls.filter(([value]) =>
      value !== null && typeof value === "object" && Reflect.get(value, "sourceReference") === reference,
    ).length);
    return { updated, projections };
  } finally {
    stringify.mockRestore();
  }
}

it("skips unchanged Ohio projections and preserves a school source edit", () => {
  const { state, data } = guidedSchoolDistrictFixture();
  const school = required(data.ohioSchoolDistrict);
  const residence = required(data.ohioResidency);
  const payments = required(data.ohioPayments);
  const editedSchool = {
    ...school,
    payments: {
      ...school.payments,
      account: { ...school.payments.account, sourceReference: "replacement school account reference" },
    },
  };
  const incoming = { ...data, ohioSchoolDistrict: editedSchool };
  const before = structuredClone({ state, incoming });
  const references = [residence.sourceReference, payments.sourceReference, school.sourceReference];
  const shared = projectEdit(state, incoming, ...references);
  const rebuilt = projectEdit(state, structuredClone(incoming), ...references);

  expect(shared.updated).toStrictEqual(rebuilt.updated);
  expect(shared.updated.sectionData["state-return"]).toStrictEqual({
    ...incoming, ohioSchoolDistrict: { ...editedSchool, sourceFactsConfirmed: null },
  });
  expect({ state, incoming }).toStrictEqual(before);
  expect(rebuilt.projections).toEqual([2, 2, 2]);
  expect(shared.projections).toEqual([0, 0, 2]);
});

it.each(["changed", "removed"] as const)("keeps Ohio dependency invalidation for a changed or removed payment %s", action => {
  if (action === "changed") {
    const { state, input, residency, payments } = julyNativeFixture();
    const header = confirmGuidedOhioReturnHeaderSources(input, julyEnteredHeader(), residency, payments);
    const data = required(state.sectionData["state-return"]);
    data.ohioReturnHeaderSources = header;
    const editedPayment = { ...payments, sourceReference: "replacement Ohio payment source" };
    const incoming = { ...data, ohioPayments: editedPayment };
    const before = structuredClone({ state, incoming });
    const shared = projectEdit(state, incoming, header.sourceReference, payments.sourceReference, editedPayment.sourceReference);
    const rebuilt = projectEdit(state, structuredClone(incoming), header.sourceReference);

    expect(shared.updated).toStrictEqual(rebuilt.updated);
    expect(shared.updated.sectionData["state-return"]).toStrictEqual({
      ...incoming,
      ohioPayments: { ...editedPayment, sourceFactsConfirmed: null },
      ohioResidency: {
        ...residency,
        sourceFactsConfirmed: null,
        businessSources: { ...required(residency.businessSources), sourceFactsConfirmed: null },
      },
      ohioReturnHeaderSources: { ...header, sourceFactsConfirmed: null },
    });
    expect({ state, incoming }).toStrictEqual(before);
    expect(rebuilt.projections).toEqual([2]);
    expect(shared.projections).toEqual([0, 1, 1]);
  } else {
    const { state, data, draft, residency, payments } = guidedReciprocalWageFixture();
    const { ohioPayments: _removedPayment, ...incoming } = data;
    const before = structuredClone({ state, incoming });
    const shared = projectEdit(state, incoming, residency.sourceReference, draft.sourceReference, payments.sourceReference);
    const rebuilt = projectEdit(state, structuredClone(incoming), residency.sourceReference, draft.sourceReference);

    expect(shared.updated).toStrictEqual(rebuilt.updated);
    expect(shared.updated.sectionData["state-return"]).toStrictEqual({
      ...incoming, ohioReciprocalWages: { ...draft, sourceFactsConfirmed: null },
    });
    expect({ state, incoming }).toStrictEqual(before);
    expect(rebuilt.projections).toEqual([2, 2]);
    expect(shared.projections).toEqual([0, 0, 1]);
  }
});
