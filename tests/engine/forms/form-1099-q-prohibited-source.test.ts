/** Spec: spec/federal/form-1099-q-prohibited-source.yaml. Source validation, not a taxable-income oracle. */
import { expect, it } from "vitest";
import { Form1099QSchema } from "@/models/inputs.js";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";
import { ordinaryCoverdellSource as source, ordinaryCoverdellSummary as summary } from "../../fixtures/education-coverdell-source.js";

const facts = {
  distributionCode: "6", grossDistribution: "1000", prohibitedTransactionKind: "account_disqualification",
  prohibitedTransactionDate: "2025-06-01", prohibitedTransactionSourceReference: "custodian-event-record",
  prohibitedTransactionSourceConfirmed: true, prohibitedTransactionJanuary1Value: "1000", prohibitedTransactionBasis: "700",
};

it("preserves actual prohibited-transaction facts and missing-source status", () => {
  const complete = source(facts);
  expect(complete).toMatchObject(facts);
  expect(complete.sourceFactsComplete).toBe(true);
  for (const key of ["prohibitedTransactionKind", "prohibitedTransactionDate", "prohibitedTransactionSourceReference", "prohibitedTransactionSourceConfirmed", "prohibitedTransactionJanuary1Value", "prohibitedTransactionBasis"]) {
    const incomplete = source({ ...facts, [key]: undefined });
    expect(incomplete.sourceFactsComplete).toBe(false);
    expect(Form1099QSchema.parse(incomplete).sourceFactsComplete).toBe(false);
  }
  const pledge = source({ ...facts, prohibitedTransactionKind: "pledged_portion", prohibitedTransactionJanuary1Value: undefined, prohibitedTransactionPledgedAmount: "1000", prohibitedTransactionBasis: "0" });
  expect(pledge.sourceFactsComplete).toBe(true);
  expect(pledge).toMatchObject({ prohibitedTransactionPledgedAmount: "1000", prohibitedTransactionBasis: "0" });
});

it("validates the actual deemed-distribution source before blocking unresolved treatment", () => {
  for (const [changes, error] of [
    [{ prohibitedTransactionJanuary1Value: "999" }, /Box1.*January1/i],
    [{ prohibitedTransactionDate: "2024-06-01" }, /event year/i],
    [{ prohibitedTransactionDate: "2025-02-30" }, /valid.*date/i],
    [{ prohibitedTransactionBasis: "-1" }, /basis.*nonnegative/i],
    [{ prohibitedTransactionSourceConfirmed: false }, /source.*confirm/i],
    [{ prohibitedTransactionSourceReference: "" }, /source reference/i],
    [{ prohibitedTransactionKind: "pledged_portion", prohibitedTransactionJanuary1Value: undefined, prohibitedTransactionPledgedAmount: "999" }, /Box1.*pledged/i],
    [{ accountType: "529" }, /Coverdell/i],
    [{ distributionCode: "1" }, /code6/i],
  ] as const) expect(() => calculateForm1099Q([source({ ...facts, ...changes })], summary())).toThrow(error);
});

it("keeps incomplete whole-account and pledged source methods blocked", () => {
  expect(() => calculateForm1099Q([source(facts)], summary())).toThrow(/actual.*qualified education expenses/i);
  expect(() => calculateForm1099Q([source({ ...facts, prohibitedTransactionKind: "pledged_portion", prohibitedTransactionJanuary1Value: undefined, prohibitedTransactionPledgedAmount: "1000" })], summary())).toThrow(/pledged portion.*unresolved.*basis.*education/i);
});

it("prevents actual source fields from falling back to historical aggregate treatment", () => {
  for (const additions of [{ distributionCode: "6" }, { sourceFactsConfirmed: false }, { returnedContributionPrincipal: "100" }, { transfer: { kind: "none" } }, { prohibitedTransactionBasis: "0" }]) {
    const statement = Form1099QSchema.parse({ grossDistribution: "1000", earnings: "200", basis: "800", ...additions });
    expect(() => calculateForm1099Q([statement], undefined, { taxYear: 2025 })).toThrow(/actual.*source/i);
  }
});

it("preserves actual distribution medium without inferring cash", () => {
  for (const distributionMedium of [undefined, "cash", "in_kind_prepaid_tuition"] as const) {
    const form = source({ accountType: "529", grossDistribution: "1000", earnings: "200", basis: "800", distributionMedium });
    expect(form).toMatchObject({ distributionMedium });
    const result = calculateForm1099Q([form], summary());
    expect(result.perDistribution[0]).toMatchObject({ distributionMedium });
    expect(result.taxableEarnings.toFixed()).toBe("200");
  }
});
