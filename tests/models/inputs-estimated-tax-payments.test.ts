import { describe, expect, it } from "vitest";
import { AdjustmentsSchema } from "@/models/inputs.js";

describe("estimated tax payment schema", () => {
  it("AdjustmentsSchema preserves optional state codes on estimated payments", () => {
    const parsed = AdjustmentsSchema.parse({
      estimatedTaxPayments: [
        { date: "2025-04-15", amount: "500", type: "state", state: "NJ" },
        { date: "2025-06-15", amount: "700", type: "state" },
      ],
    });

    expect(parsed.estimatedTaxPayments[0]?.state).toBe("NJ");
    expect(parsed.estimatedTaxPayments[1]?.state).toBeUndefined();
  });
});
