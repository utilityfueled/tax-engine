import { describe, expect, it } from "vitest";
import { calculateForm4972, type Form4972Input } from "@/engine/forms/form-4972";

const source = {
  taxYear: 2026, distributionCode: "7A", participantBirthDate: "1936-01-01",
  election: "both" as const,
  ownQualifiedPlan: true, fiveParticipationYearsConfirmed: true, entireBalanceConfirmed: true,
  rolloverOccurred: false, priorDisqualifyingElection: false, otherDisqualifications: false,
  onlyDistributionAndRecipientConfirmed: true, taxableAmountNotDetermined: false,
  grossDistribution: "100000", taxableAmount: "90000", capitalGain: "20000",
  netUnrealizedAppreciation: "0", actuarialValue: "0",
};

const beneficiary = {
  taxYear: 2026, distributionCode: "4A", participantBirthDate: "1936-01-01",
  sourceKind: "death_beneficiary", participantDeathDate: "1996-08-21", distributionDate: "2026-12-31",
  qualifiedPlanConfirmed: true, receivedBecauseOfDeath: true, priorBeneficiaryElectionForParticipant: false, federalEstateTax: "0.00",
  entireBalanceConfirmed: true, rolloverOccurred: false, otherDisqualifications: false,
  onlyDistributionAndRecipientConfirmed: true, taxableAmountNotDetermined: false,
  election: "both", grossDistribution: "100000", taxableAmount: "90000", capitalGain: "20000",
  netUnrealizedAppreciation: "0", actuarialValue: "0",
} satisfies Form4972Input;

describe("2026 Form 4972 death-beneficiary worksheet", () => {
  it("computes a beneficiary election on the first day without a death exclusion", () => {
    const result = calculateForm4972(beneficiary);
    expect(result.line7?.toFixed()).toBe("4000");
    expect(result.line29?.toFixed()).toBe("9505");
    expect(result.separateTax.toFixed()).toBe("13505");
    expect(result.lines.filter(row => ["9", "18"].includes(row.line)).map(row => row.value.toFixed()))
      .toEqual(["0", "0"]);
    const partII = calculateForm4972({ ...beneficiary, distributionCode: "A4", election: "capital_gain" });
    expect(partII.separateTax.toFixed()).toBe("4000");
    expect(partII.ordinaryPensionTransfer.toFixed()).toBe("70000");
    expect(partII.lines.map(row => row.line)).toEqual(["6", "7"]);
  });

  it("holds a beneficiary election with incomplete or conflicting originals", () => {
    for (const change of [
      { distributionCode: "7A" }, { participantBirthDate: "1936-01-02" }, { participantDeathDate: "1996-08-20" },
      { participantDeathDate: "2006-02-29" }, { participantDeathDate: "2027-01-01" }, { participantDeathDate: undefined },
      { distributionDate: "2025-12-31" }, { distributionDate: "2026-02-30" }, { distributionDate: undefined },
      { qualifiedPlanConfirmed: undefined }, { receivedBecauseOfDeath: undefined }, { receivedBecauseOfDeath: false },
      { priorBeneficiaryElectionForParticipant: undefined }, { priorBeneficiaryElectionForParticipant: true },
      { federalEstateTax: "0.01" }, { federalEstateTax: "" }, { federalEstateTax: undefined },
      { entireBalanceConfirmed: undefined }, { rolloverOccurred: true }, { otherDisqualifications: true },
      { onlyDistributionAndRecipientConfirmed: false }, { taxableAmountNotDetermined: true },
      { capitalGain: "90000.01" }, { netUnrealizedAppreciation: "0.01" }, { actuarialValue: "0.01" },
    ]) expect(() => calculateForm4972({ ...beneficiary, ...change } as Form4972Input)).toThrow(/Form 4972/u);
    expect(() => calculateForm4972({ ...beneficiary, election: "capital_gain", federalEstateTax: "0.01" }))
      .toThrow(/Form 4972.*estate tax/u);
  });
});

