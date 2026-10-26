// Spec: spec/federal/qbi-loss-relimitation.yaml.
import { expect, it } from "vitest";
import { d } from "@/utils/decimal.js";
import { getConstants } from "@/models/constants.js";
import { calculateForm461 } from "@/engine/forms/form-461.js";
import { calculateQbiLossCharacter } from "@/engine/forms/qbi-loss-character.js";
import { calculateQbiLossRelimitation, type QbiLossRelimitationContext } from "@/engine/forms/qbi-loss-relimitation.js";

function context(loss = "333000", positiveBusinessIncome = "0"): QbiLossRelimitationContext {
  const form461 = calculateForm461({ totalWages: d("500000"), scheduleCNetProfit: d(positiveBusinessIncome), scheduleFNetProfit: d("0"),
    form4797OrdinaryGainOrLoss: d("0"), nonpassiveK1Income: d("0"), nonpassiveK1Loss: d(loss).negated(),
    otherBusinessIncome: d("0"), deductibleSETax: d("0"), seHealthInsurance: d("0"), seRetirementContributions: d("0"),
    priorYearEBLNol: d("0"), sourceFactsConfirmed: true, atRiskAndPassiveLimitationsApplied: true,
    capitalGainOrLoss: d("0"), tradeOrBusinessCapitalGainNetIncome: d("0"), scheduleESupplementalIncome: d(loss).negated(),
    noncapitalNonbusinessIncome: d("0"), noncapitalNonbusinessLoss: d("0"), noncapitalBusinessNet: d(positiveBusinessIncome).minus(loss),
    otherBusinessDeductions: d("0"),
  }, "single", getConstants(2025));
  return { taxYear: 2025, form461, positiveBusinessIncome: d(positiveBusinessIncome),
    lossPools: [{ activitySourceId: "scheduleK1:0", loss: d(loss) }] };
}
function current() {
  return calculateQbiLossCharacter({ taxYear: 2025, activitySourceId: "scheduleK1:0", limitation: "465",
    currentLoss: d("433000"), currentQualifiedLoss: d("346400"), priorLoss: d("0"), calculatedAllowedLoss: d("333000"),
    history: { sourceTaxYear: 2024, sourceReference: "Actual at-risk history", sourceFactsConfirmed: true, vintages: [] } });
}
function prior(mixed = false) {
  return calculateQbiLossCharacter({ taxYear: 2025, activitySourceId: "scheduleK1:0", limitation: "469",
    currentLoss: d(mixed ? "10000" : "0"), currentQualifiedLoss: d(mixed ? "10000" : "0"),
    priorLoss: d("333000"), calculatedAllowedLoss: d(mixed ? "343000" : "333000"),
    history: { sourceTaxYear: 2024, sourceReference: "Actual passive/QBI history", sourceFactsConfirmed: true,
      vintages: [{ taxYear: 2022, originalLoss: "433000", qualifiedOriginalLoss: "346400", remainingLoss: "333000", qualifiedRemainingLoss: "266400",
        materiallyParticipatedInCurrentYear: true }] } });
}

it("derives the current qualified re-suspension from canonical Form461 once", () => {
  const original = current(); const ctx = context(); const before = JSON.stringify({ original, ctx });
  expect(ctx.form461.line16ExcessBusinessLoss.toFixed()).toBe("20000");
  const result = calculateQbiLossRelimitation(original, ctx);
  expect(result.currentQualifiedLossAllowed.toFixed()).toBe("250400");
  expect(result.priorQualifiedLossAllowed.toFixed()).toBe("0");
  expect(result.excessBusinessLoss.toFixed()).toBe("20000");
  expect(result.qualifiedExcessBusinessLoss.toFixed()).toBe("16000");
  expect(result.excessBusinessLossVintage?.limitation).toBe("461(l)");
  expect(result.excessBusinessLossVintage?.taxYear).toBe(2025);
  expect(result.excessBusinessLossVintage?.qualifiedRemainingLoss.toFixed()).toBe("16000");
  expect(original.remainingVintages[0].qualifiedRemainingLoss.toFixed()).toBe("80000");
  expect(JSON.stringify({ original, ctx })).toBe(before);
});

it("retains prior origin character when one released vintage is limited again", () => {
  const result = calculateQbiLossRelimitation(prior(), context());
  expect(result.currentQualifiedLossAllowed.toFixed()).toBe("0");
  expect(result.priorQualifiedLossAllowed.toFixed()).toBe("250400");
  expect(result.priorActiveQualifiedLossAllowed?.toFixed()).toBe("250400");
  expect(result.qualifiedExcessBusinessLoss.toFixed()).toBe("16000");
  expect(result.excessBusinessLossVintage?.remainingLoss.toFixed()).toBe("20000");
  expect(result.lines.find(row => row.line.endsWith(":prior"))?.inputs["Original loss year"]).toBe("2022");
});

it("preserves mixed current and prior loss transfers when EBL is zero", () => {
  // Actual additional business income, independent of the loss pool.
  const source = prior(true); const ctx = context("343000", "50000");
  const result = calculateQbiLossRelimitation(source, ctx);
  expect(result.currentQualifiedLossAllowed.toFixed()).toBe("10000");
  expect(result.priorQualifiedLossAllowed.toFixed()).toBe("266400");
  expect(result.excessBusinessLossVintage).toBeUndefined();
});

it("rejects stale or unreconciled canonical loss contexts", () => {
  const source = current();
  expect(() => calculateQbiLossRelimitation(source, { ...context(), taxYear: 2026 })).toThrow(/year/i);
  expect(() => calculateQbiLossRelimitation(source, { ...context(), positiveBusinessIncome: d("1") })).toThrow(/reconcile/i);
  expect(() => calculateQbiLossRelimitation(source, { ...context(), lossPools: [{ activitySourceId: "scheduleK1:1", loss: d("333000") }] })).toThrow(/source/i);
  const unknown = context(); unknown.form461.sourceFactsVerified = false;
  expect(() => calculateQbiLossRelimitation(source, unknown)).toThrow(/verified/i);
  const stale = context(); stale.form461.line16ExcessBusinessLoss = d("19000");
  expect(() => calculateQbiLossRelimitation(source, stale)).toThrow(/reconcile/i);
  expect(() => calculateQbiLossRelimitation(source, { ...context(), positiveBusinessIncome: d("NaN") })).toThrow(/finite/i);
});

it("keeps unresolved cross-pool and mixed-origin EBL allocation explicit", () => {
  const multiple = context("343000");
  multiple.lossPools = [{ activitySourceId: "scheduleK1:0", loss: d("333000") }, { activitySourceId: "scheduleC", loss: d("10000") }];
  expect(() => calculateQbiLossRelimitation(current(), multiple)).toThrow(/multiple.*pool|allocation/i);
  expect(() => calculateQbiLossRelimitation(prior(true), context("343000"))).toThrow(/current.*prior|allocation/i);
  const rows = prior(); rows.allowedPriorVintages = [
    { ...rows.allowedPriorVintages[0], lossAllowed: d("100000"), qualifiedLossAllowed: d("80000") },
    { ...rows.allowedPriorVintages[0], taxYear: 2023, lossAllowed: d("233000"), qualifiedLossAllowed: d("186400") },
  ];
  expect(() => calculateQbiLossRelimitation(rows, context())).toThrow(/origin|allocation/i);
});
