import { describe, expect, it } from "vitest";
import {
  calculateNYIT201AdditionsSubtractions,
  calculateNYIT201Credits,
  calculateNYIT201Deduction,
  calculateNYIT201FullReturn,
  calculateNYIT201NYCTax,
  calculateNYIT201Tax,
  calculateNYIT201Withholding,
  calculateNYIT201YonkersTax,
  calculateNYIT217,
  calculateNYIT249,
  NYIT201FullReturnInputSchema,
  getNYIT201ResidentConstants,
} from "@/index.js";

describe("New York public API", () => {
  it("exports the resident IT-201 engine, core component calculators, and shared 2025 constants", () => {
    expect(typeof calculateNYIT201FullReturn).toBe("function");
    expect(typeof calculateNYIT201AdditionsSubtractions).toBe("function");
    expect(typeof calculateNYIT201Deduction).toBe("function");
    expect(typeof calculateNYIT201Tax).toBe("function");
    expect(typeof calculateNYIT201Credits).toBe("function");
    expect(typeof calculateNYIT201NYCTax).toBe("function");
    expect(typeof calculateNYIT201YonkersTax).toBe("function");
    expect(typeof calculateNYIT201Withholding).toBe("function");
    expect(typeof calculateNYIT217).toBe("function");
    expect(typeof calculateNYIT249).toBe("function");
    expect(NYIT201FullReturnInputSchema.parse({
      federalAgi: "1000",
      filingStatus: "single",
      taxYear: 2025,
    }).taxYear).toBe(2025);

    const constants2025 = getNYIT201ResidentConstants(2025);
    expect(constants2025.standardDeduction.single.toNumber()).toBe(8000);
    expect(constants2025.recaptureAgiThreshold.toNumber()).toBe(107650);
    expect(constants2025.taxBrackets.single_mfs).toHaveLength(9);
  });
});
