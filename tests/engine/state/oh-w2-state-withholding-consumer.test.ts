import { actualOidStateSource } from '../../fixtures/investment-source-year-oh-oid.js';
/** Spec: state/oh-w2-state-withholding-consumer.yaml; originals before outputs. */
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildOhioResidentReturnInput, extractOhioWithholding } from "@/engine/state/oh-input-adapter.js";
import { buildOhioPaymentSource } from "@/engine/state/oh-payment-source.js";
import { calculateOhioResidentReturn } from "@/engine/state/oh-return.js";
import { ohioActualW2WithholdingFixture, ohioConsumerW2, ohioConsumerPacket, rebindOhioConsumerOuter, rebindOhioConsumerW2, unusedOhioConsumerScalars } from "../../fixtures/oh-w2-state-withholding-consumer.js";

it("OH actual W2 consumer selects second OH row without duplicating the federal original", () => {
  const input = ohioActualW2WithholdingFixture();
  const before = structuredClone(input);
  const federal = calculateFederalTax(input);
  expect(federal.totalWages.toString()).toBe("100000");
  const adapted = buildOhioResidentReturnInput(input, federal);
  expect(adapted.ohioWithholding?.toString()).toBe("1000");
  expect(input.w2s.length).toBe(1);
  expect(ohioConsumerW2(input).stateTaxWithheld).toBe("1535");
  expect(input).toEqual(before);
});

it("OH actual W2 consumer excludes matching OH scalar projection from the actual row total", () => {
  const input = ohioActualW2WithholdingFixture();
  const packet = ohioConsumerPacket(input);
  packet.stateRows.reverse();
  packet.stateRows.forEach((row, i) => { row.printedRow = i + 1; });
  Object.assign(ohioConsumerW2(input), { state: "OH", stateTaxWithheld: "1000" });
  rebindOhioConsumerW2(input);
  expect(buildOhioResidentReturnInput(input, calculateFederalTax(input)).ohioWithholding?.toString()).toBe("1000");
});

it("OH actual W2 consumer admits explicit unused scalars with complete actual rows", () => {
  const input = ohioActualW2WithholdingFixture();
  unusedOhioConsumerScalars(input);
  expect(ohioConsumerW2(input).stateTaxWithheld).toBeUndefined();
  expect(buildOhioPaymentSource(input, input.ohioPayments).estimatedPayments.toString()).toBe("0");
  expect(buildOhioResidentReturnInput(input, calculateFederalTax(input)).ohioWithholding?.toString()).toBe("1000");
});

it("OH actual W2 consumer distinguishes known OH zero and known no OH row", () => {
  const input = ohioActualW2WithholdingFixture("0");
  expect(buildOhioResidentReturnInput(input, calculateFederalTax(input)).ohioWithholding?.toString()).toBe("0");
  const packet = ohioConsumerPacket(input);
  packet.stateRows = packet.stateRows.filter(row => row.state === "PA");
  packet.stateReporting = "single";
  rebindOhioConsumerOuter(input);
  expect(buildOhioResidentReturnInput(input, calculateFederalTax(input)).ohioWithholding?.toString()).toBe("0");
});

it("OH actual W2 consumer rejects unknown or contradictory canonical originals at payment source admission", () => {
  const mutations = ["unknownAmount", "wrongYear", "wrongOwner", "wrongOriginal", "unconfirmed", "repeatedOH", "missingStatementYear", "missingStatementOwner", "duplicateEconomicW2"] as const;
  for (const kind of mutations) {
    const input = ohioActualW2WithholdingFixture();
    const packet = ohioConsumerPacket(input);
    const w2 = ohioConsumerW2(input);
    const ohio = packet.stateRows.find(row => row.state === "OH");
    if (!ohio) throw new Error("Synthetic actual Ohio printed row required");
    if (kind === "unknownAmount") ohio.withheld = "";
    if (kind === "wrongYear") packet.sourceTaxYear = 2024;
    if (kind === "wrongOwner") packet.owner.originalTaxpayer = { firstName: "Different", lastName: "Original", ssn: "900-70-0999" };
    if (kind === "wrongOriginal") packet.originalW2 = { ...packet.originalW2, employer: { name: "Different actual employer", ein: "99-9999999" } };
    if (kind === "unconfirmed") packet.sourceFactsConfirmed = false;
    if (kind === "repeatedOH") packet.stateRows = [{ ...ohio, printedRow: 1 }, { ...ohio, printedRow: 2, sourceReference: "renamed duplicate" }];
    if (kind === "missingStatementYear") delete w2.taxYear;
    if (kind === "missingStatementOwner") delete w2.accountHolder;
    if (kind === "duplicateEconomicW2") input.w2s.push(structuredClone(w2));
    rebindOhioConsumerOuter(input);
    expect(() => buildOhioPaymentSource(input, input.ohioPayments), kind).toThrow(/actual|source|owner|year|original|amount|withholding/i);
  }
});

