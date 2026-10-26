import { k1PassiveDistributionFixture } from './k1-passive-distribution';
import { actualGuidedK1CashDistribution } from './guided-k1-cash-distribution';
import { actualGuidedK1Sources } from './guided-k1-qbi-sources';
import type { QbiSourceEntry } from '@/lib/guided-qbi-loss-data';

/** Source-year control spelling for fictional records, not application defaults. */
function controls<T>(value: T): QbiSourceEntry<T> {
  if (typeof value === 'number') return String(value) as QbiSourceEntry<T>;
  if (Array.isArray(value)) return value.map(controls) as QbiSourceEntry<T>;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, controls(item)])) as QbiSourceEntry<T>;
  return value as QbiSourceEntry<T>;
}
/** One fictional original shared by the distribution, charity and469/QBI histories. */
export function actualGuidedK1PassiveDistribution(prior = '1500', scorp = false) {
  const input = k1PassiveDistributionFixture(prior, scorp), charity = actualGuidedK1CashDistribution(scorp), qualifiedLoss = actualGuidedK1Sources();
  const source = input.k1CharitableSources?.statements?.[0], history = input.qbiLossSources?.activities?.[0];
  const row = charity.statements?.[0], q = qualifiedLoss.activities?.[0];
  if (!source || !history || !row || !q) throw new Error('Missing fictional passive source');
  Object.assign(row, controls(source), { link: 'qbi', qbiSourceId: 'scheduleK1:0', original: { ...row.original, ...controls(input.scheduleK1[0]) } });
  if (!row.basis) throw new Error('Missing fictional charity identity');
  Object.assign(row.basis, { recipientName: 'Jordan Example', recipientTaxpayerIdLast4: '3333' });
  Object.assign(q, controls(history), { allOtherAmountsZeroConfirmed: false, allOtherNonCharitableAmountsZeroConfirmed: true,
    domesticNonPtpConfirmed: true, noScorpDebtBasisOrElectionConfirmed: true, recipientName: 'Jordan Example', recipientTaxpayerIdLast4: '3333',
    passiveHistory: controls(input.priorYear?.suspendedPassiveLosses?.[0].qbiLossTracking) });
  if (scorp) q.selfEmploymentTreatment = undefined;
  // This fictional source has passive business capital, not the distinct ordinary-only461 assertion.
  qualifiedLoss.form461Classification = undefined;
  return { charity, qualifiedLoss };
}
