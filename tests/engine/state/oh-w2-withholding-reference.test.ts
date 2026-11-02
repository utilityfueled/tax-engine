/** Spec: spec/state/oh-w2-withholding-reference.yaml; literal oracles precede product. */
import { expect, it } from "vitest";
import { calculateOhioScheduleOfWithholding } from "@/engine/state/oh-schedule-of-withholding.js";
import { calculateW2StateLocalSources } from "@/engine/forms/w2-state-local.js";
import { calculateDigitalAssetStateSources } from "@/engine/state/digital-asset-sources.js";
import { allOhioSourceFamilies, ohioReferenceFixture, ohioConsumerPacket, ohioConsumerOHRow, ohioConsumerW2, rebindOhioConsumerW2, statuses } from "../../fixtures/oh-w2-withholding-reference.js";
import type { TaxYearInput } from "@/models/inputs.js";
function support(input: TaxYearInput) {
  const source = { w2s: input.w2s, w2SourceContext: input, formW2Gs: input.formW2G, form1099Gs: input.form1099G, form1099Ks: input.form1099K, form1099Rs: input.form1099R, form1099Necs: input.form1099Nec, form1099Miscs: input.form1099Misc, form1099Ints: input.form1099Int, form1099Divs: input.form1099Div, form1099Bs: calculateDigitalAssetStateSources(input, "OH").form1099B, form1099OIDs: input.form1099OID };
  return calculateOhioScheduleOfWithholding(source);
}
it("OH support selects actual OH rows once for either order and unused scalars", () => {
  for (const status of statuses) for (const mode of ["pa_first", "oh_first", "unused"] as const) {
    const input = ohioReferenceFixture(status, mode), before = structuredClone(input);
    const result = support(input), proof = calculateW2StateLocalSources(input, 0, ohioConsumerPacket(input));
    expect(result.line1_w2OhioWithholding.toString()).toBe("1000");
    expect(result.line6_totalOhioWithholding.toString()).toBe("1000");
    expect(result).toEqual(expect.objectContaining({ actualW2SourceCommitments: [{ originalIndex: 0, sourceCommitment: proof.sourceCommitment }] }));
    const audit = JSON.stringify(result.lines);
    expect(audit).toContain(proof.sourceCommitment);
    for (const secret of [input.taxpayer.primary.ssn, "PRIVATE-ACTUAL-OH-SECOND", "PRIVATE-OH-STATE-ID"]) expect(audit).not.toContain(secret);
    expect(input).toEqual(before);
  }
});
it("OH support rejects actual packets without matching current full context", () => {
  const input = ohioReferenceFixture(), other = structuredClone(input);
  ohioConsumerW2(other).employer.name = "Changed actual source";
  for (const candidate of [{ w2s: input.w2s }, { w2s: input.w2s, w2SourceContext: other }, { w2s: [], w2SourceContext: input }]) expect(() => calculateOhioScheduleOfWithholding(candidate)).toThrow(/context|actual|original|source/i);
  const clone = structuredClone(input);
  expect(calculateOhioScheduleOfWithholding({ w2s: input.w2s, ...{ w2SourceContext: clone } }).line1_w2OhioWithholding.toString()).toBe("1000");
});
it.each(["zero", "no_oh"] as const)("OH support validates known %s even when no positive Ohio credit is present", mode => {
  const input = ohioReferenceFixture("full_year_resident", mode);
  expect(support(input).line6_totalOhioWithholding.toString()).toBe("0");
  ohioConsumerPacket(input).sourceFactsConfirmed = false;
  expect(() => support(input)).toThrow(/actual|source|confirm/i);
});
it.each(["unknown", "year", "owner", "original", "duplicate", "projection", "localUnknown", "missingOwner"] as const)("OH support rejects malformed actual %s without fallback", kind => {
  const input = ohioReferenceFixture(), packet = ohioConsumerPacket(input);
  if (kind === "unknown") ohioConsumerOHRow(input).withheld = "";
  if (kind === "year") packet.sourceTaxYear = 2024;
  if (kind === "owner") packet.owner.originalTaxpayer.ssn = "900-00-0000";
  if (kind === "original") ohioConsumerW2(input).employer.name = "New original";
  if (kind === "duplicate") input.w2s.push(structuredClone(ohioConsumerW2(input)));
  if (kind === "projection") ohioConsumerW2(input).stateTaxWithheld = "9999";
  if (kind === "localUnknown") packet.localReporting = "single";
  if (kind === "missingOwner") delete ohioConsumerW2(input).accountHolder;
  expect(() => support(input)).toThrow(/actual|source|original|owner|amount|row|projection/i);
});
it("OH support retains every source family and exact large Decimal cents", () => {
  const all = allOhioSourceFamilies(), result = support(all);
  expect([result.line1_w2OhioWithholding, result.line2_w2gOhioWithholding, result.line3_1099gOhioWithholding, result.line4_1099kOhioWithholding, result.line5_1099rOhioWithholding, result.line5a_1099NecOhioWithholding, result.line5b_1099MiscOhioWithholding, result.line5c_1099IntOhioWithholding, result.line5d_1099DivOhioWithholding, result.line5e_1099BOhioWithholding, result.line5f_1099OIDOhioWithholding, result.line5g_1099DAOhioWithholding].map(x => x.toString())).toEqual(["1000.01", "2.02", "3.03", "4.04", "5.05", "6.06", "7.07", "8.08", "9.09", "10.1", "11.11", "12.12"]);
  expect(result.line6_totalOhioWithholding.toString()).toBe("1077.78");
  const input = ohioReferenceFixture(); ohioConsumerOHRow(input).withheld = "9007199254740993.01";
  const legacy = structuredClone(ohioConsumerW2(input)); delete legacy.stateLocalSources;
  Object.assign(legacy, { employer: { name: "Independent actual legacy employer", ein: "23-4567890" }, state: "OH", stateTaxWithheld: "0.02", wages: "100" });
  input.w2s.push(legacy);
  expect(support(input).line6_totalOhioWithholding.toString()).toBe("9007199254740993.03");
});
it("OH support binds current private original identity and retains legacy calls", () => {
  const input = ohioReferenceFixture(), first = support(input);
  ohioConsumerW2(input).employer.name = "Same-money changed original"; rebindOhioConsumerW2(input);
  expect(support(input).lines).not.toEqual(first.lines);
  expect(calculateOhioScheduleOfWithholding({ w2s: [{ ...ohioConsumerW2(input), stateLocalSources: undefined, state: "OH", stateTaxWithheld: "0.25" }] }).line6_totalOhioWithholding.toString()).toBe("0.25");
});
