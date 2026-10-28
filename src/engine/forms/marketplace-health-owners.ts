/** Actual two-owner attribution. Spec: spec/federal/marketplace-health-owners.yaml. */
import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/inputs.js";
import type { MarketplaceHealthPremiumGroup } from "./marketplace-health-premiums.js";
import { sumSourceMoney } from "@/utils/sum-source-money.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, zeroFloor } from "@/utils/decimal.js";

type Owner = "primary" | "spouse";
interface CompletedBusiness {
  businessSourceId: string;
  accountHolder: Owner;
  allocatedCredit: Decimal;
  netPremiumsAfterCredit: Decimal;
}
interface Params {
  taxYear: number;
  filingStatus: FilingStatus;
  groups: readonly MarketplaceHealthPremiumGroup[];
  /** These stages and amounts come from the canonical calculation, never input. */
  stage: { kind: "worksheet-w" | "maximum" } | { kind: "final"; businesses: readonly CompletedBusiness[] };
  /** Optional independently calculated total to reconcile, never an override. */
  specifiedDeduction?: Decimal;
}
function finite(value: Decimal, nonnegative = true): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite() || (nonnegative && value.lt(0))) throw new Error("Pub974 owner attribution requires actual finite calculation amounts.");
  return value;
}
export function calculateMarketplaceOwnerDeductions(params: Params) {
  if (![2025, 2026].includes(params.taxYear) || params.filingStatus !== "married_filing_jointly") throw new Error("Pub974 two-owner attribution requires the actual 2025 or 2026 joint return.");
  if (params.stage.kind === "worksheet-w" && params.taxYear !== 2025) throw new Error("Pub974 historical Worksheet W attribution requires 2025.");
  if (params.specifiedDeduction !== undefined) finite(params.specifiedDeduction, !params.groups.some(row => row.creditAllocationMethod));
  const specified = params.groups.filter(row => row.months.length > 0 && row.includedInEarnedIncomeLimit !== false);
  if (new Set(specified.map(row => row.accountHolder)).size !== 2 || specified.some(row => !["primary", "spouse"].includes(row.accountHolder))) throw new Error("Pub974 two-owner attribution requires both actual owners.");
  if (new Set(params.groups.map(row => row.businessSourceId)).size !== params.groups.length || params.groups.some(row => !row.businessSourceId.trim())) throw new Error("Pub974 owner attribution requires unique business source identities.");
  const byBusiness = new Map<string, { premiums: Decimal; advances: Decimal; credit: Decimal; deduction: Decimal }>();
  const completed = params.stage.kind === "final" ? params.stage.businesses : undefined;
  if (completed && (completed.length !== params.groups.length || new Set(completed.map(row => row.businessSourceId)).size !== completed.length)) throw new Error("Pub974 final owner attribution requires unique completed business records.");
  for (const group of specified) {
    const premiums = finite(group.specifiedPremiums);
    finite(group.remainingEarnedIncome, false);
    const months = new Set<number>();
    let advances = d(0), monthlyPremiums = d(0);
    for (const month of group.months) {
      if (!Number.isInteger(month.month) || month.month < 1 || month.month > 12 || months.has(month.month)) throw new Error("Pub974 owner attribution has a duplicate or invalid source month.");
      months.add(month.month);
      for (const value of [month.specifiedPremium, month.sourcePremium, month.advancePremiumTaxCredit]) finite(value);
      if (month.specifiedPremium.gt(month.sourcePremium) || month.advancePremiumTaxCredit.gt(month.sourcePremium)) throw new Error("Pub974 owner amounts exceed their actual source month.");
      if (month.specifiedAdvancePremiumTaxCredit !== undefined && finite(month.specifiedAdvancePremiumTaxCredit).gt(month.advancePremiumTaxCredit)) throw new Error("Pub974 owner specified advances exceed the actual source advance.");
      monthlyPremiums = sumSourceMoney(monthlyPremiums, month.specifiedPremium);
      if (month.sourcePremium.gt(0)) advances = advances.plus((month.specifiedAdvancePremiumTaxCredit ?? month.advancePremiumTaxCredit.times(month.specifiedPremium).div(month.sourcePremium)));
    }
    if (!monthlyPremiums.eq(premiums)) throw new Error("Pub974 owner monthly premiums do not reconcile their business source.");
    let credit = d(0);
    let deduction = params.stage.kind === "worksheet-w" ? sumSourceMoney(premiums, advances.negated()) : premiums;
    if (completed) {
      const row = completed.find(item => item.businessSourceId === group.businessSourceId);
      if (!row || row.accountHolder !== group.accountHolder) throw new Error("Pub974 completed business must match its actual owner.");
      credit = finite(row.allocatedCredit);
      deduction = finite(row.netPremiumsAfterCredit, !group.creditAllocationMethod);
      // Rounded Form8962 credit can exceed the exact source premium by cents;
      // preserve the recorded method's signed difference; the legacy path
      // retains its existing zero floor without changing originals.
      const sourcePremium = group.creditAllocationMethod ? sumSourceMoney(...group.months.map(month => finite(month.creditAllocationPremium!))) : premiums;
      const expected = group.creditAllocationMethod ? sumSourceMoney(premiums, credit.negated()) : zeroFloor(sumSourceMoney(premiums, credit.negated()));
      if (roundDollar(credit).gt(roundDollar(sourcePremium)) || !deduction.eq(expected)) throw new Error("Pub974 final owner net premiums do not reconcile the calculated credit.");
    }
    byBusiness.set(group.businessSourceId, { premiums, advances, credit, deduction });
  }
  const audit = new AuditTrail();
  const hasHistoricalAdvances = params.taxYear === 2025 && sumSourceMoney(...[...byBusiness.values()].map(row => row.advances)).gt(0);
  const owners = (["primary", "spouse"] as const).map(accountHolder => {
    const groups = specified.filter(row => row.accountHolder === accountHolder);
    const records = groups.map(row => {
      const record = byBusiness.get(row.businessSourceId);
      if (!record) throw new Error("Pub974 actual owner source is incomplete.");
      return record;
    });
    const specifiedPremiums = sumSourceMoney(...records.map(row => row.premiums));
    const remainingEarnedIncome = sumSourceMoney(...groups.map(row => row.remainingEarnedIncome));
    if (hasHistoricalAdvances && remainingEarnedIncome.lt(specifiedPremiums)) throw new Error("Pub974 binding owner earned-income limits with historical advances require the separate capped-repayment coordination method.");
    const specifiedAdvances = sumSourceMoney(...records.map(row => row.advances));
    const allocatedCredit = sumSourceMoney(...records.map(row => row.credit));
    const specifiedDeduction = min(sumSourceMoney(...records.map(row => row.deduction)), zeroFloor(remainingEarnedIncome));
    for (const [line, description, value, formula] of [
      ["premiums", "Actual owner specified premiums", specifiedPremiums, "Sum actual plan premiums bound to this owner"],
      ["earned-income", "Actual owner remaining earned income", remainingEarnedIncome, "Sum same-owner completed business limits; no spouse income transfer"],
      ["deduction", "Specified deduction attributable to this owner", specifiedDeduction,
        params.stage.kind === "worksheet-w" ? "min(owner premiums minus actual attributable advances, nonnegative same-owner remaining earned income)"
          : params.stage.kind === "maximum" ? "min(owner specified premiums, nonnegative same-owner remaining earned income)"
            : "min(sum owner plan premiums after calculated Step2 credit, nonnegative same-owner remaining earned income); no combined cap allocation"],
    ] as const) audit.record("Pub974 Owner Allocation", `${accountHolder}:${line}`, description, value, formula, { "Owner": accountHolder, "Stage": params.stage.kind });
    return { accountHolder, specifiedPremiums, remainingEarnedIncome, specifiedAdvances, allocatedCredit, specifiedDeduction };
  });
  const specifiedDeduction = sumSourceMoney(...owners.map(row => row.specifiedDeduction));
  if (params.specifiedDeduction !== undefined && !specifiedDeduction.eq(params.specifiedDeduction)) throw new Error("Pub974 combined deduction must reconcile actual owner limits; a binding repayment-cap deduction requires its separate owner attribution method.");
  return { owners, specifiedDeduction, lines: audit.getLines() };
}
