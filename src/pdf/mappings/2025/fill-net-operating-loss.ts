/** Source-bound NOL review statement. Spec: net-operating-loss-return.yaml. */
import Decimal from "decimal.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { NetOperatingLossResult } from "@/engine/forms/net-operating-loss.js";
import { calculateCharitableNolCarryover } from "@/engine/forms/charitable-net-operating-loss.js";
import { calculateForm172Return } from "@/engine/forms/form-172-return.js";
import { calculateForm2441Benefits } from "@/engine/forms/form-2441-benefits.js";
import { calculateDependentCareBenefitSources } from "@/engine/forms/dependent-care-benefit-sources.js";
import { calculateForm6251BondSources } from "@/engine/forms/form-6251-bond-sources.js";
import { isIraForm1099RDistribution, resolveForm1099RTaxableAmount } from "@/engine/forms/form-1099-r.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateScheduleB } from "@/engine/schedules/schedule-b.js";
import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { getConstants } from "@/models/constants.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";
import { assertPdfExportAllowed, markReviewPdf } from "@/pdf/export-policy.js";

function amount(value: Decimal | undefined): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite()) throw new Error("NOL review requires complete finite retained amounts");
  return value;
}
function eq(actual: Decimal | undefined, expected: Decimal): void {
  if (!amount(actual).eq(expected)) throw new Error("NOL review amounts do not reconcile");
}

