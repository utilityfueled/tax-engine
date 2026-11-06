/** Spec: state/oh-sd-100-resident-income.yaml; source originals precede product. */
import { expect, it } from "vitest";
import { calculateOhioSDResidentIncome, type OhioSDResidentIncomeInput } from "@/engine/state/oh-sd-100-resident-income.js";
import { ohioSDResidentIncomeOriginals as originals } from "../../fixtures/oh-sd-resident-income.js";

// Published amounts plus explicitly synthetic prior-district calendar; not an
// assertion of missing published annual wages or pre-move district facts.
const exampleInput = { ...originals.published, residency: originals.syntheticSameMoveCalendar };

it("OH SD resident income reproduces published Eric Angela mixed allocation", () => {
  const input = structuredClone(exampleInput);
  const before = structuredClone(input);
  const result = calculateOhioSDResidentIncome(input);
  expect(result.residentDays).toBe(214);
  expect(result.residencyFactor.toString()).toBe("0.5863");
  expect([result.line29, result.line30, result.line31, result.line32, result.line33].map(v => v.toString())).toEqual(["58000", "52181", "110181", "104904", "104904"]);
  expect(result.line32.toString()).not.toBe("97326");
  expect(input).toEqual(before);
  expect(input.wages.annual.status).toBe("not-provided");
  expect(input.magiComponents[1].allocation.annual.amount).toBe("4000");
});

it("OH SD resident income derives actual owner residency without factor override", () => {
  const supplied = { ...exampleInput, residencyFactor: "1" };
  expect(() => calculateOhioSDResidentIncome(supplied)).toThrow(/factor|override/i);
  const reversed = { ...exampleInput, residency: [...exampleInput.residency].reverse().map(owner => ({ ...owner, periods: [...owner.periods].reverse() })) };
  expect(calculateOhioSDResidentIncome(reversed).residencyFactor.toString()).toBe("0.5863");
  expect(reversed.residency[0]?.periods[0]?.from).toBe("2025-06-01");
});

it("OH SD resident income retains resident SE losses before earned-income floor", () => {
  const input = { ...exampleInput, selfEmployment: { owner: "spouse", method: "specific", residentAmount: "-60000", annual: { status: "known", amount: "-70000" } } } as const;
  const result = calculateOhioSDResidentIncome(input);
  expect(result.line30.toString()).toBe("-60000");
  expect([result.line31, result.line32, result.line33].map(v => v.toString())).toEqual(["0", "0", "0"]);
});

it("OH SD resident income uses identified MAGI changes and annual cap", () => {
  expect(calculateOhioSDResidentIncome({ ...exampleInput, annualMAGI: "100000" }).line32.toString()).toBe("100000");
  const input = { ...exampleInput, magiComponents: [
    { id: "resident-adjustment", sign: "subtract", allocation: { owner: "joint", method: "specific", residentAmount: "1000", annual: { status: "known", amount: "9000" } } },
  ] } as const;
  expect(calculateOhioSDResidentIncome(input).line32.toString()).toBe("109181");
});

it("OH SD resident income guards incomplete overlapping and invalid actual timelines", () => {
  const base = structuredClone(exampleInput);
  const bad = [
    { ...base, residency: base.residency.slice(0, 1) },
    { ...base, residency: base.residency.map(owner => ({ ...owner, periods: owner.periods.slice(1) })) },
    { ...base, residency: base.residency.map(owner => ({ ...owner, periods: [{ ...owner.periods[0], through: "2025-06-01" }, owner.periods[1]] })) },
    { ...base, residency: base.residency.map(owner => ({ ...owner, periods: [{ ...owner.periods[0], through: "2025-02-30" }, owner.periods[1]] })) },
    { ...base, residency: [base.residency[0], base.residency[0]] },
    { ...base, districtCode: "9999" },
    { ...base, taxYear: 2026 },
  ];
  for (const raw of bad) expect(() => calculateOhioSDResidentIncome(raw as OhioSDResidentIncomeInput)).toThrow();
});

it("OH SD resident income refuses differing joint actual residency methods", () => {
  const input = { ...exampleInput, residency: [exampleInput.residency[0], { owner: "spouse", periods: [
    { from: "2025-01-01", through: "2025-06-30", districtCode: "9999" },
    { from: "2025-07-01", through: "2025-12-31", districtCode: "3907" },
  ] }] } as const;
  expect(() => calculateOhioSDResidentIncome(input)).toThrow(/joint|different|method/i);
});

