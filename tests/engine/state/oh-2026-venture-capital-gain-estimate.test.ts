// Spec: spec/state/oh-2026-venture-capital-gain-estimate.yaml.
import { describe, expect, it } from "vitest";
import { estimateOhio2026VentureCapitalGain } from "@/engine/state/oh-2026-venture-capital-gain-estimate.js";

type Source = Parameters<typeof estimateOhio2026VentureCapitalGain>[0];

const certified = {
  taxYear: 2026,
  calendarYearConfirmed: true,
  asOfDate: "2027-03-01",
  certificate: {
    taxYear: 2026,
    authority: "ohio-director-of-development-122.851(D)(2)",
    ownerReference: "owner-private-test-reference",
    holdingReference: "original-private-holding-reference",
    certificateReference: "private-certificate-001",
    issuedDate: "2027-02-16",
    certifiedFrom: "2025-03-01",
    certifiedThrough: "2026-12-31",
    statusConfirmedCurrent: true,
    noRevocationOrRecaptureConfirmed: true,
    factsConfirmed: true,
    investeeClassificationConfirmed: true,
    underlyingInvestmentDate: "2025-04-10",
    disposalDate: "2026-10-14",
    investorGain: "1000.01",
    investorOhioGain: "1000.01",
  },
  recognition: {
    taxYear: 2026,
    ownerReference: "owner-private-test-reference",
    holdingReference: "original-private-holding-reference",
    certificateReference: "private-certificate-001",
    sourceReference: "independent-original-gain-confirmation",
    factsConfirmed: true,
    acquiredDate: "2025-03-01",
    recognitionDate: "2026-10-14",
    directCashInterestConfirmed: true,
    oneUnderlyingInvestmentDisposalConfirmed: true,
    capitalGainReceivedConfirmed: true,
    nonbusinessIncomeConfirmed: true,
    fullyIncludedFederalAgiConfirmed: true,
    noOtherExclusionOrDeductionConfirmed: true,
    noCapitalLossNettingOrCarryoverConfirmed: true,
    recognizedFederalGain: "1000.01",
  },
} satisfies Source;

describe("2026 Ohio venture capital gain deduction estimate", () => {
  it("calculates the statutory rate on certified Ohio and other gains without rounding", () => {
    const ohio = estimateOhio2026VentureCapitalGain(certified);
    expect(ohio.deduction.toFixed()).toBe("1000.01");
    const nonOhio = estimateOhio2026VentureCapitalGain({
      ...certified, certificate: { ...certified.certificate, investorOhioGain: "0" },
    });
    expect(nonOhio.deduction.toFixed()).toBe("500.005");
    expect(nonOhio.lines.map(({ line, value }) => [line, value.toFixed()])).toEqual([["A35", "500.005"]]);
    expect(nonOhio.lines[0]?.inputs["Certified other gain"]?.toString()).toBe("1000.01");
    for (const privateReference of [certified.certificate.ownerReference, certified.certificate.holdingReference,
      certified.certificate.certificateReference, certified.recognition.sourceReference]) {
      expect(JSON.stringify(nonOhio)).not.toContain(privateReference);
    }
  });

  it("requires an issued same-owner certification and valid acquisition and disposal dates", () => {
    const certificate = certified.certificate;
    const recognition = certified.recognition;
    for (const invalid of [
      { taxYear: 2025 }, { calendarYearConfirmed: false }, { asOfDate: "2027-02-15" }, { asOfDate: "2027-02-29" },
      { certificate: undefined }, { recognition: undefined },
      { certificate: { ...certificate, taxYear: 2025 } },
      { certificate: { ...certificate, authority: "ohio-venture-capital-authority-150.07" } },
      { certificate: { ...certificate, issuedDate: "2026-12-31" } },
      { certificate: { ...certificate, issuedDate: "2027-02-16\n" } },
      { certificate: { ...certificate, factsConfirmed: undefined } },
      { certificate: { ...certificate, statusConfirmedCurrent: false } },
      { certificate: { ...certificate, noRevocationOrRecaptureConfirmed: false } },
      { certificate: { ...certificate, certifiedFrom: "2025-03-02" } },
      { certificate: { ...certificate, certifiedThrough: "2026-10-13" } },
      { certificate: { ...certificate, certifiedThrough: undefined } },
      { certificate: { ...certificate, underlyingInvestmentDate: "2025-02-28" } },
      { certificate: { ...certificate, underlyingInvestmentDate: "2026-10-15" } },
      { certificate: { ...certificate, disposalDate: "2025-10-14" } },
      { certificate: { ...certificate, disposalDate: "2026-02-29" } },
      { recognition: { ...recognition, taxYear: 2025 } },
      { recognition: { ...recognition, ownerReference: "another-owner" } },
      { recognition: { ...recognition, holdingReference: "another-holding" } },
      { recognition: { ...recognition, certificateReference: "another-certificate" } },
      { recognition: { ...recognition, sourceReference: " " } },
      { recognition: { ...recognition, acquiredDate: "2026-10-15" } },
      { recognition: { ...recognition, acquiredDate: "2025-02-28" } },
      { recognition: { ...recognition, recognitionDate: "2026-10-15" } },
    ]) {
      expect(() => estimateOhio2026VentureCapitalGain({ ...certified, ...invalid } as unknown as Source))
        .toThrow(/Ohio venture capital/iu);
    }
    expect(estimateOhio2026VentureCapitalGain({
      ...certified, asOfDate: certificate.issuedDate, certificate: { ...certificate, certifiedThrough: certificate.disposalDate },
    }).deduction.toFixed()).toBe("1000.01");
  });

  it("rejects unknown or conflicting source eligibility and exact capital-gain facts", () => {
    for (const flag of [
      "factsConfirmed", "directCashInterestConfirmed", "oneUnderlyingInvestmentDisposalConfirmed",
      "capitalGainReceivedConfirmed", "nonbusinessIncomeConfirmed", "fullyIncludedFederalAgiConfirmed",
      "noOtherExclusionOrDeductionConfirmed", "noCapitalLossNettingOrCarryoverConfirmed",
    ] as const) {
      expect(() => estimateOhio2026VentureCapitalGain({
        ...certified, recognition: { ...certified.recognition, [flag]: false },
      })).toThrow(/Ohio venture capital/iu);
    }
    for (const invalid of [
      { certificate: { ...certified.certificate, investeeClassificationConfirmed: false } },
      { certificate: { ...certified.certificate, investorOhioGain: undefined } },
      { certificate: { ...certified.certificate, investorOhioGain: "0.01" } },
      { certificate: { ...certified.certificate, investorOhioGain: "1000.02" } },
      { certificate: { ...certified.certificate, investorGain: "1e3" } },
      { certificate: { ...certified.certificate, investorGain: "1000.010" } },
      { recognition: { ...certified.recognition, recognizedFederalGain: "1000" } },
      { recognition: { ...certified.recognition, recognizedFederalGain: 1000.01 } },
      { certificate: { ...certified.certificate, investorGain: "0", investorOhioGain: "0" },
        recognition: { ...certified.recognition, recognizedFederalGain: "0" } },
    ]) {
      expect(() => estimateOhio2026VentureCapitalGain({ ...certified, ...invalid } as unknown as Source))
        .toThrow(/Ohio venture capital/iu);
    }
  });
});
