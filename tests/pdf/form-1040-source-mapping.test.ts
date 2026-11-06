/** Spec: spec/federal/form-1040.yaml reviewPdfMapping; official 2025 Form 1040 created 9/5/25. */
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import Decimal from "decimal.js";
import { fillForm1040 } from "@/pdf/fill-form-1040.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture, complexMFJFixture } from "../fixtures/simple-w2.js";

const p1 = "topmostSubform[0].Page1[0].";
const p2 = "topmostSubform[0].Page2[0].";
const blank = "forms/blank/2025/f1040.pdf";

describe("official 2025 Form 1040 field locations", () => {
  it("places simple return values on official 2025 printed lines after serialization", async () => {
    const input = { ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], wages: "150000", federalWithheld: "30000" }] };
    const doc = await fillForm1040(input, calculateFederalTax(input), blank);
    const saved = await PDFDocument.load(await doc.save());
    const form = saved.getForm();
    // Literal field names were identified from the official blank's page coordinates,
    // independently of FORM_1040_FIELDS. Tax: 1,192.50 + 4,386 + 12,072.50 + 7,416 = 25,067.
    const expected = {
      [p1 + "f1_47[0]"]: "150000", // 1a wages
      [p1 + "f1_57[0]"]: "150000", // 1z wages total
      [p1 + "f1_73[0]"]: "150000", // 9 total income
      [p1 + "f1_75[0]"]: "150000", // 11a AGI
      [p2 + "f2_01[0]"]: "150000", // 11b AGI repeat
      [p2 + "f2_02[0]"]: "15750", // 12e deduction
      [p2 + "f2_05[0]"]: "15750", // 14 total deductions
      [p2 + "f2_06[0]"]: "134250", // 15 taxable income
      [p2 + "f2_08[0]"]: "25067", // 16 income tax
      [p2 + "f2_16[0]"]: "25067", // 24 total tax
      [p2 + "f2_20[0]"]: "30000", // 25d withholding
      [p2 + "f2_29[0]"]: "30000", // 33 total payments
      [p2 + "f2_30[0]"]: "4933", // 34 overpayment
      [p2 + "f2_31[0]"]: "4933", // 35a refund
    };
    for (const [name, value] of Object.entries(expected)) {
      const field = form.getTextField(name);
      expect(field.getText(), name).toBe(value);
      for (const widget of field.acroField.getWidgets()) {
        expect(widget.dict.lookup(PDFName.of("AP"), PDFDict).get(PDFName.of("N")), name).toBeDefined();
      }
    }
    const selectedStatus = form.getCheckBox(p1 + "Checkbox_ReadOrder[0].c1_8[0]");
    expect(selectedStatus.isChecked()).toBe(true);
    for (const widget of selectedStatus.acroField.getWidgets()) {
      const state = widget.getAppearanceState();
      expect(state?.toString()).toBe(selectedStatus.acroField.getValue().toString());
      const normal = widget.dict.lookup(PDFName.of("AP"), PDFDict).lookup(PDFName.of("N"), PDFDict);
      expect(state && normal.get(state)).toBeDefined();
    }
    expect(form.getCheckBox(p1 + "c1_1[0]").isChecked()).toBe(false); // late-election box, not Single
  });

  it("keeps dependent columns and credit boxes separate from residency", async () => {
    const doc = await fillForm1040(complexMFJFixture, calculateFederalTax(complexMFJFixture), blank);
    const form = (await PDFDocument.load(await doc.save())).getForm();
    const dep = p1 + "Table_Dependents[0].";
    expect(form.getTextField(dep + "Row1[0].f1_31[0]").getText()).toBe("Tommy");
    expect(form.getTextField(dep + "Row2[0].f1_35[0]").getText()).toBe("Smith");
    expect(form.getTextField(dep + "Row3[0].f1_39[0]").getText()).toBe("777889999");
    expect(form.getTextField(dep + "Row4[0].f1_43[0]").getText()).toBe("Son");
    expect(form.getCheckBox(dep + "Row7[0].Dependent1[0].c1_28[0]").isChecked()).toBe(true);
  });

  it("selects the distinct qualifying surviving spouse box", async () => {
    const input = { ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "qualifying_surviving_spouse" as const } };
    const form = (await fillForm1040(input, calculateFederalTax(input), blank)).getForm();
    expect(form.getCheckBox(p1 + "c1_8[1]").isChecked()).toBe(true);
    expect(form.getCheckBox(p1 + "Checkbox_ReadOrder[0].c1_8[1]").isChecked()).toBe(false);
  });

  it("rejects a result missing an audited tax line rather than guessing", async () => {
    const result = calculateFederalTax(simpleW2Fixture);
    result.allLines = result.allLines.filter((line) => !(line.form === "1040" && line.line === "16"));
    await expect(fillForm1040(simpleW2Fixture, result, blank)).rejects.toThrow("Missing audited Form 1040 line 16");
  });

  it("separates wage and withholding sources at the printed sublines", async () => {
    const input = { ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], federalWithheld: "12000" }],
      form4137: { unreportedTipIncome: "1000" },
      form8919: { wagesNotReportedOnW2: "2000" },
      form1099Int: [{ taxExemptInterest: "0", privateActivityBondInterest: "0", payer: "Synthetic bank", interestIncome: "100", federalWithheld: "25" }],
      formW2G: [{ payer: "Synthetic casino", reportableWinnings: "1000", federalWithheld: "150" }] };
    const form = (await PDFDocument.load(await (await fillForm1040(input, calculateFederalTax(input), blank)).save())).getForm();
    expect(form.getTextField(p1 + "f1_47[0]").getText()).toBe("85000"); // W-2s only
    expect(form.getTextField(p1 + "f1_49[0]").getText()).toBe("1000"); // unreported tips
    expect(form.getTextField(p1 + "f1_53[0]").getText()).toBe("2000"); // Form 8919
    expect(form.getTextField(p1 + "f1_57[0]").getText()).toBe("88000"); // wage total
    expect(form.getTextField(p2 + "f2_17[0]").getText()).toBe("12000");
    expect(form.getTextField(p2 + "f2_18[0]").getText()).toBe("25");
    expect(form.getTextField(p2 + "f2_19[0]").getText()).toBe("150");
    expect(form.getTextField(p2 + "f2_20[0]").getText()).toBe("12175");
  });

  it("preserves audited overpayment separately from refund after a penalty", async () => {
    const result = calculateFederalTax(simpleW2Fixture);
    // Synthetic mapper contract: penalty reduces a $1,000 overpayment to a
    // $950 refund. The mapper must consume each audit entry, not copy refund.
    const amounts: Record<string, string> = { "34": "1000", "35a": "950", "37": "0", "38": "50" };
    result.allLines = result.allLines.map((line) => line.form === "1040" && amounts[line.line] !== undefined
      ? { ...line, value: new Decimal(amounts[line.line]) } : line);
    result.refund = new Decimal(950);
    result.amountOwed = new Decimal(0);
    result.estimatedTaxPenalty = new Decimal(50);
    const form = (await fillForm1040(simpleW2Fixture, result, blank)).getForm();
    expect(form.getTextField(p2 + "f2_30[0]").getText()).toBe("1000");
    expect(form.getTextField(p2 + "f2_31[0]").getText()).toBe("950");
    expect(form.getTextField(p2 + "f2_36[0]").getText()).toBe("50");
  });

  it("rejects excess dependents until an attachment mapping can preserve every person", async () => {
    const input = { ...complexMFJFixture, taxpayer: { ...complexMFJFixture.taxpayer,
      dependents: Array.from({ length: 5 }, () => ({ ...complexMFJFixture.taxpayer.dependents[0] })) } };
    await expect(fillForm1040(input, calculateFederalTax(complexMFJFixture), blank).then(() => undefined)).rejects.toThrow(/dependent attachment/i);
  });
});
