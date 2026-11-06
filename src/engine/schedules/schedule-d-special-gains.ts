/** ScheduleD instructions, Lines18/19 source worksheets.
 * Spec: spec/federal/schedule-d-special-gains.yaml.
 * Source binding and final form rounding belong to the canonical caller.
 */
import Decimal from 'decimal.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum, zeroFloor } from '@/utils/decimal.js';

export interface ScheduleDSpecialGainSources {
  form8949CollectiblesGainLoss: Decimal;
  section1202WorksheetComponent: Decimal;
  otherCollectiblesGainLoss: Decimal;
  reportedCollectiblesGainLoss: Decimal;
  shortTermNetGainLoss: Decimal;
  /** Signed negative ScheduleD14, including any final1041 long-term loss once. */
  longTermLossCarryover: Decimal;
  form4797Gain: Decimal;
  form4797Lookback: Decimal;
  businessProperties: Array<{ depreciationAllowed: Decimal; totalGain: Decimal; ordinaryRecapture: Decimal }>;
  businessInstallment1250Gain: Decimal;
  passThrough1250Gain: Decimal;
  partnershipSale1250Gain: Decimal;
  reported1250Gain: Decimal;
  other1250Gain: Decimal;
}
export interface ScheduleDSpecialGainResult {
  collectiblesGain: Decimal;
  unrecapturedSection1250Gain: Decimal;
  lines: CalculatedLine[];
}

function sourceAmount(value: Decimal, signed = false): Decimal {
  if (!(value instanceof Decimal) || !value.isFinite() || (!signed && value.lt(0))) {
    throw new Error('ScheduleD special gain source amounts must be finite and have their actual worksheet sign');
  }
  return value;
}

