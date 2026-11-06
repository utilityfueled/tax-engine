/** Finite original-sourced Pub525 recoveries; spec/federal/taxable-state-refund-recoveries.yaml. */
import Decimal from "decimal.js";
import {TaxableRefundWorksheetSchema, type TaxYearInput, type TaxableStateRefundYearInput} from "@/models/inputs.js";
import type {CalculatedLine} from "@/models/outputs.js";
import {AuditTrail} from "@/utils/audit.js";
import {roundDollar} from "@/utils/decimal.js";
import {calculateForm1099G, type Form1099GResult} from "./form-1099-g.js";
import {calculateTaxableRefundWorksheet, type TaxableRefundWorksheetResult} from "./taxable-refund-worksheet.js";

export interface TaxableStateRefundRecoveriesResult {
  taxableRefund: Decimal;
  currentYearRefund: Decimal;
  years: Array<{priorTaxYear:number; worksheet:TaxableRefundWorksheetResult}>;
  allocations: Form1099GResult["refundSources"];
  lines: CalculatedLine[];
}
const exclusions = ["priorYearHadAMT", "priorYearHadUnusedTaxCredits", "priorYearHadTaxCredits", "priorYearUsedSpecialTaxComputation", "priorYearUsedPreferentialTaxWorksheet", "priorYearWasDependent", "priorYearNonresidentAlien", "priorYearHadCarryoverBenefits", "priorYearHadOtherRecoveries", "priorYearHadEarlierRefunds", "priorYearBlind", "priorYearDeceased", "priorYearMandatoryItemization", "communityPropertyAllocationRequired"] as const;
function money(value:string|undefined):Decimal {
  if (value === undefined || !/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) throw new Error("Refund historical and payment amounts require actual bounded nonnegative cents; unknown is not zero.");
  return new Decimal(value);
}
function source(value:string|undefined):asserts value is string {if(!value?.trim()) throw new Error("Refund requires actual documentary source references.");}
/** Compare original lexemes and provenance, not merely equivalent monetary values. */
function original(value:unknown):string {
  if(Array.isArray(value)) return `array[${value.map(original).join(",")}]`;
  if(value !== null && typeof value === "object") return `object{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${original(item)}`).join(",")}}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}