function currentOriginRows(input: TaxYearInput, result: TaxReturnResult): string[] {
  if (!input.form172 && !result.form172) return [];
  const current = result.form172, prior = result.netOperatingLoss, schedule1 = result.schedule1;
  if (!input.form172 || current?.sourceFactsVerified !== true || current.calculationComplete !== true
    || !prior?.calculationComplete || !schedule1 || !result.form6251) throw new Error("NOL review requires the actual complete current origin sources and calculation");
  calculateForm172Return(input);
  const benefits = input.dependentCareBenefits ? calculateForm2441Benefits({ taxYear: input.taxpayer.taxYear,
    filingStatus: input.taxpayer.filingStatus, facts: input.dependentCareBenefits }) : undefined;
  const care = calculateDependentCareBenefitSources(input, benefits);
  const business = calculateScheduleC(input, input.scheduleC, { dependentCareBenefitsAdjustment: care.scheduleCAdjustment });
  eq(schedule1.businessIncome, business.netProfit);
  if (result.scheduleC) eq(result.scheduleC.netProfit, business.netProfit);
  const investments = calculateScheduleB(input, result.form8815?.excludableSavingsBondInterest);
  eq(result.totalInterest, investments.taxableInterest); eq(result.totalDividends, investments.totalOrdinaryDividends);
  eq(schedule1.earlyWithdrawalPenalty, sum(...input.form1099Int.map(source => d(source.earlyWithdrawalPenalty))));
  const bondSources = calculateForm6251BondSources(input.form1099Int, input.form1099Div, result.taxYear, input.taxpayer.filingStatus);
  const capital = calculateScheduleD(input, input.taxpayer.filingStatus, getConstants(input.taxpayer.taxYear));
  if (!result.scheduleD) throw new Error("Current origin review requires the actual completed capital calculation");
  for (const key of ["netShortTerm", "netLongTerm", "netCapitalGainLoss", "capitalLossDeduction", "section1202Exclusion", "section1202AmtPreference"] as const) {
    eq(result.scheduleD[key], capital[key]);
  }
  const savedLine = (form: string, line: string): Decimal => {
    const rows = result.allLines.filter(row => row.form === form && row.line === line);
    if (rows.length !== 1) throw new Error(`Current origin review requires a unique ${form} line${line}`);
    return amount(rows[0].value);
  };
  let annuityIncome = d("0");
  // Preserve the completed source classification after identifier redaction.
  // This checks each retained source amount and classification audit; it does
  // not replace the original payer/account identity verification with fake IDs.
  for (const [index, source] of (input.form1099R ?? []).entries()) {
    if (isIraForm1099RDistribution(source) || !d(source.grossDistribution).gt(0)) continue;
    const taxable = resolveForm1099RTaxableAmount(source);
    if (!taxable.gt(0)) continue;
    const id = `form1099R:${index}`;
    const classification = input.form8960Sources?.annuities?.find(row => row.sourceId === id);
    const included = source.distributionCode?.toUpperCase().includes("D") || classification?.classification === "nonqualified_annuity";
    if (!included && classification?.classification !== "excluded_retirement_plan") throw new Error("Current origin review requires the retained actual annuity source classification");
    if (classification) {
      if (classification.owner !== source.accountHolder || classification.payerName?.trim() !== source.payer.trim()) throw new Error("Current origin annuity sources do not reconcile");
      eq(d(classification.grossDistribution), d(source.grossDistribution)); eq(d(classification.taxableAmount), taxable);
    }
    eq(savedLine("Form8960 source WS", `${id}:${included ? "taxable-annuity" : "excluded-plan"}`), taxable);
    if (included) annuityIncome = annuityIncome.plus(taxable);
  }
  const checked = calculateForm172Return(input, {
    agi: result.agi, totalIncome: result.totalIncome, totalWages: result.totalWages,
    taxableInterest: investments.taxableInterest, ordinaryDividends: investments.totalOrdinaryDividends,
    iraTaxable: result.iraDistributionsTaxable, pensionTaxable: result.pensionDistributionsTaxable,
    taxableSocialSecurity: result.socialSecurityBenefitsTaxable, capitalGainLoss: result.capitalGainLoss, scheduleD: capital,
    deductionUsed: result.deductionUsed, deductionAmount: result.deductionAmount,
    qbiDeduction: savedLine("1040", "13"), additionalDeductions: (result.schedule1A?.totalDeduction ?? d("0")).plus(result.nonitemizerCharitableDeduction ?? d("0")),
    nonitemizerCharitableDeduction: result.nonitemizerCharitableDeduction ?? d("0"), schedule1, scheduleA: result.scheduleA,
    currentExcessBusinessLoss: result.form461?.line16ExcessBusinessLoss ?? d("0"),
    alternativeTaxIncome: result.form6251.amti, alternativeTaxPrivateActivityInterest: bondSources.privateActivityBondInterest,
    investmentIncome: sum(investments.taxableInterest, investments.totalOrdinaryDividends, annuityIncome),
    unverifiedAnnuitySourceIds: [], priorLoss: prior,
  });
  for (const key of ["regular", "alternativeTax", "investment"] as const) {
    if (current[key].taxYear !== checked[key].taxYear) throw new Error("Current origin review source years do not reconcile");
    for (const line of checked[key].lines) eq(current[key].partI[Number(line.line) as keyof typeof current.regular.partI], line.value);
    for (const [number, exact] of Object.entries(checked[key].sourcePartI)) {
      eq(current[key].sourcePartI?.[Number(number) as keyof typeof current.regular.sourcePartI], exact);
    }
    eq(current[key].sourceSignedComputation, checked[key].sourceSignedComputation);
    eq(current[key].signedComputation, checked[key].signedComputation); eq(current[key].netOperatingLoss, checked[key].netOperatingLoss);
  }
  for (const key of ["section1411OriginalLoss", "currentExcessBusinessLoss", "alternativeExcessBusinessLoss", "newRegularCarryforward",
    "newAlternativeCarryforward", "regularClosingCarryforward", "alternativeClosingCarryforward"] as const) eq(current[key], checked[key]);
  for (const line of checked.lines) {
    eq(savedLine(line.form, line.line), line.value);
    const saved = current.lines.filter(row => row.form === line.form && row.line === line.line);
    if (saved.length !== 1) throw new Error("Current origin retained audits are missing or duplicated");
    eq(saved[0].value, line.value);
  }
  eq(result.carryforwards.nolCarryforward, checked.regularClosingCarryforward);
  eq(result.carryforwards.alternativeTaxNolCarryforward, checked.alternativeClosingCarryforward);
  return [
    `Current regular PartI loss ${checked.regular.netOperatingLoss}; current EBL carry ${checked.currentExcessBusinessLoss}; total regular closing carry ${checked.regularClosingCarryforward}`,
    `Current alternative PartI loss ${checked.alternativeTax.netOperatingLoss}; current EBL carry ${checked.alternativeExcessBusinessLoss}; total alternative closing carry ${checked.alternativeClosingCarryforward}`,
    `Current section1411 original loss ${checked.section1411OriginalLoss}`,
    ...checked.lines.filter(line => line.form === "Current Form172 itemized sources" || line.form === "Current Form172 capital sources")
      .map(line => `${line.description}: ${line.value}`),
    ...([ ["Regular", checked.regular], ["Alternative", checked.alternativeTax], ["Investment", checked.investment] ] as const)
      .flatMap(([label, form]) => form.lines.map(line => `${label} current Form172 line${line.line}: ${line.value}`)),
  ];
}

/** Source amounts and retained canonical contexts are checked separately. This
 * render path works after identifier redaction and never invents taxpayer IDs. */
