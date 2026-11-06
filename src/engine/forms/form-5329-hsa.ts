/** Individual Form5329 PartVII; spec/federal/form-5329-hsa-owner.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { Form8889Result } from "./form-8889.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

export interface Form5329HsaResult {
  taxYear: number;
  owner: "primary" | "spouse";
  sourceFactsVerified: true;
  requiresForm5329: boolean;
  line42: Decimal; line43: Decimal; line44: Decimal; line45: Decimal;
  line46: Decimal; line47: Decimal; line48: Decimal; line49: Decimal;
  valueDec31: Decimal;
  absorbedExcessDeduction: Decimal;
  reliefEarnings: Decimal;
  taxableExcessEmployerContributions: Decimal;
  correctedForm8889: Form8889Result;
  lines: CalculatedLine[];
}

export function calculateForm5329Hsa(params: {
  taxYear: number;
  owner: "primary" | "spouse";
  facts: NonNullable<NonNullable<TaxYearInput["form5329HsaByOwner"]>["primary"]>;
  form8889: Form8889Result;
}): Form5329HsaResult {
  const { taxYear, owner, facts, form8889 } = params;
  if (![2025, 2026].includes(taxYear) || facts.sourceTaxYear !== taxYear || facts.priorYearSourceTaxYear !== taxYear - 1) {
    throw new Error(`Form5329 HSA ${owner} source year must match the current and prior tax years`);
  }
  if (facts.sourceFactsConfirmed !== true) throw new Error(`Form5329 HSA ${owner} actual source confirmation is required`);
  const actual = (key: keyof typeof facts): Decimal => {
    const raw = facts[key];
    if (typeof raw !== "string") throw new Error(`Form5329 HSA ${owner} actual source ${key} is required`);
    const value = d(raw);
    if (!value.isFinite() || value.lt(0)) throw new Error(`Form5329 HSA ${owner} source ${key} must be finite and nonnegative`);
    return value;
  };
  const priorExcess = actual("priorYearExcessContributions");
  const priorTax = actual("priorYearAdditionalTax");
  if (priorTax.gt(0) && priorExcess.isZero()) throw new Error("Form5329 HSA prior tax requires actual prior excess");
  const valueDec31 = actual("valueDec31");
  const reliefPrincipal = actual("returnedExcessContributionsUnder9100Relief");
  const reliefEarnings = actual("returnedExcessContributionEarningsUnder9100Relief");
  if (reliefPrincipal.gt(0) || reliefEarnings.gt(0)) {
    if (facts.reliefRequirementsConfirmed !== true || reliefPrincipal.isZero()) throw new Error("Form5329 HSA amended-return relief requires actual principal and confirmed requirements");
  }
  for (const key of ["line2", "line8", "line9", "line10", "line11", "line12", "line13", "line16", "supportedReturnedExcessContributionPrincipal"] as const) {
    if (!form8889[key].isFinite() || form8889[key].lt(0)) throw new Error(`Form5329 HSA actual Form8889 ${key} is invalid`);
  }
  if (form8889.supportedReturnedExcessContributions.gt(form8889.line14a)
    || form8889.supportedReturnedExcessContributions.gt(form8889.line14b)) {
    throw new Error("Form5329 HSA returned gross distributions must reconcile with Form8889 lines14a and14b");
  }
  if (form8889.line10.gt(form8889.line8)) throw new Error("Form5329 HSA qualified funding distribution exceeds the actual annual limit; IRA source treatment is required");
  const employerExcess = zeroFloor(form8889.line9.minus(zeroFloor(form8889.line8.minus(form8889.line10))));
  const employerExcessAlreadyInWages = employerExcess.gt(0) || facts.excessEmployerContributionsAlreadyInWages !== undefined
    ? actual("excessEmployerContributionsAlreadyInWages") : d("0");
  if (employerExcessAlreadyInWages.gt(employerExcess)) throw new Error("Form5329 HSA employer excess already in wages exceeds the actual excess");
  const taxableExcessEmployerContributions = employerExcess.minus(employerExcessAlreadyInWages);
  const contributions = form8889.line2;
  const limit = form8889.line12;
  const line42 = priorTax.gt(0) ? priorExcess : d("0");
  const line43 = zeroFloor(limit.minus(contributions));
  const line44 = form8889.line16;
  const line45 = sum(line43, line44);
  const line46 = zeroFloor(line42.minus(line45));
  const rawCurrentExcess = zeroFloor(contributions.minus(limit))
    .plus(zeroFloor(form8889.line11.minus(form8889.line8)));
  if (form8889.supportedReturnedExcessContributionPrincipal.gt(rawCurrentExcess)) throw new Error("Form5329 HSA timely correction exceeds this owner's current excess; actual origin-year allocation is required");
  const timelyCorrection = form8889.supportedReturnedExcessContributionPrincipal;
  if (reliefPrincipal.gt(rawCurrentExcess.minus(timelyCorrection))) throw new Error("Form5329 HSA relief exceeds this owner's remaining current excess");
  const line47 = zeroFloor(rawCurrentExcess.minus(timelyCorrection).minus(reliefPrincipal));
  const line48 = sum(line46, line47);
  const line49 = roundDollar(Decimal.min(line48, valueDec31).times("0.06"));
  const absorbedExcessDeduction = Decimal.min(line43, zeroFloor(line42.minus(line44)));
  const correctedDeduction = form8889.line13.plus(absorbedExcessDeduction);
  const originalDeductionLines = form8889.lines.filter(line => line.line === "13");
  if (originalDeductionLines.length !== 1 || !originalDeductionLines[0].value.eq(form8889.line13)) {
    throw new Error("Form5329 HSA deduction must reconcile with the actual owner's Form8889 audit");
  }
  const correctedForm8889 = { ...form8889, line13: correctedDeduction,
    lines: form8889.lines.map(line => line.line !== "13" ? line : { ...line, value: correctedDeduction,
      formula: "Current allowable HSA deduction + same-owner prior excess absorbed under Form5329 line43 instructions",
      inputs: { ...line.inputs, "Original current deduction": form8889.line13, "Prior excess absorbed": absorbedExcessDeduction } }) };
  const audit = new AuditTrail();
  const form = `Form 5329 HSA (${owner})`;
  const rows = [
    ["42", "Prior-year excess subject to carry", line42, "Actual prior line48 only if prior line49 is positive"],
    ["43", "Same-owner unused contribution room", line43, "max(0,Form8889line12-line2)"],
    ["44", "Same-owner taxable distributions", line44, "Form8889line16"],
    ["45", "Total reductions", line45, "43+44"],
    ["46", "Remaining prior excess", line46, "max(0,42-45)"],
    ["47", "Current excess after actual corrections", line47, "Personal plus employer excess less same-owner timely and confirmed amended-return corrections"],
    ["48", "Remaining excess", line48, "46+47"],
    ["49", "Additional tax", line49, "roundDollar(6%*min(48,actual same-owner year-end value))"],
  ] as const;
  for (const [line, description, value, formula] of rows) audit.record(form, line, description, value, formula, { owner });
  return { taxYear, owner, sourceFactsVerified: true,
    requiresForm5329: line42.gt(0) || rawCurrentExcess.gt(0),
    line42, line43, line44, line45, line46, line47, line48, line49,
    valueDec31, absorbedExcessDeduction, reliefEarnings, taxableExcessEmployerContributions, correctedForm8889, lines: audit.getLines() };
}