function historicalFacts(input:TaxYearInput, facts:TaxableStateRefundYearInput):void {
  const year=facts.priorTaxYear, status=input.taxpayer.filingStatus;
  if ((year!==2024 && year!==2025) || year>=input.taxpayer.taxYear || !["single","married_filing_jointly"].includes(status)) throw new Error("Refund collection only supports actual 2024/2025 single or joint historical returns before receipt.");
  source(facts.sourceReference);
  if(facts.sourceFactsConfirmed!==true || facts.priorYearFilingStatus!==status || facts.priorYearPrimarySsn!==input.taxpayer.primary.ssn || facts.priorYearSpouseSsn!==input.taxpayer.spouse?.ssn) throw new Error("Refund historical return ownership and filing status must match actual current owners.");
  for(const key of exclusions) if(facts[key]!==false) throw new Error("Refund special tax, carryover, owner, age or other-recovery treatment is unknown or outside this method.");
  for(const person of [input.taxpayer.primary,...(input.taxpayer.spouse?[input.taxpayer.spouse]:[])]) {
    const dob=person.dateOfBirth;
    if(!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(Date.parse(dob+"T00:00:00Z")) || new Date(dob+"T00:00:00Z").toISOString().slice(0,10)!==dob || dob<=`${year-64}-01-01` || dob>`${year}-12-31`) throw new Error("Refund historical standard deduction requires actual under-65 birth dates.");
  }
  if((status==="married_filing_jointly")!==Boolean(input.taxpayer.spouse)) throw new Error("Refund history requires actual consistent single or joint owners.");
  if(year===2025 && money(facts.priorYearSaltMagi).lt(money(facts.priorYearAdjustedGrossIncome))) throw new Error("Refund historical SALT MAGI contradicts actual AGI.");
  const joint=status==="married_filing_jointly";
  const standard=money(facts.priorYearStandardDeduction);
  if(!standard.eq(year===2024?(joint?"29200":"14600"):(joint?"31500":"15750"))) throw new Error("Refund historical standard deduction does not match independently sourced ordinary year/status amount.");
  if(typeof facts.priorYearItemized!=="boolean" || (facts.priorYearItemized && !["income","sales"].includes(facts.priorYearStateLocalTaxElection??""))) throw new Error("Refund requires actual historical deduction and income/sales election.");
  const income=money(facts.priorYearStateLocalTaxesPaid), property=money(facts.priorYearPropertyTaxesPaid), sales=money(facts.priorYearAlternativeGeneralSalesTaxDeduction);
  const itemized=money(facts.priorYearItemizedTotal), claimedSalt=money(facts.priorYearSaltDeduction), other=money(facts.priorYearOtherItemizedDeductions);
  const agi=money(facts.priorYearAdjustedGrossIncome), taxable=money(facts.priorYearTaxableIncome), extra=money(facts.priorYearAdditionalDeductions);
  if(!extra.isZero()) throw new Error("Refund additional below-AGI deductions require separately supported tax-benefit treatment.");
  const cap=year===2024?new Decimal(10000):roundDollar(Decimal.max(10000,new Decimal(40000).minus(Decimal.max(0,money(facts.priorYearSaltMagi).minus(500000)).times("0.30"))));
  if(facts.priorYearItemized) {
    if(!claimedSalt.eq(Decimal.min(cap,(facts.priorYearStateLocalTaxElection==="income"?income:sales).plus(property))) || !itemized.eq(claimedSalt.plus(other))) throw new Error("Refund actual historical ScheduleA deductions do not reconcile to original tax payments and cap.");
  } else if(!itemized.isZero() || !claimedSalt.isZero() || !other.isZero()) throw new Error("Refund standard-deduction return contradicts claimed itemized deductions.");
  const deduction=facts.priorYearItemized?itemized:standard;
  if(agi.lt(deduction) || !agi.minus(deduction).eq(taxable)) throw new Error("Refund actual historical taxable income is negative or does not reconcile; special Worksheet2 treatment is unsupported.");
}