it("OH actual W2 consumer preserves every existing nonW2 owner year and withholding guard", () => {
  // Isolated source-metadata probes do not qualify missing income-form facts.
  for (const key of ["formW2G", "form1099G", "form1099K", "form1099R", "form1099Nec", "form1099Misc", "form1099Int", "form1099Div", "form1099B", "form1099OID"] as const) {
    const input = ohioActualW2WithholdingFixture();
    const field = key === "form1099OID" ? "stateWithholding" : "stateWithheld";
    const actualRows = [{ state: "OH", statePayerId: "Synthetic actual OID payerID", stateWithheld: "0" }];
    const row: Record<string, unknown> = key === "form1099OID" ? { ...actualOidStateSource(actualRows) } : { taxYear: 2025, accountHolder: "primary", state: "OH", stateWithheld: "0" };
    (input as unknown as Record<string, unknown>)[key] = [row];
    const bind = () => rebindOhioConsumerOuter(input);
    bind();
    expect(buildOhioPaymentSource(input, input.ohioPayments).estimatedPayments.toString()).toBe("0");
    delete row[field];
    bind();
    expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/withholding/i);
    row[field] = key === "form1099OID" ? structuredClone(actualRows) : "0";
    row.taxYear = 2024;
    bind();
    expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/year/i);
    row.taxYear = 2025;
    row.accountHolder = "spouse";
    bind();
    expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/owner/i);
    row.accountHolder = "primary";
    row[field] = key === "form1099OID" ? [{ ...actualRows[0], stateWithheld: "NaN" }] : "NaN";
    bind();
    expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/withholding/i);
  }
});

it("OH actual W2 consumer preserves source override and local reconciliation gates", () => {
  const input = ohioActualW2WithholdingFixture();
  const federal = calculateFederalTax(input);
  for (const overlay of [{ ohioWithholdingOverride: "0" }, { estimatedPayments: "0" }, { priorYearTaxLiability: "0" }, { computeUnderpaymentPenalty: false }]) expect(() => buildOhioResidentReturnInput(input, federal, overlay)).toThrow(/override|source|payment/i);
  const { ohioResidency: _residency, ohioPayments: _payments, ...withoutPaymentSources } = input;
  expect(() => buildOhioResidentReturnInput(withoutPaymentSources, calculateFederalTax(withoutPaymentSources), { ohioWithholdingOverride: "9999" })).toThrow(/actual|override|source/i);
  const local = ohioActualW2WithholdingFixture();
  unusedOhioConsumerScalars(local);
  const packet = ohioConsumerPacket(local);
  packet.localReporting = "single";
  packet.localRows = [{ printedRow: 1, sourceReference: "PRIVATE-UNRECONCILED-LOCAL", localityNameStatus: "reported", localityName: "Actual unresolved locality", wages: "100000", withheld: "1" }];
  rebindOhioConsumerOuter(local);
  expect(() => buildOhioResidentReturnInput(local, calculateFederalTax(local))).toThrow(/local|district|reconcil/i);
});

it("OH actual W2 consumer requires canonical context rather than the scalar-only extractor", () => {
  const input = ohioActualW2WithholdingFixture();
  expect(() => extractOhioWithholding(input.w2s)).toThrow(/canonical|context|actual/i);
});

it("OH actual W2 consumer retains missing legacy withholding rejection without actual packet", () => {
  const input = ohioActualW2WithholdingFixture();
  const w2 = ohioConsumerW2(input);
  delete w2.stateLocalSources;
  delete w2.stateTaxWithheld;
  rebindOhioConsumerOuter(input);
  expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/withholding/i);
});

it("OH actual W2 consumer feeds existing qualified endpoint balances", () => {
  const input = ohioActualW2WithholdingFixture();
  const result = calculateOhioResidentReturn(buildOhioResidentReturnInput(input, calculateFederalTax(input)));
  expect(result.it1040.line10_taxAfterCredits.toString()).toBe("2323");
  expect(result.it1040.line14_ohioWithholding.toString()).toBe("1000");
  expect(result.itsd2210?.quarters?.map(q => q.interestPenalty.toString())).toEqual(["4", "11", "22", "19"]);
  expect(result.itsd2210?.line17_totalPenalty.toString()).toBe("56");
  expect(result.it1040.line22_totalAmountDue.toString()).toBe("1379");
});

it("OH actual W2 consumer retains exact source cents before reported line14 rounding", () => {
  const input = ohioActualW2WithholdingFixture();
  const ohio = ohioConsumerPacket(input).stateRows.find(row => row.state === "OH");
  if (!ohio) throw new Error("Synthetic actual Ohio printed row required");
  ohio.withheld = "1000.51";
  input.ohioPayments.remainingTaxPayment.amountAppliedToTax = "1322";
  rebindOhioConsumerOuter(input);
  expect(buildOhioResidentReturnInput(input, calculateFederalTax(input)).ohioWithholding?.toString()).toBe("1001");
  expect(ohio.withheld).toBe("1000.51");
});

it("OH actual W2 consumer binds current full private identity without audit leakage", () => {
  const input = ohioActualW2WithholdingFixture();
  const before = buildOhioPaymentSource(input, input.ohioPayments).sourceDigest;
  const ohio = ohioConsumerPacket(input).stateRows.find(row => row.state === "OH");
  if (!ohio) throw new Error("Synthetic actual Ohio printed row required");
  ohio.employerStateID = "PRIVATE-CHANGED-ACTUAL-OH-ID";
  rebindOhioConsumerOuter(input);
  const after = buildOhioPaymentSource(input, input.ohioPayments).sourceDigest;
  expect(after).not.toBe(before);
  const result = calculateOhioResidentReturn(buildOhioResidentReturnInput(input, calculateFederalTax(input)));
  const audit = JSON.stringify(result.lines);
  expect(audit).toContain(after);
  for (const value of [input.taxpayer.primary.ssn, ohio.employerStateID, ohio.sourceReference]) expect(audit).not.toContain(value);
});

it("OH actual W2 source consumer rejects the historical fake scalar OID probe", () => {
  const input = ohioActualW2WithholdingFixture();
  (input as unknown as Record<string, unknown>).form1099OID = [{ taxYear: 2025, accountHolder: "primary", state: "OH", stateWithheld: "0" }];
  rebindOhioConsumerOuter(input);
  expect(() => buildOhioPaymentSource(input, input.ohioPayments)).toThrow(/OID.*withholding/i);
});
