/** One original prior charity vintage. Spec: charitable-prior-net-operating-loss.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';
import { createPriorCharitableNolLimit, readPriorCharitableNolSources, type PriorCharitableNolLimit } from '@/utils/charitable-prior-nol-source.js';
import { calculateCharitableCarryover } from './charitable-carryover.js';

export interface PriorCharitableNolCarryoverResult {
  returnTaxYear: number; contributionYear?: number; sourceId?: string;
  category?: PriorCharitableNolLimit['category']; medium?: PriorCharitableNolLimit['medium'];
  ledger: PriorCharitableNolLimit['ledger']; sourceDigest: string;
  opening: Decimal; normalTreatedAsPaid: Decimal; normalDeduction: Decimal; tentativeExcess: Decimal;
  nolCarryforward: Decimal; counterfactualNolCarryforward: Decimal; reduction: Decimal; expired: Decimal; carryforward: Decimal;
  lines: CalculatedLine[];
}
export function calculatePriorCharitableNolCarryover(params: {
  input: TaxYearInput; ledger: PriorCharitableNolLimit['ledger']; normalContributionBase: Decimal;
  normalDeductionUsed: 'standard' | 'itemized' | 'nonitemized'; nolCarryforward: Decimal;
  computeCarryover: (limit: PriorCharitableNolLimit) => Decimal;
}): PriorCharitableNolCarryoverResult {
  const { input, ledger } = params, sources = readPriorCharitableNolSources(input), row = sources[ledger][0];
  if (!Decimal.isDecimal(params.normalContributionBase) || !params.normalContributionBase.isFinite()
    || !Decimal.isDecimal(params.nolCarryforward) || !params.nolCarryforward.isFinite() || params.nolCarryforward.lt(0) || !params.nolCarryforward.isInteger()
    || !['standard', 'itemized'].includes(params.normalDeductionUsed)) throw new Error('Prior charitable NOL requires actual normal income selection and completed succeeding NOL');
  const alternativeSources = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources;
  if (ledger === 'alternative' && !alternativeSources) throw new Error('Prior alternative charitable history is required');
  const selected = ledger === 'regular' ? input : { ...input, priorYear: undefined, charitableCarryoverSources: alternativeSources };
  const normal = calculateCharitableCarryover(selected, { contributionBase: params.normalContributionBase, itemizes: params.normalDeductionUsed === 'itemized',
    current: { cashPublic: d('0'), noncashPublic: d('0'), capitalGainPublic: d('0'), cashPrivate: d('0'), noncashPrivate: d('0'), capitalGainPrivate: d('0') } });
  const opening = row?.amount ?? d('0'), normalTreatedAsPaid = normal.priorTreatedAsPaid, tentativeExcess = opening.minus(normalTreatedAsPaid);
  const expiredBefore = row !== undefined && row.taxYear + 5 < input.taxpayer.taxYear;
  const counterfactualNolCarryforward = row && !expiredBefore && tentativeExcess.gt(0) && params.nolCarryforward.gt(0)
    ? params.computeCarryover(createPriorCharitableNolLimit(input, ledger, normalTreatedAsPaid)) : params.nolCarryforward;
  if (!Decimal.isDecimal(counterfactualNolCarryforward) || !counterfactualNolCarryforward.isFinite() || !counterfactualNolCarryforward.isInteger()
    || counterfactualNolCarryforward.lt(0) || counterfactualNolCarryforward.gt(params.nolCarryforward)) throw new Error('Prior charitable comparison must reconcile actual succeeding NOL carry');
  const reduction = Decimal.min(tentativeExcess, params.nolCarryforward.minus(counterfactualNolCarryforward));
  const afterReduction = tentativeExcess.minus(reduction), expires = row !== undefined && row.taxYear + 5 <= input.taxpayer.taxYear;
  const expired = expires ? afterReduction : d('0'), carryforward = expires ? d('0') : afterReduction;
  if (!opening.eq(normalTreatedAsPaid.plus(reduction).plus(expired).plus(carryforward))) throw new Error('Prior charitable original source must conserve use reduction expiry and carry');
  const audit = new AuditTrail();
  audit.record('Prior Charitable NOL Carry', `${ledger}:normal`, 'Original prior contribution normal-year use', normalTreatedAsPaid,
    'Actual independent opening and ordinary percentage category at regular AGI; original contribution year remains unchanged', { opening, normalDeduction: normal.priorDeduction, tentativeExcess });
  audit.record('Prior Charitable NOL Carry', `${ledger}:reduction`, 'Prior charitable excess preserving succeeding NOL', reduction,
    'Smaller of unused original excess and actual succeeding NOL minus modified comparison retaining only normal-year use',
    { actualNol: params.nolCarryforward, comparisonNol: counterfactualNolCarryforward });
  audit.record('Prior Charitable NOL Carry', `${ledger}:remaining`, 'Remaining original prior charitable carry', carryforward,
    'Original opening less normal treated-paid use, NOL reduction and original five-year expiration; no new contribution year',
    { opening, treatedAsPaid: normalTreatedAsPaid, reduction, expired });
  return { returnTaxYear: input.taxpayer.taxYear, contributionYear: row?.taxYear, sourceId: row?.sourceId, category: row?.category, medium: row?.medium,
    ledger, sourceDigest: sources.sourceDigest, opening, normalTreatedAsPaid, normalDeduction: normal.priorDeduction, tentativeExcess,
    nolCarryforward: params.nolCarryforward, counterfactualNolCarryforward, reduction, expired, carryforward, lines: audit.getLines() };
}
