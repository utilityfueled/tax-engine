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

describe("2026 Form 4972 own-plan annuity adjustment", () => {
  const annuity = {
    ...source, grossDistribution: "25000", taxableAmount: "20000", capitalGain: "5000",
    actuarialValue: "5000", lumpSumAnnuityValueConfirmed: true,
  };
  const worksheetValues = (input: Form4972Input, lines: string[]) => {
    const result = calculateForm4972(input);
    return lines.map(line => result.lines.find(row => row.line === line)?.value.toFixed());
  };

  it("apportions the allowance to a confirmed annuity contract", () => {
    expect(worksheetValues(annuity, ["11", "12", "16", "20", "21", "22", "25", "28", "29", "30"]))
      .toEqual(["5000", "20000", "10000", "0.25", "2500", "2500", "1100", "275", "825", "1825"]);
  });

  it("uses zero allowance at the adjusted total threshold", () => {
    const input = { ...annuity, grossDistribution: "65000", taxableAmount: "65000", capitalGain: "0", election: "ten_year" as const };
    expect(worksheetValues(input, ["12", "16", "17", "21", "22", "25", "28", "29", "30"]))
      .toEqual(["70000", undefined, "70000", "0", "5000", "9505", "550", "8955", "8955"]);
  });

  it("retains precision for a recurring actuarial ratio", () => {
    const result = calculateForm4972({ ...annuity, actuarialValue: "3000" });
    expect(result.lines.find(row => row.line === "20")?.value.toFixed(6)).toBe("0.166667");
    expect(result.lines.find(row => row.line === "21")?.value.toFixed(6)).toBe("1500.000000");
    expect(result.line29?.toFixed(6)).toBe("825.000000");
  });

  it("keeps actuarial value out of the Part II pension transfer", () => {
    const result = calculateForm4972({ ...annuity, election: "capital_gain" });
    expect(result.separateTax.toFixed()).toBe("1000");
    expect(result.ordinaryPensionTransfer.toFixed()).toBe("15000");
    expect(result.lines.map(line => line.line)).toEqual(["6", "7"]);
  });

  it("requires an actual qualified lump-sum annuity value in Box 8a", () => {
    for (const input of [
      { ...annuity, lumpSumAnnuityValueConfirmed: undefined },
      { ...annuity, lumpSumAnnuityValueConfirmed: false },
      { ...annuity, actuarialValue: "" },
      { ...annuity, actuarialValue: "-0.01" },
      { ...beneficiary, actuarialValue: "1", lumpSumAnnuityValueConfirmed: true },
    ]) expect(() => calculateForm4972(input)).toThrow(/Box 8a/u);
  });
});

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
      { federalEstateTax: "" }, { federalEstateTax: undefined },
      { entireBalanceConfirmed: undefined }, { rolloverOccurred: true }, { otherDisqualifications: true },
      { onlyDistributionAndRecipientConfirmed: false }, { taxableAmountNotDetermined: true },
      { capitalGain: "90000.01" }, { netUnrealizedAppreciation: "0.01" }, { actuarialValue: "0.01" },
    ]) expect(() => calculateForm4972({ ...beneficiary, ...change } as Form4972Input)).toThrow(/Form 4972/u);
    expect(() => calculateForm4972({ ...beneficiary, election: "capital_gain", federalEstateTax: "0.01" }))
      .toThrow(/Form 4972.*estate tax/u);
  });

  it("subtracts the confirmed estate tax for a beneficiary electing only Part III", () => {
    const input = { ...beneficiary, election: "ten_year" as const, taxableAmount: "20000", capitalGain: "5000",
      federalEstateTax: "2000" };
    const result = calculateForm4972(input);
    expect(result.lines.filter(row => ["8", "17", "18", "19", "23", "24", "30"].includes(row.line))
      .map(row => row.value.toFixed())).toEqual(["20000", "10000", "2000", "8000", "800", "88", "880"]);
    expect(result.ordinaryPensionTransfer.isZero()).toBe(true);
    const fullyOffset = calculateForm4972({ ...input, federalEstateTax: "10000" });
    expect(fullyOffset.separateTax.isZero()).toBe(true);
    expect(fullyOffset.line6).toBeUndefined();
    expect(calculateForm4972({ ...input, federalEstateTax: "2000.25" }).separateTax.toFixed(4)).toBe("879.9725");
  });

  it("allocates estate tax across both elected parts without increasing ordinary income", () => {
    const result = calculateForm4972({ ...beneficiary, taxableAmount: "20000", capitalGain: "5000", federalEstateTax: "2000" });
    expect(result.deathBenefitWorksheet?.map(row => [row.line, row.value.toFixed()]))
      .toEqual([["A", "5000"], ["B", "20000"], ["C", "0.25"]]);
    expect(result.lines.filter(row => ["6", "7", "8", "17", "18", "19", "30"].includes(row.line))
      .map(row => row.value.toFixed())).toEqual(["4500", "900", "15000", "7500", "1500", "6000", "1560"]);
    expect(result.ordinaryPensionTransfer.toFixed()).toBe("0");
  });

  it("retains cents when the estate allocation ratio recurs", () => {
    const result = calculateForm4972({ ...beneficiary, federalEstateTax: "2000" });
    expect(result.lines.filter(row => ["6", "7", "8", "18", "29", "30"].includes(row.line))
      .map(row => row.value.toFixed(4))).toEqual(["19555.5556", "3911.1111", "70000.0000", "1555.5556", "9256.1111", "13167.2222"]);
  });

  it("holds Part II alone with positive estate tax and a deduction exceeding either base", () => {
    expect(() => calculateForm4972({ ...beneficiary, election: "capital_gain", federalEstateTax: "0.01" }))
      .toThrow(/estate tax.*Part II/u);
    expect(() => calculateForm4972({ ...beneficiary, taxableAmount: "20000", capitalGain: "5000", federalEstateTax: "20000.01" }))
      .toThrow(/estate tax.*Box 3/u);
    expect(() => calculateForm4972({ ...beneficiary, taxableAmount: "20000", capitalGain: "5000", federalEstateTax: "10000.01" }))
      .toThrow(/estate tax.*line 17/u);
    expect(() => calculateForm4972({ ...beneficiary, election: "ten_year", taxableAmount: "20000", capitalGain: "0",
      federalEstateTax: "10000.01" })).toThrow(/estate tax.*line 17/u);
  });
});

