// Spec: spec/federal/passive-loss-qbi.yaml review-transfer.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { fillForm8995, FORM_8995_FIELDS } from "@/pdf/fill-form-8995.js";
import { buildForm8995AReferenceSummary } from "@/pdf/fill-form-8995-a.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

it("retains current and prior qualified losses in both QBI review outputs", async () => {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "120000", federalWithheld: "40000" }],
    rentalProperties: [{ description: "Actual rental", rents: "10000", propertyType: "single_family",
      rentalDays: 365, personalUseDays: 0, isActiveParticipant: true, qualifiesForQBI: true }],
    priorYear: { suspendedPassiveLosses: [{ partnershipName: "Actual rental", amount: "3000", qbiLossTracking: {
      sourceTaxYear: 2024, sourceReference: "Actual filed QBI loss tracking worksheet", sourceFactsConfirmed: true,
      vintages: [{ taxYear: 2024, originalLoss: "3000", qualifiedOriginalLoss: "3000",
        remainingLoss: "3000", qualifiedRemainingLoss: "3000" }],
    } }] },
  });
  const result = calculateFederalTax(input);
  const doc = await fillForm8995(input, result, "forms/blank/2025/f8995.pdf");
  const form = doc.getForm();
  expect(form.getTextField(FORM_8995_FIELDS.line2).getText()).toBe("10000");
  expect(form.getTextField(FORM_8995_FIELDS.line3).getText()).toBe("3000");
  expect(form.getTextField(FORM_8995_FIELDS.line4).getText()).toBe("7000");
  expect(form.getTextField(FORM_8995_FIELDS.line15).getText()).toBe("1400");
  input.w2s[0].wages = "231050"; //222300 taxable income: halfway through the2025SSTB phase-in.
  input.rentalProperties[0].qbiIsSST = true;
  input.rentalProperties[0].qbiUBIA = "200000";
  const detailed = calculateFederalTax(input).form8995A;
  if (!detailed) throw new Error("Fixture requires the actual detailed QBI result");
  const summary = buildForm8995AReferenceSummary(detailed);
  expect(summary.businesses[0].line1QBI).toBe("2000");
  expect(summary.businesses[0].line15QBIComponent).toBe("400");
  expect(detailed.qbiDeduction.toFixed()).toBe("400");
  expect(summary.warningLabel).toBe("REFERENCE SUMMARY ONLY");
});