export function calculateScheduleDSpecialGains(sources: ScheduleDSpecialGainSources): ScheduleDSpecialGainResult {
  const audit = new AuditTrail();
  const rateForm = '28% Rate Gain Worksheet';
  const recaptureForm = 'Unrecaptured Section1250 Gain Worksheet';
  const record = (form: string, line: string, label: string, value: Decimal, formula: string) => {
    audit.record(form, line, label, value, formula);
    return value;
  };
  const c1 = record(rateForm, '1', 'Form8949 long-term collectible gain or loss', sourceAmount(sources.form8949CollectiblesGainLoss, true), 'Actual classified Form8949PartII sources');
  const c2 = record(rateForm, '2', 'Section1202 worksheet component', sourceAmount(sources.section1202WorksheetComponent), 'Actual exclusion for50percent; two-thirds for60percent; one-third for75percent; zero for100percent');
  const c3 = record(rateForm, '3', 'Other-form collectible gain or loss', sourceAmount(sources.otherCollectiblesGainLoss, true), 'Actual collectible sources from other forms');
  const c4 = record(rateForm, '4', 'Reported collectible gain or loss', sourceAmount(sources.reportedCollectiblesGainLoss, true), 'Actual DIV,2439,K1 and elected child sources');
  const carry = sourceAmount(sources.longTermLossCarryover, true);
  if (carry.gt(0)) throw new Error('ScheduleD loss carry source must be zero or negative');
  const c5 = record(rateForm, '5', 'Long-term capital loss carryover', carry, 'ScheduleD14 including final1041loss once');
  const c6 = record(rateForm, '6', 'Net short-term capital loss', Decimal.min(d('0'), sourceAmount(sources.shortTermNetGainLoss, true)), 'Smaller of zero or ScheduleD7');
  const collectibleSubtotal = sum(c1, c2, c3, c4);
  const collectiblesGain = record(rateForm, '7', '28 percent rate gain', zeroFloor(sum(collectibleSubtotal, c5, c6)), 'Positive sum of lines1through6; ScheduleD18');

  const propertyResults = sources.businessProperties.map((property, index) => {
    const lesser = Decimal.min(sourceAmount(property.depreciationAllowed), sourceAmount(property.totalGain));
    const recapture = sourceAmount(property.ordinaryRecapture);
    if (recapture.gt(lesser)) throw new Error('ScheduleD ordinary recapture exceeds the actual property depreciation or gain');
    record(recaptureForm, `1:${index + 1}`, 'Property depreciation limited by actual gain', lesser, 'Smaller of depreciation allowed or total gain');
    record(recaptureForm, `2:${index + 1}`, 'Property ordinary1250recapture', recapture, 'Actual Form4797ordinary recapture');
    return record(recaptureForm, `3:${index + 1}`, 'Property unrecaptured1250gain', lesser.minus(recapture), 'Property line1 minus line2');
  });
  const businessGain = sourceAmount(sources.form4797Gain, true);
  const lookback = sourceAmount(sources.form4797Lookback);
  const installment = sourceAmount(sources.businessInstallment1250Gain);
  const passThrough = sourceAmount(sources.passThrough1250Gain);
  let business1250Gain = d('0');
  if (businessGain.gt(0)) {
    const u3 = record(recaptureForm, '3', 'Total property unrecaptured1250gain', sum(...propertyResults), 'Sum each actual property line3');
    const u4 = record(recaptureForm, '4', 'Business installment1250gain', installment, 'Actual current installment gain and remaining1250history');
    const u5 = record(recaptureForm, '5', 'Partnership and S corporation1250gain', passThrough, 'Actual K1 partnership and S corporation amounts');
    const u6 = record(recaptureForm, '6', 'Business1250gain subtotal', sum(u3, u4, u5), 'Lines3+4+5');
    const u7 = record(recaptureForm, '7', 'Business1250gain limited by1231gain', Decimal.min(u6, businessGain), 'Smaller of line6 or Form4797line7');
    record(recaptureForm, '8', 'Section1231 lookback', lookback, 'Actual Form4797line8');
    business1250Gain = zeroFloor(u7.minus(lookback));
  }
  const u9 = record(recaptureForm, '9', 'Business1250gain after lookback', business1250Gain, businessGain.gt(0) ? 'Positive line7 minus line8' : 'Skip lines1through9 when Form4797line7 is not a gain');
  const u10 = record(recaptureForm, '10', 'Partnership interest sale1250gain', sourceAmount(sources.partnershipSale1250Gain), 'Actual partnership interest sale source');
  const u11 = record(recaptureForm, '11', 'Reported estate trust and distribution1250gain', sourceAmount(sources.reported1250Gain), 'Actual DIV,2439,1041,1099R and elected child sources');
  const u12 = record(recaptureForm, '12', 'Other nonbusiness1250gain', sourceAmount(sources.other1250Gain), 'Actual dispositions not included in Form4797PartI');
  const u13 = record(recaptureForm, '13', 'Total unrecaptured1250gain before capital losses', sum(u9, u10, u11, u12), 'Lines9through12');
  const u14 = record(recaptureForm, '14', 'Signed collectible and QSBS subtotal', collectibleSubtotal, '28percentworksheet lines1through4 before loss offsets');
  const u15 = record(recaptureForm, '15', 'Net short-term capital loss', c6, 'ScheduleD7 loss only');
  const u16 = record(recaptureForm, '16', 'Long-term capital loss carryover', c5, 'ScheduleD14 including final1041loss once');
  const u17 = record(recaptureForm, '17', 'Capital loss remaining after collectible sources', zeroFloor(sum(u14, u15, u16).negated()), 'Negative sum of lines14through16, expressed positive; otherwise zero');
  const unrecapturedSection1250Gain = record(recaptureForm, '18', 'Unrecaptured1250gain after capital losses', zeroFloor(u13.minus(u17)), 'Positive line13 minus line17; ScheduleD19');
  return { collectiblesGain, unrecapturedSection1250Gain, lines: audit.getLines() };
}
