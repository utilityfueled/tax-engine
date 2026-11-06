// Spec: spec/federal/form-172-section-1202-origin.yaml. Derived literal controls.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm172Origin, type Form172OriginInput } from "@/engine/forms/form-172-origin.js";
import { calculateForm172Return } from "@/engine/forms/form-172-return.js";
import { calculateForm172CapitalSources } from "@/engine/forms/form-172-capital-sources.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { qsbsOriginInput } from "../fixtures/form-172-section-1202-origin.js";

function required<T>(value: T | undefined): T { if (value === undefined) throw new Error("Missing actual synthetic source"); return value; }
function partI(gain = "1000", loss = "0", exclusion = "500"): Form172OriginInput {
  const net = d(gain).minus(loss).minus(exclusion);
  const transfer = net.lt("-3000") ? d("-3000") : net;
  return { taxYear: 2025, filingStatus: "single", adjustedGrossIncome: d("-75000").plus(transfer), deductionAmount: d("15750"),
    nonbusinessCapitalLosses: d(loss), nonbusinessCapitalGains: d(gain), nonbusinessDeductions: d("15750"), nonbusinessOrdinaryIncome: d("5000"),
    businessCapitalLosses: d("0"), businessCapitalGains: d("0"), netCapitalGainOrLoss: net, section1202Exclusion: d(exclusion), otherYearNolDeduction: d("0") };
}
function priorLoss(input: ReturnType<typeof qsbsOriginInput>, short: string, long: string) {
  input.priorYear = TaxYearInputSchema.parse({ taxpayer: input.taxpayer, priorYear: { shortTermCapitalLoss: short, longTermCapitalLoss: long } }).priorYear;
  const classified = required(required(required(input.form172).capitalSources).priorCapitalLosses);
  classified.shortTermCapitalLoss = short; classified.longTermCapitalLoss = long;
  const schedule = required(input.scheduleDSpecialGainSources);
  schedule.priorShortTermCapitalLoss = short; schedule.priorLongTermCapitalLoss = long;
}

it("restores positive QSBS once when statutory and printed origin traces agree", () => {
  const result = calculateForm172Origin(partI());
  expect(result.sourcePartI[9].toFixed()).toBe("9750");
  expect(result.sourcePartI[17].toFixed()).toBe("500");
  expect(([16, 18, 19, 20, 21, 22] as const).map(line => result.sourcePartI[line].toFixed())).toEqual(["0", "0", "0", "0", "0", "0"]);
  expect(result.netOperatingLoss.toFixed()).toBe("80000");
  expect(calculateForm172Origin(partI("20000", "0", "20000")).netOperatingLoss.toFixed()).toBe("70750");
});

it("binds original broker and fund QSBS to separate regular AMT and investment origins", () => {
  for (const kind of ["broker", "fund"] as const) {
    const source = qsbsOriginInput(kind), before = JSON.stringify(source), result = calculateFederalTax(source);
    expect(result.capitalGainLoss.toFixed()).toBe(kind === "broker" ? "500.125" : "1000.375");
    expect(result.agi.toFixed()).toBe(kind === "broker" ? "-74499.875" : "-73999.625");
    expect(result.allLines.find(line => line.form === "Form 6251" && line.line === "2h")?.value.toFixed()).toBe("35");
    expect(result.form172?.regular.sourcePartI[3].toFixed()).toBe(kind === "broker" ? "1000.25" : "1500.5");
    expect(result.form172?.regular.sourcePartI[17].toFixed()).toBe("500.125");
    expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
    expect(result.form172?.alternativeTax.sourceSignedComputation.toFixed()).toBe(kind === "broker" ? "-73999.75" : "-73499.5");
    expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe(kind === "broker" ? "74000" : "73500");
    expect(result.form172?.section1411OriginalLoss.toFixed()).toBe("0");
    expect(JSON.stringify(source)).toBe(before);
  }
});

