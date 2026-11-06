import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";

describe("review-copy identifiers", () => {
  it("removes taxpayer last-four source identifiers without changing original histories", () => {
    const source = {
      charitableCarryoverSources: { primaryTaxpayerIdLast4: "8384", spouseTaxpayerIdLast4: "9192", vintages: [{ openingCarryforward: "1000.25" }] },
      netOperatingLoss: { primaryTaxpayerIdLast4: "8384", spouseTaxpayerIdLast4: "9192", vintages: [{ originalLoss: "12500.01" }] },
    };
    const original = JSON.stringify(source);
    const review = redactReviewIdentifiers(source);
    for (const packet of [review.charitableCarryoverSources, review.netOperatingLoss]) {
      expect(packet.primaryTaxpayerIdLast4).toBe(""); expect(packet.spouseTaxpayerIdLast4).toBe("");
    }
    expect(JSON.stringify(review)).not.toMatch(/8384|9192/);
    expect(review.charitableCarryoverSources.vintages[0].openingCarryforward).toBe("1000.25");
    expect(review.netOperatingLoss.vintages[0].originalLoss).toBe("12500.01");
    expect(JSON.stringify(source)).toBe(original);
  });
  it("redacts actual account references from review copies without altering source records", () => {
    const actual = { form1099R: [{ accountReference: "Actual account 123456789", taxableAmount: "10000.25" }], form8960Sources: { annuities: [{ accountReference: "Actual account 123456789", sourceId: "form1099R:0" }] } };
    const backup = JSON.stringify(actual);
    const review = redactReviewIdentifiers(actual);
    expect(review.form1099R[0].accountReference).toBe("");
    expect(review.form8960Sources.annuities[0].accountReference).toBe("");
    expect(JSON.stringify(review)).not.toContain("Actual account 123456789");
    expect(review.form1099R[0].taxableAmount).toBe("10000.25");
    expect(review.form8960Sources.annuities[0].sourceId).toBe("form1099R:0");
    expect(JSON.stringify(actual)).toBe(backup);
  });
  it("removes person and ambiguous payer TIN fields across nested inputs and calculated state records", () => {
    const source = {
      taxpayer: { primary: { ssn: "111-22-3333", employmentValidSsnIssuedByDueDate: true } },
      educationExpenses: { aocStudents: [{ studentTaxId: "444556666", studentTinEligible: false }] },
      adoptions: [{ childIdentifyingNumber: "777-88-9999" }],
      form1099Q: [{ beneficiarySSN: "222-33-4444" }],
      adjustments: { alimonyRecipientSSN: "333-44-5555" },
      stateReturns: { illinois: { students: [{ studentSSN: "555-66-7777" }] } },
      form1099Int: [{ payerTin: "666778888" }],
      form1099B: [{ brokerTin: "888990000" }],
      absent: undefined, empty: null,
    };
    const original = JSON.stringify(source);
    const review = redactReviewIdentifiers(source);
    for (const identifier of ["111-22-3333", "444556666", "777-88-9999", "222-33-4444", "333-44-5555", "555-66-7777", "666778888", "888990000"]) expect(JSON.stringify(review)).not.toContain(identifier);
    expect(review.taxpayer.primary.employmentValidSsnIssuedByDueDate).toBe(true);
    expect(review.educationExpenses.aocStudents[0].studentTinEligible).toBe(false);
    expect(JSON.stringify(source)).toBe(original);
    expect(review.absent).toBeUndefined(); expect(review.empty).toBeNull();
  });
  it("preserves exact Decimal audits, money strings, actual zero and explicit institution EINs", () => {
    const amount = new Decimal("0.0000006");
    const source = { value: amount, inputs: { wages: "9007199254740993.01", zero: "0" }, institutions: [{ ein: "12-3456789" }] };
    const review = redactReviewIdentifiers(source);
    expect(review.value).toBeInstanceOf(Decimal);
    expect(review.value.toFixed()).toBe("0.0000006");
    expect(review.inputs).toEqual(source.inputs);
    expect(review.institutions).toEqual(source.institutions);
  });
});
