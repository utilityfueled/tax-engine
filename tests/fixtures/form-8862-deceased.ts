import { source, packet, filer, home, known } from './form-8862.js';
import { form8862ReviewInput } from './form-8862-review.js';

/** Explicit fictional original final-return records, never product defaults. */
export function deceasedForm8862Input(joint = true) {
  const current = source(joint);
  Object.assign(known(current.standardDeductionFacts), { primaryDeathDate: '2025-06-30', shortTaxYear: false });
  filer(current).applicableYearEnd = '2025-06-30'; filer(current).homeDays = home(91);
  if (joint) {
    filer(current, 1).homeDays = home(183);
    packet(current).jointReturnAfterDeath = { sourceReference: 'Fictional confidential final-year marriage record', survivingSpouseRemarriedBeforeOwnYearEnd: false };
  }
  return form8862ReviewInput(current);
}
