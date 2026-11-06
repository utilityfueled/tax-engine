// Spec: spec/federal/form-172-capital-origin.yaml. Literal derived controls.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm172Return } from "@/engine/forms/form-172-return.js";
import { calculateForm172CapitalSources } from "@/engine/forms/form-172-capital-sources.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { capitalOriginInput } from "../fixtures/form-172-capital-origin.js";

function required<T>(value: T | undefined): T { if (value === undefined) throw new Error("Missing explicit synthetic source"); return value; }

it("conserves exact investment capital sources in regular AMT and investment origins", () => {
  const input = capitalOriginInput(), before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.capitalGainLoss.toFixed()).toBe("-0.01");
  expect(result.agi.toFixed()).toBe("-75000.01");
  expect(result.form172?.regular.sourcePartI[2].toFixed()).toBe("100.5");
  expect(result.form172?.regular.sourcePartI[3].toFixed()).toBe("100.49");
  expect(result.form172?.regular.sourcePartI[22].toFixed()).toBe("0.01");
  expect(result.form172?.regular.sourceSignedComputation.toFixed()).toBe("-80000");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("75000");
  expect(result.form172?.section1411OriginalLoss.toFixed()).toBe("0");
  expect(JSON.stringify(input)).toBe(before);
  const wash = capitalOriginInput("100", "200"), transaction = required(wash.form1099B[0]?.transactions[1]);
  transaction.washSale = true; transaction.washSaleDisallowed = "50";
  required(required(required(wash.form172).capitalSources).transactions)[1].transaction = { ...transaction };
  const adjusted = calculateFederalTax(wash);
  expect(adjusted.capitalGainLoss.toFixed()).toBe("-50");
  expect(adjusted.form172?.regular.sourcePartI[2].toFixed()).toBe("150");
  expect(adjusted.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
});

it("classifies distributions and prior capital losses without duplicating the current NOL", () => {
  const gains = capitalOriginInput("20000.49", "100.50"), gainResult = calculateFederalTax(gains);
  expect(gainResult.capitalGainLoss.toFixed()).toBe("19899.99");
  expect(gainResult.form172?.regular.sourceSignedComputation.toFixed()).toBe("-70850.01");
  expect(gainResult.form172?.regular.netOperatingLoss.toFixed()).toBe("70850");
  expect(gainResult.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("55100");
  const source = capitalOriginInput("0", "0"), packet = required(required(source.form172).capitalSources);
  source.form1099B = []; packet.transactions = [];
  source.form1099Div = TaxYearInputSchema.parse({ taxpayer: source.taxpayer, form1099Div: [{ payer: "Original fund", accountHolder: "primary",
    ordinaryDividends: "0", totalCapitalGainDistributions: "500", section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0" }] }).form1099Div;
  packet.distributions = [{ sourceId: "form1099Div:0", sourceTaxYear: 2025, sourceReference: "Original fund capital boxes",
    accountHolder: "primary", payerName: "Original fund", nonbusinessInvestmentConfirmed: true,
    totalCapitalGainDistributions: "500", section1250Gain: "0", section1202Gain: "0", collectiblesGain: "0" }];
  source.priorYear = TaxYearInputSchema.parse({ taxpayer: source.taxpayer, priorYear: { shortTermCapitalLoss: "-4000", longTermCapitalLoss: "-3000" } }).priorYear;
  required(packet.priorCapitalLosses).shortTermCapitalLoss = "-4000"; required(packet.priorCapitalLosses).longTermCapitalLoss = "-3000";
  const result = calculateFederalTax(source);
  expect(result.scheduleD?.netCapitalGainLoss.toFixed()).toBe("-6500");
  expect(result.capitalGainLoss.toFixed()).toBe("-3000");
  expect(result.form172?.regular.partI[2].toFixed()).toBe("7000");
  expect(result.form172?.regular.partI[3].toFixed()).toBe("500");
  expect(result.form172?.regular.partI[22].toFixed()).toBe("3000");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("75000");
  expect(result.form172?.section1411OriginalLoss.toFixed()).toBe("0");
  expect(result.carryforwards.capitalLoss.toFixed()).toBe("-6500");
});

it("requires complete original capital classification and independent alternative facts", () => {
  const known = capitalOriginInput();
  expect(calculateForm172Return(known)).toMatchObject({ sourceFactsVerified: true, calculationComplete: false });
  for (const change of [
    (v: typeof known) => { required(v.form172).capitalSources = undefined; },
    (v: typeof known) => { required(required(v.form172).capitalSources).allCapitalSourcesIncluded = undefined; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).transactions).pop(); },
    (v: typeof known) => { const rows = required(required(required(v.form172).capitalSources).transactions); rows[1].sourceId = rows[0].sourceId; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).transactions)[0].nonbusinessInvestmentConfirmed = false; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).transactions)[0].capitalCharacter = undefined; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).transactions)[0].capitalCharacter = "collectible"; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).transactions)[0].accountHolder = "spouse"; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).transactions)[0].sourceTaxYear = 2024; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).transactions)[0].statementSourceId = "different"; },
    (v: typeof known) => { required(v.form1099B[0]).taxYear = undefined; },
    (v: typeof known) => { required(required(required(required(v.form172).capitalSources).transactions)[0].transaction).basisReportedToIRS = undefined; },
    (v: typeof known) => { required(v.form1099B[0]?.transactions[0]).proceeds = "1100.48"; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).alternativeTax).currentBasisAndAdjustmentsSameConfirmed = undefined; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).alternativeTax).priorCapitalLossesSameConfirmed = false; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).priorCapitalLosses).shortTermCapitalLoss = "-1"; },
    (v: typeof known) => { required(required(required(v.form172).capitalSources).priorCapitalLosses).sameReturnMembershipConfirmed = undefined; },
    (v: typeof known) => { const t = required(v.form1099B[0]?.transactions[0]); t.digitalAsset = true; required(required(required(v.form172).capitalSources).transactions)[0].transaction = { ...t }; },
    (v: typeof known) => { const t = required(v.form1099B[0]?.transactions[0]); t.adjustments = "-1"; required(required(required(v.form172).capitalSources).transactions)[0].transaction = { ...t }; },
    (v: typeof known) => { v.amtCapitalGains = { sourceTaxYear: 2025, sourceReference: "Contradictory separate AMT worksheet", sourceFactsConfirmed: true,
      qualifiedDividends: "0", netCapitalGain: "100", section1250Gain: "0", collectiblesGain: "0" }; },
  ]) {
    const source = capitalOriginInput(); change(source);
    expect(() => calculateForm172Return(source)).toThrow(/Form172.*capital|Form172.*investment|Form172.*alternative/i);
  }
});