describe("2026 Form 4972 own-plan worksheet", () => {
  it("requires actual eligibility and determined source amounts", () => {
    for (const incomplete of [
      { taxYear: 2025 }, { distributionCode: "4A" }, { distributionCode: "A" },
      { participantBirthDate: "1936-01-02" }, { participantBirthDate: "1935-02-29" },
      { ownQualifiedPlan: undefined }, { fiveParticipationYearsConfirmed: false }, { entireBalanceConfirmed: false },
      { rolloverOccurred: true }, { priorDisqualifyingElection: undefined }, { otherDisqualifications: true },
      { onlyDistributionAndRecipientConfirmed: false }, { taxableAmountNotDetermined: true },
      { capitalGain: "90000.01" }, { capitalGain: "0" }, { taxableAmount: "100000.01" },
      { netUnrealizedAppreciation: "0.01" }, { actuarialValue: "0.01" },
      { taxableAmount: "-0.01" }, { actuarialValue: "" }, { taxableAmount: "NaN" },
    ]) expect(() => calculateForm4972({ ...source, ...incomplete } as typeof source)).toThrow(/Form 4972/);
  });

  it("computes the separate Part II charge and ordinary pension remainder", () => {
    const result = calculateForm4972({ ...source, distributionCode: "A7", election: "capital_gain" });
    expect(result.line6?.toFixed()).toBe("20000");
    expect(result.line7?.toFixed()).toBe("4000");
    expect(result.line30).toBeUndefined();
    expect(result.separateTax.toFixed()).toBe("4000");
    expect(result.ordinaryPensionTransfer.toFixed()).toBe("70000");
    expect(result.lines.some(line => line.line === "8")).toBe(false);
  });

  it("splits the combined election and computes the separate ten-year tax", () => {
    const result = calculateForm4972(source);
    expect(result.line8?.toFixed()).toBe("70000");
    expect(result.line17?.toFixed()).toBe("70000");
    expect(result.line24?.toFixed()).toBe("950.5");
    expect(result.line29?.toFixed()).toBe("9505");
    expect(result.line30?.toFixed()).toBe("13505");
    expect(result.separateTax.toFixed()).toBe("13505");
    expect(result.ordinaryPensionTransfer.toFixed()).toBe("0");
    expect(result.lines.map(line => line.line)).toEqual(["6", "7", "8", "9", "10", "11", "12", "17", "18", "19", "23", "24", "25", "29", "30"]);
  });

  it.each([
    ["0", "0", "0"], ["19999.99", "9999.995", "1099.99945"], ["20000", "10000", "1100"],
    ["20000.01", "9999.998", "1100.00132"], ["69999.99", "0.002", "9504.99808"],
    ["70000", undefined, "9505"], ["70000.01", undefined, "9505.0016"],
  ])("applies the allowance boundaries before the tax rate for %s", (amount, allowance, expected) => {
    const result = calculateForm4972({ ...source, election: "ten_year", taxableAmount: amount, capitalGain: "0" });
    expect(result.line16?.toFixed()).toBe(allowance);
    expect(result.separateTax.toFixed()).toBe(expected);
  });

  it.each([
    ["21583.32", "1308.99824"], ["21583.34", "1309.00096"], ["30583.32", "2604.99808"], ["30583.34", "2605.00112"],
    ["49416.66", "5768.99888"], ["49416.68", "5769.0024"], ["67416.66", "9008.9988"], ["67416.68", "9009.00256"],
    ["91699.99", "12976.9984"], ["91700.01", "12977.0018"], ["114399.99", "17062.9982"], ["114400.01", "17063.002"],
    ["137099.99", "21602.998"], ["137100.01", "21603.0023"], ["171599.99", "29537.9977"], ["171600.01", "29538.0026"],
    ["228799.99", "44409.9974"], ["228800.01", "44410.003"], ["285999.99", "61569.997"], ["286000.01", "61570.0034"],
    ["343199.99", "81017.9966"], ["343200.01", "81018.0038"], ["422999.99", "111341.9962"], ["423000.01", "111342.0042"],
    ["571899.99", "173879.9958"], ["571900.01", "173880.0048"], ["857899.99", "311159.9952"], ["857900.01", "311160.005"],
  ])("uses the printed rate table across every band boundary for %s", (amount, expected) => {
    const result = calculateForm4972({ ...source, election: "ten_year", grossDistribution: amount, taxableAmount: amount, capitalGain: "0" });
    expect(result.separateTax.toFixed()).toBe(expected);
  });
});
