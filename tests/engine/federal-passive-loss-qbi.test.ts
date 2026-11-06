// Spec: spec/federal/passive-loss-qbi.yaml return.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

function source(vintages = [{ taxYear: 2024, originalLoss: "3000", qualifiedOriginalLoss: "3000",
  remainingLoss: "3000", qualifiedRemainingLoss: "3000" }]) {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "120000", socialSecurityWages: "120000", medicareWages: "120000" }],
    rentalProperties: [{ description: "Actual rental", rents: "10000", propertyType: "single_family",
      rentalDays: 365, personalUseDays: 0, isActiveParticipant: true, qualifiesForQBI: true }],
    priorYear: { suspendedPassiveLosses: [{ partnershipName: "Actual rental", amount: "3000", qbiLossTracking: {
      sourceTaxYear: 2024, sourceReference: "Actual filed QBI loss tracking worksheet", sourceFactsConfirmed: true, vintages,
    } }] },
  });
}

it("uses actual released prior qualified loss separately from positive current rental QBI", () => {
  const result = calculateFederalTax(source());
  expect(result.agi.toFixed()).toBe("127000");
  expect(result.form8995?.totalQBI.toFixed()).toBe("7000");
  expect(result.form8995?.qbiDeduction.toFixed()).toBe("1400");
  expect(result.allLines.find(row => row.form === "1040" && row.line === "13-QBI-rental")?.value.toFixed()).toBe("10000");
  const pre2018 = calculateFederalTax(source([{ taxYear: 2017, originalLoss: "3000", qualifiedOriginalLoss: "0",
    remainingLoss: "3000", qualifiedRemainingLoss: "0" }]));
  expect(pre2018.form8995?.totalQBI.toFixed()).toBe("10000");
  expect(pre2018.form8995?.qbiDeduction.toFixed()).toBe("2000");
  const unknown = source();
  delete unknown.priorYear?.suspendedPassiveLosses[0].qbiLossTracking;
  expect(() => calculateFederalTax(unknown)).toThrow(/QBI.*tracking|tracking.*QBI/i);
  const detailed = source(); detailed.w2s[0].wages = "300000"; detailed.w2s[0].federalWithheld = "80000";
  detailed.rentalProperties[0].qbiUBIA = "200000";
  expect(calculateFederalTax(detailed).form8995A?.qbiDeduction.toFixed()).toBe("1400");
  detailed.w2s[0].wages = "231050"; // +7000 rental minus15750 standard =222300 TI,50% SSTB.
  detailed.rentalProperties[0].qbiIsSST = true;
  expect(calculateFederalTax(detailed).form8995A?.qbiDeduction.toFixed()).toBe("400");
  const oldCarry = source();
  if (!oldCarry.priorYear) throw new Error("Test requires actual prior-year source");
  oldCarry.priorYear.qbiLossCarryforward = "2000";
  expect(calculateFederalTax(oldCarry).form8995?.totalQBI.toFixed()).toBe("5000");
  const notCurrentQualified = source(); notCurrentQualified.rentalProperties[0].qualifiesForQBI = false;
  expect(calculateFederalTax(notCurrentQualified).carryforwards.qbiLossCarryforward.toFixed()).toBe("3000");
});