it("preserves exact canonical net source validation and closed future-year readiness", () => {
  const source = capitalOriginInput("100", "100");
  const result = calculateFederalTax(source);
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  const saved = required(result.scheduleD);
  for (const key of ["netShortTerm", "netLongTerm", "netCapitalGainLoss", "capitalLossDeduction", "section1202Exclusion"] as const) {
    expect(() => calculateForm172CapitalSources(source, { ...saved, [key]: saved[key].plus("0.01") })).toThrow(/capital.*reconcile/i);
  }
  const missing = capitalOriginInput(); required(required(missing.form172).capitalSources).distributions = [{ sourceId: "invented", sourceTaxYear: 2025 }];
  expect(() => calculateForm172Return(missing)).toThrow(/capital distribution/);
  const signed = capitalOriginInput();
  signed.priorYear = TaxYearInputSchema.parse({ taxpayer: signed.taxpayer, priorYear: { shortTermCapitalLoss: "100" } }).priorYear;
  required(required(required(signed.form172).capitalSources).priorCapitalLosses).shortTermCapitalLoss = "100";
  expect(() => calculateForm172Return(signed)).toThrow(/capital prior carry/);
  const fractional = capitalOriginInput();
  fractional.priorYear = TaxYearInputSchema.parse({ taxpayer: fractional.taxpayer, priorYear: { shortTermCapitalLoss: "-0.01" } }).priorYear;
  required(required(required(fractional.form172).capitalSources).priorCapitalLosses).shortTermCapitalLoss = "-0.01";
  expect(() => calculateForm172Return(fractional)).toThrow(/capital prior carry/);
  const special = capitalOriginInput();
  special.form1099Div = TaxYearInputSchema.parse({ taxpayer: special.taxpayer, form1099Div: [{ payer: "Actual special distribution", ordinaryDividends: "0", section1202Gain: "1" }] }).form1099Div;
  expect(() => calculateForm172Return(special)).toThrow(/capital special.character/);
  const canonical = calculateForm172CapitalSources(source, saved);
  expect(canonical.nonbusinessCapitalGains.minus(canonical.nonbusinessCapitalLosses).eq(d("0"))).toBe(true);
  source.amtCapitalGains = { sourceTaxYear: 2025, sourceReference: "Actual matching AMT PartIII worksheet", sourceFactsConfirmed: true,
    qualifiedDividends: "0", netCapitalGain: "0", section1250Gain: "0", collectiblesGain: "0" };
  expect(calculateForm172Return(source).calculationComplete).toBe(false);
  const future = capitalOriginInput(), capital = required(required(future.form172).capitalSources);
  future.taxpayer.taxYear = 2026; required(future.form172).sourceTaxYear = 2026;
  required(future.netOperatingLoss).sourceTaxYear = 2026; capital.sourceTaxYear = 2026;
  required(future.form1099B[0]).taxYear = 2026; required(capital.priorCapitalLosses).sourceTaxYear = 2025;
  for (const row of required(capital.transactions)) { row.sourceTaxYear = 2026; required(row.transaction).dateSold = "2026-06-03"; }
  for (const row of required(future.form1099B[0]).transactions) row.dateSold = "2026-06-03";
  expect(calculateForm172Return(future).calculationComplete).toBe(false);
  expect(() => calculateFederalTax(future)).toThrow(/not ready|unavailable|not enabled|readiness/i);
});
