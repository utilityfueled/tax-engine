// Spec: spec/federal/schedule-d-review-mapping.yaml.
import { expect, it } from "vitest";
import Decimal from "decimal.js";
import { PDFDocument } from "pdf-lib";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { getConstants } from "@/models/constants.js";
import { calculateForm4952 } from "@/engine/forms/form-4952.js";
import { Form4952InputSchema } from "@/models/inputs.js";
import { fillScheduleD, SCHEDULE_D_FIELDS as F } from "@/pdf/fill-schedule-d.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

async function saved(input: TaxYearInput) {
  const result = calculateFederalTax(input);
  const document = await fillScheduleD(input, result, "forms/blank/2025/f1040sd.pdf");
  return (await PDFDocument.load(await document.save())).getForm();
}

it("routes actual Form8949 categories and adjustments to the printed rows", async () => {
  const input = TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    form1099B: [{ broker: "Synthetic broker", transactions: [
      { description: "A", dateAcquired: "2025-01-01", dateSold: "2025-06-01", holdingPeriod: "short", basisReportedToIRS: true, proceeds: "1000", costBasis: "900", adjustments: "25" },
      { description: "B", dateAcquired: "2025-01-01", dateSold: "2025-06-01", holdingPeriod: "short", basisReportedToIRS: false, proceeds: "2000", costBasis: "1800", adjustments: "-25" },
      { description: "D", dateAcquired: "2020-01-01", dateSold: "2025-06-01", holdingPeriod: "long", basisReportedToIRS: true, proceeds: "4000", costBasis: "4500", washSale: true, washSaleDisallowed: "200" },
      { description: "E", dateAcquired: "2020-01-01", dateSold: "2025-06-01", holdingPeriod: "long", basisReportedToIRS: false, proceeds: "5000", costBasis: "3500", adjustments: "50" },
    ] }],
  });
  const form = await saved(input);
  for (const [field, expected] of [
    [F.line1bProceeds, "1000"], [F.line1bCostBasis, "900"], [F.line1bAdjustments, "25"], [F.line1bGainLoss, "125"],
    [F.line2Proceeds, "2000"], [F.line2CostBasis, "1800"], [F.line2Adjustments, "(25)"], [F.line2GainLoss, "175"],
    [F.line8bProceeds, "4000"], [F.line8bCostBasis, "4500"], [F.line8bAdjustments, "200"], [F.line8bGainLoss, "(300)"],
    [F.line9Proceeds, "5000"], [F.line9CostBasis, "3500"], [F.line9Adjustments, "50"], [F.line9GainLoss, "1550"],
    [F.line7, "300"], [F.line15, "1250"], [F.line16, "1550"],
  ]) expect(form.getTextField(field).getText()).toBe(expected);
  for (const field of [F.line1aProceeds, F.line1aGainLoss, F.line8aProceeds, F.line8aGainLoss]) {
    expect(form.getTextField(field).getText()).toBeUndefined();
  }
});

it("prints pass-through and prior carryover components separately", async () => {
  const input = TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    scheduleK1: [{ partnershipName: "Synthetic entity", partnershipEIN: "00-0000001", ordinaryIncome: "0", netShortTermCapitalGain: "700", netLongTermCapitalGain: "900" }],
    scheduleK1Form1041: [{ estateTrustName: "Synthetic trust", estateTrustEIN: "00-0000002", netShortTermCapitalGain: "100", netLongTermCapitalGain: "200", isFinalK1: true, finalYearShortTermCapitalLoss: "-300", finalYearLongTermCapitalLoss: "-400" }],
    priorYear: { shortTermCapitalLoss: "-10000", longTermCapitalLoss: "-5000" },
  });
  const scheduleD = calculateScheduleD(input, "single", getConstants(2025));
  const result = { ...calculateFederalTax(simpleW2Fixture), scheduleD, allLines: scheduleD.lines };
  const doc = await fillScheduleD(input, result, "forms/blank/2025/f1040sd.pdf");
  const form = (await PDFDocument.load(await doc.save())).getForm();
  for (const [field, expected] of [[F.line5, "800"], [F.line6, "10300"], [F.line7, "(9500)"], [F.line12, "1100"], [F.line14, "5400"], [F.line15, "(4300)"]]) {
    expect(form.getTextField(field).getText()).toBe(expected);
  }
});

