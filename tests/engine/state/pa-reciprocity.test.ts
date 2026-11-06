import { expect, it } from "vitest";
import { calculatePAReciprocalCompensation } from "@/engine/state/pa-reciprocity.js";
import { calculatePAResidencySources } from "@/engine/state/pa-residency-sources.js";
import { paReciprocityFixture, paPartYearReciprocityFixture } from "../../fixtures/pa-reciprocity.js";
// Spec: spec/state/pa-reciprocity.yaml. Original monetary controls precede output.

it("PA reciprocity - excludes actual employee services and preserves actual originals", () => {
  for (const year of [2025, 2026]) for (const state of ["IN", "MD", "NJ", "OH", "VA", "WV"]) {
    const f = paReciprocityFixture(year, state); const before = structuredClone(f);
    const r = calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources);
    expect(r.totalExcludedPACompensation.toString()).toBe("50000");
    expect(r.segments[0].taxablePAServices.toString()).toBe("0");
    expect(f).toEqual(before);
    expect(JSON.stringify(r)).not.toContain("900-70-0311");
    expect(JSON.stringify(r)).not.toContain("12-3456789");
    expect(JSON.stringify(r)).not.toContain("fictional-private");
  }
});
it("PA reciprocity - distinguishes actual Ohio ownership below and at20percent", () => {
  for (const [ownership, excluded, taxable] of [["0", "50000", "0"], ["19.999", "50000", "0"], ["20", "0", "50000"], ["100", "0", "50000"]]) {
    const f = paReciprocityFixture(); Object.assign(f.reciprocalSources.segments[0], { employerIsPASCorporation: true, shareholderEmployee: true, actualOwnershipPercent: ownership });
    const r = calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources);
    expect(r.totalExcludedPACompensation.toString()).toBe(excluded);
    expect(r.segments[0].taxablePAServices.toString()).toBe(taxable);
  }
});
it("PA reciprocity - counts withholding once and separates pending refund documents", () => {
  const f = paReciprocityFixture();
  f.residencySources.wages[0].payroll = [
    { ...f.residencySources.wages[0].payroll[0], sourceReference: "actual-first-payroll", paidOn: "2025-06-30", serviceThrough: "2025-06-30", grossCompensation: "25000", paServicesCompensation: "25000" },
    { ...f.residencySources.wages[0].payroll[0], sourceReference: "actual-second-payroll", serviceFrom: "2025-07-01", grossCompensation: "25000", paServicesCompensation: "25000" },
  ];
  f.reciprocalSources.segments = f.residencySources.wages[0].payroll.map((p, i) => ({ ...f.reciprocalSources.segments[0], payrollIndex: i, sourceReference: `actual-classification-${i}`, actualPayroll: structuredClone(p) }));
  let r = calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources);
  expect(r.paWithheldFromCoveredOriginals.toString()).toBe("1535");
  expect(r.originals[0].refundSupportStatus).toBe("complete");
  f.reciprocalSources.originals[0].residentStateReturn.filedConfirmed = false;
  f.reciprocalSources.originals[0].residentStateReturn.sourceReference = "";
  r = calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources);
  expect(r.totalExcludedPACompensation.toString()).toBe("50000");
  expect(r.originals[0].refundSupportStatus).toBe("pending_documents");
});
it("PA reciprocity - rejects stale unknown contradictory and duplicated source proof", () => {
  const mutations = [
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.sourceTaxYear = 2024; },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.segments[0].employeeCompensationOnlyConfirmed = false; },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.segments[0].noPAResidentEarnedDeferredCompensationConfirmed = false; },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.segments[0].actualPayroll.grossCompensation = "49999.99"; },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.input.w2s[0].employer.name = "A different actual employer"; },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.originals[0].actualPAWithheld = "0"; },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.originals[0].zeroOrOneStateRowOnActualOriginalConfirmed = false; },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.segments.push(structuredClone(f.reciprocalSources.segments[0])); },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.originals = []; },
  ];
  for (const mutate of mutations) { const f = paReciprocityFixture(); mutate(f); expect(() => calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources)).toThrow(/PA.*recipro|PA.*source/i); }
});

