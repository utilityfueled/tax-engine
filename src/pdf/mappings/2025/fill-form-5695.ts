/** 2025 review-only Form 5695: numeric lines come exclusively from the engine audit. */
import { PDFDocument, PDFObjectCopier, PDFPage, PDFPageLeaf, StandardFonts, type PDFForm } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult, CalculatedLine } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { loadReviewTemplate, setTextField, setCurrencyField, setCheckBox } from "../../pdf-utils.js";

import { calculateEnergySourceFacts, ENERGY_PANEL_CODES, type EnergySourceFactsResult, type ResolvedEnergyImprovement, type ResolvedCleanEnergyProperty } from "@/engine/forms/energy-source-facts.js";

const field = (page: number, name: string) => `topmostSubform[0].Page${page}[0].${name}[0]`;
const p1 = (name: string) => field(1, name);
const p2 = (name: string) => field(2, name);
const p3 = (name: string) => field(3, name);
const p4 = (name: string) => field(4, name);
const qmid = (page: number, section: string, name: string, box = "Box1-4") => `topmostSubform[0].Page${page}[0].${section ? `${section}[0].` : ""}${box}[0].${name}[0]`;

export const FORM_5695_FIELDS = {
  name:p1("f1_01"),ssn:p1("f1_02"),name2:p2("f2_01"),ssn2:p2("f2_02"),
  line1:p1("f1_08"),line2:p1("f1_09"),line3:p1("f1_10"),line4:p1("f1_11"),line5b:p1("f1_12"),
  line6a:p1("f1_13"),line6b:p1("f1_14"),line8:p1("f1_20"),line9:p1("f1_21"),
  capacityInteger:p1("f1_22"),capacityFraction:p1("f1_23"),line10:p1("f1_24"),
  line11:p1("f1_25"),line12:p1("f1_26"),line13:p1("f1_27"),line14:p1("f1_28"),line15:p1("f1_29"),line16:p1("f1_30"),
  line18a:p2("f2_08"),line18b:p2("f2_09"),line19a:p2("f2_10"),line19c:p2("f2_13"),line19d:p2("f2_14"),
  line19d1:p2("f2_17"),line19d2:p2("f2_20"),line19e:p2("f2_21"),line19f:p2("f2_22"),line19g:p2("f2_23"),line19h:p2("f2_24"),
  line20a:p2("f2_25"),line20a1:p2("f2_28"),line20a2:p2("f2_31"),line20a3:p2("f2_34"),line20a4:p2("f2_37"),
  line20b:p2("f2_38"),line20c:p2("f2_39"),line20d:p2("f2_40"),
  line22a:p3("f3_21"),line22b:p3("f3_24"),line22c:p3("f3_25"),line22d:p3("f3_26"),
  line23a:p3("f3_27"),line23a1:p3("f3_30"),line23a2:p3("f3_32"),line23b:p3("f3_33"),line23c:p3("f3_34"),line23d:p3("f3_35"),
  line24a:p3("f3_36"),line24b:p3("f3_39"),line24c:p3("f3_40"),line24d:p3("f3_41"),line25c:p3("f3_49"),line25e:p3("f3_52"),
  line26b:p4("f4_01"),line26c:p4("f4_02"),line27:p4("f4_03"),line28:p4("f4_04"),
  line29a:p4("f4_05"),line29b:p4("f4_08"),line29c:p4("f4_09"),line29d:p4("f4_12"),line29e:p4("f4_13"),line29f:p4("f4_16"),
  line29g:p4("f4_17"),line29h:p4("f4_18"),line30:p4("f4_19"),line31:p4("f4_20"),line32:p4("f4_21"),
  doorQmids:[qmid(2,"Ln19b","f2_11"),qmid(2,"Ln19i","f2_15"),qmid(2,"Ln19ii","f2_18")],
  windowQmids:[qmid(2,"Ln20i","f2_26"),qmid(2,"Ln20ii","f2_29"),qmid(2,"Ln20iii","f2_32"),qmid(2,"Ln20iv","f2_35")],
  acQmid:qmid(3,"Ln_22a","f3_22"),waterHeaterQmids:[qmid(3,"Ln23ai","f3_28"),qmid(3,"Ln23aii","f3_30")],furnaceQmid:qmid(3,"Ln_24a","f3_37"),
  panelQmids:[qmid(3,"","f3_50"),qmid(3,"","f3_51","Box2-4")],heatPumpQmid:qmid(4,"Ln_29a","f4_06"),heatPumpWaterQmid:qmid(4,"Ln_29c","f4_10"),biomassQmid:qmid(4,"Ln_29e","f4_14"),
} as const;
const F=FORM_5695_FIELDS;

