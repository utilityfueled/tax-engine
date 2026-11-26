import type { ScheduleK1 } from "@/models/inputs.js";
import type { PartnershipEntry } from "./schedules/schedule-e.js";
import type { Form8582Result } from "./forms/form-8582.js";
import { d, zeroFloor } from "@/utils/decimal.js";

/** Reg. §1.199A-3(c)(3)(ii)(A). Do not reuse loss dollars until allowed in taxable income. */
export function reconcileQualifiedPtpLossSource(
  taxYear: number,
  k1: ScheduleK1,
  partnership: PartnershipEntry,
  allowance?: Form8582Result["ptpLossAllowances"][number],
) {
  const statementAmount = d(k1.section199AQualifiedPTPIncome);
  const source = k1.section199APTPLossSource;
  const precedingPassiveLoss = allowance?.priorLoss ?? d(0);
  const currentPassiveLoss = allowance?.currentLoss ?? d(0);
  const atRiskSuspended = partnership.suspendedAtRiskLoss.abs();
  const basisLosses = partnership.basisResult?.lossCategories;
  const ordinaryBasisAllowed = d(basisLosses?.find(category => category.key === "ordinary")?.allowed);
  const nonpassiveAllowed = basisLosses
    ? zeroFloor(ordinaryBasisAllowed.minus(atRiskSuspended))
    : partnership.nonpassiveLoss.abs();
  const totalAllowed = allowance?.allowedTotal ?? nonpassiveAllowed;
  const upstreamSuspended = d(partnership.basisResult?.totalSuspendedLosses).abs().plus(atRiskSuspended);
  const canReleasePrior = precedingPassiveLoss.gt(0) && totalAllowed.gt(0);
  const maySuspendCurrent = upstreamSuspended.gt(0)
    || (currentPassiveLoss.gt(0) && totalAllowed.lt(currentPassiveLoss.plus(precedingPassiveLoss)));
  const hasStatement = k1.section199AQualifiedPTPIncome !== undefined;
  const needsSource = k1.isPubliclyTradedPartnership === true && (canReleasePrior || (hasStatement && maySuspendCurrent));
  if (k1.isPubliclyTradedPartnership
    && Object.values(k1.priorSuspendedLosses ?? {}).some(amount => !d(amount).isZero())) {
    throw new Error("PTP prior basis losses require separate qualification review");
  }
  if (!source && !needsSource) return { currentAmount: statementAmount, releasedPriorQualifiedLoss: d(0), reviewed: false };

  if (!source || !k1.isPubliclyTradedPartnership || source.sourceFactsConfirmed !== true
    || !source.sourceReference.trim() || source.sourceTaxYear !== taxYear) {
    throw new Error("A confirmed current-year PTP loss source is required for the section 199A statement and passive loss history");
  }
  if (partnership.basisResult?.totalSuspendedLosses.gt(0)
    && basisLosses?.some(category => category.key !== "ordinary" && category.total.gt(0))) {
    throw new Error("Mixed PTP basis loss categories require separate qualification review");
  }
  const priorAllowed = d(source.priorAllowedLoss);
  const currentAllowed = totalAllowed.minus(priorAllowed);
  const currentSuspended = upstreamSuspended.plus(allowance ? currentPassiveLoss.minus(currentAllowed) : d(0));
  const currentAmount = d(source.currentAllowedAmount);
  const excludedCurrentLoss = currentAmount.minus(statementAmount);
  const releasedPriorQualifiedLoss = d(source.releasedPriorQualifiedLoss);
  if (!statementAmount.isFinite() || !statementAmount.eq(source.currentStatementAmount)
    || !priorAllowed.isFinite() || priorAllowed.lt(0) || priorAllowed.gt(precedingPassiveLoss)
    || currentAllowed.lt(0) || (allowance && currentAllowed.gt(currentPassiveLoss))
    || !excludedCurrentLoss.isFinite() || excludedCurrentLoss.lt(0) || excludedCurrentLoss.gt(currentSuspended)
    || (currentSuspended.gt(0) && currentAmount.lt(currentAllowed.negated()))
    || !releasedPriorQualifiedLoss.isFinite() || releasedPriorQualifiedLoss.lt(0) || releasedPriorQualifiedLoss.gt(priorAllowed)) {
    throw new Error("Qualified PTP amounts must reconcile to the statement and actual loss allowances");
  }
  return { currentAmount, releasedPriorQualifiedLoss, reviewed: true };
}
