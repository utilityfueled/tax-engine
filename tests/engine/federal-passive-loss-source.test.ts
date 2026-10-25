// Spec: spec/federal/form-8582.yaml return-magi/return-loss-transfer.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const rental = (description: string, rents: string, otherExpenses = "0") => ({
  description, rents, otherExpenses, propertyType: "single_family", rentalDays: 365, personalUseDays: 0, isActiveParticipant: true,
});
const source = (extra: Record<string, unknown>) => TaxYearInputSchema.parse({ ...simpleW2Fixture,
  w2s: [{ ...simpleW2Fixture.w2s[0], wages: "120000", socialSecurityWages: "120000", medicareWages: "120000" }], ...extra });
const line = (result: ReturnType<typeof calculateFederalTax>, id: string) => result.form8582?.lines.find(row => row.form === "Form 8582" && row.line === id)?.value.toString();

it("transfers allowed losses by actual activity index and releases prior losses once", () => {
  const profitableFirst = calculateFederalTax(source({ rentalProperties: [rental("Profit", "10000"), rental("Loss", "0", "40000")] }));
  // Net regular loss30000, MAGI120000, allowance15000 => taxable passive net-15000.
  expect(profitableFirst.form8582?.suspendedLoss.toString()).toBe("15000");
  expect(profitableFirst.agi.toString()).toBe("105000");
  expect(profitableFirst.schedule1?.supplementalIncome.toString()).toBe("-15000");
  const prior = calculateFederalTax(source({ rentalProperties: [rental("Rental", "10000")],
    priorYear: { suspendedPassiveLosses: [{ partnershipName: "Rental", amount: "3000" }] } }));
  expect(prior.form8582?.allowedLoss.toString()).toBe("3000");
  expect(prior.agi.toString()).toBe("127000");
  expect(prior.schedule1?.supplementalIncome.toString()).toBe("7000");
});

it("uses net passive loss and actual line 6 addbacks rather than gross rental losses", () => {
  const mixed = calculateFederalTax(source({ rentalProperties: [rental("Profit", "10000"), rental("Loss", "0", "25000")] }));
  expect(line(mixed, "6")).toBe("120000");
  expect(mixed.form8582?.rentalAllowance.toString()).toBe("15000");
  expect(mixed.agi.toString()).toBe("105000");
  const selfEmployed = calculateFederalTax(source({ w2s: [], form1099Nec: [{ payer: "Actual business", nonemployeeCompensation: "140000", federalWithheld: "30000" }],
    rentalProperties: [rental("Rental", "0", "20000")] }));
  expect(line(selfEmployed, "6")).toBe("140000");
  expect(selfEmployed.form8582?.rentalAllowance.toString()).toBe("5000");
  const retired = calculateFederalTax(source({ w2s: [{ ...simpleW2Fixture.w2s[0], wages: "95000" }],
    formSSA1099: [{ recipient: "primary", netBenefits: "20000", federalWithheld: "0" }],
    rentalProperties: [rental("Rental", "0", "10000")] }));
  expect(retired.socialSecurityBenefitsTaxable.toString()).toBe("17000");
  expect(line(retired, "6")).toBe("95000");
});
