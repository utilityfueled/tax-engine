/** Actual 2025 Form7206 review mapping. Spec: spec/federal/form-7206-pdf.yaml. */
import Decimal from "decimal.js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { calculateForm7206, type Form7206BusinessResult } from "@/engine/forms/form-7206.js";
import { roundDollar, sum } from "@/utils/decimal.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { formatCurrency, loadReviewTemplate, setTextField } from "../../pdf-utils.js";
import { assertMarketplaceHealthReviewSources } from "./form-7206-marketplace-source.js";
import { calculateForm7206ReviewSources } from "./form-7206-business-source.js";
import { calculateMarketplaceActualCashHealth } from "@/engine/forms/marketplace-actual-cash-health.js";
import { calculateMarketplaceFullAdvanceRepayment } from "@/engine/forms/marketplace-full-advance-repayment.js";
import { calculateMarketplaceReportedRepaymentPayment } from "@/engine/forms/marketplace-reported-repayment-payment.js";
import { charitableReviewOriginalSourceInput, type PreparedCharitableReview } from "../../charitable-review-context.js";
import { hasPremiumTaxCreditReviewSources, premiumTaxCreditReviewOriginalSourceInput, type PreparedPremiumTaxCreditReview } from "../../premium-tax-credit-review-context.js";
import { redactReviewIdentifiers } from "../../redact-review-identifiers.js";
const field = (number: number) => `topmostSubform[0].Page1[0].f1_${number}[0]`;
/** Sixteen leaf fields inspected against the registered October2,2025 revision. */
export const FORM_7206_FIELDS = {
  name: field(1), ssn: field(2), line1: field(3), line2: field(4), line3: field(5), line4: field(6),
  line5: field(7), line6: field(8), line7: field(9), line8: field(10), line9: field(11), line10: field(12),
  line11: field(13), line12: field(14), line13: field(15), line14: field(16),
} as const;
const properties = {
  "1": "medicalPremiums", "2": "longTermCarePremiums", "3": "eligiblePremiums", "4": "netIncome",
  "5": "ownerPositiveBusinessIncome", "6": "incomeRatio", "7": "allocatedSelfEmploymentTax", "8": "incomeAfterSelfEmploymentTax",
  "9": "attributableRetirementDeduction", "10": "incomeAfterRetirement", "11": "sCorporationMedicareWages",
  "12": "attributableForeignExclusion", "13": "earnedIncomeLimit", "14": "deduction",
} as const;
function exact(value: unknown, label: string): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite()) throw new Error(`Form7206 requires the actual finite ${label}.`);
  return value;
}
function reconcileSources(input: TaxYearInput, result: NonNullable<TaxReturnResult["form7206"]>, fullReturn: TaxReturnResult) {
  const marketplace = fullReturn.marketplaceHealthInsurance, fullRepayment = fullReturn.marketplaceFullRepaymentHealth;
  const reportedRepayment = fullReturn.marketplaceReportedRepaymentHealth, actualCash = fullReturn.marketplaceActualCashHealth;
  const hasMarketplace = input.form7206?.plans?.some(plan => plan.marketplaceCoverage && plan.premiumTaxCreditInvolved);
  if ([marketplace, fullRepayment, reportedRepayment, actualCash].filter(Boolean).length !== (hasMarketplace ? 1 : 0)
    || (!marketplace && !fullRepayment && !reportedRepayment && !actualCash && result.marketplaceHandling !== undefined)
    || (actualCash && result.marketplaceHandling !== 'actual-cash-zero-credit')
    || (fullRepayment && result.marketplaceHandling !== 'full-advance-repayment')
    || (reportedRepayment && result.marketplaceHandling !== 'reported-advance-repayment')) throw new Error("Form7206 Marketplace method requires its actual source coordination.");
  const reportedPayment = reportedRepayment ? calculateMarketplaceReportedRepaymentPayment(input, fullReturn) : undefined;
  const actual = calculateForm7206({ taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus, facts: input.form7206!, marketplaceSourceInput: input, marketplaceHandling: result.marketplaceHandling, reportedPayment });
  const retained = (value: unknown) => JSON.stringify(redactReviewIdentifiers(value));
  if (retained(actual.coverageFamilyAllocations) !== retained(result.coverageFamilyAllocations)) throw new Error("Form7206 coverage-family allocation does not reconcile its actual original sources.");
  const familyAudit = actual.lines.filter(row => row.form === "Pub974 Coverage Family");
  if (retained(familyAudit) !== retained(result.lines.filter(row => row.form === "Pub974 Coverage Family"))
    || retained(familyAudit) !== retained(fullReturn.allLines.filter(row => row.form === "Pub974 Coverage Family"))) throw new Error("Form7206 coverage-family source audits are stale or conflicting.");
  for (const key of ["grossSourcePremiums", "paidSourcePremiums"] as const) if (!actual[key].eq(exact(result[key], key))) throw new Error("Form7206 source totals do not reconcile with the persisted calculation.");
  if (actual.sourceRecords.length !== result.sourceRecords.length || actual.businesses.length !== result.businesses.length) throw new Error("Form7206 source records do not reconcile with the persisted calculation.");
  for (const [index, source] of actual.sourceRecords.entries()) {
    const persisted = result.sourceRecords[index];
    for (const key of ["sourceId", "planId", "accountHolder", "businessSourceId", "personId", "payer", "coverageTaxYear", "coverageMonth"] as const) if (source[key] !== persisted[key]) throw new Error("Form7206 source identities disagree with the persisted calculation.");
    for (const key of ["amountPaid", "advancePremiumTaxCredit", "excludedFunding", "eligiblePremium", "marketplaceSpecifiedPremium"] as const) if (!source[key].eq(exact(persisted[key], key))) throw new Error("Form7206 source amounts disagree with the persisted calculation.");
  }
  for (const source of actual.businesses) {
    const matches = result.businesses.filter(group => group.accountHolder === source.accountHolder && group.businessSourceId === source.businessSourceId && group.kind === source.kind);
    if (matches.length !== 1 || source.planIds.join("\0") !== matches[0].planIds.join("\0")) throw new Error("Form7206 business source identity is missing or duplicated.");
    for (const key of ["medicalPremiums", "longTermCarePremiums", "eligiblePremiums", "specifiedPremiums"] as const) if (!source[key].eq(exact(matches[0][key], key))) throw new Error("Form7206 business premium sources disagree with the persisted calculation.");
  }
  if (!sum(...result.businesses.map(group => exact(group.deduction, "business deduction"))).eq(exact(result.deduction, "total source deduction"))) throw new Error("Form7206 business deductions disagree with their calculated source total.");
  const fresh = calculateForm7206ReviewSources(input, fullReturn);
  for (const source of fresh.physical.businesses) {
    const persisted = result.businesses.find(group => group.businessSourceId === source.businessSourceId && group.accountHolder === source.accountHolder);
    if (!persisted) throw new Error("Form7206 current business source is absent from the saved calculation.");
    for (const property of Object.values(properties)) {
      if (source[property] === undefined) {
        if (persisted[property] !== undefined) throw new Error("Form7206 current business source branch conflicts with its saved calculation.");
      } else if (!source[property]!.eq(exact(persisted[property], property))) throw new Error("Form7206 current business income sources do not reconcile with the saved calculation.");
    }
  }
  if (actualCash) {
    const proof = calculateMarketplaceActualCashHealth(input, fullReturn);
    if (retained(proof) !== retained(actualCash)
      || retained(proof.lines) !== retained(fullReturn.allLines.filter(row => row.form === 'Marketplace Actual Cash'))) throw new Error('Form7206 actual cash proof and audits do not reconcile.');
  } else if (reportedPayment) {
    if (retained(reportedPayment) !== retained(reportedRepayment)
      || retained(reportedPayment.lines) !== retained(fullReturn.allLines.filter(row => row.form === 'Marketplace Reported Repayment'))) throw new Error('Form7206 reported repayment proof and audits do not reconcile.');
  } else if (fullRepayment) {
    const proof = calculateMarketplaceFullAdvanceRepayment(input, fullReturn);
    if (retained(proof) !== retained(fullRepayment)
      || retained(proof.lines) !== retained(fullReturn.allLines.filter(row => row.form === 'Marketplace Full Advance Repayment'))) throw new Error('Form7206 full advance repayment proof and audits do not reconcile.');
  } else if (marketplace) assertMarketplaceHealthReviewSources(input, fullReturn, fresh.physical, fresh.nonspecified);
  else {
    const transferred = sum(...result.businesses.map(group => roundDollar(exact(group.deduction, "business deduction"))));
    if (!transferred.eq(exact(result.deductionToSchedule1, "Schedule1 transfer"))) throw new Error("Form7206 separate business deductions disagree with the Schedule1 transfer.");
  }
}

