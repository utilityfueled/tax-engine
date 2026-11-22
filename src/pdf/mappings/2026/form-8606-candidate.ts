/**
 * Final 2026 Form 8606 physical mapping candidate, Created 4/21/26.
 * Spec: spec/federal/form-8606-2026-template.yaml.
 * The internal projection stays outside the export registry.
 */
import Decimal from "decimal.js";
import { calculateForm8606 } from "@/engine/forms/form-8606.js";
import { calculateIraBasisSources } from "@/engine/forms/ira-basis-sources.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d, roundDollar } from "@/utils/decimal.js";

const page1 = "topmostSubform[0].Page1[0].";
const page2 = "topmostSubform[0].Page2[0].";
const taxableTransfer = "2026 Form 1040 / 1040-SR / 1040-NR line 4b";
// Four digits fit the pinned line 10 fraction widget at its native size.
const nativeLine10FractionDigits = 4;

export const FORM_8606_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f8606.pdf",
  sourceRevision: "Created 4/21/26",
  retrievedAt: "2026-11-13T02:27:21Z",
  sha256: "eeb2c5a11da6903e30c468572da0242c28f19ee135b9853562d7ce9fc037cb56",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  contributionWindow: Object.freeze({ from: "2027-01-01", through: "2027-04-15" }),
  printedLine10: Object.freeze({ minimumFractionDigits: 3, maximum: "1.000" }),
  printedReferences: Object.freeze({
    line15b: "2026 Form 8915-F line 18",
    line15c: taxableTransfer,
    line18: taxableTransfer,
    line25b: "2026 Form 8915-F line 19",
    line25c: taxableTransfer,
  }),
  fields: Object.freeze({
    name: `${page1}f1_1[0]`,
    ssn: `${page1}f1_2[0]`,
    streetAddress: `${page1}f1_3[0]`,
    apartment: `${page1}f1_4[0]`,
    city: `${page1}f1_5[0]`,
    state: `${page1}f1_6[0]`,
    zipCode: `${page1}f1_7[0]`,
    foreignCountry: `${page1}f1_8[0]`,
    foreignProvince: `${page1}f1_9[0]`,
    foreignPostalCode: `${page1}f1_10[0]`,
    line1: `${page1}f1_11[0]`,
    line2: `${page1}f1_12[0]`,
    line3: `${page1}f1_13[0]`,
    line4: `${page1}f1_14[0]`,
    line5: `${page1}f1_15[0]`,
    line6: `${page1}f1_16[0]`,
    line7: `${page1}f1_17[0]`,
    line8: `${page1}f1_18[0]`,
    line9: `${page1}f1_19[0]`,
    line10Integer: `${page1}f1_20[0]`,
    line10Fraction: `${page1}f1_21[0]`,
    line11: `${page1}f1_22[0]`,
    line12: `${page1}f1_23[0]`,
    line13: `${page1}f1_24[0]`,
    line14: `${page1}f1_25[0]`,
    line15a: `${page2}f2_1[0]`,
    line15b: `${page2}f2_2[0]`,
    line15c: `${page2}f2_3[0]`,
    line16: `${page2}f2_4[0]`,
    line17: `${page2}f2_5[0]`,
    line18: `${page2}f2_6[0]`,
    line19: `${page2}f2_7[0]`,
    line20: `${page2}f2_8[0]`,
    line21: `${page2}f2_9[0]`,
    line22: `${page2}f2_10[0]`,
    line23: `${page2}f2_11[0]`,
    line24: `${page2}f2_12[0]`,
    line25a: `${page2}f2_13[0]`,
    line25b: `${page2}f2_14[0]`,
    line25c: `${page2}f2_15[0]`,
    preparerName: `${page2}f2_16[0]`,
    preparerPtin: `${page2}f2_17[0]`,
    preparerFirmName: `${page2}f2_18[0]`,
    preparerFirmAddress: `${page2}f2_19[0]`,
    preparerFirmEin: `${page2}f2_20[0]`,
    preparerFirmPhone: `${page2}f2_21[0]`,
    preparerSelfEmployed: `${page2}c2_1[0]`,
  }),
});

export function projectForm86062026OrdinaryDistribution(
  input: TaxYearInput,
  owner: "primary" | "spouse",
): Record<string, string> {
  if (input.taxpayer.taxYear !== 2026 || input.form8915F || input.form5329
    || input.form1099R?.some(form => form.iraSepSimple !== true)) {
    throw new Error("The Form 8606 candidate requires a 2026 return with only ordinary IRA statements");
  }
  const bound = calculateIraBasisSources(input)?.form8606ByOwner[owner];
  const history = input.iraBasisSources?.owners.find(source => source.accountHolder === owner)?.basisHistory;
  if (!bound || history?.method !== "prior_form_8606" || !d(history.line15cWorksheetAdjustment).isZero()) {
    throw new Error("The Form 8606 candidate requires an original prior basis without a repayment adjustment");
  }

  const result = calculateForm8606(bound);
  if (result.line2.lte(0) || result.line7.lte(0)) {
    throw new Error("The Form 8606 candidate requires positive prior basis and an ordinary distribution");
  }
  const { fields, printedLine10 } = FORM_8606_2026_CANDIDATE;
  const useFourPlaces = result.line13.gt(result.line3);
  const precision = useFourPlaces ? nativeLine10FractionDigits : printedLine10.minimumFractionDigits;
  const ratio = useFourPlaces
    ? Decimal.min(1, result.line5.dividedBy(result.line9)).toDecimalPlaces(precision, Decimal.ROUND_HALF_UP)
    : result.line10;
  const line12 = roundDollar(result.line7.times(ratio));
  const line13 = result.line11.plus(line12);
  if (line13.gt(result.line3)) {
    throw new Error("The Form 8606 candidate cannot reconcile the printed ratio with available basis");
  }

  const line15a = result.line7.minus(line12);
  const [integer, fraction] = ratio.toFixed(precision).split(".");
  const text: Record<string, string> = {
    [fields.line10Integer]: integer,
    [fields.line10Fraction]: fraction,
  };
  const money = {
    line1: result.line1, line2: result.line2, line3: result.line3, line4: result.line4, line5: result.line5,
    line6: result.line6, line7: result.line7, line8: result.line8, line9: result.line9, line11: result.line11,
    line12, line13, line14: result.line3.minus(line13), line15a, line15b: result.line15b,
    line15c: line15a.minus(result.line15b),
  };
  for (const line of Object.keys(money) as (keyof typeof money)[]) text[fields[line]] = money[line].toFixed(0);
  return text;
}
