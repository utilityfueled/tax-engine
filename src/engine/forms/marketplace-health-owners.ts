/** Actual two-owner attribution. Spec: spec/federal/marketplace-health-owners.yaml. */
import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/inputs.js";
import type { MarketplaceHealthPremiumGroup } from "./marketplace-health-premiums.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

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
  specifiedDeduction: Decimal;
}
function finite(value: Decimal, nonnegative = true): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite() || (nonnegative && value.lt(0))) throw new Error("Pub974 owner attribution requires actual finite calculation amounts.");
  return value;
}
export function calculateMarketplaceOwnerDeductions(params: Params) {
  if (![2025, 2026].includes(params.taxYear) || params.filingStatus !== "married_filing_jointly") throw new Error("Pub974 two-owner attribution requires the actual 2025 or 2026 joint return.");
  if (params.stage.kind === "worksheet-w" && params.taxYear !== 2025) throw new Error("Pub974 historical Worksheet W attribution requires 2025.");
  finite(params.specifiedDeduction);
  const specified = params.groups.filter(row => row.months.length > 0);
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
      monthlyPremiums = monthlyPremiums.plus(month.specifiedPremium);
      if (month.sourcePremium.gt(0)) advances = advances.plus(month.advancePremiumTaxCredit.times(month.specifiedPremium).div(month.sourcePremium));
    }
    if (!monthlyPremiums.eq(premiums)) throw new Error("Pub974 owner monthly premiums do not reconcile their business source.");
    let credit = d(0);
    let deduction = params.stage.kind === "worksheet-w" ? premiums.minus(advances) : premiums;
    if (completed) {
      const row = completed.find(item => item.businessSourceId === group.businessSourceId);
      if (!row || row.accountHolder !== group.accountHolder) throw new Error("Pub974 completed business must match its actual owner.");
      credit = finite(row.allocatedCredit);
      deduction = finite(row.netPremiumsAfterCredit);
      // Rounded Form8962 credit can exceed the exact source premium by cents;
      // the existing Step3 zero floor is retained, without changing originals.
      if (roundDollar(credit).gt(roundDollar(premiums)) || !deduction.eq(zeroFloor(premiums.minus(credit)))) throw new Error("Pub974 final owner net premiums do not reconcile the calculated credit.");
    }
    byBusiness.set(group.businessSourceId, { premiums, advances, credit, deduction });
  }
  const audit = new AuditTrail();
  const owners = (["primary", "spouse"] as const).map(accountHolder => {
    const groups = specified.filter(row => row.accountHolder === accountHolder);
    const records = groups.map(row => {
      const record = byBusiness.get(row.businessSourceId);
      if (!record) throw new Error("Pub974 actual owner source is incomplete.");
      return record;
    });
    const specifiedPremiums = sum(...records.map(row => row.premiums));
    const remainingEarnedIncome = sum(...groups.map(row => row.remainingEarnedIncome));
    if (remainingEarnedIncome.lt(specifiedPremiums)) throw new Error("Pub974 binding owner earned-income limits require the separate owner coordination method.");
    const specifiedAdvances = sum(...records.map(row => row.advances));
    const allocatedCredit = sum(...records.map(row => row.credit));
    const specifiedDeduction = sum(...records.map(row => row.deduction));
    for (const [line, description, value, formula] of [
      ["premiums", "Actual owner specified premiums", specifiedPremiums, "Sum actual plan premiums bound to this owner"],
      ["earned-income", "Actual owner remaining earned income", remainingEarnedIncome, "Sum same-owner completed business limits; no spouse income transfer"],
      ["deduction", "Specified deduction attributable to this owner", specifiedDeduction,
        params.stage.kind === "worksheet-w" ? "Owner specified premiums minus actual attributable advances"
          : params.stage.kind === "maximum" ? "Owner specified premiums; neither owner income nor combined maximum binds"
            : "Sum owner plan premiums after calculated Step2 credit; no combined cap reduction"],
    ] as const) audit.record("Pub974 Owner Allocation", `${accountHolder}:${line}`, description, value, formula, { "Owner": accountHolder, "Stage": params.stage.kind });
    return { accountHolder, specifiedPremiums, remainingEarnedIncome, specifiedAdvances, allocatedCredit, specifiedDeduction };
  });
  if (!sum(...owners.map(row => row.specifiedDeduction)).eq(params.specifiedDeduction)) throw new Error("Pub974 binding combined repayment-cap deduction requires a separate actual owner attribution method.");
  return { owners, lines: audit.getLines() };
}
