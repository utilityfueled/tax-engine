/** Canonical current K-1 limitations and separately released prior QBI.
 * Spec: spec/federal/k1-qbi-loss-return.yaml.
 */
import Decimal from 'decimal.js';
import type { CalculatedLine } from '@/models/outputs.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { ScheduleEResult } from '@/engine/schedules/schedule-e.js';
import type { Form8582Result } from '@/engine/forms/form-8582.js';
import type { Form461Result } from '@/engine/forms/form-461.js';
import { calculateQbiLossCharacter, type QbiLossCharacterResult, type QbiLossCharacterVintage } from '@/engine/forms/qbi-loss-character.js';
import { calculateQbiLossRelimitation } from '@/engine/forms/qbi-loss-relimitation.js';
import { calculateQbiPriorRiskTransfer } from '@/engine/forms/k1-prior-risk-qbi.js';
import { calculateK1PassiveCapitalSources } from './k1-passive-capital-sources.js';
import { validateK1QbiLossSources, type K1QbiLossSourceInput } from '@/engine/forms/k1-qbi-loss-sources.js';
import { d, roundDollar, sum } from '@/utils/decimal.js';

export interface K1QbiLossActivityResult {
  sourceId: string;
  k1Index: number;
  accountHolder: 'primary' | 'spouse';
  passiveSourceIndex?: number;
  currentQbi: Decimal;
  priorQualifiedLoss: Decimal;
  priorActiveQualifiedLoss?: Decimal;
  stages: QbiLossCharacterResult[];
  excessBusinessLossVintage?: QbiLossCharacterVintage;
  excessBusinessLossCurrentOrigin?: boolean;
}
export interface K1QbiLossReturnResult {
  activities: K1QbiLossActivityResult[];
  priorQualifiedLoss: Decimal;
  priorActiveQualifiedLoss?: Decimal;
  lines: CalculatedLine[];
}

