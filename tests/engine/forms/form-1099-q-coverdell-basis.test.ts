/** Spec: spec/federal/form-1099-q-coverdell-basis.yaml. Independent synthetic input-line arithmetic. */
import { expect, it } from "vitest";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import { ordinaryCoverdellSource as source, ordinaryCoverdellSummary as summary } from "../../fixtures/education-coverdell-source.js";

it("rounds Coverdell worksheet inputs without creating negative basis", () => {
  for (const [basis, expectedBasis, expectedEarnings] of [["100.49", "100", "1"], ["100.50", "101", "0"]]) {
    const result = calculateForm1099Q([source()], summary({ priorYearBasis: basis }));
    expect(result.coverdellAccounts[0]?.distributedBasis.toFixed()).toBe(expectedBasis);
    expect(result.coverdellAccounts[0]?.earnings.toFixed()).toBe(expectedEarnings);
    expect(result.coverdellAccounts[0]?.endingBasis.toFixed()).toBe("0");
    expect(result.grossDistribution.toFixed()).toBe("100.51");
    expect(result.lines.find(line => line.form === "Coverdell source" && line.line === "esa-account:prior-basis")?.value.eq(basis)).toBe(true);
    expect(result.lines.find(line => line.form === "Pub970 WS6-3" && line.line === "esa-account:4")?.value.toFixed()).toBe("101");
  }
});

it("reconciles rounded rollover basis across multiple statements", () => {
  const transfer = { kind: "coverdell", amount: "0.49", receivedDate: "2025-05-02", sameBeneficiary: true, eligibleFamilyMember: false, priorRolloverWithin12Months: false, destinationBeneficiaryAge: 20, destinationSpecialNeeds: false, coverdellTransferredBasis: "0.49" };
  const first = source({ distributionDate: "2025-05-01", grossDistribution: "0.49", isTrusteeToTrustee: true, transfer });
  const second = source({ sourceId: "second", distributionDate: "2025-05-01", grossDistribution: "0.49", isTrusteeToTrustee: true, transfer });
  const result = calculateForm1099Q([first, second], summary({ priorYearBasis: "0.98" }));
  expect(result.totalBasis.toFixed()).toBe("1");
  expect(result.totalEarnings.toFixed()).toBe("0");
  expect(result.perDistribution.map(row => row.basis.toFixed())).toEqual(["1", "0"]);
  expect(result.coverdellAccounts[0]?.endingBasis.toFixed()).toBe("0");
});

it("aggregates source cents before rounding account distributions", () => {
  const result = calculateForm1099Q([source({ grossDistribution: "0.49" }), source({ sourceId: "second", grossDistribution: "0.49" })], summary({ priorYearBasis: "0.98" }));
  expect(result.grossDistribution.toFixed()).toBe("0.98");
  expect(result.totalBasis.toFixed()).toBe("1");
  expect(result.totalEarnings.toFixed()).toBe("0");
  expect(result.coverdellAccounts[0]?.endingBasis.toFixed()).toBe("0");
  expect(result.perDistribution.map(row => row.basis.toFixed())).toEqual(["1", "0"]);
});

it("separates prior basis from actual current rollover adjustments", () => {
  const transfer = { kind: "coverdell", amount: "500", receivedDate: "2025-05-02", sameBeneficiary: true, eligibleFamilyMember: false, priorRolloverWithin12Months: false, destinationBeneficiaryAge: 20, destinationSpecialNeeds: false, coverdellTransferredBasis: "400" };
  const form = source({ distributionDate: "2025-05-01", grossDistribution: "1000", transfer });
  const result = calculateForm1099Q([form], summary({ priorYearBasis: "800" }));
  expect(result.totalBasis.toFixed()).toBe("800"); expect(result.taxableEarnings.toFixed()).toBe("100");
  expect(result.lines.find(line => line.form === "Coverdell rollover worksheet" && line.line === "esa-account:2")?.value.toFixed()).toBe("800");
  expect(result.lines.find(line => line.form === "Coverdell rollover worksheet" && line.line === "esa-account:3")?.value.toFixed()).toBe("400");
  expect(result.lines.some(line => line.form === "Pub970 WS6-3" && line.line === "esa-account:2")).toBe(false);
  const received = calculateForm1099Q([source({ grossDistribution: "100" })], summary({ priorYearBasis: "0", rolloverBasisReceived: "200", yearEndValue: "100" }));
  expect(received.coverdellAccounts[0]?.endingBasis.toFixed()).toBe("100");
  const tinyTransfer = { ...transfer, amount: "0.98", coverdellTransferredBasis: "0.98" };
  expect(() => calculateForm1099Q([source({ distributionDate: "2025-05-01", grossDistribution: "1.98", transfer: tinyTransfer })], summary({ priorYearBasis: "0.49", currentYearContributions: "0.49" }))).toThrow(/round|basis/i);
});
