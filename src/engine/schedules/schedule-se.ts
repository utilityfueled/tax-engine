/** Schedule SE regular method. Spec: spec/federal/schedule-se.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { YearConstants } from "@/models/constants.js";
import { calculateForm4137 } from "@/engine/forms/form-4137.js";
import { calculateForm8919 } from "@/engine/forms/form-8919.js";
import { calculateScheduleC } from "./schedule-c.js";
import { calculateScheduleF } from "./schedule-f.js";
import { d, zeroFloor, min, roundDollar, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

type Owner = "primary" | "spouse";
export interface ScheduleSEAmounts {
  netFarmProfit: Decimal; // Line 1a
  netNonfarmProfit: Decimal; // Line 2
  netSEEarnings: Decimal; // Line 3, before the .9235 adjustment
  taxableEarnings: Decimal; // Nonnegative line 4a; retained compatibility alias
  earningsSubjectToSETax: Decimal; // Line 6, after the line 4c filing threshold
  socialSecurityPortion: Decimal; // Line 10
  medicarePortion: Decimal; // Line 11
  totalSETax: Decimal; // Line 12
  deductibleHalf: Decimal; // Line 13
  lines: CalculatedLine[];
}
export interface ScheduleSEPerTaxpayer extends ScheduleSEAmounts { accountHolder?: Owner }
export interface ScheduleSEResult extends ScheduleSEAmounts {
  /** Source attribution and payroll/K-1 facts verified for the regular-method slice, not filing qualification. */
  sourceFactsVerified: boolean;
  perTaxpayer: ScheduleSEPerTaxpayer[];
}
interface ProfitSource { amount: Decimal; owner?: Owner; kind: "farm" | "nonfarm"; label: string }