export function calculateK1QbiLossReturn(input: K1QbiLossSourceInput & Pick<TaxYearInput, 'form461' | 'scheduleK1Form1041'>, context: {
  scheduleE: ScheduleEResult;
  form8582: Form8582Result;
  form461: Form461Result;
}): K1QbiLossReturnResult {
  const sources = validateK1QbiLossSources(input);
  const capital = calculateK1PassiveCapitalSources(input, context.scheduleE);
  const terminalCharacters = new Map<string, QbiLossCharacterResult>();
  const lines: CalculatedLine[] = [];
  let priorQualifiedLoss = d('0');
  let priorActiveQualifiedLoss: Decimal | undefined = d('0');
  const activities: K1QbiLossActivityResult[] = sources.map(source => {
    const original = input.scheduleK1[source.k1Index];
    const entry = context.scheduleE.partnerships[source.k1Index];
    if (!entry || entry.name !== original.partnershipName || entry.ein !== original.partnershipEIN
      || !entry.rawNetAmount.eq(source.ordinaryIncome) || entry.isPassive !== original.isPassiveActivity
      || !entry.basisResult) {
      throw new Error('K1 QBI requires its matching canonical ordinary ScheduleE source and basis result');
    }
    if (!original.form6198 || !d(original.form6198.ordinaryIncome).eq(entry.basisAdjustedNetAmount.minus(source.priorAtRiskLoss))) {
      throw new Error('K1 QBI original Form6198 ordinary source must reconcile to the canonical basis-adjusted amount');
    }
    const currentLoss = Decimal.max(0, source.ordinaryIncome.negated());
    const qualifiedLoss = Decimal.max(0, source.qualifiedBusinessIncome.negated());
    const qualifiedFraction = currentLoss.isZero() ? d('0') : qualifiedLoss.div(currentLoss);
    const basisLoss = Decimal.max(0, entry.basisAdjustedNetAmount.negated());
    const atRiskLoss = source.charitableAtRisk?.ordinaryDeductionAllowed ?? Decimal.max(0, entry.netAmount.negated());
    if (basisLoss.gt(currentLoss) || atRiskLoss.gt(basisLoss.plus(source.priorAtRiskLoss))) {
      throw new Error('K1 QBI canonical current loss limits exceed their original source');
    }
    const common = { taxYear: input.taxpayer.taxYear, activitySourceId: source.sourceId, priorLoss: d('0') };
    const basis = calculateQbiLossCharacter({ ...common,
      limitation: original.entityType === 'partnership' ? '704(d)' : '1366(d)',
      currentLoss, currentQualifiedLoss: qualifiedLoss, calculatedAllowedLoss: basisLoss, history: source.basisHistory });
    // Preserve the actual fraction between statutory limitations; do not use a
    // rounded QBI display as the next step's original source numerator.
    const atRisk = calculateQbiLossCharacter({ ...common, limitation: '465',
      currentLoss: basisLoss, currentQualifiedLoss: basisLoss.times(qualifiedFraction),
      priorLoss: source.priorAtRiskLoss, calculatedAllowedLoss: atRiskLoss,
      calculatedPriorLossAllowance: source.charitableAtRisk
        ? sum(...source.charitableAtRisk.prior.filter(row=>row.character==='ordinary').map(row=>row.allowed)) : undefined,
      history: source.atRiskHistory });
    const stages = [basis, atRisk];
    let passiveSourceIndex: number | undefined;
    let currentQualifiedAllowed = atRisk.currentQualifiedLossAllowed;
    let priorQualifiedAllowed = atRisk.priorQualifiedLossAllowed;
    let priorActiveAllowed = atRisk.priorActiveQualifiedLossAllowed;
    if (original.isPassiveActivity) {
      let final: QbiLossCharacterResult;
      passiveSourceIndex = input.scheduleK1.slice(0, source.k1Index).filter(row => row.isPassiveActivity).length;
      const row = context.form8582.activityRows.find(row => row.sourceIndex === passiveSourceIndex);
      const allocation = context.form8582.activityAllocations.find(row => row.sourceIndex === passiveSourceIndex);
      const capitalRow = capital?.rows.find(item => item.k1Index === source.k1Index);
      const ordinaryAllowed = capitalRow?.ordinaryAllowedLoss ?? allocation?.allowedLoss ?? d(0);
      if (!row || row.name !== original.partnershipName
        || !row.sourceCurrentLoss.eq(capitalRow?.currentLoss ?? Decimal.min(0, entry.netAmount))
        || !row.sourceCurrentIncome.eq(capitalRow?.currentIncome ?? Decimal.max(0, entry.netAmount).plus(source.passiveCapitalGain))
        || !row.sourcePriorYearSuspendedLoss.eq(capitalRow?.priorLoss ?? source.priorPassiveLoss)
        || ((entry.netAmount.lt(0) || source.priorPassiveLoss.gt(0)) && !allocation)) {
        throw new Error('K1 QBI requires its original-index canonical passive allocation and source balances');
      }
      if (source.priorAtRiskLoss.gt(0)) {
        // Gross deductions already offset by this activity's own ordinary
        // income remain allowed even if the net Form8582 current loss is zero.
        const allowedGross = atRiskLoss.minus(Decimal.max(0, entry.netAmount.negated()))
          .plus(ordinaryAllowed);
        const transferred = calculateQbiPriorRiskTransfer(atRisk, { taxYear: input.taxpayer.taxYear,
          activitySourceId: source.sourceId, priorPassiveLoss: source.priorPassiveLoss,
          calculatedAllowedLoss: allowedGross, history: source.passiveHistory });
        final = transferred.stage;
        currentQualifiedAllowed = transferred.currentQualifiedLossAllowed;
        priorQualifiedAllowed = transferred.priorQualifiedLossAllowed;
        priorActiveAllowed = transferred.priorActiveQualifiedLossAllowed;
        if (context.form461.line16ExcessBusinessLoss.gt(0)) {
          const oldSources = [...atRisk.allowedPriorVintages, ...final.allowedPriorVintages].filter(item => item.lossAllowed.gt(0));
          const originalCurrentAllowed = roundDollar(transferred.currentLossAllowed);
          const originalPriorAllowed = final.currentAllowedLoss.plus(final.priorLossAllowed).minus(originalCurrentAllowed);
          if (originalCurrentAllowed.gt(0) && originalPriorAllowed.gt(0) || oldSources.length > 1) {
            throw new Error('Multiple loss pools or mixed current/prior origin EBL require their separate allocation method.');
          }
          terminalCharacters.set(source.sourceId, { ...final,
            sourceCurrentLoss: atRisk.sourceCurrentLoss, sourceCurrentQualifiedLoss: atRisk.sourceCurrentQualifiedLoss,
            currentAllowedLoss: originalCurrentAllowed, currentQualifiedLossAllowed: currentQualifiedAllowed,
            priorLossAllowed: originalPriorAllowed, priorQualifiedLossAllowed: priorQualifiedAllowed,
            priorActiveQualifiedLossAllowed: priorActiveAllowed,
            allowedPriorVintages: originalPriorAllowed.isZero() ? [] : [{ ...oldSources[0],
              lossAllowed: originalPriorAllowed, qualifiedLossAllowed: priorQualifiedAllowed }] });
        }
      } else {
        final = calculateQbiLossCharacter({ ...common, limitation: '469',
          currentLoss: atRiskLoss, currentQualifiedLoss: atRiskLoss.times(qualifiedFraction),
          priorLoss: source.priorPassiveLoss, calculatedAllowedLoss: ordinaryAllowed,
          history: source.passiveHistory });
        currentQualifiedAllowed = final.currentQualifiedLossAllowed;
        priorQualifiedAllowed = final.priorQualifiedLossAllowed;
        priorActiveAllowed = final.priorActiveQualifiedLossAllowed;
      }
      stages.push(final);
    }
    priorQualifiedLoss = priorQualifiedLoss.plus(priorQualifiedAllowed);
    if (priorActiveAllowed === undefined) priorActiveQualifiedLoss = undefined;
    else if (priorActiveQualifiedLoss !== undefined) priorActiveQualifiedLoss = priorActiveQualifiedLoss.plus(priorActiveAllowed);
    lines.push(...stages.flatMap(stage => stage.lines));
    return { sourceId: source.sourceId, k1Index: source.k1Index, accountHolder: source.accountHolder,
      passiveSourceIndex, currentQbi: source.ordinaryIncome.lt(0) ? currentQualifiedAllowed.negated() : source.qualifiedBusinessIncome,
      priorQualifiedLoss: priorQualifiedAllowed, priorActiveQualifiedLoss: priorActiveAllowed, stages };
  });
  if (sources.length > 0 && context.form461.line16ExcessBusinessLoss.gt(0)) {
    const form = context.form461;
    // This ordinary method identifies every loss before applying the aggregate
    // limit. A net unexplained difference is never assigned to the K-1.
    if (!form.sourceFactsVerified || (!input.form461 && !input.qbiLossSources?.form461Classification)
      || !d(input.form461?.noncapitalNonbusinessIncome).isZero() || !d(input.form461?.noncapitalNonbusinessLoss).isZero()
      || (input.rentalProperties?.length ?? 0) > 0 || (input.scheduleK1Form1041?.length ?? 0) > 0) {
      throw new Error('K1 QBI Form461 other supplemental or nonbusiness sources require their separate loss-pool allocation method');
    }
    const k1Positive = sum(...activities.map(activity => roundDollar(Decimal.max(0, context.scheduleE.partnerships[activity.k1Index].netAmount))));
    const lossPools = activities.map(activity => {
      const final = activity.stages.at(-1);
      if (!final) throw new Error('K1 QBI requires completed ordered loss limits');
      return { activitySourceId: activity.sourceId, loss: sum(final.currentAllowedLoss, final.priorLossAllowed) };
    }).filter(row => row.loss.gt(0));
    if (!k1Positive.minus(sum(...lossPools.map(row => row.loss))).eq(form.line5ScheduleE)) {
      throw new Error('K1 QBI calculated original source pools must reconcile to printed Form461 ScheduleE');
    }
    const businessCapital = Decimal.max(0, form.line3CapitalGainOrLoss).minus(form.line10NonbusinessIncome);
    if (businessCapital.lt(0) || !form.line11NonbusinessLosses.eq(Decimal.max(0, form.line3CapitalGainOrLoss.negated()))) {
      throw new Error('K1 QBI Form461 capital exclusion source does not reconcile with its ordinary loss-pool method');
    }
    const otherBusiness = [
      { activitySourceId: 'scheduleC', amount: form.line2ScheduleC },
      { activitySourceId: 'form4797', amount: form.line4Form4797 },
      { activitySourceId: 'scheduleF', amount: form.line6ScheduleF },
      { activitySourceId: 'form461:otherBusiness', amount: form.line8OtherBusiness },
      { activitySourceId: 'businessCapital', amount: businessCapital },
    ];
    lossPools.push(...otherBusiness.filter(row => row.amount.lt(0)).map(row => ({ activitySourceId: row.activitySourceId, loss: row.amount.negated() })));
    const positiveBusinessIncome = k1Positive.plus(sum(...otherBusiness.map(row => Decimal.max(0, row.amount))));
    if (lossPools.length !== 1 || !activities.some(activity => activity.sourceId === lossPools[0].activitySourceId)) {
      throw new Error('Multiple calculated business loss pools require their separate Form461 allocation method');
    }
    const activity = activities.find(activity => activity.sourceId === lossPools[0].activitySourceId);
    const final = activity ? terminalCharacters.get(activity.sourceId) ?? activity.stages.at(-1) : undefined;
    if (!activity || !final) throw new Error('K1 QBI requires the actual completed source loss pool');
    const relimited = calculateQbiLossRelimitation(final, { taxYear: input.taxpayer.taxYear, form461: form, positiveBusinessIncome, lossPools });
    if (d(input.scheduleK1[activity.k1Index].ordinaryIncome).lt(0)) activity.currentQbi = relimited.currentQualifiedLossAllowed.negated();
    activity.priorQualifiedLoss = relimited.priorQualifiedLossAllowed;
    activity.priorActiveQualifiedLoss = relimited.priorActiveQualifiedLossAllowed;
    activity.excessBusinessLossVintage = relimited.excessBusinessLossVintage;
    activity.excessBusinessLossCurrentOrigin = final.currentAllowedLoss.gt(0);
    lines.push(...relimited.lines);
    priorQualifiedLoss = sum(...activities.map(row => row.priorQualifiedLoss));
    priorActiveQualifiedLoss = activities.some(row => row.priorActiveQualifiedLoss === undefined) ? undefined
      : sum(...activities.map(row => row.priorActiveQualifiedLoss ?? d('0')));
  }
  return { activities, priorQualifiedLoss, priorActiveQualifiedLoss, lines };
}
