import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateDraftSchedule3A, type DraftSchedule3AInput } from "@/engine/schedules/schedule-3-a-draft.js";

// See spec/federal/schedule-3-a-draft.yaml and Treasury's proposed § 1.32-4 examples.
const source = {
  taxYear: 2026, returnForm: "1040", filingStatus: "single",
  earnedIncomeCredit: "2272", additionalChildTaxCredit: "0",
  refundableAmericanOpportunityCredit: "0", refundableAdoptionCredit: "0",
  schedule3Payments: "0", totalTaxBeforeForm1062: "1451", schedule2Line20: "0",
  benefitElection: "receive", taxpayerEligibility: "no",
} satisfies DraftSchedule3AInput;

function values(input: DraftSchedule3AInput, lines: string[]) {
  const result = calculateDraftSchedule3A(input);
  return lines.map(line => result.lines.find(row => row.line === line)?.value.toFixed());
}

describe("2026 draft Schedule 3-A", () => {
  it("reproduces the Treasury examples and stops at the liability boundary", () => {
    expect(values(source, ["1a", "1b", "2", "3", "4", "5", "6", "8"]))
      .toEqual(["2272", "0", "2272", "1451", "0", "1451", "821", "821"]);
    expect(values({ ...source, additionalChildTaxCredit: "1455", totalTaxBeforeForm1062: "706" }, ["2", "6", "8"]))
      .toEqual(["3727", "3021", "3021"]);
    for (const totalTaxBeforeForm1062 of ["2272.00", "2272.01"]) {
      const result = calculateDraftSchedule3A({ ...source, totalTaxBeforeForm1062, benefitElection: undefined });
      expect(result.status).toBe("no-benefit");
      expect(result.form1040Line32b?.toFixed()).toBe("0");
      expect(result.form1040Line32c?.toFixed()).toBe("2272");
      expect(result.lines.map(line => line.line)).toEqual(["1a", "1b", "2", "3", "4", "5", "6"]);
    }
  });

  it("keeps unaffected payments outside the benefit and skips when no covered credit is claimed", () => {
    const result = calculateDraftSchedule3A({ ...source, schedule3Payments: new Decimal("319.37") });
    expect(result.lines.slice(0, 3).map(row => row.value.toFixed())).toEqual(["2591.37", "319.37", "2272"]);
    expect(result.form1040Line32b?.toFixed()).toBe("821");
    expect(result.form1040Line32c?.toFixed()).toBe("1770.37");
    const skipped = calculateDraftSchedule3A({ ...source, earnedIncomeCredit: "0.00", schedule3Payments: "319.37" });
    expect(skipped.status).toBe("not-required");
    expect(skipped.lines).toEqual([]);
    expect(skipped.form1040Line32b).toBeUndefined();
    expect(skipped.form1040Line32c?.toFixed()).toBe("319.37");
  });

  it("aggregates the four affected credits before testing the liability floor", () => {
    const result = calculateDraftSchedule3A({
      ...source, earnedIncomeCredit: "200.01", additionalChildTaxCredit: "300.02",
      refundableAmericanOpportunityCredit: "400.03", refundableAdoptionCredit: "500.04",
      totalTaxBeforeForm1062: "1400.09", schedule3Payments: "0.03",
    });
    expect(result.lines[2]?.value.toFixed()).toBe("1400.1");
    expect(result.form1040Line32b?.toFixed()).toBe("0.01");
    expect(result.form1040Line32c?.toFixed()).toBe("1400.12");
  });

  it("deducts only Schedule 2 line 20 from the supplied line 24a", () => {
    const input = { ...source, totalTaxBeforeForm1062: "1701", schedule2Line20: "250" };
    expect(values(input, ["3", "4", "5", "6"])).toEqual(["1701", "250", "1451", "821"]);
    expect(values({ ...input, schedule2Line20: "1701" }, ["5", "6"])).toEqual(["0", "2272"]);
  });

  it("keeps a missing election unresolved and applies an explicit decline", () => {
    const unresolved = calculateDraftSchedule3A({ ...source, taxpayerEligibility: "yes", benefitElection: undefined });
    expect(unresolved.status).toBe("needs-election");
    expect(unresolved.form1040Line32b).toBeUndefined();
    expect(unresolved.form1040Line32c).toBeUndefined();
    const declined = calculateDraftSchedule3A({ ...source, taxpayerEligibility: "yes", benefitElection: "decline" });
    expect(declined.status).toBe("declined");
    expect(declined.form1040Line32b?.toFixed()).toBe("821");
    expect(declined.form1040Line32c?.toFixed()).toBe("1451");
    expect(declined.lines.find(row => row.line === "8")).toBeUndefined();
  });

  it("requires an explicit qualification answer and accepts either qualified spouse on a joint return", () => {
    const joint = { ...source, returnForm: "1040-SR", filingStatus: "married_filing_jointly" } as const;
    expect(calculateDraftSchedule3A({ ...joint, taxpayerEligibility: "unknown" }).status).toBe("needs-eligibility");
    expect(calculateDraftSchedule3A({ ...joint, taxpayerEligibility: "no", spouseEligibility: "unknown" }).form1040Line32b)
      .toBeUndefined();
    const spouseOnly = calculateDraftSchedule3A({ ...joint, taxpayerEligibility: "unknown", spouseEligibility: "yes" });
    expect(spouseOnly.status).toBe("eligible");
    expect(spouseOnly.form1040Line32b?.toFixed()).toBe("0");
    expect(spouseOnly.form1040Line32c?.toFixed()).toBe("2272");
    expect(calculateDraftSchedule3A({ ...joint, taxpayerEligibility: "yes", spouseEligibility: "no" }).status).toBe("eligible");
    expect(calculateDraftSchedule3A({ ...joint, spouseEligibility: "no" }).status).toBe("ineligible");
    expect(calculateDraftSchedule3A({ ...source, taxpayerEligibility: undefined }).status).toBe("needs-eligibility");
  });

  it("rejects incompatible sources and keeps eligibility answers out of the audit", () => {
    for (const change of [
      { taxYear: 2025 }, { returnForm: "1040-NR" }, { returnForm: "1040-SS" },
      { filingStatus: "joint" }, { spouseEligibility: "yes" }, { taxpayerEligibility: "work-authorized" },
      { benefitElection: false }, { schedule3Payments: "" }, { earnedIncomeCredit: "-0.01" },
      { schedule2Line20: "1451.01" }, { refundableAdoptionCredit: "0.001" },
      { additionalChildTaxCredit: new Decimal(Infinity) }, { totalTaxBeforeForm1062: undefined },
      { totalTaxBeforeForm1062: new Decimal("1e100000000") }, { totalTaxBeforeForm1062: "1000000000000" },
    ]) expect(() => calculateDraftSchedule3A({ ...source, ...change } as DraftSchedule3AInput)).toThrow(/Schedule 3-A/u);
    const result = calculateDraftSchedule3A(source);
    expect(result.lines.every(row => row.form === "Schedule 3-A (draft)" && Object.keys(row.inputs).length === 0)).toBe(true);
    expect(JSON.stringify(result.lines)).not.toMatch(/citizen|immigration|authorized|ineligible|taxpayerEligibility|spouseEligibility/u);
  });
});
