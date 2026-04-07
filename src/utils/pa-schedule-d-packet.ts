import type { TaxYearInput } from "@/models/inputs.js";
import type { PAScheduleDResult } from "@/engine/state/pa-schedule-d.js";
import { d } from "@/utils/decimal.js";

function hasNonZeroDecimalish(value: string | number | undefined) {
  return value !== undefined && !d(value).isZero();
}

function hasNonZeroScheduleK1CapitalGain(input: TaxYearInput) {
  return input.scheduleK1.some((entry) =>
    !d(entry.netShortTermCapitalGain).isZero()
    || !d(entry.netLongTermCapitalGain).isZero()
    || !d(entry.section1231Gain).isZero(),
  );
}

function hasNonZeroPAPassThroughGain(input: TaxYearInput) {
  return (input.paPassThroughStatements ?? []).some((statement) => !d(statement.netGainOrLoss).isZero());
}

function hasNonZeroForm6781Amount(input: TaxYearInput) {
  return input.form6781 !== undefined && (
    !d(input.form6781.section1256Gains).isZero()
    || !d(input.form6781.section1256Losses).isZero()
    || !d(input.form6781.adjustments).isZero()
  );
}

export function shouldIncludePAScheduleDReferenceSummary(
  input: TaxYearInput,
  result: PAScheduleDResult,
) {
  if (
    result.digitalAssetQuestionYes
    || result.likeKindExchanges.length > 0
    || [
      result.line1,
      result.line2,
      result.line4,
      result.line5,
      result.line6,
      result.line7,
      result.line8,
      result.line9,
      result.line10,
      result.line11,
      result.line12,
    ].some((line) => !line.isZero())
  ) {
    return true;
  }

  if (input.form1099B.some((entry) => entry.transactions.length > 0)) {
    return true;
  }

  if ((input.form6252?.length ?? 0) > 0 || hasNonZeroForm6781Amount(input) || hasNonZeroScheduleK1CapitalGain(input)) {
    return true;
  }

  if (hasNonZeroPAPassThroughGain(input)) {
    return true;
  }

  const scheduleDOverrides = input.paResidentReturn?.scheduleD;

  if (
    (scheduleDOverrides?.additionalTransactions?.length ?? 0) > 0
    || (scheduleDOverrides?.likeKindExchanges?.length ?? 0) > 0
    || scheduleDOverrides?.receivedDigitalAssetAsCompensationOrServices === true
  ) {
    return true;
  }

  return [
    scheduleDOverrides?.otherLine3GainOrLoss,
    scheduleDOverrides?.cCorporationDistributionGain,
    scheduleDOverrides?.scheduleD71GainOrLoss,
    scheduleDOverrides?.partnershipDistributionGain,
    scheduleDOverrides?.sCorporationDistributionGain,
    scheduleDOverrides?.insuranceContractGain,
  ].some((value) => hasNonZeroDecimalish(value));
}