it("retains current loss and originating SSTB character in the next-year history", () => {
  const input = source();
  input.rentalProperties[0].rents = "0"; input.rentalProperties[0].otherExpenses = "20000";
  const result = calculateFederalTax(input);
  expect(result.form8582?.allowedLoss.toFixed()).toBe("15000");
  expect(result.form8995?.totalQBI.toFixed()).toBe("-15000");
  expect(result.carryforwards.suspendedPassiveLosses[0].qbiVintages?.map(row => [row.taxYear, row.originalLoss.toFixed(),
    row.remainingLoss.toFixed(), row.qualifiedRemainingLoss.toFixed()])).toEqual([[2025, "8000", "8000", "8000"]]);
  const high = source([]);
  if (!high.priorYear) throw new Error("Test requires actual prior-year source");
  high.priorYear.suspendedPassiveLosses = [];
  high.w2s[0].wages = "300000"; high.w2s[0].federalWithheld = "80000";
  high.rentalProperties[0].rents = "0"; high.rentalProperties[0].otherExpenses = "10000";
  high.rentalProperties[0].qbiIsSST = true;
  const sst = calculateFederalTax(high);
  expect(sst.carryforwards.suspendedPassiveLosses[0].qbiVintages?.[0].originalLoss.toFixed()).toBe("10000");
  expect(sst.carryforwards.suspendedPassiveLosses[0].qbiVintages?.[0].qualifiedOriginalLoss.toFixed()).toBe("0");
  expect(sst.carryforwards.suspendedPassiveLosses[0].qbiVintages?.[0].qualifiedRemainingLoss.toFixed()).toBe("0");
  high.w2s[0].wages = "238050"; // TI222300: halfway through197300-247300.
  const partial = calculateFederalTax(high);
  expect(partial.carryforwards.suspendedPassiveLosses[0].qbiVintages?.[0].qualifiedOriginalLoss.toFixed()).toBe("5000");
  expect(partial.carryforwards.suspendedPassiveLosses[0].qbiVintages?.[0].qualifiedRemainingLoss.toFixed()).toBe("5000");
});

it("opens a partially qualified SSTB vintage from only the newly suspended loss", () => {
  // Published columnA opens with only the current loss actually suspended.
  // TI227300 gives40%; loss6 minus2 allowed leaves4, of which round(4*.4)=2.
  const high = source([]);
  if (!high.priorYear) throw new Error("Test requires actual prior-year source");
  high.priorYear.suspendedPassiveLosses = [];
  high.w2s[0].wages = "243050"; high.w2s[0].federalWithheld = "80000";
  high.rentalProperties[0].rents = "0";
  high.rentalProperties[0].qbiIsSST = true;
  high.rentalProperties[0].otherExpenses = "6";
  high.rentalProperties.push({ ...high.rentalProperties[0], description: "Actual offset rental",
    rents: "2", otherExpenses: "0", qualifiesForQBI: false, qbiIsSST: false });
  const partlyAllowed = calculateFederalTax(high);
  expect(partlyAllowed.form8582?.allowedLoss.toFixed()).toBe("2");
  expect(partlyAllowed.carryforwards.suspendedPassiveLosses[0].qbiVintages?.map(row => [
    row.originalLoss.toFixed(), row.qualifiedOriginalLoss.toFixed(), row.remainingLoss.toFixed(), row.qualifiedRemainingLoss.toFixed(),
  ])).toEqual([["4", "2", "4", "2"]]);
});

it("preserves unknown active prior loss when the2026 minimum can change", () => {
  const input = source(); input.taxpayer.taxYear = 2026;
  input.w2s[0].socialSecurityTips = "0";
  input.w2s[0].federalWithheld = "30000"; // Actual synthetic sufficient withholding; no penalty facts required.
  input.rentalProperties[0].rents = "4000";
  input.rentalProperties[0].qbiMateriallyParticipated = true;
  const tracking = input.priorYear?.suspendedPassiveLosses[0].qbiLossTracking;
  if (!tracking) throw new Error("Test requires actual QBI loss tracking source");
  tracking.sourceTaxYear = 2025;
  expect(() => calculateFederalTax(input)).toThrow(/active.*unknown/i);
  tracking.vintages[0].materiallyParticipatedInCurrentYear = true;
  expect(calculateFederalTax(input).form8995?.qbiDeduction.toFixed()).toBe("400");
  tracking.vintages[0].materiallyParticipatedInCurrentYear = false;
  expect(calculateFederalTax(input).form8995?.qbiDeduction.toFixed()).toBe("400");
  input.rentalProperties[0].rents = "3500";
  tracking.vintages[0].materiallyParticipatedInCurrentYear = true;
  expect(calculateFederalTax(input).form8995?.qbiDeduction.toFixed()).toBe("100");
  tracking.vintages[0].materiallyParticipatedInCurrentYear = false;
  expect(calculateFederalTax(input).form8995?.qbiDeduction.toFixed()).toBe("400");
});
