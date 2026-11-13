/**
 * Final 2026 Form 6252 physical mapping candidate, Created 6/16/26.
 * Spec: spec/federal/form-6252-2026-template.yaml.
 */
import { z } from "zod";
import type Decimal from "decimal.js";
import { calculateForm6252 } from "@/engine/forms/form-6252.js";
import { d, roundDollar } from "@/utils/decimal.js";

const page1 = "topmostSubform[0].Page1[0].";

export const FORM_6252_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.2-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-prior/f6252--2026.pdf",
  sourceRevision: "Created 6/16/26",
  posted: "2026-10-16",
  retrievedAt: "2026-11-13",
  sha256: "efecc62a9ed84ba8328eaceecc71305b7176ffa072ad24a30bb9cb4d5ded9310",
  instructionsPages: Object.freeze([2, 3, 4]),
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  fields: Object.freeze({
    name: `${page1}f1_1[0]`,
    identifyingNumber: `${page1}f1_2[0]`,
    line1PropertyDescription: `${page1}f1_3[0]`,
    line2aAcquiredDate: `${page1}f1_4[0]`,
    line2bSoldDate: `${page1}f1_5[0]`,
    line3Yes: `${page1}c1_1[0]`,
    line3No: `${page1}c1_1[1]`,
    line4Yes: `${page1}c1_2[0]`,
    line4No: `${page1}c1_2[1]`,
    line5: `${page1}f1_6[0]`,
    line6: `${page1}f1_7[0]`,
    line7: `${page1}f1_8[0]`,
    line8: `${page1}f1_9[0]`,
    line9: `${page1}f1_10[0]`,
    line10: `${page1}f1_11[0]`,
    line11: `${page1}f1_12[0]`,
    line12: `${page1}f1_13[0]`,
    line13: `${page1}f1_14[0]`,
    line14: `${page1}f1_15[0]`,
    line15: `${page1}f1_16[0]`,
    line16: `${page1}f1_17[0]`,
    line17: `${page1}f1_18[0]`,
    line18: `${page1}f1_19[0]`,
    line19GrossProfitPercentage: `${page1}f1_20[0]`,
    line20: `${page1}f1_21[0]`,
    line21: `${page1}f1_22[0]`,
    line22: `${page1}f1_23[0]`,
    line23: `${page1}f1_24[0]`,
    line24: `${page1}f1_25[0]`,
    line25: `${page1}f1_26[0]`,
    line26: `${page1}f1_27[0]`,
    line27RelatedPartyFirst: `${page1}f1_28[0]`,
    line27RelatedPartySecond: `${page1}f1_29[0]`,
    line28Yes: `${page1}c1_3[0]`,
    line28No: `${page1}c1_3[1]`,
    line29a: `${page1}c1_4[0]`,
    line29aDispositionDate: `${page1}f1_30[0]`,
    line29b: `${page1}c1_4[1]`,
    line29c: `${page1}c1_4[2]`,
    line29d: `${page1}c1_4[3]`,
    line29e: `${page1}c1_4[4]`,
    line30: `${page1}f1_31[0]`,
    line31: `${page1}f1_32[0]`,
    line32: `${page1}f1_33[0]`,
    line33: `${page1}f1_34[0]`,
    line34: `${page1}f1_35[0]`,
    line35: `${page1}f1_36[0]`,
    line36: `${page1}f1_37[0]`,
    line37: `${page1}f1_38[0]`,
  }),
});

const amount = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
const investmentLandSources = z.strictObject({
  acquiredDate: z.iso.date(),
  soldDate: z.iso.date(),
  sellingPrice: amount,
  costBasis: amount,
  sellingExpenses: amount,
  currentPrincipal: amount,
  closingBasisAndPaymentRecordsConfirmed: z.literal(true),
  investmentLandAndUnrelatedFixedPriceSaleConfirmed: z.literal(true),
  ordinaryInstallmentMethodWithoutAssumedDebtOrSpecialPaymentsConfirmed: z.literal(true),
});
const currentYearSources = investmentLandSources.extend({
  firstFuturePayment: z.strictObject({ date: z.iso.date(), principal: amount }),
});
const subsequentYearSources = investmentLandSources.extend({
  saleYearGrossProfitPercentage: z.string().regex(/^(?:0\.\d{4,6}|1\.0{4,6})$/u),
  priorPrincipalByYear: z.array(z.strictObject({ year: z.number().int().min(1).max(2025), principal: amount })).min(1).max(2025),
  originalRatioAndUnchangedAgreementConfirmed: z.literal(true),
});

interface InvestmentLandProjection {
  text: Record<string, string>;
  checked: string[];
}

function formDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${month}/${day}/${year}`;
}

export function projectForm62522026InvestmentLand(sources: unknown): InvestmentLandProjection {
  const parsed = currentYearSources.safeParse(sources);
  if (!parsed.success) throw new Error("The Form 6252 installment sale requires complete confirmed sources");
  const sale = parsed.data;
  // In this annual candidate, only a 2025 acquisition can be on the one-year boundary.
  if (!sale.soldDate.startsWith("2026-") || sale.acquiredDate >= `2025${sale.soldDate.slice(4)}`
    || sale.firstFuturePayment.date <= "2026-12-31") {
    throw new Error("The Form 6252 installment sale requires a long-term 2026 sale with later principal");
  }
  const futurePrincipal = d(sale.firstFuturePayment.principal);
  if (futurePrincipal.lte(0) || futurePrincipal.gt(d(sale.sellingPrice).minus(sale.currentPrincipal))) {
    throw new Error("The Form 6252 installment sale requires an open contract balance");
  }
  return projectInvestmentLand(sale);
}

export function projectForm62522026SubsequentInvestmentLand(sources: unknown): InvestmentLandProjection {
  const parsed = subsequentYearSources.safeParse(sources);
  if (!parsed.success) throw new Error("The Form 6252 installment sale requires complete confirmed prior-year sources");
  const sale = parsed.data;
  const saleYear = Number(sale.soldDate.slice(0, 4));
  const holdingAnniversary = `${String(saleYear - 1).padStart(4, "0")}${sale.soldDate.slice(4)}`;
  if (saleYear < 2 || saleYear >= 2026 || sale.acquiredDate.startsWith("0000-") || sale.acquiredDate >= holdingAnniversary) {
    throw new Error("The Form 6252 installment sale requires a long-term sale before 2026");
  }
  const priorYears = new Set<number>();
  let priorPrincipal = d(0);
  for (const { year, principal } of sale.priorPrincipalByYear) {
    if (year < saleYear || priorYears.has(year)) {
      throw new Error("The Form 6252 installment sale needs one principal total for each prior year");
    }
    priorYears.add(year);
    priorPrincipal = priorPrincipal.plus(principal);
  }
  if (priorYears.size !== 2026 - saleYear) {
    throw new Error("The Form 6252 installment sale is missing prior-year principal totals");
  }
  const contractPrice = d(sale.sellingPrice);
  if (priorPrincipal.gte(contractPrice) || priorPrincipal.plus(sale.currentPrincipal).gt(contractPrice)) {
    throw new Error("The Form 6252 installment sale requires a prior balance and payments within the original contract price");
  }
  return projectInvestmentLand(sale, { priorPrincipal, percentage: sale.saleYearGrossProfitPercentage });
}

function projectInvestmentLand(
  sale: z.infer<typeof investmentLandSources>,
  history?: { priorPrincipal: Decimal; percentage: string },
): InvestmentLandProjection {
  const description = "4 - Investment land";
  const result = calculateForm6252({
    description,
    propertyType: "other",
    gainCharacter: "long_term_capital",
    isYearOfSale: history === undefined,
    sellingPrice: sale.sellingPrice,
    costBasis: sale.costBasis,
    sellingExpenses: sale.sellingExpenses,
    paymentsReceived: sale.currentPrincipal,
    assumedLiabilities: "0",
    depreciation: "0",
    depreciationRecapture: "0",
    section121Exclusion: "0",
    priorYearPayments: history?.priorPrincipal.toFixed() ?? "0",
    remainingOrdinaryRecapture: "0",
  });
  if (result.line14.lte(0)) throw new Error("The Form 6252 installment sale requires a gain");

  const sellingPrice = roundDollar(result.line5);
  const basis = roundDollar(result.line10);
  const expenses = roundDollar(result.line11);
  const installmentBasis = roundDollar(result.line13);
  const grossProfit = roundDollar(result.line16);
  const contractPrice = roundDollar(result.line18);
  const currentPrincipal = roundDollar(result.line21);
  const priorPrincipal = roundDollar(result.line23);
  if (!basis.plus(expenses).eq(installmentBasis) || !sellingPrice.minus(installmentBasis).eq(grossProfit)
    || grossProfit.lte(0) || priorPrincipal.gte(contractPrice)
    || priorPrincipal.plus(currentPrincipal).gt(contractPrice) || (!history && currentPrincipal.eq(contractPrice))) {
    throw new Error("The Form 6252 installment sale does not reconcile in whole dollars");
  }
  const precision = history ? history.percentage.length - 2 : 6;
  const printedRatio = grossProfit.div(contractPrice).toDecimalPlaces(precision);
  const ratio = history ? d(history.percentage) : printedRatio;
  if (ratio.lte(0) || !ratio.eq(printedRatio) || !ratio.eq(result.line19.toDecimalPlaces(precision))
    || !roundDollar(currentPrincipal.times(ratio)).eq(result.line24)) {
    throw new Error("The Form 6252 installment sale does not reconcile at the printed ratio precision");
  }

  const { fields } = FORM_6252_2026_CANDIDATE;
  const text: Record<string, string> = {
    [fields.line1PropertyDescription]: description,
    [fields.line2aAcquiredDate]: formDate(sale.acquiredDate),
    [fields.line2bSoldDate]: formDate(sale.soldDate),
    [fields.line19GrossProfitPercentage]: history?.percentage ?? ratio.toFixed(Math.max(4, ratio.decimalPlaces())),
  };
  const money = {
    line5: result.line5, line6: result.line6, line7: result.line7,
    line8: basis, line9: d(0), line10: result.line10, line11: result.line11,
    line12: result.line12, line13: result.line13, line14: result.line14,
    line15: result.line15, line16: result.line16, line17: result.line17, line18: result.line18,
    line20: result.line20, line21: result.line21, line22: result.line22, line23: result.line23,
    line24: result.line24, line25: result.line25, line26: result.line26,
  };
  for (const line of Object.keys(money) as (keyof typeof money)[]) {
    text[fields[line]] = roundDollar(money[line]).toFixed(0);
  }
  return { text, checked: [fields.line3No, fields.line4Yes] };
}