it("prints other-form short and long term gains on lines4and11", async () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, form6781: {
    section1256Gains: "5000", section1256Losses: "0", shortTermStraddleLosses: "100", longTermStraddleLosses: "200",
  } });
  const form = await saved(input);
  expect(form.getTextField(F.line4).getText()).toBe("1900");
  expect(form.getTextField(F.line11).getText()).toBe("2800");
  expect(form.getTextField(F.line7).getText()).toBe("1900");
  expect(form.getTextField(F.line15).getText()).toBe("2800");
});

it("leaves the QOF answer unknown instead of inventing a disposition", async () => {
  const form = await saved(simpleW2Fixture);
  expect(form.getCheckBox("topmostSubform[0].Page1[0].c1_1[0]").isChecked()).toBe(false);
  expect(form.getCheckBox("topmostSubform[0].Page1[0].c1_1[1]").isChecked()).toBe(false);
});

it("follows the printed gain loss and qualified-dividend branches", async () => {
  for (const [short, long, qualified, expected17, expected22] of [
    ["-10000", "0", "0", "blank", "no"],
    ["0", "0", "100", "blank", "yes"],
    ["1000", "-500", "0", "no", "no"],
    ["0", "1000", "100", "yes", "blank"],
  ]) {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099Div: [{ payer: "Synthetic fund", ordinaryDividends: qualified, qualifiedDividends: qualified }] });
    const result = calculateFederalTax(input);
    const net = new Decimal(short).plus(long);
    if (!result.scheduleD) throw new Error("Expected calculated ScheduleD");
    Object.assign(result.scheduleD, { netShortTerm: new Decimal(short), netLongTerm: new Decimal(long), netCapitalGainLoss: net, capitalLossDeduction: Decimal.max(net, -3000) });
    const document = await fillScheduleD(input, result, "forms/blank/2025/f1040sd.pdf");
    const form = (await PDFDocument.load(await document.save())).getForm();
    expect(form.getCheckBox(F.line17Yes).isChecked()).toBe(expected17 === "yes");
    expect(form.getCheckBox(F.line17No).isChecked()).toBe(expected17 === "no");
    expect(form.getCheckBox(F.line22Yes).isChecked()).toBe(expected22 === "yes");
    expect(form.getCheckBox(F.line22No).isChecked()).toBe(expected22 === "no");
    expect(form.getCheckBox(F.line20Yes).isChecked()).toBe(false);
    expect(form.getCheckBox(F.line20No).isChecked()).toBe(false);
  }
});

it("uses completed special worksheet and investment-interest facts at line20", async () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    form1099Div: [{ payer: "Synthetic fund", ordinaryDividends: "0", totalCapitalGainDistributions: "1000" }],
  });
  for (const [gain28, gain25, hasInterest, useOrdinaryWorksheet] of [
    ["0", "0", false, true], ["250", "100", false, false], ["0", "0", true, false],
  ] as const) {
    const result = calculateFederalTax(input);
    result.allLines.push(...[["18", gain28], ["19", gain25]].map(([line, value]) => ({
      form: "Sched D", line, description: "Synthetic completed worksheet output", value: new Decimal(value), formula: "Actual final worksheet result", inputs: {},
    })));
    if (hasInterest) result.form4952 = calculateForm4952(Form4952InputSchema.parse({ investmentInterestExpense: "100", grossInvestmentIncome: "1000" }));
    const document = await fillScheduleD(input, result, "forms/blank/2025/f1040sd.pdf");
    const form = (await PDFDocument.load(await document.save())).getForm();
    // Printed line20 expressly permits either zero or blank on18and19.
    expect(form.getTextField(F.line18).getText()).toBe(gain28 === "0" ? undefined : gain28);
    expect(form.getTextField(F.line19).getText()).toBe(gain25 === "0" ? undefined : gain25);
    expect(form.getCheckBox(F.line20Yes).isChecked()).toBe(useOrdinaryWorksheet);
    expect(form.getCheckBox(F.line20No).isChecked()).toBe(!useOrdinaryWorksheet);
    expect(form.getCheckBox(F.line22Yes).isChecked()).toBe(false);
    expect(form.getCheckBox(F.line22No).isChecked()).toBe(false);
  }
});

it("rejects a nonmonetary audit value in a monetary transaction field", async () => {
  const result = calculateFederalTax(simpleW2Fixture);
  const line = result.allLines.find(item => item.form === "Form 8949" && item.line === "Part I Box A");
  if (!line) throw new Error("Expected actual Form8949 audit");
  line.inputs.proceeds = "unknown source";
  await expect(fillScheduleD(simpleW2Fixture, result, "forms/blank/2025/f1040sd.pdf")).rejects.toThrow(/monetary audit inputs must be Decimal/);
});