function calculateIndividual(
  input: TaxYearInput, constants: YearConstants, profits: ProfitSource[],
  owner: Owner | undefined, aggregateLegacy: boolean,
): ScheduleSEPerTaxpayer {
  const audit = new AuditTrail();
  const se = constants.selfEmploymentTax;
  const netFarmProfit = sum(...profits.filter(p => p.kind === "farm").map(p => p.amount));
  const netNonfarmProfit = sum(...profits.filter(p => p.kind === "nonfarm").map(p => p.amount));
  const netSEEarnings = netFarmProfit.plus(netNonfarmProfit);
  const line4a = netSEEarnings.gt(0) ? roundDollar(netSEEarnings.times(se.earningsMultiplier)) : netSEEarnings;
  const taxableEarnings = zeroFloor(line4a);
  const earningsSubjectToSETax = taxableEarnings.gte(400) ? taxableEarnings : new Decimal(0);
  const belongs = (sourceOwner?: Owner) => aggregateLegacy || (sourceOwner ?? (input.taxpayer.filingStatus !== "married_filing_jointly" ? "primary" : undefined)) === owner;
  const w2s = input.w2s.filter(w2 => belongs(w2.accountHolder));
  const w2SSWages = sum(...w2s.map(w2 => d(w2.socialSecurityWages)));
  const w2SSTips = sum(...w2s.map(w2 => d(w2.socialSecurityTips)));
  const w2SSWagesAndTips = roundDollar(w2SSWages.plus(w2SSTips));
  const tips = input.form4137 && belongs(input.form4137.accountHolder) ? calculateForm4137(input.form4137, constants, {
    socialSecurityWagesAndTipsAlreadyReported: w2SSWages,
    socialSecurityTipsAlreadyReported: w2SSTips,
  }).line10 : new Decimal(0);
  const wages = input.form8919 && belongs(input.form8919.accountHolder) ? calculateForm8919(input.form8919, constants, {
    socialSecurityWagesAndTipsAlreadyReported: w2SSWages,
    w2SocialSecurityTipsAlreadyReported: w2SSTips,
    form4137SocialSecurityTipsAlreadyReported: tips,
  }).line10 : new Decimal(0);
  const rrta = input.form8919 && belongs(input.form8919.accountHolder)
    ? zeroFloor(d(input.form8919.rrtaCompensationSubjectToSocialSecurityTax)) : new Decimal(0);
  const line8a = w2SSWagesAndTips.plus(roundDollar(rrta));
  const line8d = sum(line8a, roundDollar(tips), roundDollar(wages));
  const ssRemaining = zeroFloor(se.socialSecurityWageBase.minus(line8d));
  const ssTaxable = min(earningsSubjectToSETax, ssRemaining);
  const socialSecurityPortion = roundDollar(ssTaxable.times(se.socialSecurityRate));
  const medicarePortion = roundDollar(earningsSubjectToSETax.times(se.medicareRate));
  const totalSETax = socialSecurityPortion.plus(medicarePortion);
  const deductibleHalf = roundDollar(totalSETax.times(se.deductiblePortion));
  const record = (line: string, description: string, value: Decimal, formula: string, inputs: Record<string, Decimal | string> = {}) =>
    audit.record("Sched SE", line, description, value, formula, { ...inputs, "Taxpayer owner": owner ?? "unverified legacy aggregate" });
  record("1a", "Net farm profit or loss", netFarmProfit, "Schedule F line34 plus adjusted farming K-1 Box14A");
  record("1b", "Excluded CRP payments", new Decimal(0), "No CRP adjustment represented in the regular-method slice");
  record("2", "Net nonfarm profit", netNonfarmProfit, "Schedule C line31 plus adjusted nonfarm K-1 Box14A and other business earnings; Box4 not added twice", {
    "Schedule C Line 31 net profit": sum(...profits.filter(p => p.label === "Schedule C").map(p => p.amount)),
    "K-1 self-employment earnings": sum(...profits.filter(p => p.label === "K-1" && p.kind === "nonfarm").map(p => p.amount)),
  });
  record("3", "Combined net profit", netSEEarnings, "Line1a - line1b + line2 for this person", { "Line 1a": netFarmProfit, "Line 2": netNonfarmProfit });
  record("4a", "Adjusted net earnings", line4a, "Positive line3 times0.9235, rounded; otherwise signed line3");
  record("4b", "Optional-method earnings", new Decimal(0), "Regular method");
  record("4c", "Combined adjusted earnings", line4a, "Lines4a +4b; stop below400");
  record("5a", "Church employee income", new Decimal(0), "No church-employee income represented in this slice");
  record("5b", "Adjusted church employee income", new Decimal(0), "No church-employee income represented in this slice");
  record("6", "Earnings subject to SE tax", earningsSubjectToSETax, "Lines4c +5b after the filing threshold");
  record("7", "Social Security wage base", se.socialSecurityWageBase, "Year-specific statutory limit");
  record("8a", "Social Security wages and tips", line8a, "This person's W2 Boxes3 +7 and applicable Tier1 compensation");
  record("8b", "Unreported tips subject to Social Security", roundDollar(tips), "This person's Form4137line10");
  record("8c", "Unreported employee wages subject to Social Security", roundDollar(wages), "This person's Form8919line10");
  record("8d", "Total covered employee compensation", line8d, "Lines8a +8b +8c");
  record("9", "Remaining Social Security wage base", ssRemaining, "max(0,line7 -line8d)");
  record("10", "SS portion", socialSecurityPortion, "round(min(line6,line9) times0.124)", {
    "Line 6 taxable earnings": earningsSubjectToSETax, "W-2 SS wages": w2SSWages,
    "W-2 SS tips": w2SSTips, "Supported Form 4137 Line 10 tips": tips,
    "Supported Form 8919 Line 10 wages": wages, "Remaining SS wage base room": ssRemaining,
    "SS-taxable earnings after cap": ssTaxable,
  });
  record("11", "Medicare portion", medicarePortion, "round(line6 times0.029)");
  record("12", "Total SE tax", totalSETax, "Line10 +line11", { "Line 10": socialSecurityPortion, "Line 11": medicarePortion });
  record("13", "Deductible half", deductibleHalf, "round(line12 times0.5)", { "Line 12": totalSETax });
  return { accountHolder: owner, netFarmProfit, netNonfarmProfit, netSEEarnings, taxableEarnings,
    earningsSubjectToSETax, socialSecurityPortion, medicarePortion, totalSETax, deductibleHalf, lines: audit.getLines() };
}