it("OH SD resident income requires explicit allocation evidence and source ownership", () => {
  const bad: unknown[] = [
    { ...exampleInput, wages: { owner: "primary", method: "unknown" } },
    { ...exampleInput, wages: { owner: "primary", method: "specific", residentAmount: "58000" } },
    { ...exampleInput, selfEmployment: { owner: "spouse", method: "prorated", annualAmount: "89000" } },
    { ...exampleInput, selfEmployment: { owner: "spouse", method: "prorated", annualAmount: "89000", specificIdentification: "available" } },
    { ...exampleInput, selfEmployment: { owner: "spouse", method: "prorated", annualAmount: "89000", specificIdentification: "unavailable", residentAmount: "50000" } },
    { ...exampleInput, wages: { owner: "primary", method: "specific", residentAmount: "58000", annual: { status: "known", amount: "57000" } } },
    { ...exampleInput, wages: { ...exampleInput.wages, residentAmount: "58000.01" } },
    { ...exampleInput, wages: { ...exampleInput.wages, residentAmount: "-1" } },
    { ...exampleInput, annualMAGI: "NaN" },
    { ...exampleInput, annualMAGI: 166000 },
    { ...exampleInput, magiComponents: [exampleInput.magiComponents[0], exampleInput.magiComponents[0]] },
    { ...exampleInput, filingStatus: "single", residency: [exampleInput.residency[0]] },
  ];
  for (const raw of bad) expect(() => calculateOhioSDResidentIncome(raw as OhioSDResidentIncomeInput)).toThrow();
});

it("OH SD resident income handles actual full-year and zero-resident calendars", () => {
  const full = { ...exampleInput, magiComponents: [exampleInput.magiComponents[0], { ...exampleInput.magiComponents[1], allocation: { ...exampleInput.magiComponents[1].allocation, residentAmount: "4000" } }], residency: exampleInput.residency.map(owner => ({ owner: owner.owner, periods: [{ from: "2025-01-01", through: "2025-12-31", districtCode: "3907" }] })) };
  const result = calculateOhioSDResidentIncome(full);
  expect(result.residencyFactor.toString()).toBe("1");
  expect(result.line30.toString()).toBe("89000");
  // Printed full-year line32 is the actual line3 amount, not a reconstructed
  // partial-year component total or an inferred annual wage amount.
  expect(result.line32.toString()).toBe("166000");
  expect(result.line33.toString()).toBe("147000");
  expect(() => calculateOhioSDResidentIncome({ ...full, magiComponents: exampleInput.magiComponents })).toThrow(/full.year|annual|resident/i);
  const none = { ...exampleInput, residency: exampleInput.residency.map(owner => ({ owner: owner.owner, periods: [{ from: "2025-01-01", through: "2025-12-31", districtCode: "9999" }] })) };
  expect(() => calculateOhioSDResidentIncome(none)).toThrow(/resident|zero|contradict/i);
  const actualZero = calculateOhioSDResidentIncome({ ...none, wages: { owner: "primary", method: "prorated", annualAmount: "100000", specificIdentification: "unavailable" } });
  expect(actualZero.residentDays).toBe(0);
  expect([actualZero.line29, actualZero.line30, actualZero.line31, actualZero.line32, actualZero.line33].map(v => v.toString())).toEqual(["0", "0", "0", "0", "0"]);
});

it("OH SD resident income gives a one-day actual factor before monetary proration", () => {
  const input = { ...exampleInput, wages: { owner: "primary", method: "prorated", annualAmount: "100000", specificIdentification: "unavailable" }, selfEmployment: { owner: "spouse", method: "prorated", annualAmount: "0", specificIdentification: "unavailable" }, magiComponents: [], residency: exampleInput.residency.map(owner => ({ owner: owner.owner, periods: [
    { from: "2025-01-01", through: "2025-12-30", districtCode: "9999" },
    { from: "2025-12-31", through: "2025-12-31", districtCode: "3907" },
  ] })) } as const;
  const result = calculateOhioSDResidentIncome(input);
  expect(result.residencyFactor.toString()).toBe("0.0027");
  expect(result.line29.toString()).toBe("270");
});

it("OH SD resident income audit omits private source identities", () => {
  const input = { ...exampleInput, magiComponents: exampleInput.magiComponents.map(item => ({ ...item, id: `private-source-${item.id}` })) };
  const result = calculateOhioSDResidentIncome(input);
  expect(result.lines.length).toBeGreaterThanOrEqual(5);
  expect(JSON.stringify(result.lines)).not.toContain("private-source-");
  expect(result.line33.toString()).toBe("104904");
});

it("OH SD resident income uses only actual primary ownership on nonjoint returns", () => {
  for (const filingStatus of ["single", "married_filing_separately", "head_of_household", "qualifying_surviving_spouse"] as const) {
    const input = { ...exampleInput, filingStatus, residency: [exampleInput.residency[0]], selfEmployment: { owner: "primary", method: "specific", residentAmount: "0", annual: { status: "known", amount: "0" } }, magiComponents: [] } as const;
    expect(calculateOhioSDResidentIncome(input).line33.toString()).toBe("58000");
  }
});
