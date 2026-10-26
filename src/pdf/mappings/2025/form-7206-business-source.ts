/** Rebind review income limits to current sources without a whole-return recalculation. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { getConstants } from "@/models/constants.js";
import { calculateForm2441Benefits } from "@/engine/forms/form-2441-benefits.js";
import { calculateDependentCareBenefitSources } from "@/engine/forms/dependent-care-benefit-sources.js";
import { calculateCryptoIncome, processNFTTransactions } from "@/engine/forms/crypto-lot-matching.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateScheduleF } from "@/engine/schedules/schedule-f.js";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se.js";
import { calculateScheduleE } from "@/engine/schedules/schedule-e.js";
import { calculateK1OrdinarySelfEmployment } from "@/engine/forms/k1-ordinary-self-employment.js";
import { calculateForm2555 } from "@/engine/forms/form-2555.js";
import { calculateForm7206Return } from "@/engine/forms/form-7206-return.js";
import { d, sum } from "@/utils/decimal.js";

function same(actual: Decimal | undefined, expected: Decimal) {
  if (!Decimal.isDecimal(actual) || !actual.isFinite() || !actual.eq(expected)) throw new Error("Form7206 current business or payroll sources do not reconcile with the saved calculation.");
}
export function calculateForm7206ReviewSources(input: TaxYearInput, result: TaxReturnResult) {
  const constants = getConstants(input.taxpayer.taxYear);
  const benefits = input.dependentCareBenefits ? calculateForm2441Benefits({ taxYear: input.taxpayer.taxYear,
    filingStatus: input.taxpayer.filingStatus, facts: input.dependentCareBenefits }) : undefined;
  const care = calculateDependentCareBenefitSources(input, benefits);
  const scheduleC = calculateScheduleC(input, input.scheduleC, { dependentCareBenefitsAdjustment: care.scheduleCAdjustment });
  const scheduleF = calculateScheduleF(input.scheduleF, { dependentCareBenefitsAdjustment: care.scheduleFAdjustment });
  const crypto = input.cryptoIncome ? calculateCryptoIncome(input.cryptoIncome) : undefined;
  const nft = processNFTTransactions(input.cryptoIncome?.nftTransactions ?? []);
  const cryptoGross = sum(crypto?.businessMiningGrossReceipts ?? d(0), crypto?.businessStakingGrossReceipts ?? d(0), nft.mintSaleIncome);
  const cryptoNet = cryptoGross.minus(sum(crypto?.businessMiningExpenses ?? d(0), crypto?.businessStakingExpenses ?? d(0)));
  // ScheduleSE itself binds actual owner W2 Boxes3/7, Forms4137/8919 and K1
  // earnings. It does not use a taxpayer identifier or a saved SE-half scalar.
  const ordinaryK1 = calculateK1OrdinarySelfEmployment(input, calculateScheduleE(input));
  const seSourceInput = ordinaryK1.scheduleK1 === input.scheduleK1 ? input : { ...input, scheduleK1: ordinaryK1.scheduleK1 };
  const scheduleSE = calculateScheduleSE(seSourceInput, constants, scheduleC.netProfit, scheduleF.netFarmProfit, {
    additionalNonfarmIncome: cryptoNet, additionalNonfarmOwner: input.cryptoIncome?.businessAccountHolder,
  });
  const savedSE = result.scheduleSE;
  if (!scheduleSE.sourceFactsVerified || !savedSE?.sourceFactsVerified || savedSE.perTaxpayer.length !== scheduleSE.perTaxpayer.length) throw new Error("Form7206 requires unique actual owner SE source calculations.");
  for (const owner of scheduleSE.perTaxpayer) {
    const saved = savedSE.perTaxpayer.filter(row => row.accountHolder === owner.accountHolder);
    if (saved.length !== 1) throw new Error("Form7206 actual owner SE sources are missing or duplicated.");
    for (const key of ["netFarmProfit", "netNonfarmProfit", "netSEEarnings", "taxableEarnings", "earningsSubjectToSETax", "socialSecurityPortion", "medicarePortion", "totalSETax", "deductibleHalf"] as const) same(saved[0][key], owner[key]);
  }
  if (savedSE.lines.length !== scheduleSE.lines.length) throw new Error("Form7206 owner payroll source audits are incomplete or duplicated.");
  for (const line of scheduleSE.lines) {
    const saved = savedSE.lines.filter(row => row.form === line.form && row.line === line.line && row.inputs?.["Taxpayer owner"] === line.inputs?.["Taxpayer owner"]);
    if (saved.length !== 1) throw new Error("Form7206 owner payroll source audit is missing or duplicated.");
    same(saved[0].value, line.value);
  }
  same(savedSE.deductibleHalf, scheduleSE.deductibleHalf);
  if (input.form2555?.taxYear !== undefined && input.form2555.taxYear !== input.taxpayer.taxYear) throw new Error("Form7206 foreign source year does not match the return.");
  const foreign = input.form2555 ? calculateForm2555({ ...input.form2555, taxYear: input.taxpayer.taxYear }, constants) : undefined;
  const params = { input: seSourceInput, scheduleCProfit: scheduleC.netProfit, scheduleFProfit: scheduleF.netFarmProfit,
    cryptoBusinessProfit: cryptoNet, selfEmploymentDeductions: scheduleSE.perTaxpayer.map(row => ({ accountHolder: row.accountHolder, amount: row.deductibleHalf })),
    foreignIncomeExclusion: foreign?.totalIncomeReduction ?? d(0), selfEmploymentSourcesVerified: scheduleSE.sourceFactsVerified,
    businessGrossIncomes: [{ sourceId: "scheduleC", amount: scheduleC.grossIncome }, { sourceId: "scheduleF", amount: scheduleF.grossFarmIncome }, { sourceId: "cryptoBusiness", amount: cryptoGross }] };
  const marketplace = result.marketplaceHealthInsurance;
  const physical = calculateForm7206Return({ ...params, marketplace: marketplace ? { stage: "final", deduction: marketplace } : undefined }).form7206;
  const nonspecified = marketplace?.method.startsWith("ordinary-no-ptc-")
    ? calculateForm7206Return({ ...params, marketplace: { stage: "maximum", historicalLimit: marketplace.historicalLimit } }).form7206 : physical;
  return { physical, nonspecified };
}
