/**
 * Tests for New York IT-201 withholding totals on lines 72 through 74.
 * Spec: spec/state/ny-it201-withholding.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import type { Form1099G, Form1099R, FormW2G, W2 } from "@/models/inputs.js";
import { calculateNYIT201Withholding } from "@/engine/state/ny-it201-withholding.js";

const d = (value: string | number) => new Decimal(value);

function makeW2(overrides: Record<string, unknown> = {}): W2 {
  return {
    employer: {
      name: "Example Employer",
      ein: "12-3456789",
    },
    wages: "1000",
    federalWithheld: "100",
    box12CodeW: "0",
    box12CodeD: "0",
    box12CodeE: "0",
    box12CodeF: "0",
    box12CodeG: "0",
    box12CodeH: "0",
    box12CodeS: "0",
    box12CodeAA: "0",
    box12CodeBB: "0",
    box12CodeEE: "0",
    box12CodeT: "0",
    socialSecurityWages: "0",
    socialSecurityTips: "0",
    socialSecurityWithheld: "0",
    medicareWages: "0",
    medicareWithheld: "0",
    stateTaxWithheld: "0",
    localTaxWithheld: "0",
    stateWages: "0",
    ...overrides,
  } as W2;
}

function make1099R(overrides: Record<string, unknown> = {}): Form1099R {
  return {
    payer: "Example Pension",
    grossDistribution: "1000",
    taxableAmount: "1000",
    federalWithheld: "0",
    employeeContributions: "0",
    eligibleGovernmental457bPlan: false,
    eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "0",
    rothConversionAmount: "0",
    rothContributionOrConversionMadeBefore2021: false,
    qualifiedRothDistribution: false,
    rothIraRolledOverAmount: "0",
    returnedContributionByDueDate: false,
    excessContributionReturnedWithoutEarnings: false,
    qualifiedCharitableDistribution: "0",
    retiredPublicSafetyOfficerInsurancePremiums: "0",
    separationFromServiceAfterAge55ExceptionApplies: false,
    qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: false,
    qualifiedDomesticRelationsOrderExceptionApplies: false,
    terminalIllnessExceptionApplies: false,
    iraSepSimple: false,
    disabilityPensionBeforeMinimumRetirementAge: false,
    ...overrides,
  } as Form1099R;
}

function make1099G(overrides: Record<string, unknown> = {}): Form1099G {
  return {
    payer: "NYS Tax Department",
    unemploymentCompensation: "0",
    federalWithheld: "0",
    stateWithheld: "0",
    ...overrides,
  } as Form1099G;
}

function makeW2G(overrides: Record<string, unknown> = {}): FormW2G {
  return {
    payer: "Example Casino",
    reportableWinnings: "0",
    federalWithheld: "0",
    stateWithheld: "0",
    ...overrides,
  } as FormW2G;
}

describe("NY IT-201 withholding", () => {
  it("NY IT-201 withholding Line 72 - sums NY withholding from supported documents and direct additions", () => {
    const result = calculateNYIT201Withholding({
      taxYear: 2025,
      w2s: [
        makeW2({ state: "NY", stateTaxWithheld: "100" }),
        makeW2({ state: "CA", stateTaxWithheld: "40" }),
      ],
      form1099R: [
        make1099R({ state: "New York", stateTaxWithheld: "50" }),
        make1099R({ state: "NJ", stateTaxWithheld: "70" }),
      ],
      form1099G: [
        make1099G({ state: "NY", stateWithheld: "25" }),
        make1099G({ state: "PA", stateWithheld: "15" }),
      ],
      formW2G: [
        makeW2G({ state: "New York", stateWithheld: "30" }),
        makeW2G({ state: "CT", stateWithheld: "20" }),
      ],
      additionalNYStateTaxWithheld: 10,
    });

    expect(result.nyStateTaxWithheld.equals(d(215))).toBe(true);
    expect(result.nycTaxWithheld.equals(d(0))).toBe(true);
    expect(result.yonkersTaxWithheld.equals(d(0))).toBe(true);
  });

  it("NY IT-201 withholding Lines 73 and 74 - classifies NYC and Yonkers local withholding from supported documents", () => {
    const result = calculateNYIT201Withholding({
      taxYear: 2025,
      w2s: [
        makeW2({ localTaxWithheld: "100", locality: "NYC" }),
        makeW2({ localTaxWithheld: "25", locality: "Yonkers" }),
        makeW2({ localTaxWithheld: "12", locality: "Albany" }),
      ],
      form1099R: [
        make1099R({ localTaxWithheld: "20", locality: "New York City" }),
        make1099R({ localTaxWithheld: "7", locality: "Yonkers Resident Tax" }),
      ],
      additionalNYCTaxWithheld: 5,
      additionalYonkersTaxWithheld: 3,
    });

    expect(result.nyStateTaxWithheld.equals(d(0))).toBe(true);
    expect(result.nycTaxWithheld.equals(d(125))).toBe(true);
    expect(result.yonkersTaxWithheld.equals(d(35))).toBe(true);
  });

  it("NY IT-201 withholding - unsupported localities are ignored instead of guessed", () => {
    const result = calculateNYIT201Withholding({
      taxYear: 2025,
      w2s: [
        makeW2({ localTaxWithheld: "40", locality: "Buffalo" }),
      ],
    });

    expect(result.nycTaxWithheld.equals(d(0))).toBe(true);
    expect(result.yonkersTaxWithheld.equals(d(0))).toBe(true);
  });

  it("NY IT-201 withholding - negative withholding is rejected", () => {
    expect(() =>
      calculateNYIT201Withholding({
        taxYear: 2025,
        w2s: [
          makeW2({ state: "NY", stateTaxWithheld: "-1" }),
        ],
      })
    ).toThrow("NY IT-201 W-2 state withholding must be non-negative");
  });

  it("NY IT-201 withholding - audit trail records document and direct subtotals", () => {
    const result = calculateNYIT201Withholding({
      taxYear: 2025,
      w2s: [
        makeW2({ state: "NY", stateTaxWithheld: "80", localTaxWithheld: "15", locality: "NYC" }),
      ],
      additionalNYStateTaxWithheld: 20,
      additionalNYCTaxWithheld: 5,
    });

    const line72 = result.lines.find((line) => line.form === "NY-IT201" && line.line === "72");
    const line73 = result.lines.find((line) => line.form === "NY-IT201" && line.line === "73");

    expect(line72?.inputs).toMatchObject({
      "W-2 NY withholding": d(80),
      "Direct line 72 additions": d(20),
    });
    expect(line73?.inputs).toMatchObject({
      "W-2 NYC withholding": d(15),
      "Direct line 73 additions": d(5),
    });
  });
});
