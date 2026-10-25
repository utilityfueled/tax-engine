/** Taxpayer deductions attributable to QBI. Spec: spec/federal/qbi-source-deductions.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { QBISource } from "./form-8995.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

type Owner = "primary" | "spouse";
export interface QBIDeductionSource extends QBISource {
  id: string;
  accountHolder?: Owner;
  netSEEarnings: Decimal;
  /** SE earnings include amounts excluded from this source's QBI. */
  excludedSEIncome?: boolean;
}
export interface QBIDeductionSourceAmount {
  sourceId: string;
  accountHolder: Owner;
  amount: Decimal;
  /** Only canonical shareholder-wage sources are outside business QBI here. */
  nonQbi?: boolean;
}
interface Params {
  taxYear: number;
  sources: QBIDeductionSource[];
  selfEmploymentDeductions: { accountHolder?: Owner; amount: Decimal }[];
  healthInsuranceDeduction: Decimal;
  retirementPlanDeduction: Decimal;
  sourceFactsVerified: boolean;
  allocation?: TaxYearInput["qbiDeductionAllocations"];
  healthInsuranceSources?: QBIDeductionSourceAmount[];
  retirementPlanSources?: QBIDeductionSourceAmount[];
}

export function calculateQBISourceDeductions(input: Params) {
  const audit = new AuditTrail();
  let sourceFactsVerified = input.sourceFactsVerified;
  const sources = input.sources.map(source => ({...source}));
  const assigned = sources.map(() => ({se:new Decimal(0),health:new Decimal(0),retirement:new Decimal(0)}));
  const nonnegative = (value: Decimal) => {
    if (!value.isFinite() || value.lt(0)) throw new Error("QBI allocation requires finite nonnegative deductions");
  };
  for (const value of [input.healthInsuranceDeduction,input.retirementPlanDeduction,...input.selfEmploymentDeductions.map(row=>row.amount)]) nonnegative(value);
  if (new Set(sources.map(source=>source.id)).size !== sources.length) throw new Error("Duplicate QBI source ID");
  if (input.allocation) {
    if (input.allocation.sourceFactsConfirmed !== true) throw new Error("QBI deduction allocation source facts are not confirmed");
    const seen = new Set<string>();
    const seByOwner = new Map<Owner,Decimal>();
    let totalHealth = new Decimal(0), totalRetirement = new Decimal(0);
    for (const row of input.allocation.rows) {
      const key = `${row.accountHolder}:${row.sourceId}`;
      if (seen.has(key)) throw new Error("Duplicate QBI deduction allocation");
      seen.add(key);
      const se=d(row.deductibleSelfEmploymentTax),health=d(row.selfEmployedHealthInsurance),retirement=d(row.selfEmployedRetirementPlans);
      [se,health,retirement].forEach(nonnegative);
      seByOwner.set(row.accountHolder,(seByOwner.get(row.accountHolder) ?? new Decimal(0)).plus(se));
      totalHealth=totalHealth.plus(health); totalRetirement=totalRetirement.plus(retirement);
      if (row.sourceId === "nonQbi") continue;
      const index=sources.findIndex(source=>source.id===row.sourceId);
      if (index < 0) throw new Error("QBI deduction allocation references an unknown source");
      if (sources[index].accountHolder !== row.accountHolder) throw new Error("QBI deduction allocation requires matching actual owner facts");
      assigned[index]={se,health,retirement};
    }
    if (input.selfEmploymentDeductions.some(row=>row.accountHolder===undefined)) throw new Error("QBI allocation cannot reconcile an unknown SE owner");
    for (const owner of ["primary","spouse"] as const) {
      const allowed=sum(...input.selfEmploymentDeductions.filter(row=>row.accountHolder===owner).map(row=>row.amount));
      if (!(seByOwner.get(owner) ?? new Decimal(0)).eq(allowed)) throw new Error("QBI SE deduction allocations do not reconcile by owner");
    }
    if (!totalHealth.eq(input.healthInsuranceDeduction) || !totalRetirement.eq(input.retirementPlanDeduction)) throw new Error("QBI health/retirement deduction allocations do not reconcile");
  } else {
    const allocate = (indexes:number[],amount:Decimal,key:keyof typeof assigned[number],ambiguous=false) => {
      if (amount.isZero()) return;
      if (!indexes.length) throw new Error("A positive QBI deduction has no attributable source");
      if (indexes.length > 1 || ambiguous) {
        sourceFactsVerified=false;
        if (input.taxYear >= 2026) throw new Error("2026 QBI requires actual deduction allocation for multiple trades or excluded SE income");
      }
      const denominator=sum(...indexes.map(index=>zeroFloor(sources[index].netSEEarnings)));
      let remaining=amount;
      indexes.forEach((index,position)=>{
        const allocated=position===indexes.length-1 ? remaining
          : Decimal.min(remaining,roundDollar(amount.times(zeroFloor(sources[index].netSEEarnings)).dividedBy(denominator)));
        assigned[index][key]=assigned[index][key].plus(allocated);
        remaining=remaining.minus(allocated);
      });
    };
    for (const deduction of input.selfEmploymentDeductions) {
      const indexes=sources.flatMap((source,index)=>source.netSEEarnings.gt(0)
        && (deduction.accountHolder===undefined || source.accountHolder===deduction.accountHolder) ? [index] : []);
      allocate(indexes,deduction.amount,"se",deduction.accountHolder===undefined || indexes.some(index=>sources[index].excludedSEIncome));
    }
    const positive=sources.flatMap((source,index)=>source.netSEEarnings.gt(0) ? [index] : []);
    if (!input.healthInsuranceSources) allocate(positive,input.healthInsuranceDeduction,"health",positive.some(index=>sources[index].excludedSEIncome));
    if (!input.retirementPlanSources) allocate(positive,input.retirementPlanDeduction,"retirement",positive.some(index=>sources[index].excludedSEIncome));
  }
  const bindActualSources = (actual: QBIDeductionSourceAmount[] | undefined, total: Decimal, key: "health" | "retirement") => {
    if (!actual) return;
    if (!sum(...actual.map(row => row.amount)).eq(total)) throw new Error(`QBI ${key} source totals do not reconcile`);
    const seen = new Set<string>(), bound = new Set<number>();
    const nonQbiByOwner = { primary: new Decimal(0), spouse: new Decimal(0) };
    for (const row of actual) {
      nonnegative(row.amount);
      const identity = `${row.accountHolder}:${row.sourceId}`;
      if (seen.has(identity)) throw new Error(`Duplicate QBI ${key} source`);
      seen.add(identity);
      if (row.nonQbi) {
        if (!/^formW2:\d+$/.test(row.sourceId)) throw new Error(`Unknown nonQBI ${key} source`);
        nonQbiByOwner[row.accountHolder] = nonQbiByOwner[row.accountHolder].plus(row.amount);
        continue;
      }
      const index = sources.findIndex(source => source.id === row.sourceId);
      if (index < 0 && row.amount.isZero()) continue;
      if (index < 0 || sources[index].accountHolder !== row.accountHolder) throw new Error(`QBI ${key} source requires the actual matching business and owner`);
      bound.add(index);
      if (sources[index].excludedSEIncome && row.amount.gt(0)) {
        if (!input.allocation) throw new Error(`Actual mixed-income ${key} source requires a completed QBI allocation`);
        if (assigned[index][key].gt(row.amount)) throw new Error(`QBI ${key} allocation exceeds its actual source`);
        nonQbiByOwner[row.accountHolder] = nonQbiByOwner[row.accountHolder].plus(row.amount.minus(assigned[index][key]));
      } else if (input.allocation) {
        if (!assigned[index][key].eq(row.amount)) throw new Error(`QBI ${key} allocation must reconcile its actual business source`);
      } else assigned[index][key] = row.amount;
    }
    assigned.forEach((row,index) => { if (!bound.has(index) && !row[key].isZero()) throw new Error(`QBI ${key} allocation has no actual source for that business`); });
    if (input.allocation) for (const owner of ["primary", "spouse"] as const) {
      const field = key === "health" ? "selfEmployedHealthInsurance" : "selfEmployedRetirementPlans";
      const actualNonQbi = sum(...input.allocation.rows.filter(row => row.sourceId === "nonQbi" && row.accountHolder === owner).map(row => d(row[field])));
      if (!actualNonQbi.eq(nonQbiByOwner[owner])) throw new Error(`QBI nonbusiness ${key} allocations do not reconcile the actual owner sources`);
    }
  };
  bindActualSources(input.healthInsuranceSources,input.healthInsuranceDeduction,"health");
  bindActualSources(input.retirementPlanSources,input.retirementPlanDeduction,"retirement");
  sources.forEach((source,index)=>{
    const deduction=assigned[index];
    source.qbi=source.qbi.minus(sum(deduction.se,deduction.health,deduction.retirement));
    audit.record("QBI Source Deductions",source.id,`Adjusted QBI: ${source.name}`,source.qbi,
      sourceFactsVerified ? "Source QBI less reconciled attributable taxpayer deductions" : "Historical preview attribution; source verification incomplete",
      {"SE tax deduction":deduction.se,"SE health insurance":deduction.health,"SE retirement plans":deduction.retirement,
        "Owner":source.accountHolder ?? "unknown"});
  });
  return {sources,sourceFactsVerified,lines:audit.getLines()};
}
