/** Spec: spec/federal/form-5695-source.yaml; explicit synthetic sources only. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm5695 } from "@/engine/forms/form-5695.js";
import { fillForm5695, FORM_5695_FIELDS as F } from "@/pdf/fill-form-5695.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { energyHome, energySource, sourceCleanProperty, sourceImprovement } from "../fixtures/energy-source.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const path = "forms/blank/2025/f5695.pdf";
const p = (page: number, name: string, index = 0) => `topmostSubform[0].Page${page}[0].${name}[${index}]`;
function required<T>(value: T | undefined): T { if (value === undefined) throw new Error("Missing synthetic test fixture"); return value; }
function fixture(energyCredits: unknown = energySource, joint = false) {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer,
    filingStatus: joint ? "married_filing_jointly" : "single",
    spouse: joint ? { firstName: "Jamie", lastName: "Example", ssn: "999-88-7777", dateOfBirth: "1980-01-01" } : undefined,
    address: { street: "99 Mailing Only", city: "Denver", state: "CO", zip: "80202" },
  }, energyCredits });
  const result = calculateFederalTax({ ...input, energyCredits: undefined });
  result.form5695 = calculateForm5695(input.energyCredits, { taxYear: 2025, filingStatus: input.taxpayer.filingStatus,
    taxLiabilityLimit: new Decimal(10000), improvementTaxLiabilityLimit: new Decimal(3500) });
  return { input, result };
}
async function textOf(doc: PDFDocument) {
  const dir = await mkdtemp(join(tmpdir(), "energy-source-pdf-"));
  try {
    const path = join(dir, "review.pdf"); await writeFile(path, await doc.save());
    return execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c",
      "import sys; from pypdf import PdfReader; print('\\n'.join(p.extract_text() or '' for p in PdfReader(sys.argv[1]).pages))", path], { encoding: "utf8" });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

describe("Form5695 physical source mapping", () => {
  it("fills actual physical source fields and preserves saved widgets", async () => {
    const heater = { ...sourceImprovement, sourceId: "heater", category: "heat_pump_water_heater", qualifiedCost: "4000" };
    const panel = { ...sourceImprovement, sourceId: "panel", category: "electrical_panel", qualifiedCost: "1000",
      installationCompletedDate: "2024-12-01", enabledPropertyIds: ["heater"], panelLoadAmps: "200", panelCodeComplianceConfirmed: true,
      consecutiveYearElection: true, priorYearCreditClaimed: false };
    const { input, result } = fixture({ ...energySource,
      cleanEnergyProperties: [sourceCleanProperty, { ...sourceCleanProperty, sourceId: "battery", category: "battery", qualifiedCost: "1000", batteryKilowattHours: "3" },
        { ...sourceCleanProperty, sourceId: "fuel", category: "fuel_cell", qualifiedCost: "2000", fuelCellKilowattCapacity: "0.5" }],
      qualifiedImprovements: [sourceImprovement, heater, panel, { ...sourceImprovement, sourceId: "audit", category: "home_energy_audit", qualifiedCost: "500", auditReportCertified: true }],
    });
    const doc = await PDFDocument.load(await (await fillForm5695(input, result, path)).save()); const form = doc.getForm();
    for (const address of [p(1, "f1_03"), p(1, "f1_15"), p(2, "f2_03"), "topmostSubform[0].Page3[0].Table_Line21c[0].Row1[0].f3_01[0]"])
      expect(form.getTextField(address).getText()).toBe("12 Installation Way");
    for (const [page, name] of [[1, "c1_1"], [1, "c1_2"], [2, "c2_1"], [2, "c2_2"], [2, "c2_3"], [3, "c3_1"], [3, "c3_2"], [3, "c3_4"], [4, "c4_1"]] as const) {
      expect(form.getCheckBox(p(page, name)).isChecked(), name).toBe(true);
      expect(form.getCheckBox(p(page, name, 1)).isChecked(), name).toBe(false);
    }
    expect(form.getCheckBox(p(2, "c2_4", 1)).isChecked()).toBe(true);
    expect(form.getTextField(p(3, "f3_42")).getText()).toBe("F");
    expect(form.getTextField(F.panelQmids[0]).getText()).toBe("A1B2");
    expect(form.getTextField(F.line25c).getText()).toBe("1000");
    const text = (await textOf(doc)).replace(/\s+/g, " "); expect(text).toContain("2024-12-01"); expect(text).toContain("consecutive-year election");
    expect(text).not.toContain("99 Mailing Only");
    expect(text.split(REVIEW_PDF_NOTICE).length - 1).toBe(doc.getPageCount());
  });
  it("retains joint and association allocations and excluded property facts", async () => {
    const home = { ...energyHome, jointOccupancyWithOtherReturn: true, allOccupantCostsComplete: true };
    const { input, result } = fixture({ ...energySource, homes: [home],
      cleanEnergyProperties: [{ ...sourceCleanProperty, category: "fuel_cell", qualifiedCost: "12000", totalCostPaidByAllOccupants: "20000", fuelCellKilowattCapacity: "5" }],
      qualifiedImprovements: [{ ...sourceImprovement, category: "insulation", qualifiedCost: "5000", totalCostPaidByAllOccupants: "10000", associationCostShare: true,
        associationAllocation: { totalQualifiedCost: "50000", numerator: "1", denominator: "10", sourceReference: "Synthetic association statement" } },
        { ...sourceImprovement, sourceId: "excluded", qualifiedCost: "123", totalCostPaidByAllOccupants: "123", originalUseByTaxpayer: false }],
    });
    const doc = await fillForm5695(input, result, path); const form = doc.getForm();
    for (const box of [p(1, "c1_3"), p(4, "c4_2"), p(4, "c4_3")]) expect(form.getCheckBox(box).isChecked()).toBe(true);
    expect(form.getTextField(F.line8).getText()).toBe("10002"); expect(form.getTextField(F.line18b).getText()).toBe("600");
    const text = (await textOf(doc)).replace(/\s+/g, " "); for (const value of ["Synthetic association statement", "1/10", "$10000.00", "excluded", "$123.00", "ineligible"]) expect(text).toContain(value);
  });
  it("preserves separate spousal worksheets and applies the shared limit once", async () => {
    const spouseHome = { ...energyHome, id: "home-b", owner: "spouse", mainHomeFor: "spouse", address: { ...energyHome.address, street: "34 Spouse Home" } };
    const { input, result } = fixture({ ...energySource, separateSpousalMainHomes: true, homes: [energyHome, spouseHome], cleanEnergyProperties: [],
      qualifiedImprovements: [{ ...sourceImprovement, category: "heat_pump", qualifiedCost: "10000" },
        { ...sourceImprovement, sourceId: "spouse-heat", homeId: "home-b", category: "heat_pump", qualifiedCost: "10000", manufacturerQualifiedId: "B2C3" }],
    }, true);
    const doc = await PDFDocument.load(await (await fillForm5695(input, result, path)).save()); const form = doc.getForm();
    expect(form.getTextField(F.line30).getText()).toBe("4000"); expect(form.getTextField(F.line32).getText()).toBe("3500");
    const extra = (name: string) => name.replace("topmostSubform[0]", "spouse_Form5695");
    expect(form.getTextField(extra(F.line30)).getText()).toBe("2000");
    expect(form.getTextField(extra(F.line31)).getText() ?? "").toBe(""); expect(form.getTextField(extra(F.line32)).getText() ?? "").toBe("");
    expect(form.getTextField(extra(F.heatPumpQmid)).getText()).toBe("B2C3");
    const names = form.getFields().map(field => field.getName()); expect(new Set(names).size).toBe(names.length);
    expect(form.getFieldMaybe(extra(F.name))).toBeUndefined();
    const text = await textOf(doc); expect(text).toContain("More than one main home"); expect(text).toContain("34 Spouse Home");
    expect(text.match(/Part I Residential Clean Energy Credit/g)?.length).toBe(1);
    expect(text.split(REVIEW_PDF_NOTICE).length - 1).toBe(doc.getPageCount());
  });
  it("rejects stale source bindings and incomplete separate-home audits", async () => {
    for (const change of [{ category: "central_ac" }, { qualifiedCost: "2000" }, { qualificationConfirmed: false }, { manufacturerQualifiedId: "B2C3" }]) {
      const { input, result } = fixture(); Object.assign(required(required(input.energyCredits).qualifiedImprovements)[0], change);
      await expect(fillForm5695(input, result, path)).rejects.toThrow(/source|binding|audit/i);
    }
    const { input, result } = fixture(); const group = required(required(result.form5695).improvementHomes)[0]; group.lines = group.lines.filter(line => line.line !== "30");
    await expect(fillForm5695(input, result, path)).rejects.toThrow(/audit|worksheet/i);
    const missing = fixture(); required(missing.input.energyCredits).sourceFactsConfirmed = false;
    await expect(fillForm5695(missing.input, missing.result, path)).rejects.toThrow(/source|verified/i);
  });
  it("attaches unused carryforward when Schedule3 has no allowed credit", async () => {
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [], energyCredits: { ...energySource, homes: [], cleanEnergyProperties: [], qualifiedImprovements: [], priorYearCarryforward: "300" } });
    const result = calculateFederalTax(input); expect(required(result.schedule3).totalNonrefundableCredits.toFixed()).toBe("0");
    // A packet may omit a zero Schedule3. That cannot discard the energy carry.
    result.schedule3 = undefined;
    expect(required(result.form5695).residentialCleanEnergyCarryforward.toFixed()).toBe("300");
    const dir = await mkdtemp(join(tmpdir(), "energy-carry-"));
    try {
      const output = await fillReturn(input, result, { blankFormsDir: "forms/blank/2025", outputDir: dir });
      const file = output.filledForms.find(file => file.endsWith("f5695-filled.pdf")); expect(file).toBeDefined();
      const doc = await PDFDocument.load(await readFile(required(file))); expect(doc.getForm().getTextField(F.line16).getText()).toBe("300");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("selects the actual highest-cost home and retains additional addresses and known false answers", async () => {
    const homes = Array.from({ length: 5 }, (_, index) => ({ ...energyHome, id: `home-${index}`, mainHomeFor: "neither",
      address: { ...energyHome.address, street: `${index + 1} Actual Residence` } }));
    const { input, result } = fixture({ ...energySource, homes,
      cleanEnergyProperties: homes.map((home, index) => ({ ...sourceCleanProperty, sourceId: `solar-${index}`, homeId: home.id, qualifiedCost: String((index + 1) * 1000) })),
      qualifiedImprovements: homes.map((home, index) => ({ ...sourceImprovement, sourceId: `air-${index}`, homeId: home.id, category: "central_ac", qualifiedCost: "1000" })),
    });
    const doc = await fillForm5695(input, result, path); expect(doc.getForm().getTextField(p(1, "f1_03")).getText()).toBe("5 Actual Residence");
    expect(doc.getForm().getTextField("topmostSubform[0].Page3[0].Table_Line21c[0].Row4[0].f3_16[0]").getText()).toBe("4 Actual Residence");
    expect(await textOf(doc)).toContain("5 Actual Residence");
    const excluded = fixture({ ...energySource,
      cleanEnergyProperties: [{ ...sourceCleanProperty, category: "battery", batteryKilowattHours: "2.9" }],
      qualifiedImprovements: [{ ...sourceImprovement, originalUseByTaxpayer: false, expectedFiveYearUse: false, newConstruction: true }],
    });
    const excludedDoc = await fillForm5695(excluded.input, excluded.result, path); const form = excludedDoc.getForm();
    expect(form.getCheckBox(p(1, "c1_1", 1)).isChecked()).toBe(true);
    expect(form.getCheckBox(p(2, "c2_2", 1)).isChecked()).toBe(true); expect(form.getCheckBox(p(2, "c2_3", 1)).isChecked()).toBe(true);
    expect(form.getCheckBox(p(2, "c2_4")).isChecked()).toBe(true);
    expect(form.getTextField(F.line15).getText() ?? "").toBe(""); expect(form.getTextField(F.line32).getText() ?? "").toBe("");
  });
});