export function assertForm7206ReviewSource(input: TaxYearInput, result: TaxReturnResult, charitableReview?: PreparedCharitableReview, premiumTaxCreditReview?: PreparedPremiumTaxCreditReview) {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const calculation = result.form7206;
  if (!input.form7206 || !calculation || calculation.sourceFactsVerified !== true || !calculation.calculationComplete) throw new Error("Form7206 requires actual sources and a completed audited calculation.");
  const charitableOriginal = charitableReviewOriginalSourceInput(input, result, charitableReview);
  const original = hasPremiumTaxCreditReviewSources(input) || premiumTaxCreditReview
    ? premiumTaxCreditReviewOriginalSourceInput(charitableOriginal, result, premiumTaxCreditReview) : charitableOriginal;
  reconcileSources(original, calculation, result);
  return calculation;
}

export async function fillForm7206(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string,
  businessSourceId: string, accountHolder: "primary" | "spouse", charitableReview?: PreparedCharitableReview, premiumTaxCreditReview?: PreparedPremiumTaxCreditReview): Promise<PDFDocument> {
  const calculation = assertForm7206ReviewSource(input, result, charitableReview, premiumTaxCreditReview);
  const facts = input.form7206!; // The source assertion above requires this original worksheet.
  const groups = calculation.businesses.filter(group => group.businessSourceId === businessSourceId && group.accountHolder === accountHolder);
  if (groups.length !== 1) throw new Error("Form7206 requires one actual business and owner.");
  const group = groups[0];
  const byLine = new Map<string, Decimal>();
  for (const line of calculation.lines) {
    if (line.form !== "Form 7206" || !(line.line in properties) || line.inputs?.Owner !== accountHolder || line.inputs?.Business !== businessSourceId) continue;
    const value = exact(line.value, `line ${line.line} audit`);
    if (byLine.has(line.line) || (!['4', '8', '10'].includes(line.line) && value.lt(0))) throw new Error(`Form7206 line ${line.line} audit is duplicated or invalid.`);
    byLine.set(line.line, value);
  }
  const doc = await loadReviewTemplate(blankPdfPath, 2025), form = doc.getForm();
  const names = [input.taxpayer.primary, ...(input.taxpayer.spouse ? [input.taxpayer.spouse] : [])].map(person => `${person.firstName} ${person.lastName}`).join(" & ");
  setTextField(form, FORM_7206_FIELDS.name, names);
  setTextField(form, FORM_7206_FIELDS.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));
  for (const [line, property] of Object.entries(properties)) {
    const applies = group.kind === "s_corporation" ? !["4", "5", "6", "7", "8", "9", "10"].includes(line) : line !== "11";
    const value = byLine.get(line), fieldName = FORM_7206_FIELDS[`line${line}` as keyof typeof FORM_7206_FIELDS];
    if (!applies) {
      if (value !== undefined) throw new Error(`Form7206 contains an unexpected branch audit for line ${line}.`);
      setTextField(form, fieldName, ""); continue;
    }
    if (!value || !value.eq(exact(group[property as keyof Form7206BusinessResult], `calculated line ${line}`))) throw new Error(`Form7206 line ${line} audit is missing or disagrees with its calculated total.`);
    setTextField(form, fieldName, line === "6" ? `${value.times(100).toDecimalPlaces(6).toFixed()}%` : value.isZero() ? "0" : formatCurrency(value));
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]), y = 752;
  const write = (value: string) => {
    const words = value.replace(/\s+/g, " ").trim().split(" "); let line = "";
    const emit = () => { if (y < 48) { page = doc.addPage([612, 792]); y = 752; } page.drawText(line, { x: 32, y, size: 9, font }); y -= 14; line = ""; };
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, 9) > 548 && line) emit();
      // Long actual source references are wrapped by characters, never truncated.
      for (const char of word) { if (font.widthOfTextAtSize(line + char, 9) > 548) emit(); line += char; }
      line += " ";
    }
    if (line) emit();
  };
  write("FORM 7206 - ACTUAL SOURCE REVIEW STATEMENT");
  write(`Tax year 2025; business source ${businessSourceId}; owner ${accountHolder}; type ${group.kind}.`);
  write("This appendix preserves original source facts and exact calculations. The preceding IRS form is a review copy. Independent filing qualification remains pending.");
  const marketplace = result.marketplaceHealthInsurance;
  const fullRepayment = result.marketplaceFullRepaymentHealth;
  const reportedRepayment = result.marketplaceReportedRepaymentHealth;
  const actualCash = result.marketplaceActualCashHealth;
  if (actualCash) {
    write('ACTUAL CASH WITH ZERO FINAL CREDIT');
    write('The completed return has zero premium tax credit and all original advances are zero. Actual qualified owner/business cash enters this ordinary Form7206 subject to its own business income limit. Tax-family and coverage-family premium allocations remain separate from payment records.');
    write(`Return-level actual final credit $${actualCash.finalCredit.toFixed()}; repayment $${actualCash.finalRepayment.toFixed()}; Schedule1 health deduction $${actualCash.deduction.toFixed()}. These shared return totals are not additional deductions and must not be added across business appendices.`);
    for (const row of actualCash.months) if (group.planIds.includes(row.planId)) write(`Plan ${row.planId}, month ${row.month}: actual coverage-family cash $${row.actualSpecifiedCash.toFixed()}; actual noncoverage-family cash $${row.actualNonspecifiedCash.toFixed()}; allocated tax-family premium $${row.taxFamilyPremium.toFixed()}; specified premium pool $${row.specifiedPremium.toFixed()}; nonspecified premium pool $${row.nonspecifiedPremium.toFixed()}.`);
  }
  if (reportedRepayment) {
    write('ACTUAL CASH AND REPORTED ADVANCE REPAYMENT');
    write('The completed return has zero premium tax credit. One eligible owner and business payment source uses actual cash plus reported repayment, capped at its original premium cost and its actual business income limit. Original source cents are not replaced by the reported total.');
    write(`Original eligible premium $${reportedRepayment.originalEligiblePremiums.toFixed()}; actual cash $${reportedRepayment.actualCash.toFixed()}; actual paid premium $${reportedRepayment.eligiblePremiums.toFixed()}.`);
    write(`Exact original advances $${reportedRepayment.exactSourceAdvances.toFixed()}; actual reported repayment $${reportedRepayment.finalRepayment.toFixed()}; unpaid source remainder $${reportedRepayment.unreportedAdvanceRemainder.toFixed()}; reporting excess above original advance $${reportedRepayment.reportingExcess.toFixed()}.`);
    write('A reporting excess does not create an expense above original cost. The unpaid remainder is not treated as repaid. These amounts describe one payment pool and do not authorize an allocation across differently qualified people, plans or owners.');
  }
  if (fullRepayment) {
    write('ACTUAL ZERO CREDIT AND FULL ADVANCE REPAYMENT');
    write('The completed return has zero premium tax credit and repays all original advances. The physical Form7206 contains ordinary eligible premiums and its actual own-business income limit. No partial repayment or credit is allocated between people or businesses.');
    write(`Exact original allocated advances $${fullRepayment.exactSourceAdvances.toFixed()}; reported advances $${fullRepayment.reportedAdvances.toFixed()}; actual final credit $${fullRepayment.finalCredit.toFixed()}; actual final repayment $${fullRepayment.finalRepayment.toFixed()}.`);
    write('These final credit and repayment amounts are shared return-level reference totals. Do not add repeated totals from separate business appendices. Source cash and advances remain separately recorded below.');
  }
  if (marketplace) write(marketplace.method === "pub974-nonspecified-stop-2025"
    ? "NONSPECIFIED STOP: each actual specified-plan business has exhausted its income limit after its own completed nonspecified claim. These physical forms contain the final health deduction. Final Form8962 uses that deduction independently. No Worksheets W/X or retained special-order deductions apply."
    : marketplace.method === "pub974-simplified-2025"
    ? "NONSPECIFIED PREMIUMS: the physical Form7206 contains only the nonspecified deduction. The separate Pub974 calculation below determines the combined return transfer."
    : "FINAL ORDINARY NO-CREDIT METHOD: the physical Form7206 contains the final ordinary eligible premiums and deduction. Interim attempted coordination is retained below for review; it does not replace the final ordinary deduction or repayment rules.");
  write(`Source reference: ${facts.sourceReference ?? "Unknown"}. Plans: ${group.planIds.join(", ")}.`);
  for (const plan of facts.plans ?? []) {
    if (plan.businessSourceId !== businessSourceId || plan.accountHolder !== accountHolder) continue;
    write(`Plan ${plan.planId}: policy ${plan.policyReference}; ${plan.kind}; policy held by ${plan.policyHolder}.`);
    for (const person of plan.coveredPersons ?? []) {
      const relationship = person.childRelationshipSources;
      if (relationship) write(`Actual child relationship ${relationship.childRelationship ?? "Unknown"}; began ${relationship.relationshipStartDate ?? "Unknown"}; health person ${person.personId}; business owner ${relationship.accountHolder ?? "Unknown"}; source tax year ${relationship.sourceTaxYear ?? "Unknown"}; source ${relationship.sourceReference ?? "Unknown"}. Owner and child identifiers withheld from this review copy. This relationship does not establish a PartV alternative-family assignment.`);
    }
    for (const sourceId of plan.marketplacePolicySourceIds ?? []) {
      const index = /^form1095A:(\d+)$/.exec(sourceId)?.[1];
      const policy = index === undefined ? undefined : input.form1095A[Number(index)];
      write(`Marketplace original ${sourceId}: ${policy?.marketplace ?? "Unknown"}; policy ${policy?.policyNumber ?? "Unknown"}; actual source year ${policy?.taxYear ?? "Unknown"}; all covered persons in the coverage family ${String(plan.allCoveredPersonsInCoverageFamilyConfirmed)}.`);
    }
    if (plan.sharedMarketplaceSources) {
      write("Shared policy family allocation: original full payments above and below are preserved. These separately derived amounts belong to this return's coverage family; an agreement alone does not establish a paid share.");
      const indexes = new Set((plan.marketplacePolicySourceIds ?? []).map(id => Number(id.slice("form1095A:".length))));
      for (const row of result.form8962?.sharedPolicyAllocation?.months ?? []) {
        if (indexes.has(row.policyIndex)) write(`Shared policy family allocation, original policy ${row.policyIndex + 1}, month ${row.month}: premium $${row.premium.toFixed()}; advances $${row.advance.toFixed()}.`);
      }
    }
    if (plan.coverageFamilySources) {
      write("COVERAGE-FAMILY PREMIUM SPLIT: original person cash and advance payments remain unchanged. The monthly benchmark calculation below determines separate specified and nonspecified premiums after any tax-family allocation. It is not a payment or credit allocation percentage.");
      for (const row of calculation.coverageFamilyAllocations ?? []) if (row.planId === plan.planId) {
        write(`Coverage-family month ${row.month}: tax-family enrollment premium $${row.taxFamilyPremium.toFixed()}; coverage-family SLCSP $${row.coverageFamilySlcsp.toFixed()}; noncoverage-family SLCSP $${row.nonCoverageFamilySlcsp.toFixed()}; specified premium $${row.specifiedPremium.toFixed()}; nonspecified premium $${row.nonspecifiedPremium.toFixed()}; actual attributable advances $${row.advancePremiumTaxCredit.toFixed()}.`);
        for (const audit of calculation.lines.filter(line => line.form === "Pub974 Coverage Family" && line.line.startsWith(`${plan.planId}:${row.month}:`))) write(actualCash ? `Independently allocated ${audit.line.endsWith(':nonspecified') ? 'nonspecified' : 'specified'} premium pool $${audit.value.toFixed()}; actual eligible cash is recorded separately.` : `Actual qualified ${audit.line.endsWith(':nonspecified') ? 'nonspecified' : 'specified'} amount before business limits $${audit.value.toFixed()}.`);
      }
      const outsideMonths = (calculation.coverageFamilyAllocations ?? []).filter(row => row.planId === plan.planId && row.outsidePersonIds.length > 0);
      if (outsideMonths.length) {
        write("OUTSIDE-TAX-FAMILY CASH: actual owner/business cash for each outside person remains separate from this return's family premiums and credit. Only independently qualified cash enters nonspecified Form7206 premiums, subject to the actual business limit. Another family's advances or repayment are not treated as cash.");
        for (const record of plan.coverageFamilySources.outsidePersonReturns ?? []) {
          if (!(calculation.sourceRecords ?? []).some(source => source.planId === plan.planId && source.personId === record.personId && source.eligiblePremium.gt(0))) continue;
          write(`Completed other-return Form8962 line24 $${record.form8962Line24}; tax year ${record.sourceTaxYear}; claimant ${record.claimantName}; covered health person ${record.personId}; source ${record.sourceReference}; original policy links ${(record.policySourceIds ?? []).join(', ')}. Claimant identifier withheld from this review copy.`);
        }
        for (const row of outsideMonths) write(`Outside-person month ${row.month}: outside-person cash $${row.outsideCash.toFixed()}; outside premium pool $${row.outsidePremiumPool.toFixed()}; original outside advances $${row.outsideAdvance.toFixed()}.`);
      }
    }
    for (const month of plan.months ?? []) {
      write(`Coverage month ${month.month}: eligible for subsidized employer coverage ${String(month.employerSubsidizedPlanEligible)}.`);
      if (month.employerOfferPtcException || month.employerCoverageEnrolled !== undefined || month.employerOfferSourceReference) write(`Actual employer-offer PTC exception ${month.employerOfferPtcException ?? "Unknown"}; employer coverage enrolled ${String(month.employerCoverageEnrolled)}; source ${month.employerOfferSourceReference ?? "Unknown"}.`);
    }
    for (const payment of plan.payments ?? []) {
      write(`Source ${payment.sourceId}; paid ${payment.datePaid}; coverage ${payment.coverageTaxYear}-${payment.coverageMonth}; original premium $${payment.grossPremium}; owner/business paid $${payment.ownerOrBusinessPaid}; other persons paid $${payment.otherPersonPaid}.`);
      if (plan.marketplaceCoverage && plan.premiumTaxCreditInvolved) write(`Original payment actual advance credit $${payment.advancePremiumTaxCredit}; this amount is separate from owner/business paid shares.`);
      for (const source of calculation.sourceRecords.filter(row => row.planId === plan.planId && row.sourceId === payment.sourceId)) {
        const person = facts.persons?.find(row => row.personId === source.personId);
        write(`Person ${person?.name ?? source.personId}; payer ${source.payer}; paid share $${source.amountPaid.toFixed()}; distinct excluded funding $${source.excludedFunding.toFixed()}; eligible before annual and business limits $${source.eligiblePremium.toFixed()}.`);
        const relationship = plan.coveredPersons?.find(row => row.personId === source.personId)?.relationshipToOwner;
        if (relationship === 'child_under_27') write(`Actual relationship to owner ${relationship}; Actual attained age at year end ${person?.attainedAgeAtYearEnd ?? "Unknown"}.`);
        if (plan.marketplaceCoverage && plan.premiumTaxCreditInvolved) write(plan.coverageFamilySources
          ? `Person ${person?.name ?? source.personId}: actual advance credit $${source.advancePremiumTaxCredit.toFixed()}; legal premium classes are derived separately in the monthly coverage-family ledger above.`
          : `Person ${person?.name ?? source.personId}: actual advance credit $${source.advancePremiumTaxCredit.toFixed()}; specified premium before coordinated credit $${source.marketplaceSpecifiedPremium.toFixed()}.`);
      }
    }
  }
  const coveredPeople = new Set(calculation.sourceRecords.filter(row => row.businessSourceId === businessSourceId && row.accountHolder === accountHolder).map(row => row.personId));
  for (const person of calculation.longTermCarePersons.filter(row => coveredPeople.has(row.personId))) write(`LTC person ${person.personId}: attained age ${person.attainedAge}; annual limit $${person.annualLimit.toFixed()}; eligible across all businesses $${person.eligiblePremiums.toFixed()}; allowed across all businesses $${person.allowedPremiums.toFixed()}.`);
  for (const [line, value] of byLine) write(`Exact calculated line ${line}: ${value.toFixed()}${line === "6" ? " (ratio; percentage display is rounded to six decimal places)" : " dollars"}.`);
  if (marketplace) {
    write("PUB974 ACTUAL COORDINATION REVIEW");
    write("The following return-level amounts are shared reference totals, not a separate deduction for this business. Do not add repeated totals from separate business appendices.");
    write("Calculated monetary worksheet values below are displayed to cents; the calculation audit retains full Decimal precision. Original source amounts above retain their supplied precision. The Schedule1 transfer follows its separate whole-dollar rule.");
    const money = (value: Decimal) => value.toDecimalPlaces(2).toFixed();
    const stopped = marketplace.method === "pub974-nonspecified-stop-2025";
    write(stopped
      ? `Actual completed method: ${marketplace.method}. Final Form 8962 credit: $${marketplace.finalCredit.toFixed()}. No special Step 2 was retained.`
      : `Actual completed method: ${marketplace.method}. Step 2 credit: $${marketplace.step2Credit.toFixed()}. Final Form 8962 credit: $${marketplace.finalCredit.toFixed()}.`);
    if (facts.marketplaceCreditAllocation) {
      const choice = facts.marketplaceCreditAllocation;
      write(`Recorded credit allocation: ${choice.method}; source year ${choice.sourceTaxYear}; reference ${choice.sourceReference}; consistent use ${String(choice.sameMethodForAllCalculationsConfirmed)}.`);
      write("This recorded reasonable-method choice allocates credit using monthly full eligible plan enrollment premiums. Benchmark ratios divide specified and nonspecified premiums only. Signed separate-business differences are combined before the common deduction limit; negative intermediate amounts are not separate QBI deductions.");
    }
    write(`Return-level Schedule 1 line 17 transfer: $${calculation.deductionToSchedule1.toFixed()}. Specified deduction $${money(marketplace.specifiedDeduction)}; nonspecified deduction $${money(marketplace.nonspecifiedDeduction)}; combined maximum $${money(marketplace.maximumDeduction)}.`);
    if (marketplace.historicalLimit?.separateBusinessNonspecifiedDeduction.gt(0)) write("SEPARATE BUSINESS ORDERING: each nonspecified claim first uses its own actual Form7206 earnings limit. The other business deduction reduces the published historical limit; its earnings are not borrowed. This optional worksheet method can be conservative; the repeated combined transfer is not another business deduction.");
    if (marketplace.historicalLimit?.remainingEarnedIncome.lt(0)) {
      write("SIGNED COMBINED WORKSHEET LIMIT: the published W15 subtraction is negative. Its signed specified component reduces the completed nonspecified claims to the single allowable return transfer. It is not a separate negative deduction. The physical business forms retain their original nonspecified calculations; adding their line14 amounts does not reproduce this coordinated return transfer.");
      write("The following QBI allocations divide that combined allowable claim using the actual gross income of every contributing business. They are shared reference amounts, not additional deductions.");
      for (const row of facts.partnershipGrossIncomeSources?.statements ?? []) if (row.accountHolder === accountHolder) {
        write(`Original partnership gross-income statement: ${row.businessSourceId}; owner ${row.accountHolder}; original source year ${row.originalK1?.taxYear}; actual business gross income $${row.grossIncome}; reference ${row.sourceReference}. This original gross amount is separate from net ordinary income and Box14 earnings.`);
      }
      for (const row of calculation.lines.filter(line => line.form === "Pub974 QBI Allocation")) write(`${row.form} ${row.line}: $${money(row.value)}. ${row.description}. ${row.formula}.`);
    }
    const ownerRows = calculation.lines.filter(row => row.form === "Pub974 Owner Allocation" && row.inputs?.Owner === accountHolder);
    if (ownerRows.length) {
      write("SEPARATE OWNER ATTRIBUTION: these amounts identify this owner's portion of the joint calculation. They are already included in the return-level transfer above. Any allocation among this owner's businesses for QBI is separate.");
      for (const row of ownerRows) write(`${row.form} ${row.line}: $${money(row.value)}. ${row.description}. ${row.formula}.`);
    }
    if (marketplace.method === "ordinary-no-ptc-2025") write("Interim attempted coordination: the following W/X/Y/Z and Step3 records explain the earlier method only. Final no-credit treatment uses the ordinary Form7206 and recomputed source claims.");
    for (const row of marketplace.historicalLimit?.lines ?? []) {
      const displayed = /percentage/i.test(row.description) ? `${row.value.toFixed()}%` : `$${money(row.value)}`;
      write(`${row.form} line ${row.line}: ${displayed}. ${row.description}. ${row.formula}.`);
    }
    for (const row of result.allLines.filter(line => line.form === "Pub974 Ordered Deductions")) write(`${row.form} ${row.line}: $${money(row.value)}. ${row.description}. ${row.formula}.`);
    const actualBusiness = marketplace.businesses.find(business => business.businessSourceId === businessSourceId && business.accountHolder === accountHolder);
    if (actualBusiness) write(stopped
      ? `Actual corresponding final credit $${money(actualBusiness.allocatedCredit)}; business premium difference $${money(actualBusiness.netPremiumsAfterCredit)} is a review amount only. The completed nonspecified claim above determines the deduction.`
      : `Allocated Step2 credit $${money(actualBusiness.allocatedCredit)}; signed business premium difference $${money(actualBusiness.netPremiumsAfterCredit)}. These worksheet components are included in the combined transfer, not additional deductions.`);
    const calculationForm = marketplace.method === "pub974-nonspecified-stop-2025" ? "Pub974 Nonspecified Stop" : "Pub974 Simplified";
    for (const row of marketplace.lines.filter(line => line.form === calculationForm || line.form === `${calculationForm} ${businessSourceId}`)) write(`${row.form} line ${row.line}: $${money(row.value)}. ${row.description}. ${row.formula}.`);
  } else write(`This business transfers $${roundDollar(group.deduction!).toFixed()} to Schedule 1 line 17. Total across all business forms: $${calculation.deductionToSchedule1.toFixed()}.`);
  write(`Eligible premium excess $${group.eligiblePremiumExcess?.toFixed() ?? "Unknown"} is a review amount, not an automatic itemized deduction.`);
  await markReviewPdf(doc);
  return doc;
}
