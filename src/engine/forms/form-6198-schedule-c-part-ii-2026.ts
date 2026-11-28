import Decimal from "decimal.js";
import { Form6198ScheduleCPartII2026Schema, type Form6198ScheduleCPartII2026Context } from "@/models/form-6198-schedule-c-part-ii-2026.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { sumSourceMoney } from "@/utils/sum-source-money.js";

interface Form6198ScheduleCPartII2026Result {
  allowedLoss: Decimal;
  currentSuspendedLoss: Decimal;
  atRiskAmount: Decimal;
  lines: CalculatedLine[];
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

/** Spec: spec/federal/2026/form-6198-schedule-c-part-ii.yaml. */
export function calculateForm6198ScheduleCPartII2026(
  original: unknown,
  ordinaryScheduleCLoss: Decimal,
  context: Form6198ScheduleCPartII2026Context,
): Form6198ScheduleCPartII2026Result {
  if (context.taxYear !== 2026) throw new Error("Form 6198 sole-proprietor Part II requires a 2026 return.");
  const parsed = Form6198ScheduleCPartII2026Schema.safeParse(original);
  if (!parsed.success) throw new Error("Form 6198 requires complete original Part II sole-proprietor records.");
  const source = parsed.data;

  const { primaryOwner, business } = context;
  const ownerId = primaryOwner.ssn.replaceAll("-", "");
  if (!/^\d{9}$/.test(ownerId) || ownerId.slice(-4) !== source.primaryOwnerTaxpayerIdLast4
    || normalizedName(`${primaryOwner.firstName} ${primaryOwner.lastName}`) !== normalizedName(source.primaryOwnerName)
    || business?.accountHolder !== "primary" || business.materiallyParticipated !== true || business.allInvestmentAtRisk !== false
    || normalizedName(business.activityDescription ?? "") !== normalizedName(source.activityDescription)
    || business.originalScheduleCReference?.trim() !== source.originalScheduleCReference
    || !ordinaryScheduleCLoss.isFinite() || !ordinaryScheduleCLoss.lt(0) || !ordinaryScheduleCLoss.eq(source.currentOrdinaryLoss)) {
    throw new Error("Form 6198 Part II must match the primary owner, Schedule C activity and exact current ordinary loss.");
  }

  const line6 = new Decimal(source.openingAdjustedAssetBasisBeforeLiabilities);
  const line7 = new Decimal(source.increases);
  const line8 = sumSourceMoney(line6, line7);
  const line9 = new Decimal(source.decreases);
  const line10a = sumSourceMoney(line8, line9.negated());
  if (line10a.lt(0)) throw new Error("Negative Form 6198 Part II capacity requires separate Part III and recapture review.");

  const currentLoss = ordinaryScheduleCLoss.abs();
  const deductibleLoss = Decimal.min(currentLoss, line10a);
  const allowedLoss = deductibleLoss.isZero() ? deductibleLoss : deductibleLoss.negated();
  const audit = new AuditTrail();
  audit.record("Form 6198", "1", "Ordinary Schedule C loss", ordinaryScheduleCLoss, "Independently calculated current Schedule C loss before the at-risk limitation");
  audit.record("Form 6198", "5", "Current-year activity loss", ordinaryScheduleCLoss, "Line 1 for the confirmed single ordinary loss");
  audit.record("Form 6198", "6", "Opening adjusted asset basis", line6, "Verified first-day sole-proprietor activity asset basis before liabilities");
  audit.record("Form 6198", "7", "Current-year increases", line7, "Verified Part II increases excluding current Part I income and gains");
  audit.record("Form 6198", "8", "Adjusted basis plus increases", line8, "Line 6 plus line 7");
  audit.record("Form 6198", "9", "Current-year decreases and amounts not at risk", line9, "Verified Part II decreases and amounts included in opening basis for which the owner is not at risk");
  audit.record("Form 6198", "10a", "Part II net amount", line10a, "Line 8 minus line 9");
  audit.record("Form 6198", "10b", "Part II amount at risk", line10a, "Nonnegative amount from line 10a");
  audit.record("Form 6198", "20", "Amount at risk", line10a, "Part II amount from line 10b");
  audit.record("Form 6198", "21", "Deductible loss", allowedLoss, "Lesser of the absolute line 5 loss and line 20, reported as a loss or zero");
  return {
    allowedLoss,
    currentSuspendedLoss: sumSourceMoney(currentLoss, deductibleLoss.negated()),
    atRiskAmount: line10a,
    lines: audit.getLines(),
  };
}
