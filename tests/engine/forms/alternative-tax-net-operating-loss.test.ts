// Spec: spec/federal/alternative-tax-net-operating-loss.yaml.
import { expect, it } from "vitest";
import { calculateAlternativeTaxNol } from "@/engine/forms/alternative-tax-net-operating-loss.js";
import { calculateNetOperatingLoss } from "@/engine/forms/net-operating-loss.js";
import { d } from "@/utils/decimal.js";

function sources(years = [2021], amount = "100000") {
  return calculateNetOperatingLoss({ taxYear: 2025, filingStatus: "single",
    taxpayer: { primary: { firstName: "Jane", lastName: "Doe", ssn: "123456789" } },
    facts: { sourceTaxYear: 2025, sourceReference: "AMT carry worksheet", sourceFactsConfirmed: true,
      allCarryoversIncluded: true, calendarYearTaxpayer: true, returnMembership: "continuous_individual",
      membershipUnchangedConfirmed: true, primaryName: "Jane Doe", primaryTaxpayerIdLast4: "6789",
      vintages: years.map(year => ({ sourceId: `amt-${year}`, lossTaxYear: year, sourceReference: "Originating AMT worksheet",
        originKind: "individual_nol", originalLoss: amount, openingCarryforward: amount,
        carrybackTreatment: year <= 2020 ? "waived" : "not_required", carrybackSourceReference: year <= 2020 ? "Filed election" : undefined,
        adjustedThroughTaxYear: 2024, historySourceReference: "Prior carry worksheet", allHistoryIncluded: true,
        farmingLossIncluded: false, history: [] })) } });
}
it("uses separate actual and modified AMTI limits", () => {
  const result = calculateAlternativeTaxNol({ taxYear: 2025, sources: sources(), amtiBeforeAtnol: d("97000"), modifiedAmtiBeforeAtnol: d("100000") });
  expect(result.deduction.toFixed()).toBe("87300");
  expect(result.absorbed.toFixed()).toBe("90000");
  expect(result.carryforward.toFixed()).toBe("10000");
  expect(calculateAlternativeTaxNol({ taxYear: 2025, sources: sources(), amtiBeforeAtnol: d("-100"), modifiedAmtiBeforeAtnol: d("-50") }).deduction.toFixed()).toBe("0");
  expect(() => calculateAlternativeTaxNol({ taxYear: 2025, sources: sources(), amtiBeforeAtnol: d("NaN"), modifiedAmtiBeforeAtnol: d("100") })).toThrow(/finite/i);
});
it("conserves oldest-first source balances and actual expiry", () => {
  const result = calculateAlternativeTaxNol({ taxYear: 2025, sources: sources([2021, 2022]), amtiBeforeAtnol: d("100000"), modifiedAmtiBeforeAtnol: d("103000") });
  expect(result.deduction.toFixed()).toBe("90000");
  expect(result.absorbed.toFixed()).toBe("92700");
  expect(result.vintages.map(row => row.remainingCarryforward.toFixed())).toEqual(["7300", "100000"]);
  const expiry = calculateAlternativeTaxNol({ taxYear: 2025, sources: sources([2005], "100"), amtiBeforeAtnol: d("0"), modifiedAmtiBeforeAtnol: d("0") });
  expect(expiry.expired.toFixed()).toBe("100");
  expect(expiry.carryforward.toFixed()).toBe("0");
  const rounding = calculateAlternativeTaxNol({ taxYear: 2025, sources: sources(), amtiBeforeAtnol: d("100005"), modifiedAmtiBeforeAtnol: d("100005") });
  expect(rounding.deduction.toFixed()).toBe("90005");
  expect(rounding.absorbed.toFixed()).toBe("90005");
});