type Item = ResolvedEnergyImprovement | ResolvedCleanEnergyProperty;
type Home = EnergySourceFactsResult["homes"][number];
const numericEntries = Object.entries(F).filter(([key]) => /^line\d/.test(key)) as Array<[string, string]>;
const auditId = (key: string) => key.slice(4).replace(/^(19d|20a|23a)(\d)$/, "$1-$2");
function auditReader(lines: CalculatedLine[], form = "Form 5695") {
  return (line: string): Decimal => {
    const matches = lines.filter(entry => entry.form === form && entry.line === line);
    if (matches.length !== 1 || !matches[0].value.isFinite()) throw new Error(`Missing, duplicate or invalid ${form} audit entry ${line}`);
    return matches[0].value;
  };
}
function answer(form: PDFForm, page: number, name: string, value: boolean | undefined) {
  for (const index of [0, 1]) setCheckBox(form, `topmostSubform[0].Page${page}[0].${name}[${index}]`, value === (index === 0));
}
function allAnswers(values: Array<boolean | undefined>): boolean | undefined {
  if (!values.length) return undefined;
  if (values.includes(false)) return false;
  return values.every(value => value === true) ? true : undefined;
}
function anyAnswer(values: Array<boolean | undefined>): boolean | undefined {
  if (!values.length) return undefined;
  if (values.includes(true)) return true;
  return values.every(value => value === false) ? false : undefined;
}
function address(form: PDFForm, paths: string[], home?: Home) {
  const value = home?.address;
  for (const [index, key] of (["street", "unit", "city", "state", "zip"] as const).entries()) setTextField(form, paths[index], value?.[key] ?? "");
}
function homeByCost(items: Item[]): Home | undefined {
  const totals = new Map<string, { home: Home; cost: Decimal }>();
  for (const item of items) totals.set(item.homeId, { home: item.home, cost: (totals.get(item.homeId)?.cost ?? new Decimal(0)).plus(item.qualifiedCost) });
  return [...totals.values()].sort((a, b) => b.cost.comparedTo(a.cost))[0]?.home;
}
function physicalItems<T extends Item>(items: T[]): T[] {
  const eligible = items.filter(item => item.eligible);
  // Answers describe the claimed property. Excluded records remain explicit in
  // the source statement, and do not turn a valid property's answer into false.
  return eligible.length ? eligible : items.filter(item => item.effectiveDate.startsWith("2025-"));
}
function mainHome(item: Item, joint: boolean): boolean {
  const home = item.home;
  return home.locatedInUnitedStates === true && home.usedAsResidence === true &&
    (home.mainHomeFor === "primary" || home.mainHomeFor === "both" || (joint && home.mainHomeFor === "spouse")) &&
    (home.mainHomeStartDate === undefined || (item.installationCompletedDate >= home.mainHomeStartDate && item.installationCompletedDate <= (home.mainHomeEndDate ?? "")));
}

