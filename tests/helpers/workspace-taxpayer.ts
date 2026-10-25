import type { Taxpayer } from "../../src/models/inputs";

/** Explicit synthetic taxpayer used only by workspace adapter tests. */
export function workspaceTaxpayerFixture(): Taxpayer {
  return {
    taxYear: 2025,
    filingStatus: "single",
    primary: { firstName: "Jane", lastName: "Example", ssn: "900-70-0001", dateOfBirth: "1990-06-15" },
    address: { street: "123 Example St", city: "Austin", state: "TX", zip: "78701" },
    dependents: [],
  };
}
