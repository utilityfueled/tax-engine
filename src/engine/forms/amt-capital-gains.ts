/** Form6251 PartIII. Spec: spec/federal/amt-capital-gains.yaml */
import Decimal from "decimal.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";

export interface AMTCapitalGainsInput {
  amtBase: Decimal;
  preferentialIncome: Decimal; // Actual AMT QDCG4 or ScheduleD tax worksheet13
  section1250Gain: Decimal; // Actual AMT ScheduleD19
  totalCapitalGainRatesIncome: Decimal; // Actual6251line15
  regularZeroRateOrdinaryIncome: Decimal; // Regular QDCG5 or ScheduleD tax worksheet14
  regularFifteenRateOrdinaryIncome: Decimal; // Regular QDCG5 or ScheduleD tax worksheet21
  filingStatus: FilingStatus;
}
export interface AMTCapitalGainsResult { tax: Decimal; lines: CalculatedLine[] }

export function calculateAMTCapitalGains(
  input: AMTCapitalGainsInput,
  constants: Pick<YearConstants, "amt" | "capitalGainsRates">,
): AMTCapitalGainsResult {
  const values = [input.amtBase,input.preferentialIncome,input.section1250Gain,
    input.totalCapitalGainRatesIncome,input.regularZeroRateOrdinaryIncome,input.regularFifteenRateOrdinaryIncome];
  if (values.some(value => !Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) {
    throw new Error("Actual AMT capital-gain sources must be finite and nonnegative");
  }
  if (input.totalCapitalGainRatesIncome.lt(input.preferentialIncome)
    || input.totalCapitalGainRatesIncome.gt(input.preferentialIncome.plus(input.section1250Gain))) {
    throw new Error("AMT capital-gain source totals do not reconcile");
  }
  const audit = new AuditTrail();
  const l: Record<number, Decimal> = {};
  const set = (line: number, value: Decimal, formula: string): Decimal => {
    l[line] = roundDollar(value);
    audit.record("Form 6251",String(line),`Official PartIII line${line}`,l[line],formula);
    return l[line];
  };
  const ordinary = (income: Decimal): Decimal => {
    const threshold = constants.amt.rate26Limit[input.filingStatus];
    return roundDollar(Decimal.min(income,threshold).times("0.26")
      .plus(zeroFloor(income.minus(threshold)).times("0.28")));
  };
  set(12,input.amtBase,"Actual AMT base");
  set(13,input.preferentialIncome,"Actual AMT QDCG4 or ScheduleD tax worksheet13");
  set(14,input.section1250Gain,"Actual AMT ScheduleD19");
  set(15,input.totalCapitalGainRatesIncome,"Actual source6251line15");
  set(16,Decimal.min(l[12],l[15]),"min(12,15)");
  set(17,l[12].minus(l[16]),"12-16");
  set(18,ordinary(l[17]),"Actual-year26/28percent tax on17");
  set(19,constants.capitalGainsRates.zero.threshold[input.filingStatus],"Actual year zero-rate threshold");
  set(20,input.regularZeroRateOrdinaryIncome,"Actual regular QDCG5 or ScheduleD tax worksheet14");
  set(21,zeroFloor(l[19].minus(l[20])),"max(0,19-20)");
  set(22,Decimal.min(l[12],l[13]),"min(12,13)");
  set(23,Decimal.min(l[21],l[22]),"min(21,22)");
  set(24,l[22].minus(l[23]),"22-23");
  set(25,constants.capitalGainsRates.fifteen.threshold[input.filingStatus],"Actual year fifteen-percent threshold");
  set(26,l[21],"21");
  set(27,input.regularFifteenRateOrdinaryIncome,"Actual regular QDCG5 or ScheduleD tax worksheet21");
  set(28,l[26].plus(l[27]),"26+27");
  set(29,zeroFloor(l[25].minus(l[28])),"max(0,25-28)");
  set(30,Decimal.min(l[24],l[29]),"min(24,29)");
  set(31,l[30].times("0.15"),"roundDollar(30*0.15)");
  set(32,l[23].plus(l[30]),"23+30");
  const skipRemainder = l[32].eq(l[12]);
  set(33,skipRemainder ? d("0") : l[22].minus(l[32]),"22-32, or skipped");
  set(34,l[33].times("0.20"),"roundDollar(33*0.20)");
  const skip1250 = skipRemainder || l[14].isZero();
  set(35,skip1250 ? d("0") : l[17].plus(l[32]).plus(l[33]),"17+32+33, or skipped");
  set(36,skip1250 ? d("0") : l[12].minus(l[35]),"12-35, or skipped");
  set(37,l[36].times("0.25"),"roundDollar(36*0.25)");
  set(38,l[18].plus(l[31]).plus(l[34]).plus(l[37]),"18+31+34+37");
  set(39,ordinary(l[12]),"Actual-year26/28percent tax on12");
  const tax = set(40,Decimal.min(l[38],l[39]),"min(38,39)");
  return {tax,lines:audit.getLines()};
}
