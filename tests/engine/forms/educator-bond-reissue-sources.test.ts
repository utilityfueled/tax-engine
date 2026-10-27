/** Spec: spec/federal/educator-bond-reissue-coordination.yaml. */
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateEducatorBondSources } from "@/engine/forms/educator-bond-sources.js";
import { reconcileEducatorEducationExclusions } from "@/engine/forms/educator-education-exclusions.js";
import { displaySavingsBondRatio } from "@/utils/savings-bond-ratios.js";
import { educatorBondReissueInput, educatorSoleSuccessorInput } from "../../fixtures/educator-bond-reissues.js";

it("binds exact successor ownership and original household to the completed form", () => {
  const input = educatorSoleSuccessorInput(), original = JSON.stringify(input), context = calculateEducatorBondSources(input);
  if (!context) throw new Error("Missing calculated actual source context");
  expect(displaySavingsBondRatio(context.ownerInterest.primary)).toBe("0");
  expect(displaySavingsBondRatio(context.ownerInterest.spouse)).toBe("5000 / 3 (exact)");
  expect(() => calculateEducatorBondSources({ adjustments: input.adjustments, form8815: input.form8815, savingsBondRedemptions: input.savingsBondRedemptions })).toThrow(/household|identity/i);
  const result = calculateFederalTax(input);
  if (!result.form8815) throw new Error("Missing calculated Form8815");
  const actual = { taxYear: 2025, filingStatus: input.taxpayer.filingStatus, taxpayer: input.taxpayer,
    educatorSources: input.adjustments?.educatorExpenseSources, form8815: input.form8815,
    savingsBondRedemptions: input.savingsBondRedemptions, savingsBondResult: result.form8815, bondSourceContext: context };
  expect(reconcileEducatorEducationExclusions(actual).ownerExclusions.map(row => row.savingsBondInterestRatio ? displaySavingsBondRatio(row.savingsBondInterestRatio) : "absent"))
    .toEqual(["0", "5000 / 3 (exact)"]);
  for (const mode of ["owner", "ratio", "verified", "year", "context"] as const) {
    const changed = { ...actual, savingsBondResult: { ...result.form8815, redemptionResults: result.form8815.redemptionResults.map(row => ({ ...row })) } };
    const row = changed.savingsBondResult.redemptionResults[0]; if (!row) throw new Error("Missing actual successor");
    if (mode === "owner") row.incomeOwner = "primary";
    if (mode === "ratio") row.currentYearInterestRatio = { numerator: new Decimal("1666.67"), denominator: new Decimal(1) };
    if (mode === "verified") changed.savingsBondResult.reissueSourcesVerified = false;
    if (mode === "year") changed.taxpayer = { ...input.taxpayer, taxYear: 2026 };
    if (mode === "context") changed.bondSourceContext = { ...context, ownerInterest: { ...context.ownerInterest, primary: context.ownerInterest.spouse } };
    expect(() => reconcileEducatorEducationExclusions(changed)).toThrow(/source|owner|interest|reconcile|year/i);
  }
  expect(JSON.stringify(input)).toBe(original);
});

it("keeps complete actual zero separate from missing prior reporting", () => {
  const input = educatorBondReissueInput(), packet = input.form8815?.reissueSources, group = packet?.groups?.[0];
  const statement = packet?.statements?.[0], original = input.form1099Int[0];
  if (!group || !statement || !original) throw new Error("Missing fictional original sources");
  Object.assign(group, { taxpayerPurchaseFunds: "250", spousePurchaseFunds: "250", valueAtReissue: "500" });
  for (const row of input.savingsBondRedemptions ?? []) row.proceeds = "250";
  statement.box3 = "0"; statement.currentTransfers = []; original.usSavingsBondInterest = "0";
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  expect([result.form8815?.totalInterest, result.totalInterest, result.schedule1?.educatorExpenses, result.agi].map(value => value?.toFixed()))
    .toEqual(["0", "0", "600", "79400"]);
  expect(JSON.stringify(input)).toBe(before);
  const successor = group.successors?.[0]; if (!successor) throw new Error("Missing actual successor");
  delete successor.postReissuePriorInterestReported;
  expect(() => calculateFederalTax(input)).toThrow(/actual|prior|source/i);
});
