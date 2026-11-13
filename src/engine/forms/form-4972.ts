import Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";

interface Form4972CommonInput {
  taxYear: number;
  distributionCode: string;
  participantBirthDate: string;
  election: "capital_gain" | "ten_year" | "both";
  entireBalanceConfirmed?: boolean;
  rolloverOccurred?: boolean;
  otherDisqualifications?: boolean;
  onlyDistributionAndRecipientConfirmed?: boolean;
  taxableAmountNotDetermined?: boolean;
  grossDistribution: string;
  taxableAmount: string;
  capitalGain: string;
  netUnrealizedAppreciation: string;
  actuarialValue: string;
}

export type Form4972Input = Form4972CommonInput & ({
  sourceKind?: "own_plan";
  ownQualifiedPlan?: boolean;
  fiveParticipationYearsConfirmed?: boolean;
  priorDisqualifyingElection?: boolean;
  lumpSumAnnuityValueConfirmed?: boolean;
  nuaTreatment?: "defer" | "include";
} | {
  sourceKind: "death_beneficiary";
  qualifiedPlanConfirmed?: boolean;
  participantDeathDate: string;
  distributionDate: string;
  receivedBecauseOfDeath?: boolean;
  priorBeneficiaryElectionForParticipant?: boolean;
  federalEstateTax: string;
});

// Highest threshold first so the first applicable row supplies the printed base tax.
const rateSchedule = [
  ["0", "0", "0.11"], ["1190", "130.90", "0.12"], ["2270", "260.50", "0.14"],
  ["4530", "576.90", "0.15"], ["6690", "900.90", "0.16"], ["9170", "1297.70", "0.18"],
  ["11440", "1706.30", "0.20"], ["13710", "2160.30", "0.23"], ["17160", "2953.80", "0.26"],
  ["22880", "4441.00", "0.30"], ["28600", "6157.00", "0.34"], ["34320", "8101.80", "0.38"],
  ["42300", "11134.20", "0.42"], ["57190", "17388.00", "0.48"], ["85790", "31116.00", "0.50"],
].reverse();

function sourceAmount(value: string, box: string): Decimal {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(`Form 4972 requires the original nonnegative dollar and cent amount in ${box}`);
  }
  return new Decimal(value);
}

