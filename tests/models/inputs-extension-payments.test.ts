import { describe, expect, it } from "vitest";
import { AdjustmentsSchema } from "@/models/inputs.js";

describe("extension payment schema", () => {
  it("AdjustmentsSchema preserves optional state codes on extension payments", () => {
    const parsed = AdjustmentsSchema.parse({
      extensionPayments: [
        { date: "2026-04-15", amount: "600", type: "state", state: "NJ" },
        { date: "2026-04-15", amount: "250", type: "state" },
      ],
    });

    expect(parsed.extensionPayments[0]?.state).toBe("NJ");
    expect(parsed.extensionPayments[1]?.state).toBeUndefined();
  });

  it("AdjustmentsSchema preserves source tax year and optional state codes on prior-year applied credits", () => {
    const parsed = AdjustmentsSchema.parse({
      priorYearAppliedCredits: [
        { sourceTaxYear: 2024, amount: "600", type: "state", state: "NJ" },
        { sourceTaxYear: 2024, amount: "250", type: "state" },
      ],
    });

    expect(parsed.priorYearAppliedCredits[0]?.sourceTaxYear).toBe(2024);
    expect(parsed.priorYearAppliedCredits[0]?.state).toBe("NJ");
    expect(parsed.priorYearAppliedCredits[1]?.state).toBeUndefined();
  });
});
