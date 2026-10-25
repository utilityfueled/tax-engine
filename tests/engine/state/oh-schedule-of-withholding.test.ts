import { describe, expect, it } from "vitest";
import {
  calculateOhioScheduleOfWithholding,
} from "@/engine/state/oh-schedule-of-withholding.js";
import type {
  Form1099G,
  Form1099K,
  Form1099Misc,
  Form1099Nec,
  Form1099R,
  FormW2G,
  W2,
} from "@/models/inputs.js";

function makeW2(overrides: Partial<W2> = {}): W2 {
  return {
    employer: { name: "Acme Corp", ein: "12-3456789" },
    wages: "50000",
    federalWithheld: "5000",
    socialSecurityWages: "50000",
    socialSecurityWithheld: "3100",
    medicareWages: "50000",
    medicareWithheld: "725",
    stateTaxWithheld: "0",
    localTaxWithheld: "0",
    stateWages: "0",
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
    socialSecurityTips: "0",
    ...overrides,
  };
}

function makeW2G(overrides: Partial<FormW2G> = {}): FormW2G {
  return {
    payer: "Ohio Casino",
    reportableWinnings: "1000",
    federalWithheld: "0",
    stateWithheld: "0",
    ...overrides,
  };
}

function make1099G(overrides: Partial<Form1099G> = {}): Form1099G {
  return {
    payer: "Ohio Department of Job and Family Services",
    unemploymentCompensation: "0",
    stateOrLocalTaxRefund: "0",
    federalWithheld: "0",
    stateWithheld: "0",
    ...overrides,
  };
}

function make1099K(overrides: Partial<Form1099K> = {}): Form1099K {
  return {
    pse: "Stripe",
    grossAmount: "0",
    incomeType: "other",
    stateWithheld: "0",
    ...overrides,
  };
}

function make1099R(overrides: Partial<Form1099R> = {}): Form1099R {
  return {
    payer: "Fidelity",
    grossDistribution: "10000",
    taxableAmount: "10000",
    taxableAmountNotDetermined: false,
    eligibleGovernmental457bPlan: false,
    eligibleGovernmental457bTransferredFromQualifiedPlanTaxableAmount: "0",
    rothConversionAmount: "0",
    rothContributionOrConversionMadeBefore2021: false,
    qualifiedRothDistribution: false,
    rothIraRolledOverAmount: "0",
    returnedContributionByDueDate: false,
    excessContributionReturnedWithoutEarnings: false,
    qualifiedCharitableDistribution: "0",
    federalWithheld: "0",
    stateWithheld: "0",
    employeeContributions: "0",
    retiredPublicSafetyOfficerInsurancePremiums: "0",
    iraSepSimple: false,
    disabilityPensionBeforeMinimumRetirementAge: false,
    separationFromServiceAfterAge55ExceptionApplies: false,
    qualifiedPublicSafetyEmployeeOrPrivateSectorFirefighterExceptionApplies: false,
    qualifiedDomesticRelationsOrderExceptionApplies: false,
    terminalIllnessExceptionApplies: false,
    ...overrides,
  };
}

function make1099Nec(overrides: Partial<Form1099Nec> = {}): Form1099Nec {
  return {
    payer: "Gig Platform",
    nonemployeeCompensation: "0",
    federalWithheld: "0",
    stateWithheld: "0",
    stateIncome: "0",
    ...overrides,
  };
}

function make1099Misc(overrides: Partial<Form1099Misc> = {}): Form1099Misc {
  return {
    payer: "Misc Payer",
    otherIncome: "0",
    federalWithheld: "0",
    stateWithheld: "0",
    stateIncome: "0",
    ...overrides,
  };
}