it("PA reciprocity - admits actual zero withholding without inferring another state credit", () => {
  const f = paReciprocityFixture(); f.input.w2s[0].stateTaxWithheld = "0";
  f.residencySources.wages[0].original = structuredClone(f.input.w2s[0]);
  f.reciprocalSources.originals[0].originalW2 = structuredClone(f.input.w2s[0]);
  f.reciprocalSources.originals[0].actualPAWithheld = "0";
  expect(calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources).totalExcludedPACompensation.toString()).toBe("50000");
  f.input.w2s[0].state = "OH"; f.input.w2s[0].stateTaxWithheld = "1000";
  f.residencySources.wages[0].original = structuredClone(f.input.w2s[0]);
  f.reciprocalSources.originals[0].originalW2 = structuredClone(f.input.w2s[0]);
  f.reciprocalSources.originals[0].paWithholdingStatus = "no_PA_row_on_original";
  const r = calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources);
  expect(r.totalExcludedPACompensation.toString()).toBe("50000"); expect(r.paWithheldFromCoveredOriginals.toString()).toBe("0");
});
it("PA reciprocity - preserves unknown necessary legal and Ohio entity facts", () => {
  for (const key of ["employeeCompensationOnlyConfirmed", "compensationLegallySubjectToEmployerWithholdingConfirmed", "earnedWhileReciprocalResidentConfirmed", "noPAResidentEarnedDeferredCompensationConfirmed", "employerIsPASCorporation"] as const) {
    const f = paReciprocityFixture(); Object.assign(f.reciprocalSources.segments[0], { [key]: null });
    expect(() => calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources)).toThrow(/PA.*source|PA.*recipro/i);
  }
  const f = paReciprocityFixture(); Object.assign(f.reciprocalSources.segments[0], { employerIsPASCorporation: true, shareholderEmployee: true, actualOwnershipPercent: "" });
  expect(() => calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources)).toThrow(/ownership|source/i);
});
it("PA reciprocity - gives changed actual equal-dollar originals a different private commitment", () => {
  const f = paReciprocityFixture(); const before = calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources);
  f.input.w2s[0].employer.name = "A Different Actual Employer";
  f.residencySources.wages[0].original = structuredClone(f.input.w2s[0]);
  f.reciprocalSources.originals[0].originalW2 = structuredClone(f.input.w2s[0]);
  const after = calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources);
  expect(after.totalExcludedPACompensation.toString()).toBe("50000"); expect(after.sourceCommitment).not.toBe(before.sourceCommitment);
});

it("PA reciprocity - integrates actual part-year exclusion after pre-exclusion payroll reconciliation", () => {
  for (const year of [2025, 2026]) {
    const f = paPartYearReciprocityFixture(year);
    const current = { ...f.input, paReciprocitySources: f.reciprocalSources };
    const result = calculatePAResidencySources(current, f.residencySources);
    expect(result.compensation.toString()).toBe("20000");
    expect(result.reportedCompensation.toString()).toBe("20000");
    expect(result.excludedReciprocalCompensation.toString()).toBe("30000");
    expect(result.taxBeforeCredits.toString()).toBe("614");
    expect(current.w2s[0].stateWages).toBe("50000");
    expect(f.residencySources.wages[0].payroll[1].paServicesCompensation).toBe("30000");
    expect(() => calculatePAResidencySources(f.input, f.residencySources)).toThrow(/reciprocal.*source|reciprocal.*actual/i);
    current.w2s[0].stateWages = "40000";
    f.residencySources.wages[0].original = structuredClone(current.w2s[0]);
    f.reciprocalSources.originals[0].originalW2 = structuredClone(current.w2s[0]);
    expect(() => calculatePAResidencySources(current, f.residencySources)).toThrow(/original.*compensation|payroll.*compensation|reconcile|NRH/i);
  }
});

it("PA reciprocity - rejects incomplete coverage and keeps raw exclusion cents before class rounding", () => {
  for (const mutate of [
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.originals.push(structuredClone(f.reciprocalSources.originals[0])); },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.originals[0].noAdditionalPAStateRowOnOriginalConfirmed = false; },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.segments[0].payrollIndex = 1; },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.reciprocalSources.segments[0].reciprocalState = "NJ"; },
    (f: ReturnType<typeof paReciprocityFixture>) => { f.residencySources.residency.domicilePeriods[0].daysInPA = 200; f.residencySources.residency.paPermanentAbodePeriods = [{ from: "2025-01-01", through: "2025-12-31" }]; },
    (f: ReturnType<typeof paReciprocityFixture>) => { Object.assign(f.reciprocalSources.segments[0], { employerIsPASCorporation: true, shareholderEmployee: null }); },
    (f: ReturnType<typeof paReciprocityFixture>) => { Object.assign(f.reciprocalSources.segments[0], { employerIsPASCorporation: true, shareholderEmployee: true, actualOwnershipPercent: "100.01" }); },
  ]) { const f = paReciprocityFixture(); mutate(f); expect(() => calculatePAReciprocalCompensation(f.input, f.residencySources, f.reciprocalSources)).toThrow(/PA.*source|PA.*recipro/i); }
  const f = paPartYearReciprocityFixture();
  Object.assign(f.input.w2s[0], { wages: "16.98", socialSecurityWages: "16.98", socialSecurityWithheld: "1.05", medicareWages: "16.98", medicareWithheld: "0.25", stateWages: "16.98", stateTaxWithheld: "0" });
  Object.assign(f.residencySources.wages[0].payroll[0], { grossCompensation: "16.49", outsidePAServicesCompensation: "16.49" });
  Object.assign(f.residencySources.wages[0].payroll[1], { grossCompensation: "0.49", paServicesCompensation: "0.49" });
  f.residencySources.wages[0].original = structuredClone(f.input.w2s[0]);
  f.reciprocalSources.originals[0].originalW2 = structuredClone(f.input.w2s[0]); f.reciprocalSources.originals[0].actualPAWithheld = "0";
  f.reciprocalSources.segments[0].actualPayroll = structuredClone(f.residencySources.wages[0].payroll[1]);
  const current = { ...f.input, paReciprocitySources: f.reciprocalSources };
  const r = calculatePAResidencySources(current, f.residencySources);
  expect(r.excludedReciprocalCompensation.toString()).toBe("0.49"); expect(r.compensation.toString()).toBe("16.49");
  expect(r.reportedCompensation.toString()).toBe("16"); expect(r.taxBeforeCredits.toString()).toBe("0");
});
