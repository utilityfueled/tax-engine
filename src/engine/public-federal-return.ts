import { calculateFederalTax as calculateFederalTaxFromInput } from "./federal.js";
import { assertSupportedWholeReturnAccountingPeriod } from "./federal-return-admission.js";

export const calculateFederalTax: typeof calculateFederalTaxFromInput = (input, context) => {
  assertSupportedWholeReturnAccountingPeriod(input.standardDeductionFacts);
  return calculateFederalTaxFromInput(input, context);
};