describe("2026 Form 4972 own-plan net unrealized appreciation", () => {
  const appreciation = { ...source, netUnrealizedAppreciation: "9000", nuaTreatment: "include" as const };

  it("allocates included appreciation across Part II and ordinary income", () => {
    const combined = calculateForm4972(appreciation);
    expect(combined.nuaWorksheet?.map(row => [row.line, row.value.toFixed(2)])).toEqual([
      ["A", "20000.00"], ["B", "90000.00"], ["C", "0.22"], ["D", "9000.00"],
      ["E", "2000.00"], ["F", "7000.00"], ["G", "22000.00"],
    ]);
    expect(combined.line6?.toFixed(2)).toBe("22000.00");
    expect(combined.line8?.toFixed(2)).toBe("77000.00");
    expect(combined.separateTax.toFixed(2)).toBe("15025.00");
    expect(combined.ordinaryPensionTransfer.isZero()).toBe(true);
    expect(combined.deferredNua.isZero()).toBe(true);

    const capitalOnly = calculateForm4972({ ...appreciation, election: "capital_gain" });
    expect(capitalOnly.separateTax.toFixed(2)).toBe("4400.00");
    expect(capitalOnly.ordinaryPensionTransfer.toFixed(2)).toBe("77000.00");
    expect(capitalOnly.lines.map(row => row.line)).toEqual(["6", "7"]);
  });

  it("uses the elected appreciation treatment for Part III only", () => {
    const tenYear = { ...appreciation, election: "ten_year" as const, grossDistribution: "10000", taxableAmount: "8000",
      capitalGain: "0", netUnrealizedAppreciation: "2000" };
    const included = calculateForm4972(tenYear);
    expect(included.line8?.toFixed()).toBe("10000");
    expect(included.separateTax.toFixed()).toBe("550");
    expect(included.nuaWorksheet).toBeUndefined();
    const deferred = calculateForm4972({ ...tenYear, nuaTreatment: "defer" });
    expect(deferred.line8?.toFixed()).toBe("8000");
    expect(deferred.separateTax.toFixed()).toBe("440");
    expect(deferred.deferredNua.toFixed()).toBe("2000");
    const deferredCapital = calculateForm4972({ ...appreciation, election: "capital_gain", nuaTreatment: "defer" });
    expect(deferredCapital.ordinaryPensionTransfer.toFixed()).toBe("70000");
    expect(deferredCapital.nuaWorksheet).toBeUndefined();
  });

  it("holds conflicting or missing Box 6 treatment", () => {
    expect(() => calculateForm4972({ ...appreciation, nuaTreatment: undefined })).toThrow(/choose.*Box 6/u);
    expect(() => calculateForm4972({ ...appreciation, netUnrealizedAppreciation: "10000.01" })).toThrow(/reconciled.*Box/u);
    expect(() => calculateForm4972({ ...beneficiary, netUnrealizedAppreciation: "1" })).toThrow(/beneficiary.*zero Box 6/u);
    expect(() => calculateForm4972({ ...appreciation, taxableAmount: "0", capitalGain: "0" })).toThrow(/positive Box 3/u);
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
