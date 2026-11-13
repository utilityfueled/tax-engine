// Spec: spec/federal/schedule-c-2026-template.yaml
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, it } from "vitest";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf } from "@/pdf/export-policy.js";
import { SCHEDULE_C_2026_CANDIDATE as candidate } from "@/pdf/mappings/2026/schedule-c-candidate.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const partIV = {
  offDutyPersonalUseAvailable: true,
  otherPersonalVehicleAvailable: false,
  notRequiredToFileForm4562ForBusiness: true,
};
const log = {
  taxYear: 2026,
  logReference: "Private vehicle log QA reference",
  placedInService: "2026-03-19",
  ownedVehicleFirstBusinessYearAndElectionConfirmed: true,
  writtenCompleteMileageLogConfirmed: true,
  eligibleBusinessParkingAndTollsConfirmed: true,
  noOtherActivityAllocationReimbursementsOrVehicleDeductionsConfirmed: true,
  noDispositionInServiceYearConfirmed: true,
  commutingMiles: "0",
  otherPersonalMiles: "17",
  totalMiles: "42",
  parkingAndTolls: "3.20",
  entries: [{ date: "2026-06-30", miles: "11" }, { date: "2026-07-01", miles: "14" }],
};

function parseMileage(overrides: Record<string, unknown> = {}) {
  return TaxYearInputSchema.parse({
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    scheduleC: { accountHolder: "primary", accountingMethod: "cash", grossReceipts: "10000",
      standardMileage: { ...log, partIV, ...overrides } },
  });
}

it("maps the official vehicle fields from one reconciled log and explicit Part IV answers", async () => {
  const { projectScheduleC2026MileageFields } = await import("@/pdf/mappings/2026/schedule-c-mileage-projection.js");
  const fields = candidate.fields;
  const values = projectScheduleC2026MileageFields(parseMileage());
  const text = {
    [fields.line9]: "22",
    [fields.vehiclePlacedMonth]: "03",
    [fields.vehiclePlacedDay]: "19",
    [fields.vehiclePlacedYear]: "2026",
    [fields.line44aBusinessMiles]: "25",
    [fields.line44bCommutingMiles]: "0",
    [fields.line44cOtherMiles]: "17",
  };
  const checked = {
    [fields.line45Yes]: true, [fields.line45No]: false,
    [fields.line46Yes]: false, [fields.line46No]: true,
    [fields.line47aYes]: true, [fields.line47aNo]: false,
    [fields.line47bYes]: true, [fields.line47bNo]: false,
  };
  expect(values).toEqual({ ...text, ...checked });
  expect(JSON.stringify(values)).not.toContain(log.logReference);

  const pdf = await PDFDocument.load(await readFile("forms/blank/2026/f1040sc.pdf"));
  const form = pdf.getForm();
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === "string") form.getTextField(name).setText(value);
    else if (value) form.getCheckBox(name).check();
    else form.getCheckBox(name).uncheck();
  }
  await markReviewPdf(pdf);
  const bytes = await pdf.save();
  const reopened = (await PDFDocument.load(bytes)).getForm();
  for (const [name, value] of Object.entries(text)) {
    expect(reopened.getTextField(name).acroField.getValue()?.decodeText()).toBe(value);
    expect(reopened.getTextField(name).acroField.getWidgets()[0]?.getAppearances()?.normal).toBeDefined();
  }
  for (const [name, value] of Object.entries(checked)) {
    expect(reopened.getCheckBox(name).isChecked()).toBe(value);
    expect(reopened.getCheckBox(name).acroField.getWidgets()[0]?.getAppearanceState()?.asString()).toBe(
      value ? reopened.getCheckBox(name).acroField.getOnValue()?.asString() : "/Off",
    );
  }
  expect(candidate.exportsEnabled).toBe(false);
  expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
  expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
    await writeFile(join(process.env.TAX_CANDIDATE_ARTIFACT_DIR, "schedule-c-mileage-diagnostic.pdf"), bytes);
  }
});

it("keeps older complete logs calculable while refusing unconfirmed physical answers", async () => {
  const { projectScheduleC2026MileageFields } = await import("@/pdf/mappings/2026/schedule-c-mileage-projection.js");
  const older = parseMileage({ partIV: undefined });
  expect(calculateScheduleC(older).totalExpenses.toFixed()).toBe("21.815");
  expect(() => projectScheduleC2026MileageFields(older)).toThrow(/Part IV/);
  expect(() => parseMileage({ partIV: { ...partIV, offDutyPersonalUseAvailable: undefined } })).toThrow();
  expect(() => parseMileage({ partIV: { ...partIV, notRequiredToFileForm4562ForBusiness: false } })).toThrow();
  expect(() => projectScheduleC2026MileageFields(parseMileage({ commutingMiles: "0.5", otherPersonalMiles: "16.5" }))).toThrow(/whole miles/);
  expect(() => projectScheduleC2026MileageFields(parseMileage({ totalMiles: "41" }))).toThrow(/reconcile/);
  const reverse = projectScheduleC2026MileageFields(parseMileage({
    partIV: { ...partIV, offDutyPersonalUseAvailable: false, otherPersonalVehicleAvailable: true },
  }));
  expect(reverse[candidate.fields.line45No]).toBe(true);
  expect(reverse[candidate.fields.line46Yes]).toBe(true);
});
