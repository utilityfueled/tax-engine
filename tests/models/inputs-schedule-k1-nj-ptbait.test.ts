import { describe, expect, it } from "vitest";
import { ScheduleK1Schema } from "@/models/inputs.js";

describe("Schedule K-1 NJ PTBAIT schema", () => {
  it("preserves the NJ PTBAIT credit share field", () => {
    const parsed = ScheduleK1Schema.parse({
      partnershipName: "Garden State Partners",
      partnershipEIN: "11-1111111",
      ordinaryIncome: "12000",
      entityType: "partnership",
      njPassThroughBusinessAlternativeIncomeTaxCredit: "875",
    });

    expect(parsed.njPassThroughBusinessAlternativeIncomeTaxCredit).toBe("875");
  });
});
