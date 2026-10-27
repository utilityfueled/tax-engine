/** Calculated section465 ordinary deductions limited again by section469.
 * Spec: spec/federal/k1-prior-charitable-at-risk.yaml, successive-qbi.
 * Neither the first result nor the second allowance is a taxpayer override.
 */
import Decimal from 'decimal.js';
import { calculateQbiLossCharacter, type QbiLossCharacterResult, type QbiLossHistorySource } from './qbi-loss-character.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, roundDollar, sum } from '@/utils/decimal.js';

export interface QbiPriorRiskTransferContext {
  taxYear: number;
  activitySourceId: string;
  priorPassiveLoss: Decimal;
  /** Gross ordinary deductions actually allowed, including the older469 balance. */
  calculatedAllowedLoss: Decimal;
  history: QbiLossHistorySource;
}
export interface QbiPriorRiskTransferResult {
  stage: QbiLossCharacterResult;
  currentQualifiedLossAllowed: Decimal;
  priorQualifiedLossAllowed: Decimal;
  priorActiveQualifiedLossAllowed?: Decimal;
  currentLossAllowed: Decimal;
  transferredPriorLossAllowed: Decimal;
  transferredPriorQualifiedLossAllowed: Decimal;
}

export function calculateQbiPriorRiskTransfer(source: QbiLossCharacterResult,
  context: QbiPriorRiskTransferContext): QbiPriorRiskTransferResult {
  if (source.limitation !== '465' || source.taxYear !== context.taxYear
    || source.activitySourceId !== context.activitySourceId || ![2025, 2026].includes(context.taxYear)) {
    throw new Error('Successive QBI loss limits require the same calculated source activity and year.');
  }
  const amounts = [source.currentAllowedLoss, source.priorLossAllowed,
    source.currentQualifiedLossAllowed, source.priorQualifiedLossAllowed, context.priorPassiveLoss];
  if (amounts.some(value => !(value instanceof Decimal) || !value.isFinite() || value.lt(0) || !value.isInteger())
    || !(context.calculatedAllowedLoss instanceof Decimal) || !context.calculatedAllowedLoss.isFinite()
    || context.calculatedAllowedLoss.lt(0)) {
    throw new Error('Successive QBI source balances must be finite nonnegative calculated amounts.');
  }
  if (!source.sourceCurrentLoss.isFinite() || source.sourceCurrentLoss.lt(0)
    || !source.sourceCurrentQualifiedLoss.isFinite() || source.sourceCurrentQualifiedLoss.lt(0)
    || source.sourceCurrentQualifiedLoss.gt(source.sourceCurrentLoss)
    || source.currentAllowedLoss.gt(roundDollar(source.sourceCurrentLoss))
    || source.currentQualifiedLossAllowed.gt(source.currentAllowedLoss)
    || source.priorQualifiedLossAllowed.gt(source.priorLossAllowed)
    || source.allowedPriorVintages.some(row => !Number.isInteger(row.taxYear) || row.taxYear >= context.taxYear
      || [row.lossAllowed, row.qualifiedLossAllowed].some(value => !(value instanceof Decimal) || !value.isFinite() || value.lt(0))
      || row.qualifiedLossAllowed.gt(row.lossAllowed))
    || new Set(source.allowedPriorVintages.map(row => row.taxYear)).size !== source.allowedPriorVintages.length
    || !sum(...source.allowedPriorVintages.map(row => row.lossAllowed)).eq(source.priorLossAllowed)
    || !sum(...source.allowedPriorVintages.map(row => row.qualifiedLossAllowed)).eq(source.priorQualifiedLossAllowed)) {
    throw new Error('Successive QBI original current and prior source character must reconcile.');
  }
  const currentFraction = source.sourceCurrentLoss.isZero() ? d(0)
    : source.sourceCurrentQualifiedLoss.div(source.sourceCurrentLoss);
  const expectedCurrent = source.currentAllowedLoss.eq(roundDollar(source.sourceCurrentLoss))
    ? roundDollar(source.sourceCurrentQualifiedLoss) : roundDollar(source.currentAllowedLoss.times(currentFraction));
  if (!expectedCurrent.eq(source.currentQualifiedLossAllowed)) {
    throw new Error('Successive QBI current source fraction must reconcile with its calculated first allowance.');
  }
  const incoming = source.currentAllowedLoss.plus(source.priorLossAllowed);
  const total = incoming.plus(context.priorPassiveLoss);
  if (context.calculatedAllowedLoss.gt(total)) throw new Error('Successive QBI allowance exceeds its actual source deductions.');
  // Section469 allocates the actual disallowance over all deductions within the
  // activity. QBI FIFO then classifies only the tax allowance of older469 items.
  const oldPassiveAllowed = total.isZero() ? d(0)
    : context.calculatedAllowedLoss.times(context.priorPassiveLoss).div(total);
  const stage = calculateQbiLossCharacter({ taxYear: context.taxYear, activitySourceId: context.activitySourceId,
    limitation: '469', currentLoss: incoming,
    currentQualifiedLoss: source.currentQualifiedLossAllowed.plus(source.priorQualifiedLossAllowed),
    priorLoss: context.priorPassiveLoss, calculatedAllowedLoss: context.calculatedAllowedLoss,
    calculatedPriorLossAllowance: oldPassiveAllowed, history: context.history });
  const incomingRatio = incoming.isZero() ? d(0) : stage.currentAllowedLoss.div(incoming);
  const currentLossAllowed = source.currentAllowedLoss.times(incomingRatio);
  const transferredPriorLossAllowed = stage.currentAllowedLoss.minus(currentLossAllowed);
  const currentQualifiedLossAllowed = stage.currentAllowedLoss.eq(incoming) ? source.currentQualifiedLossAllowed
    : roundDollar(currentLossAllowed.times(currentFraction));
  // Form8995 ColumnD/Row3 uses the first provision's utilized qualified and
  // nonqualified amounts. An original465 year is not an earlier469 suspension.
  const priorResuspended = source.priorLossAllowed.minus(transferredPriorLossAllowed);
  const priorQualifiedResuspended = source.priorLossAllowed.isZero() ? d(0)
    : roundDollar(priorResuspended.times(source.priorQualifiedLossAllowed).div(source.priorLossAllowed));
  const transferredPriorQualifiedLossAllowed = source.priorQualifiedLossAllowed.minus(priorQualifiedResuspended);
  const qualifiedIncomingAllowed = currentQualifiedLossAllowed.plus(transferredPriorQualifiedLossAllowed);
  const newSuspended = incoming.minus(stage.currentAllowedLoss);
  const newQualifiedSuspended = source.currentQualifiedLossAllowed.plus(source.priorQualifiedLossAllowed)
    .minus(qualifiedIncomingAllowed);
  if (currentQualifiedLossAllowed.lt(0) || currentQualifiedLossAllowed.gt(source.currentQualifiedLossAllowed)
    || qualifiedIncomingAllowed.gt(stage.currentAllowedLoss)
    || newQualifiedSuspended.lt(0) || newQualifiedSuspended.gt(newSuspended)) {
    throw new Error('Successive QBI qualified source transfers must conserve allowed and suspended deductions.');
  }
  stage.currentQualifiedLossAllowed = qualifiedIncomingAllowed;
  stage.remainingVintages = stage.remainingVintages.filter(row => row.taxYear !== context.taxYear);
  if (newSuspended.gt(0)) stage.remainingVintages.push({ taxYear: context.taxYear,
    originalLoss: newSuspended, qualifiedOriginalLoss: newQualifiedSuspended,
    remainingLoss: newSuspended, qualifiedRemainingLoss: newQualifiedSuspended });
  const priorQualifiedLossAllowed = stage.priorQualifiedLossAllowed.plus(transferredPriorQualifiedLossAllowed);
  const transferredActive = transferredPriorQualifiedLossAllowed.isZero() ? d(0)
    : source.priorActiveQualifiedLossAllowed === undefined ? undefined
      : roundDollar(transferredPriorQualifiedLossAllowed.times(source.priorActiveQualifiedLossAllowed).div(source.priorQualifiedLossAllowed));
  const priorActiveQualifiedLossAllowed = transferredActive === undefined || stage.priorActiveQualifiedLossAllowed === undefined
    ? undefined : transferredActive.plus(stage.priorActiveQualifiedLossAllowed);
  const audit = new AuditTrail();
  audit.record('QBI Successive Limit', `${context.activitySourceId}:465:469`, 'Prior465 qualified deduction finally allowed',
    transferredPriorQualifiedLossAllowed, 'Actual469 proportional deduction allocation; Form8995 ColumnD and Row3 remove re-suspended prior loss once',
    { 'Activity source': context.activitySourceId, 'Incoming current deduction': source.currentAllowedLoss,
      'Incoming prior465 deduction': source.priorLossAllowed, 'Incoming prior465 qualified deduction': source.priorQualifiedLossAllowed,
      'Older469 opening deduction': context.priorPassiveLoss, 'Total ordinary deduction allowed': context.calculatedAllowedLoss,
      'Prior465 deduction re-suspended': priorResuspended, 'Prior465 qualified deduction re-suspended': priorQualifiedResuspended,
      'New469 suspension year': String(context.taxYear), 'New469 deduction': newSuspended,
      'New469 qualified deduction': newQualifiedSuspended, 'Current qualified deduction finally allowed': currentQualifiedLossAllowed });
  // Replace the pooled current-fraction line; its qualification would erase the
  // distinction between an original current loss and a released prior465 loss.
  stage.lines = stage.lines.filter(line => line.line !== `${context.activitySourceId}:469:current`);
  stage.lines.push(...audit.getLines());
  return { stage, currentQualifiedLossAllowed, priorQualifiedLossAllowed, priorActiveQualifiedLossAllowed,
    currentLossAllowed, transferredPriorLossAllowed, transferredPriorQualifiedLossAllowed };
}