function fillPartII(doc: PDFDocument, items: ResolvedEnergyImprovement[], audited: (line: string) => Decimal, joint: boolean, final: boolean) {
  const form = doc.getForm();
  for (const [key, path] of numericEntries) if (Number.parseInt(auditId(key), 10) >= 18 && (final || Number.parseInt(auditId(key), 10) <= 30)) setCurrencyField(form, path, audited(auditId(key)));
  const envelope = physicalItems(items.filter(item => ["insulation", "exterior_door", "windows_skylights"].includes(item.category)));
  answer(form, 2, "c2_1", allAnswers(envelope.map(item => mainHome(item, joint))));
  answer(form, 2, "c2_2", allAnswers(envelope.map(item => item.originalUseByTaxpayer)));
  answer(form, 2, "c2_3", allAnswers(envelope.map(item => item.expectedFiveYearUse)));
  answer(form, 2, "c2_4", anyAnswer(envelope.map(item => item.newConstruction)));
  address(form, [3, 4, 5, 6, 7].map(index => p2(`f2_${String(index).padStart(2, "0")}`)), homeByCost(envelope));
  const property = physicalItems(items.filter(item => !["insulation", "exterior_door", "windows_skylights", "home_energy_audit"].includes(item.category)));
  answer(form, 3, "c3_1", allAnswers(property.map(item => item.home.locatedInUnitedStates === true && item.home.usedAsResidence === true)));
  answer(form, 3, "c3_2", allAnswers(property.map(item => item.originalUseByTaxpayer)));
  const homes = [...new Map(property.map(item => [item.homeId, item.home])).values()];
  for (let row = 0; row < 4; row++) address(form, Array.from({ length: 5 }, (_, column) =>
    `topmostSubform[0].Page3[0].Table_Line21c[0].Row${row + 1}[0].f3_${String(row * 5 + column + 1).padStart(2, "0")}[0]`), homes[row]);
  const qualifiedItems = (category: string) => items.filter(item => item.category === category && item.eligible).sort((a, b) => new Decimal(b.qualifiedCost).comparedTo(a.qualifiedCost));
  for (const [category, paths] of [
    ["exterior_door", F.doorQmids], ["windows_skylights", F.windowQmids], ["central_ac", [F.acQmid]],
    ["gas_water_heater", F.waterHeaterQmids], ["furnace_boiler", [F.furnaceQmid]], ["electrical_panel", F.panelQmids],
    ["heat_pump", [F.heatPumpQmid]], ["heat_pump_water_heater", [F.heatPumpWaterQmid]], ["biomass", [F.biomassQmid]],
  ] as const) {
    const entries = qualifiedItems(category);
    for (const [index, path] of paths.entries()) setTextField(form, path, entries[index]?.manufacturerQualifiedId ?? "");
  }
  const panels = qualifiedItems("electrical_panel");
  answer(form, 3, "c3_4", panels.length ? true : physicalItems(items.filter(item => item.category === "electrical_panel")).length ? false : undefined);
  const codes = [...new Set(panels.flatMap(panel => (panel.enabledPropertyIds ?? []).flatMap(id => {
    const target = items.find(item => item.sourceId === id && item.eligible);
    return target && target.category in ENERGY_PANEL_CODES ? [ENERGY_PANEL_CODES[target.category as keyof typeof ENERGY_PANEL_CODES]] : [];
  })))].sort();
  for (let index = 0; index < 7; index++) setTextField(form, p3(`f3_${42 + index}`), codes[index] ?? "");
  const audits = physicalItems(items.filter(item => item.category === "home_energy_audit"));
  answer(form, 4, "c4_1", allAnswers(audits.map(item => mainHome(item, joint) && item.auditReportCertified === true)));
  setCheckBox(form, p4("c4_2"), items.some(item => item.eligible && item.home.jointOccupancyWithOtherReturn));
  setCheckBox(form, p4("c4_3"), items.some(item => item.eligible && item.associationCostShare));
}