describe("Ohio Schedule of Withholding", () => {
  it("Ohio Schedule of Withholding Line 1 - W-2 Ohio withholding", () => {
    const result = calculateOhioScheduleOfWithholding({
      w2s: [
        makeW2({ state: "OH", stateTaxWithheld: "1200" }),
        makeW2({ state: "oh", stateTaxWithheld: "300" }),
        makeW2({ state: "PA", stateTaxWithheld: "700" }),
      ],
    });

    expect(result.line1_w2OhioWithholding.toNumber()).toBe(1500);
    expect(result.line6_totalOhioWithholding.toNumber()).toBe(1500);
  });

  it("Ohio Schedule of Withholding Line 2 - W-2G Ohio withholding", () => {
    const result = calculateOhioScheduleOfWithholding({
      formW2Gs: [
        makeW2G({ state: "OH", stateWithheld: "75" }),
        makeW2G({ state: "IN", stateWithheld: "10" }),
      ],
    });

    expect(result.line2_w2gOhioWithholding.toNumber()).toBe(75);
    expect(result.line6_totalOhioWithholding.toNumber()).toBe(75);
  });

  it("Ohio Schedule of Withholding Line 3 - 1099-G Ohio withholding", () => {
    const result = calculateOhioScheduleOfWithholding({
      form1099Gs: [
        make1099G({ state: "OH", stateWithheld: "55" }),
        make1099G({ state: "MI", stateWithheld: "40" }),
      ],
    });

    expect(result.line3_1099gOhioWithholding.toNumber()).toBe(55);
    expect(result.line6_totalOhioWithholding.toNumber()).toBe(55);
  });

  it("Ohio Schedule of Withholding Line 4 - 1099-K Ohio withholding", () => {
    const result = calculateOhioScheduleOfWithholding({
      form1099Ks: [
        make1099K({ state: "OH", stateWithheld: "45" }),
        make1099K({ state: "PA", stateWithheld: "35" }),
      ],
    });

    expect(result.line4_1099kOhioWithholding.toNumber()).toBe(45);
    expect(result.line6_totalOhioWithholding.toNumber()).toBe(45);
  });

  it("Ohio Schedule of Withholding Line 5 - 1099-R Ohio withholding", () => {
    const result = calculateOhioScheduleOfWithholding({
      form1099Rs: [
        make1099R({ state: "OH", stateWithheld: "125" }),
        make1099R({ state: "PA", stateWithheld: "50" }),
      ],
    });

    expect(result.line5_1099rOhioWithholding.toNumber()).toBe(125);
    expect(result.line6_totalOhioWithholding.toNumber()).toBe(125);
  });

  it("Ohio Schedule of Withholding Line 5a - 1099-NEC Ohio withholding", () => {
    const result = calculateOhioScheduleOfWithholding({
      form1099Necs: [
        make1099Nec({ state: "OH", stateWithheld: "85" }),
        make1099Nec({ state: "PA", stateWithheld: "40" }),
      ],
    });

    expect(result.line5a_1099NecOhioWithholding.toNumber()).toBe(85);
    expect(result.line6_totalOhioWithholding.toNumber()).toBe(85);
  });

  it("Ohio Schedule of Withholding Line 5b - 1099-MISC Ohio withholding", () => {
    const result = calculateOhioScheduleOfWithholding({
      form1099Miscs: [
        make1099Misc({ state: "OH", stateWithheld: "95" }),
        make1099Misc({ state: "PA", stateWithheld: "25" }),
      ],
    });

    expect(result.line5b_1099MiscOhioWithholding.toNumber()).toBe(95);
    expect(result.line6_totalOhioWithholding.toNumber()).toBe(95);
  });

  it("Ohio Schedule of Withholding Line 6 - total Ohio withholding combines supported statements", () => {
    const result = calculateOhioScheduleOfWithholding({
      w2s: [
        makeW2({ state: "OH", stateTaxWithheld: "1200" }),
        makeW2({ state: "PA", stateTaxWithheld: "500" }),
      ],
      formW2Gs: [
        makeW2G({ state: "OH", stateWithheld: "75" }),
        makeW2G({ state: "PA", stateWithheld: "40" }),
      ],
      form1099Gs: [
        make1099G({ state: "OH", stateWithheld: "55" }),
        make1099G({ state: "MI", stateWithheld: "12" }),
      ],
      form1099Ks: [
        make1099K({ state: "OH", stateWithheld: "45" }),
        make1099K({ state: "PA", stateWithheld: "35" }),
      ],
      form1099Rs: [
        make1099R({ state: "OH", stateWithheld: "125" }),
        make1099R({ state: "PA", stateWithheld: "50" }),
      ],
      form1099Necs: [
        make1099Nec({ state: "OH", stateWithheld: "85" }),
        make1099Nec({ state: "KY", stateWithheld: "10" }),
      ],
      form1099Miscs: [
        make1099Misc({ state: "OH", stateWithheld: "95" }),
        make1099Misc({ state: "MI", stateWithheld: "20" }),
      ],
    });

    expect(result.line1_w2OhioWithholding.toNumber()).toBe(1200);
    expect(result.line2_w2gOhioWithholding.toNumber()).toBe(75);
    expect(result.line3_1099gOhioWithholding.toNumber()).toBe(55);
    expect(result.line4_1099kOhioWithholding.toNumber()).toBe(45);
    expect(result.line5_1099rOhioWithholding.toNumber()).toBe(125);
    expect(result.line5a_1099NecOhioWithholding.toNumber()).toBe(85);
    expect(result.line5b_1099MiscOhioWithholding.toNumber()).toBe(95);
    expect(result.line6_totalOhioWithholding.toNumber()).toBe(1680);
  });
});