export function calculateTaxableStateRefundRecoveries(input:TaxYearInput):TaxableStateRefundRecoveriesResult {
  const packet=input.taxableStateRefundRecoveries, year=input.taxpayer.taxYear;
  if(!packet || input.taxableRefundWorksheet || ![2025,2026].includes(year)) throw new Error("Refund source collection and legacy worksheet are mutually exclusive supported methods.");
  source(packet.sourceReference);
  if(packet.methodVersion!=="state-income-tax-recoveries-v1" || packet.sourceTaxYear!==year || packet.sourceFactsConfirmed!==true || packet.allRefundSourcesIncludedConfirmed!==true || original(packet.originalTaxpayer)!==original(input.taxpayer)) throw new Error("Refund collection requires complete current original owner/year facts.");
  const forms=(input.form1099G??[]).filter(form=>form.refundPaymentBasis!==undefined || Decimal.max(new Decimal(form.stateOrLocalTaxRefund??0),new Decimal(form.stateLocalIncomeTaxRefund??0)).gt(0));
  if(!forms.length || forms.length>100 || !packet.sourceOriginals || packet.sourceOriginals.length!==forms.length) throw new Error("Refund collection requires exact complete original refund inventory.");
  const ids=new Set<string>(), paymentRefs=new Set<string>(), currentLinks=new Set<string>();
  for(const form of forms) {
    if(!form.sourceId || ids.has(form.sourceId)) throw new Error("Refund collection has a missing or duplicate original identity.");
    ids.add(form.sourceId);
    const originals=packet.sourceOriginals.filter(row=>row.sourceId===form.sourceId);
    const saved=originals[0];
    if(originals.length!==1 || !saved || original(saved.original)!==original(form)) throw new Error("Refund original source was edited or does not match the current statement.");
    if(form.accountHolder==="spouse" && !input.taxpayer.spouse) throw new Error("Refund spouse source requires actual joint owners.");
    if(!form.refundPaymentBasis) throw new Error("Refund collection requires actual complete payment basis for each source, not guessed origin years.");
    for(const payment of form.refundPaymentBasis.payments??[]) {
      source(payment.sourceReference);
      const paymentIdentity=payment.sourceReference.trim();
      if(paymentRefs.has(paymentIdentity)) throw new Error("Refund collection reuses an original payment across sources.");
      paymentRefs.add(paymentIdentity);
      if(payment.datePaid?.startsWith(`${year}-`)) {
        const link=payment.currentYearPayment;
        if(!link || !["estimatedTaxPayments","extensionPayments"].includes(link.collection) || !Number.isInteger(link.index) || link.index<0) throw new Error("Refund current-year payment requires its actual canonical payment identity.");
        const key=`${link.collection}:${link.index}`;
        if(currentLinks.has(key)) throw new Error("Refund current-year payment was allocated more than once.");
        currentLinks.add(key);
        const actual=input.adjustments?.[link.collection]?.[link.index];
        if(!actual || actual.type!=="state" || actual.state!==form.refundPaymentBasis.state || actual.date!==payment.datePaid || actual.amount!==payment.amount || !money(actual.amount).eq(money(payment.amount))) throw new Error("Refund current-year original payment does not match actual return payment facts.");
      } else if(payment.currentYearPayment!==undefined) throw new Error("Historical refund payment cannot claim a current-year payment identity.");
    }
  }
  const government=calculateForm1099G(forms,year,input.taxpayer.filingStatus);
  const groups=new Map<number,Form1099GResult["refundSources"]>();
  let currentYearRefund=new Decimal(0);
  for(const row of government.refundSources) {
    if(row.refundExpenseTaxYear===year) currentYearRefund=currentYearRefund.plus(row.amount);
    else groups.set(row.refundExpenseTaxYear,[...(groups.get(row.refundExpenseTaxYear)??[]),row]);
  }
  if(!packet.years || packet.years.length!==groups.size || new Set(packet.years.map(facts=>facts.priorTaxYear)).size!==packet.years.length) throw new Error("Refund collection requires exactly one actual worksheet per historical deduction year.");
  const audit=new AuditTrail(), results:TaxableStateRefundRecoveriesResult["years"]=[];
  let taxableRefund=new Decimal(0);
  for(const [priorYear,rows] of [...groups].sort(([a],[b])=>a-b)) {
    const facts=packet.years.find(facts=>facts.priorTaxYear===priorYear);
    if(!facts) throw new Error("Refund historical deduction-year facts are missing.");
    historicalFacts(input,facts);
    const basisTotal=forms.reduce((total,form)=>total.plus((form.refundPaymentBasis?.payments??[]).filter(payment=>payment.datePaid?.startsWith(`${priorYear}-`)).reduce((subtotal,payment)=>subtotal.plus(money(payment.amount)),new Decimal(0))),new Decimal(0));
    if(basisTotal.gt(money(facts.priorYearStateLocalTaxesPaid))) throw new Error("Refund payment basis exceeds actual historical income-tax payments.");
    const worksheet=calculateTaxableRefundWorksheet(rows.map(row=>({stateLocalIncomeTaxRefund:row.amount.toString(),refundTaxYear:row.refundTaxYear,refundExpenseTaxYear:priorYear})),TaxableRefundWorksheetSchema.parse(facts),year);
    taxableRefund=taxableRefund.plus(worksheet.taxableRefund);
    results.push({priorTaxYear:priorYear,worksheet});
    audit.merge(worksheet.lines.map(line=>({...line,form:`Refund ${priorYear}: ${line.form}`})));
  }
  audit.record("Taxable State Refund Recoveries","taxable","Taxable prior-year state income-tax refunds",taxableRefund,"Sum separately validated historical deduction-year worksheets; current-year amounts excluded");
  audit.record("Taxable State Refund Recoveries","current","Same-year income-tax recovery",currentYearRefund,"Reduce current-year ScheduleA income-tax payment deduction once; do not include in Schedule1");
  return {taxableRefund,currentYearRefund,years:results,allocations:government.refundSources,lines:audit.getLines()};
}
