import { describe, expect, it } from "vitest";
import {
  Form1099DivSchema,
  Form1099IntSchema,
  Form1099MiscSchema,
  Form1099NecSchema,
  Form1099RSchema,
} from "@/models/inputs.js";

describe("1099 state withholding schemas", () => {
  it("Form1099IntSchema preserves state withholding fields", () => {
    const parsed = Form1099IntSchema.parse({
      payer: "Bank",
      interestIncome: "1200",
      stateWithheld: "45",
      state: "NJ",
    });

    expect(parsed.stateWithheld).toBe("45");
    expect(parsed.state).toBe("NJ");
  });

  it("Form1099DivSchema preserves state withholding fields", () => {
    const parsed = Form1099DivSchema.parse({
      payer: "Fund",
      ordinaryDividends: "900",
      stateWithheld: "30",
      state: "NJ",
    });

    expect(parsed.stateWithheld).toBe("30");
    expect(parsed.state).toBe("NJ");
  });

  it("Form1099RSchema preserves state withholding fields", () => {
    const parsed = Form1099RSchema.parse({
      payer: "Pension Plan",
      grossDistribution: "18000",
      taxableAmount: "18000",
      distributionCode: "7",
      militaryPensionOrSurvivorBenefit: true,
      stateWithheld: "700",
      state: "NJ",
    });

    expect(parsed.militaryPensionOrSurvivorBenefit).toBe(true);
    expect(parsed.stateWithheld).toBe("700");
    expect(parsed.state).toBe("NJ");
  });

  it("Form1099NecSchema preserves state withholding fields", () => {
    const parsed = Form1099NecSchema.parse({
      payer: "Client",
      nonemployeeCompensation: "5000",
      stateWithheld: "250",
      state: "NJ",
    });

    expect(parsed.stateWithheld).toBe("250");
    expect(parsed.state).toBe("NJ");
  });

  it("Form1099MiscSchema preserves state withholding fields", () => {
    const parsed = Form1099MiscSchema.parse({
      payer: "Payer",
      otherIncome: "3200",
      stateWithheld: "160",
      state: "NJ",
    });

    expect(parsed.stateWithheld).toBe("160");
    expect(parsed.state).toBe("NJ");
  });
});
