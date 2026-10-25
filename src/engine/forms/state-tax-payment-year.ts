/** ScheduleA line5a cash-payment year; spec/federal/schedule-a.yaml. */
import Decimal from "decimal.js";
import type {TaxYearInput} from "@/models/inputs.js";
import {d} from "@/utils/decimal.js";

export function calculateStateTaxPaymentsInYear(input:TaxYearInput):Decimal {
  const year=input.taxpayer.taxYear;
  let total=d(0);
  for(const payment of [...(input.adjustments?.estimatedTaxPayments ?? []),...(input.adjustments?.extensionPayments ?? [])]) {
    if(payment.type!=="state") continue;
    const parsed=/^\d{4}-\d{2}-\d{2}$/.test(payment.date) ? new Date(`${payment.date}T00:00:00Z`) : undefined;
    if(!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==payment.date) throw new Error("State tax deduction requires actual valid payment date");
    const amount=d(payment.amount);
    if(!amount.isFinite() || amount.lt(0)) throw new Error("State tax payment must be finite and nonnegative");
    if(parsed.getUTCFullYear()===year) total=total.plus(amount);
  }
  for(const credit of input.adjustments?.priorYearAppliedCredits ?? []) {
    if(credit.type!=="state") continue;
    if(credit.sourceTaxYear!==year-1) throw new Error("State applied credit source year must be the immediately prior return year");
    const amount=d(credit.amount);
    if(!amount.isFinite() || amount.lt(0)) throw new Error("State applied credit must be finite and nonnegative");
    total=total.plus(amount);
  }
  return total;
}