export function buildNetOperatingLossReview(input: TaxYearInput, result: TaxReturnResult): string[] {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const facts = input.netOperatingLoss; const calculation = result.netOperatingLoss;
  if (!facts || facts.sourceTaxYear !== result.taxYear || facts.sourceFactsConfirmed !== true
    || facts.allCarryoversIncluded !== true || !calculation?.calculationComplete
    || facts.alternativeTax?.sourceFactsConfirmed !== true || facts.alternativeTax.allCarryoversIncluded !== true) {
    throw new Error("NOL review requires actual complete regular and alternative source packets");
  }
  const ledger = (sources: typeof facts.vintages, computed: NetOperatingLossResult, label: string): string[] => {
    if (!sources || computed.sourceFactsVerified !== true || !computed.calculationComplete || sources.length !== computed.vintages.length) {
      throw new Error("NOL review source vintages do not reconcile");
    }
    const ids = new Set<string>();
    const rows = computed.vintages.map(row => {
      const original = sources.filter(source => source.sourceId === row.sourceId);
      if (ids.has(row.sourceId) || original.length !== 1) throw new Error("NOL review source identities do not reconcile");
      ids.add(row.sourceId); const source = original[0];
      if (!source || source.lossTaxYear !== row.lossTaxYear || source.originKind !== row.originKind
        || source.allHistoryIncluded !== true || source.adjustedThroughTaxYear !== result.taxYear - 1 || !source.history
        || source.originalLoss === undefined || source.openingCarryforward === undefined) throw new Error("NOL review source history is incomplete");
      eq(row.originalLoss, d(source.originalLoss)); eq(row.openingCarryforward, d(source.openingCarryforward));
      const priorReductions = sum(...source.history.map(history => {
        if (history.nolUsed === undefined || history.attributeReduction === undefined) throw new Error("NOL review source history is incomplete");
        return d(history.nolUsed).plus(history.attributeReduction);
      }));
      eq(row.originalLoss.minus(priorReductions), row.openingCarryforward);
      eq(row.openingCarryforward, amount(row.absorbed).plus(amount(row.expired)).plus(amount(row.remainingCarryforward)));
      if (amount(row.deduction).lt(0) || amount(row.deduction).gt(row.openingCarryforward.minus(row.expiredBeforeYear))) throw new Error("NOL review claim does not reconcile with available source carry");
      return `${row.lossTaxYear}: opening ${row.openingCarryforward}; claimed ${row.deduction}; absorbed ${row.absorbed}; expired ${row.expired}; remaining ${row.remainingCarryforward}`;
    });
    for (const [total, key] of [[computed.deduction, "deduction"], [computed.absorbed, "absorbed"],
      [computed.expired, "expired"], [computed.carryforward, "remainingCarryforward"]] as const) {
      eq(total, sum(...computed.vintages.map(row => amount(row[key]))));
    }
    return [`${label}: claimed ${computed.deduction}; absorbed ${computed.absorbed}; expired ${computed.expired}; remaining ${computed.carryforward}`, ...rows];
  };
  const alternative = { ...calculation.alternativeTaxSources, ...calculation.alternativeTax };
  const regularRows = ledger(facts.vintages, calculation, "Regular NOL");
  const alternativeRows = ledger(facts.alternativeTax.vintages, alternative, "Alternative NOL");
  const originRows = currentOriginRows(input, result);
  eq(result.nolDeduction, calculation.deduction);
  if (!result.form172) eq(result.carryforwards.nolCarryforward, calculation.carryforward);
  eq(result.agi, calculation.finalIncome.agi);
  const audit = (form: string, line: string, expected: Decimal) => {
    const rows = result.allLines.filter(row => row.form === form && row.line === line);
    if (rows.length !== 1) throw new Error(`NOL review requires a unique ${form} line${line}`);
    eq(rows[0]?.value, expected);
  };
  audit("Sched 1", "8a", calculation.deduction.negated());
  audit("Form 6251", "2e", calculation.deduction);
  audit("Form 6251", "2f", calculation.alternativeTax.deduction.negated());
  eq(roundDollar(amount(result.form6251?.amti)), calculation.alternativeTax.amtiBeforeAtnol.minus(calculation.alternativeTax.deduction));
  const charityRows: string[] = [];
  const charity = calculation.charitableCarryover;
  if (charity) {
    const comparison = calculation.charitableCounterfactual;
    if (!comparison?.calculation.calculationComplete) throw new Error("Charitable NOL counterfactual review is incomplete");
    eq(comparison.calculation.carryforward, charity.counterfactualNolCarryforward);
    eq(comparison.calculation.deduction, calculation.deduction);
    if (charity.taxYear !== result.taxYear) throw new Error("Charitable NOL review source year does not reconcile");
    const checked = calculateCharitableNolCarryover({ input, tentativeCarryforward: calculation.finalIncome.charitableCarryforward,
      nolCarryforward: calculation.carryforward, alternativeTaxNolAvailable: calculation.alternativeTaxSources.availableCarryforward,
      computeCarryover: () => charity.counterfactualNolCarryforward });
    if (!checked.sourceContributions.eq(charity.sourceContributions)) throw new Error("Charitable NOL review source contributions do not reconcile");
    for (const key of ["contributions", "tentativeCarryforward", "nonexcessContributions", "nolCarryforward",
      "counterfactualNolCarryforward", "reduction", "carryforward", "alternativeTaxCarryforward"] as const) eq(charity[key], checked[key]);
    eq(result.carryforwards.charitableContributions, charity.carryforward);
    eq(result.carryforwards.amtCharitableContributions, charity.alternativeTaxCarryforward);
    for (const [rows, expected] of [[result.carryforwards.charitableContributionsByYear, charity.carryforward],
      [result.carryforwards.amtCharitableContributionsByYear, charity.alternativeTaxCarryforward]] as const) {
      if (!rows || rows.length !== (expected.gt(0) ? 1 : 0)
        || rows.some(row => row.taxYear !== result.taxYear || row.category !== "cash_60")) throw new Error("Charitable NOL carry years do not reconcile");
      eq(sum(...rows.map(row => row.amount)), expected);
    }
    for (const line of checked.lines) audit(line.form, line.line, line.value);
    charityRows.push(`Current regular charitable carry: tentative ${charity.tentativeCarryforward}; NOL-related reduction ${charity.reduction}; remaining ${charity.carryforward}`,
      `Succeeding regular NOL carry: actual ${charity.nolCarryforward}; without excess contributions ${charity.counterfactualNolCarryforward}`,
      `Original cash contributions ${charity.sourceContributions}; form-dollar total ${charity.contributions}; counterfactual retained contributions ${charity.nonexcessContributions}`,
      `Separate alternative-tax charitable carry ${charity.alternativeTaxCarryforward}; actual source history establishes no available ATNOL.`);
    charityRows.push(`Counterfactual modified regular limit income: ${comparison.income.taxableIncome}`,
      ...comparison.modifiedVintageIncome.map(row => `${comparison.calculation.vintages.find(vintage => vintage.sourceId === row.sourceId)?.lossTaxYear}: counterfactual earlier modified deduction ${row.retainedEarlierDeduction}; refigured AGI ${row.income.agi}; charity ${row.income.charitableDeduction}; modified income ${row.income.taxableIncome}`),
      ...ledger(facts.vintages, comparison.calculation, "Counterfactual NOL comparison (actual current claim unchanged)"));
  } else {
    eq(result.carryforwards.charitableContributions, calculation.finalIncome.charitableCarryforward);
  }
  const contexts = [
    `Current regular limit income before NOL, QBI and section250: ${calculation.actualIncome.taxableIncome}`,
    `Modified regular limit income: ${calculation.modifiedIncome.taxableIncome}`,
    `Pre2018 deduction ${calculation.pre2018Deduction}; post2017 deduction ${calculation.post2017Deduction}`,
    ...calculation.modifiedVintageIncome.map(row => `${calculation.vintages.find(vintage => vintage.sourceId === row.sourceId)?.lossTaxYear}: earlier modified deduction ${row.retainedEarlierDeduction}; separately refigured modified income ${row.income.taxableIncome}`),
    `AMTI before ATNOLD ${calculation.alternativeTax.amtiBeforeAtnol}; modified AMTI ${calculation.alternativeTax.modifiedAmtiBeforeAtnol}`,
    `Section1411 applicable regular deduction: ${calculation.section1411Deduction}`,
  ];
  return ["NET OPERATING LOSS - REVIEW CALCULATION STATEMENT", ...contexts, ...regularRows, ...alternativeRows, ...originRows, ...charityRows,
    "Amounts explain the retained canonical income contexts; this statement does not independently replay every upstream income source.",
    "Original loss and history documents must be retained. Prior or mixed charitable carry, positive ATNOL-charity coordination and debt-cancellation reductions require their separate worksheets.",
    "This statement and the accompanying Form6251 are review material, not filing qualification."];
}

export async function fillNetOperatingLossReview(input: TaxYearInput, result: TaxReturnResult, outputDir: string): Promise<string> {
  const paragraphs = buildNetOperatingLossReview(input, result);
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]); let y = 738;
  for (const paragraph of paragraphs) {
    let line = "";
    const draw = () => {
      if (y < 65) { page = doc.addPage([612, 792]); y = 738; }
      page.drawText(line, { x: 36, y, size: 10, font }); y -= 15; line = "";
    };
    // Every displayed value is a numeric worksheet amount or static label; no
    // untrusted source name/reference/identifier is copied into this statement.
    for (const word of paragraph.split(/\s+/)) {
      if (line && font.widthOfTextAtSize(`${line} ${word}`, 10) > 540) draw();
      line = line ? `${line} ${word}` : word;
    }
    if (line) draw(); y -= 8;
  }
  await markReviewPdf(doc); await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, "nol-carry-review.pdf"); await writeFile(path, await doc.save()); return path;
}