/** Preserve the additional PartII field graph rather than flattening its data. */
async function appendPartII(target: PDFDocument, source: PDFDocument, owner: string) {
  // pdf-lib retains its previously populated page cache after removePage().
  // Capture the intended pages before removing the unused PartI page.
  const partIIPages = source.getPages().slice(1);
  source.getForm().updateFieldAppearances();
  for (const field of source.getForm().getFields()) if (field.getName().includes(".Page1[0].")) source.getForm().removeField(field);
  source.removePage(0);
  const roots = source.getForm().acroForm.getFields();
  for (const [field] of roots) field.setPartialName(`${owner}_Form5695`);
  source.getForm().updateFieldAppearances(); await source.flush();
  const copier = PDFObjectCopier.for(source.context, target.context);
  for (const [, ref] of roots) target.getForm().acroForm.addField(copier.copy(ref));
  for (const page of partIIPages) {
    const ref = copier.copy(page.ref); const node = target.context.lookup(ref);
    if (!(node instanceof PDFPageLeaf)) throw new Error("Copied Form5695 PartII page is invalid");
    target.addPage(PDFPage.of(node, ref, target));
  }
}

export async function fillForm5695(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string): Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const source = input.energyCredits; const calculation = result.form5695;
  if (!source || !calculation) throw new Error("Form 5695 review requires energy source facts and its calculation audit");
  if (calculation.sourceFactsVerified !== true || calculation.taxYear !== 2025) throw new Error("Form 5695 requires verified actual source facts; reconcile legacy records first");
  const resolved = calculateEnergySourceFacts(source, { taxYear: 2025, filingStatus: input.taxpayer.filingStatus });
  if (JSON.stringify(resolved.sourceBindings) !== JSON.stringify(calculation.sourceBindings)) throw new Error("Form5695 source binding changed after calculation");
  const audited = auditReader(calculation.lines); const sourceAudit = auditReader(calculation.lines, "Form 5695 Source");
  if (!sourceAudit("verified").eq(1)) throw new Error("Form5695 verified source audit is missing");
  for (const item of [...resolved.cleanProperties, ...resolved.improvements]) {
    if (!sourceAudit(`${item.sourceId}:cost`).eq(item.qualifiedCost)) throw new Error("Form5695 source cost differs from its audit");
    if (item.home.jointOccupancyWithOtherReturn && !sourceAudit(`${item.sourceId}:all-occupants`).eq(item.allOccupantsCost)) throw new Error("Form5695 joint source costs differ from their audit");
    if ("allocatedCost" in item && !sourceAudit(`${item.sourceId}:allocated`).eq(item.allocatedCost)) throw new Error("Form5695 allocated source cost differs from its audit");
  }
  for (const [key] of numericEntries) audited(auditId(key));
  if (!audited("15").eq(calculation.residentialCleanEnergyCredit) || !audited("32").eq(calculation.energyImprovementCredit)) throw new Error("Form 5695 audit disagrees with allowed credit totals");
  if (!calculation.priorYearCarryforward.eq(source.priorYearCarryforward ?? "NaN") || !audited("12").eq(calculation.priorYearCarryforward.toDecimalPlaces(0, Decimal.ROUND_HALF_UP))) throw new Error("Form5695 source carryforward differs from its audit");
  const groups = calculation.improvementHomes;
  const actualGroups = new Map<string, ResolvedEnergyImprovement[]>();
  for (const item of resolved.improvements) {
    const id = resolved.separateSpousalMainHomes ? item.home.owner ?? "unknown" : "return";
    actualGroups.set(id, [...(actualGroups.get(id) ?? []), item]);
  }
  if (!groups || groups.length !== actualGroups.size || new Set(groups.map(group => group.groupId)).size !== groups.length) throw new Error("Form5695 per-home source worksheets are missing or duplicated");
  let combined = new Decimal(0);
  for (const [index, group] of groups.entries()) {
    const items = actualGroups.get(group.groupId);
    if (!items || JSON.stringify([...new Set(items.map(item => item.homeId))]) !== JSON.stringify(group.homeIds)) throw new Error("Form5695 worksheet home source binding differs");
    const groupAudit = auditReader(group.lines);
    for (const [key] of numericEntries) if (Number.parseInt(auditId(key), 10) >= 18) {
      const value = groupAudit(auditId(key));
      if (index === 0 && Number.parseInt(auditId(key), 10) < 30 && !value.eq(audited(auditId(key)))) throw new Error("Form5695 first home audit differs from the printed return");
    }
    if (!groupAudit("30").eq(group.creditBeforeTaxLimit)) throw new Error("Form5695 home tentative credit differs from its audit");
    combined = combined.plus(group.creditBeforeTaxLimit);
  }
  if (!combined.eq(audited("30")) || !Decimal.min(combined, audited("31")).eq(audited("32"))) throw new Error("Form5695 combined home audits differ from the allowed credit");
  const doc = await loadReviewTemplate(blankPdfPath, 2025); const form = doc.getForm();
  const name = input.taxpayer.spouse ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}` : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  const fillIdentity = (doc: PDFDocument) => {
    for (const nameField of [F.name, F.name2]) setTextField(doc.getForm(), nameField, name);
    for (const ssnField of [F.ssn, F.ssn2]) setTextField(doc.getForm(), ssnField, input.taxpayer.primary.ssn.replace(/-/g, ""));
  };
  fillIdentity(doc);
  for (const [key, path] of numericEntries) if (Number.parseInt(auditId(key), 10) < 18) setCurrencyField(form, path, audited(auditId(key)));
  const capacity = audited("10-capacity");
  if (capacity.gt(0)) { const [whole, fraction = "0"] = capacity.toFixed().split("."); setTextField(form, F.capacityInteger, whole); setTextField(form, F.capacityFraction, fraction); }
  const clean = resolved.cleanProperties.filter(item => item.eligible && item.category !== "fuel_cell");
  address(form, [3, 4, 5, 6, 7].map(index => p1(`f1_${String(index).padStart(2, "0")}`)), homeByCost(clean));
  const batteries = physicalItems(resolved.cleanProperties.filter(item => item.category === "battery"));
  answer(form, 1, "c1_1", allAnswers(batteries.map(item => item.batteryKilowattHours === undefined ? undefined : new Decimal(item.batteryKilowattHours).gte(3))));
  const fuels = physicalItems(resolved.cleanProperties.filter(item => item.category === "fuel_cell"));
  const joint = input.taxpayer.filingStatus === "married_filing_jointly";
  answer(form, 1, "c1_2", allAnswers(fuels.map(item => mainHome(item, joint))));
  const eligibleFuels = fuels.filter(item => item.eligible);
  address(form, [15, 16, 17, 18, 19].map(index => p1(`f1_${index}`)), eligibleFuels.find(item => item.home.mainHomeFor === "primary" || item.home.mainHomeFor === "both")?.home ?? eligibleFuels[0]?.home);
  setCheckBox(form, p1("c1_3"), eligibleFuels.some(item => item.home.jointOccupancyWithOtherReturn));
  const firstItems = groups[0] ? actualGroups.get(groups[0].groupId) ?? [] : [];
  fillPartII(doc, firstItems, audited, joint, true);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  if (resolved.separateSpousalMainHomes && groups.length > 1) doc.getPage(3).drawText("More than one main home", { x: 285, y: 392, size: 8, font });
  for (const group of groups.slice(1)) {
    const additional = await loadReviewTemplate(blankPdfPath, 2025); fillIdentity(additional);
    fillPartII(additional, actualGroups.get(group.groupId) ?? [], auditReader(group.lines), joint, false);
    await appendPartII(doc, additional, group.groupId);
  }
  let page = doc.addPage(); let y = page.getHeight() - 40;
  const write = (text: string) => {
    for (const line of text.match(/.{1,96}(?:\s|$)|.{1,96}/g) ?? [text]) {
      if (y < 48) { page = doc.addPage(); y = page.getHeight() - 40; }
      page.drawText(line.trim(), { x: 32, y, size: 9, font }); y -= 15;
    }
  };
  write("FORM 5695 - ACTUAL SOURCE AND ALLOCATION STATEMENT");
  write("Monetary form fields copy persisted calculation audits. Source verification is local;");
  write("independent filing qualification remains pending. Excluded records below are not claimed.");
  for (const home of resolved.homes) {
    write(`Home ${home.id}: ${home.address.street}, ${home.address.unit ?? ""} ${home.address.city}, ${home.address.state} ${home.address.zip}. Owner: ${home.owner}; main home for: ${home.mainHomeFor}.`);
    if (home.mainHomeStartDate) write(`Actual main-home period: ${home.mainHomeStartDate} through ${home.mainHomeEndDate}.`);
  }
  for (const item of [...resolved.cleanProperties, ...resolved.improvements]) {
    write(`${item.sourceId}: ${item.category}; home ${item.homeId}; actual net cost $${new Decimal(item.qualifiedCost).toFixed(2)}; completed ${item.installationCompletedDate}; effective year ${item.effectiveDate.slice(0, 4)}; ${item.eligible ? "eligible" : "ineligible or outside this tax year"}.`);
    if ("manufacturerQualifiedId" in item && item.manufacturerQualifiedId) write(`Manufacturer qualified ID: ${item.manufacturerQualifiedId}.`);
    if (item.home.jointOccupancyWithOtherReturn) write(`Joint allocation: taxpayer $${new Decimal(item.qualifiedCost).toFixed(2)} / all occupants $${item.allOccupantsCost.toFixed(2)}; corresponding category cap and actual line27 annual trigger apply.`);
    if ("allocatedCost" in item && item.category === "fuel_cell") write(`Fuel-cell actual capacity ${item.fuelCellKilowattCapacity} kW; cost after applicable joint allocation $${item.allocatedCost.toFixed(2)}.`);
    if (item.associationCostShare && item.associationAllocation) {
      const allocation = item.associationAllocation;
      write(`Association allocation: $${allocation.totalQualifiedCost} x ${allocation.numerator}/${allocation.denominator} = taxpayer $${new Decimal(item.qualifiedCost).toFixed(2)}. Source: ${allocation.sourceReference}.`);
    }
    if ("enabledPropertyIds" in item && item.category === "electrical_panel") write(`Panel enabled property: ${(item.enabledPropertyIds ?? []).join(", ")}; actual load ${item.panelLoadAmps ?? "not supplied"} amps; code compliance ${String(item.panelCodeComplianceConfirmed ?? "not supplied")}; consecutive-year election ${String(item.consecutiveYearElection ?? "not supplied")}; prior credit claimed ${String(item.priorYearCreditClaimed ?? "not supplied")}.`);
  }
  for (const group of groups) {
    write(`PartII worksheet ${group.groupId}; homes ${group.homeIds.join(", ")}; audited line30 $${group.creditBeforeTaxLimit.toFixed(2)}.`);
    if ((actualGroups.get(group.groupId) ?? []).some(item => item.eligible && item.home.jointOccupancyWithOtherReturn)) for (const line of ["18b", "19c", "19h", "20d", "22d", "23d", "24d", "25e", "26c", "27", "28", "29h"]) write(`Joint allocation result, line${line}: $${auditReader(group.lines)(line).toFixed(2)}.`);
  }
  write(`Prior carryforward $${calculation.priorYearCarryforward.toFixed(2)} from ${source.carryforwardSourceTaxYear}; confirmed ${String(source.carryforwardConfirmed)}.`);
  write(`Disallowed costs $${calculation.disallowedNewEnergyCosts.toFixed(2)}. Clean credit carried to ${calculation.carryforwardTaxYear}: $${calculation.residentialCleanEnergyCarryforward.toFixed(2)}.`);
  await markReviewPdf(doc);
  return doc;
}