function scheduleTax(amount: Decimal): Decimal {
  const [threshold, base, rate] = rateSchedule.find(([threshold]) => amount.gt(threshold)) ?? ["0", "0", "0.11"];
  return amount.minus(threshold).times(rate).plus(base);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Internal 2026 worksheet for one qualifying plan distribution to one recipient. */
export function calculateForm4972(input: Form4972Input) {
  const code = input.distributionCode.trim().toUpperCase();
  const zero = new Decimal(0);
  let federalEstateTax = zero;
  if (input.taxYear !== 2026 || !isCalendarDate(input.participantBirthDate) || input.participantBirthDate >= "1936-01-02"
    || input.entireBalanceConfirmed !== true || input.rolloverOccurred !== false || input.otherDisqualifications !== false
    || input.onlyDistributionAndRecipientConfirmed !== true || input.taxableAmountNotDetermined !== false) {
    throw new Error("Form 4972 requires confirmed eligibility and one determined distribution to one recipient");
  }
  if (input.sourceKind === "death_beneficiary") {
    const { participantDeathDate, distributionDate } = input;
    if (!/^(?:4A|A4)$/.test(code) || input.qualifiedPlanConfirmed !== true || input.receivedBecauseOfDeath !== true
      || input.priorBeneficiaryElectionForParticipant !== false || !isCalendarDate(participantDeathDate)
      || !isCalendarDate(distributionDate) || !distributionDate.startsWith("2026-")
      || participantDeathDate < "1996-08-21" || participantDeathDate < input.participantBirthDate
      || participantDeathDate > distributionDate) {
      throw new Error("Form 4972 requires confirmed death-beneficiary eligibility and matching original dates");
    }
    federalEstateTax = sourceAmount(input.federalEstateTax, "federal estate tax");
    if (federalEstateTax.gt(0) && input.election !== "ten_year") {
      throw new Error("Form 4972 positive federal estate tax with Part II requires a separate allocation");
    }
  } else if (!/^(?:7A|A7)$/.test(code) || input.ownQualifiedPlan !== true
    || input.fiveParticipationYearsConfirmed !== true || input.priorDisqualifyingElection !== false) {
    throw new Error("Form 4972 requires confirmed eligibility from the participant's own plan");
  }

  const gross = sourceAmount(input.grossDistribution, "Box 1");
  const taxable = sourceAmount(input.taxableAmount, "Box 2a");
  const gain = sourceAmount(input.capitalGain, "Box 3");
  const nua = sourceAmount(input.netUnrealizedAppreciation, "Box 6");
  const actuarialValue = sourceAmount(input.actuarialValue, "Box 8a");
  if (taxable.plus(nua).gt(gross) || gain.gt(taxable)) {
    throw new Error("Form 4972 requires reconciled Boxes 1, 2a, 3 and 6");
  }
  if (nua.gt(0)) {
    if (input.sourceKind === "death_beneficiary") {
      throw new Error("Form 4972 beneficiary worksheet requires confirmed zero Box 6");
    }
    if (input.nuaTreatment !== "include" && input.nuaTreatment !== "defer") {
      throw new Error("Form 4972 requires the taxpayer to choose whether to include or defer positive Box 6");
    }
  }
  if (actuarialValue.gt(0) && (input.sourceKind === "death_beneficiary" || input.lumpSumAnnuityValueConfirmed !== true)) {
    throw new Error("Form 4972 requires a confirmed own-plan lump-sum annuity value in Box 8a, excluded from Boxes 1 and 2a");
  }

  const partII = input.election === "capital_gain" || input.election === "both";
  const partIII = input.election === "ten_year" || input.election === "both";
  if ((!partII && !partIII) || (partII && gain.isZero())) {
    throw new Error("Form 4972 requires an actual election and a positive Box 3 when Part II is elected");
  }

  const audit = new AuditTrail();
  const record = (line: string, description: string, amount: Decimal, formula: string) =>
    audit.record("Form 4972", line, description, amount, formula);
  const includeNua = input.sourceKind !== "death_beneficiary" && input.nuaTreatment === "include" && nua.gt(0);
  const includedNua = includeNua ? nua : zero;
  let capitalNua = zero;
  let nuaWorksheet: ReturnType<AuditTrail["getLines"]> | undefined;
  if (includeNua && partII) {
    const worksheet = new AuditTrail();
    const worksheetLine = (line: string, description: string, amount: Decimal, formula: string) =>
      worksheet.record("Form 4972 NUA Worksheet", line, description, amount, formula);
    worksheetLine("A", "Reported capital gain", gain, "Form 1099-R Box 3");
    worksheetLine("B", "Reported taxable amount", taxable, "Form 1099-R Box 2a");
    const share = worksheetLine("C", "Capital gain share", gain.dividedBy(taxable), "A divided by B");
    worksheetLine("D", "Reported net unrealized appreciation", nua, "Form 1099-R Box 6");
    capitalNua = worksheetLine("E", "Capital gain portion of NUA", share.times(nua), "C × D");
    worksheetLine("F", "Ordinary income portion of NUA", nua.minus(capitalNua), "D less E");
    worksheetLine("G", "Total capital gain", gain.plus(capitalNua), "A plus E");
    nuaWorksheet = worksheet.getLines();
  }
  const line6 = partII ? record("6", "Capital gain elected", gain.plus(capitalNua),
    nuaWorksheet ? "NUA Worksheet G" : "Form 1099-R Box 3") : undefined;
  const line7 = line6 ? record("7", "Capital gain election tax", line6.times("0.20"), "Line 6 × 20%") : undefined;
  const remaining = taxable.plus(includedNua).minus(line6 ?? zero);
  const partIIResult = { line6, line7, nuaWorksheet, deferredNua: includeNua ? zero : nua };

  if (!partIII) {
    return { ...partIIResult, separateTax: line7 ?? zero, ordinaryPensionTransfer: remaining, lines: audit.getLines() };
  }

  const line8 = record("8", "Amount subject to the ten-year option", remaining,
    includeNua ? "Box 2a plus included Box 6 less any amount on line 6" : "Box 2a less any amount on line 6");
  const line9 = record("9", "Death benefit exclusion", zero,
    input.sourceKind === "death_beneficiary" ? "Death on or after August 21, 1996" : "Participant's own plan");
  const line10 = record("10", "Total taxable amount", line8.minus(line9), "Line 8 less line 9");
  const line11 = record("11", "Actuarial value of annuity", actuarialValue, "Form 1099-R Box 8a");
  const line12 = record("12", "Adjusted total taxable amount", line10.plus(line11), "Line 10 plus line 11");
  let line16: Decimal | undefined;
  if (line12.lt("70000")) {
    const line13 = record("13", "Initial allowance", Decimal.min(line12.times("0.50"), "10000"), "Lesser of half of line 12 or $10,000");
    const line14 = record("14", "Excess over $20,000", Decimal.max(line12.minus("20000"), zero), "Line 12 above $20,000");
    const line15 = record("15", "Allowance reduction", line14.times("0.20"), "Line 14 × 20%");
    line16 = record("16", "Minimum distribution allowance", line13.minus(line15), "Line 13 less line 15");
  }
  const line17 = record("17", "Taxable amount after allowance", line12.minus(line16 ?? zero), "Line 12 less any allowance on line 16");
  if (federalEstateTax.gt(line17)) {
    throw new Error("Form 4972 federal estate tax exceeds the supported line 17 amount");
  }
  const line18 = record("18", "Estate tax attributable to this distribution", federalEstateTax,
    input.sourceKind === "death_beneficiary" ? "Confirmed attributable amount from estate records" : "Participant's own plan");
  const line19 = record("19", "Amount for the ten-year computation", line17.minus(line18), "Line 17 less line 18");
  let line22: Decimal | undefined;
  if (line11.gt(0)) {
    const line20 = record("20", "Actuarial share of adjusted taxable amount", line11.dividedBy(line12), "Line 11 divided by line 12");
    const line21 = record("21", "Actuarial share of minimum distribution allowance", (line16 ?? zero).times(line20), "Any line 16 allowance × line 20");
    line22 = record("22", "Actuarial value after allowance", line11.minus(line21), "Line 11 less line 21");
  }
  const line23 = record("23", "One-tenth of the taxable amount", line19.times("0.10"), "Line 19 × 10%");
  const line24 = record("24", "Tax on one-tenth of the taxable amount", scheduleTax(line23), "2026 Form 4972 Tax Rate Schedule");
  const line25 = record("25", "Ten times the computed tax", line24.times(10), "Line 24 × 10");
  let line28: Decimal | undefined;
  if (line22) {
    const line26 = record("26", "One-tenth of actuarial value after allowance", line22.times("0.10"), "Line 22 × 10%");
    const line27 = record("27", "Tax on one-tenth of the actuarial amount", scheduleTax(line26), "2026 Form 4972 Tax Rate Schedule");
    line28 = record("28", "Ten times the actuarial tax", line27.times(10), "Line 27 × 10");
  }
  const line29 = record("29", "Ten-year option tax", line25.minus(line28 ?? zero), "Line 25 less any tax on line 28");
  const line30 = record("30", "Tax on the lump-sum distribution", line29.plus(line7 ?? zero), "Lines 7 and 29");

  return {
    ...partIIResult, line8, line16, line17, line24, line29, line30,
    separateTax: line30, ordinaryPensionTransfer: zero, lines: audit.getLines(),
  };
}