it("conserves source netting and full exclusions without inventing an AMT allocation", () => {
  const fund = qsbsOriginInput("fund"); priorLoss(fund, "-200", "-100");
  fund.amtCapitalGains = { sourceTaxYear: 2025, sourceReference: "Actual matching independent AMT worksheet", sourceFactsConfirmed: true,
    qualifiedDividends: "0", netCapitalGain: "700.375", section1250Gain: "0", collectiblesGain: "200.125" };
  const result = calculateFederalTax(fund);
  expect(result.capitalGainLoss.toFixed()).toBe("700.375");
  expect(result.scheduleD?.specialGainWorksheets?.collectiblesGain.toFixed()).toBe("200");
  expect(result.form172?.regular.sourcePartI[2].toFixed()).toBe("300");
  expect(result.form172?.regular.sourcePartI[3].toFixed()).toBe("1500.5");
  expect(result.form172?.regular.netOperatingLoss.toFixed()).toBe("80000");
  expect(result.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("73800");
  const full = calculateFederalTax(qsbsOriginInput("full"));
  expect(full.capitalGainLoss.toFixed()).toBe("0");
  expect(full.form172?.regular.netOperatingLoss.toFixed()).toBe("70750");
  expect(full.form172?.alternativeTax.netOperatingLoss.toFixed()).toBe("55000");
  expect(full.scheduleD?.section1202AmtPreference.toFixed()).toBe("0");
});

it("requires actual QSBS sources and reconciles retained exclusion and preference", () => {
  const known = qsbsOriginInput(), result = calculateFederalTax(known), schedule = required(result.scheduleD);
  for (const key of ["section1202Exclusion", "section1202AmtPreference"] as const) {
    expect(() => calculateForm172CapitalSources(known, { ...schedule, [key]: schedule[key].plus("0.01") })).toThrow(/capital.*reconcile/i);
  }
  for (const change of [
    (source: typeof known) => { required(source.section1202Sources).sourceFactsConfirmed = false; },
    (source: typeof known) => { required(source.section1202Sources).issuers[0].priorEligibleGainUsed = "1"; },
    (source: typeof known) => { required(required(required(source.form172).capitalSources).transactions)[0].capitalCharacter = "ordinary_investment"; },
    (source: typeof known) => { required(source.section1202Sources).lots[0].recognizedGain = "1000.26"; },
    (source: typeof known) => { source.amtCapitalGains = { sourceTaxYear: 2025, sourceReference: "Conflicting actual AMT worksheet", sourceFactsConfirmed: true,
      qualifiedDividends: "0", netCapitalGain: "500.125", section1250Gain: "0", collectiblesGain: "0" }; },
  ]) {
    const source = qsbsOriginInput(); change(source);
    expect(() => calculateForm172Return(source)).toThrow(/1202|capital|alternative/i);
  }
  const ineligible = qsbsOriginInput(); required(ineligible.section1202Sources).lots[0].qualification.activeBusinessRequirementSatisfied = false;
  const taxable = calculateFederalTax(ineligible);
  expect(taxable.scheduleD?.section1202Exclusion.toFixed()).toBe("0");
  expect(taxable.capitalGainLoss.toFixed()).toBe("1000.25");
});

it("keeps negative-net QSBS origin conventions explicitly unresolved", () => {
  for (const loss of ["700", "9000"]) {
    expect(() => calculateForm172Origin(partI("1000", loss, "500"))).toThrow(/1202.*negative|negative.*1202/i);
  }
  const source = qsbsOriginInput(); priorLoss(source, "-700", "0");
  expect(() => calculateForm172Return(source)).toThrow(/1202.*negative|negative.*1202/i);
  expect(() => calculateFederalTax(source)).toThrow(/1202.*negative|negative.*1202/i);
});

it("preserves source-only QSBS validation and future-year readiness", () => {
  const source = qsbsOriginInput();
  expect(calculateForm172Return(source)).toEqual({ taxYear: 2025, sourceFactsVerified: true, calculationComplete: false });
  source.taxpayer.taxYear = 2026; required(source.form172).sourceTaxYear = 2026; required(source.netOperatingLoss).sourceTaxYear = 2026;
  const capital = required(required(source.form172).capitalSources); capital.sourceTaxYear = 2026;
  required(capital.priorCapitalLosses).sourceTaxYear = 2025;
  for (const row of required(capital.transactions)) { row.sourceTaxYear = 2026; required(row.transaction).dateSold = "2026-06-30"; }
  for (const statement of source.form1099B) { statement.taxYear = 2026; for (const row of statement.transactions) row.dateSold = "2026-06-30"; }
  required(source.section1202Sources).taxYear = 2026; required(source.section1202Sources).lots[0].dateSold = "2026-06-30";
  const schedule = required(source.scheduleDSpecialGainSources); schedule.taxYear = 2026;
  for (const row of schedule.longTermAssets) { row.sourceTaxYear = 2026; row.dateSold = "2026-06-30"; }
  expect(calculateForm172Return(source).calculationComplete).toBe(false);
  expect(() => calculateFederalTax(source)).toThrow(/not ready|unavailable|not enabled|readiness/i);
});