export function calculateScheduleSE(
  input: TaxYearInput, constants: YearConstants,
  scheduleCNetProfitOverride?: Decimal, scheduleFNetProfitOverride?: Decimal,
  options: { additionalNonfarmIncome?: Decimal; additionalNonfarmOwner?: Owner } = {},
): ScheduleSEResult {
  const strict = input.taxpayer.taxYear >= 2026;
  const joint = input.taxpayer.filingStatus === "married_filing_jointly";
  let sourceFactsVerified = true;
  const resolveOwner = (owner: Owner | undefined, label: string): Owner | undefined => {
    if (!joint) {
      if (owner === "spouse") throw new Error(`${label}: spouse-owned SE source requires a joint return`);
      return "primary";
    }
    if (owner === undefined) {
      sourceFactsVerified = false;
      if (strict) throw new Error(`${label}: actual owner attribution is required for 2026 Schedule SE`);
    }
    return owner;
  };
  const rawProfits: ProfitSource[] = [];
  const add = (amount: Decimal, owner: Owner | undefined, kind: ProfitSource["kind"], label: string) => {
    if (!amount.isFinite()) throw new Error(`${label}: finite SE earnings required`);
    if (!amount.isZero()) rawProfits.push({ amount, owner: resolveOwner(owner,label), kind, label });
  };
  const necOwners = new Set(input.form1099Nec.filter(f => !d(f.nonemployeeCompensation).isZero()).map(f => f.accountHolder));
  if (joint && necOwners.has(undefined)) {
    sourceFactsVerified = false;
    if (strict) throw new Error("2026 Schedule SE requires actual NEC source owner attribution");
  }
  const cOwner = input.scheduleC?.accountHolder ?? (necOwners.size === 1 ? [...necOwners][0] : undefined);
  if (necOwners.size > 1 || (cOwner !== undefined && [...necOwners].some(owner => owner !== undefined && owner !== cOwner))) {
    throw new Error("A single Schedule C cannot combine different proprietor source owners");
  }
  add(scheduleCNetProfitOverride ?? calculateScheduleC(input,input.scheduleC).netProfit,cOwner,"nonfarm","Schedule C");
  add(scheduleFNetProfitOverride ?? calculateScheduleF(input.scheduleF).netFarmProfit,input.scheduleF?.accountHolder,"farm","Schedule F");
  add(options.additionalNonfarmIncome ?? new Decimal(0),options.additionalNonfarmOwner,"nonfarm","Additional nonfarm business");
  for (const k1 of input.scheduleK1) {
    if (k1.entityType === "s_corporation") {
      if (!d(k1.selfEmploymentEarnings).isZero()) throw new Error("S-corporation K-1 cannot report partnership Box14A SE earnings");
      continue;
    }
    const verified = k1.selfEmploymentFactsConfirmed === true && k1.selfEmploymentEarnings !== undefined
      && k1.selfEmploymentNetEarningsAfterAdjustments !== undefined && k1.selfEmploymentIncomeType !== undefined;
    if (!verified) {
      sourceFactsVerified = false;
      if (strict) throw new Error("2026 K-1 SE requires actual Box14A, adjusted partner earnings and farm/nonfarm source facts");
    }
    const amount = d(verified ? k1.selfEmploymentNetEarningsAfterAdjustments : k1.selfEmploymentEarnings);
    add(amount,k1.accountHolder,k1.selfEmploymentIncomeType ?? "nonfarm","K-1");
  }
  if (rawProfits.length) {
    for (const w2 of input.w2s) {
      resolveOwner(w2.accountHolder,"W-2");
      for (const key of ["socialSecurityWages","socialSecurityTips"] as const) {
        if (w2[key] === undefined) {
          sourceFactsVerified = false;
          if (strict) throw new Error("2026 Schedule SE requires actual W2 payroll Boxes3 and7, including known zero tips");
        } else if (!d(w2[key]).isFinite() || d(w2[key]).lt(0)) throw new Error("Invalid W2 Social Security payroll amount");
      }
    }
    if (input.form4137) resolveOwner(input.form4137.accountHolder,"Form4137");
    if (input.form8919) resolveOwner(input.form8919.accountHolder,"Form8919");
  }
  const hasUnknownOwner = joint && (rawProfits.some(p => p.owner === undefined)
    || input.w2s.some(w => w.accountHolder === undefined)
    || (input.form4137 !== undefined && input.form4137.accountHolder === undefined)
    || (input.form8919 !== undefined && input.form8919.accountHolder === undefined));
  const perTaxpayer = hasUnknownOwner && rawProfits.length
    ? [calculateIndividual(input,constants,rawProfits,undefined,true)]
    : (["primary","spouse"] as const).filter(owner => rawProfits.some(p => p.owner === owner))
      .map(owner => calculateIndividual(input,constants,rawProfits.filter(p => p.owner === owner),owner,false));
  const empty = calculateIndividual(input,constants,[],joint ? undefined : "primary",false);
  const total = (key: Exclude<keyof ScheduleSEAmounts,"lines">) => sum(...perTaxpayer.map(row => row[key]));
  const lines = perTaxpayer.length > 1
    ? perTaxpayer.flatMap(row => row.lines.map(line => ({...line,form:`Sched SE (${row.accountHolder})`})))
    : perTaxpayer[0]?.lines ?? empty.lines;
  return { sourceFactsVerified, perTaxpayer, netFarmProfit:total("netFarmProfit"),netNonfarmProfit:total("netNonfarmProfit"),
    netSEEarnings:total("netSEEarnings"),taxableEarnings:total("taxableEarnings"),earningsSubjectToSETax:total("earningsSubjectToSETax"),
    socialSecurityPortion:total("socialSecurityPortion"),medicarePortion:total("medicarePortion"),totalSETax:total("totalSETax"),
    deductibleHalf:total("deductibleHalf"),lines };
}
