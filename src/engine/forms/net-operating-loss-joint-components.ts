/** Determined461/ordinary components within one actual loss-year pool.
 * Spec: net-operating-loss-joint-ebl.yaml. No current owner allocation input. */
import Decimal from 'decimal.js';
import type { NetOperatingLossVintageResult } from './net-operating-loss.js';
import { d, sum } from '@/utils/decimal.js';

function amount(value: Decimal | undefined, label: string): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite() || value.lt(0) || !value.isInteger()) {
    throw new Error(`Joint EBL components require complete nonnegative whole-dollar ${label}`);
  }
  return value;
}

/** Existing statutory FIFO/expiry has already determined this year's pool totals.
 * Ordinary-only pools retain their existing aggregate method and output shape. */
export function calculateJointNolComponents<T extends NetOperatingLossVintageResult>(row: T): T {
  const components = row.jointPool?.components;
  if (!components?.some(part => part.originKind === 'excess_business_loss')) return row;
  if (row.lossTaxYear < 2021 || components.length < 2 || row.sourceId !== `joint-nol:${row.lossTaxYear}`) {
    throw new Error('Joint EBL components require the actual post2020 same-year source pool');
  }
  const ids = new Set<string>();
  for (const part of components) {
    if (!part.sourceId || ids.has(part.sourceId) || !part.ownerPersonId || !part.originalReturnSourceId
      || !['individual_nol', 'excess_business_loss'].includes(part.originKind ?? '')) {
      throw new Error('Joint EBL component identity, owner and original kind must be retained');
    }
    ids.add(part.sourceId);
    if (amount(part.openingCarryforward, 'component opening').gt(amount(part.originalLoss, 'component original'))
      || !amount(part.expiredBeforeYear, 'component prior expiry').isZero()) {
      throw new Error('Joint EBL component source amounts do not reconcile');
    }
  }
  for (const key of ['originalLoss', 'openingCarryforward', 'expiredBeforeYear'] as const) {
    if (!amount(row[key], key).eq(sum(...components.map(part => part[key])))) {
      throw new Error('Joint EBL pool must conserve every actual original component');
    }
  }
  const available = components.map(part => part.openingCarryforward.minus(part.expiredBeforeYear));
  const totalAvailable = sum(...available), active = available.filter(value => value.gt(0)).length;
  const resolve = (value: Decimal | undefined, label: string): Decimal[] => {
    const total = amount(value, label);
    if (total.gt(totalAvailable)) throw new Error('Joint EBL component use exceeds its actual available sources');
    if (total.isZero()) return available.map(() => d('0'));
    if (total.eq(totalAvailable)) return available;
    if (active === 1) return available.map(value => value.gt(0) ? total : d('0'));
    throw new Error(`NOL same-year EBL component ${label} requires its unresolved partial attribution method`);
  };
  const deductions = resolve(row.deduction, 'deduction'), absorptions = resolve(row.absorbed, 'modified absorption');
  if (!amount(row.expired, 'pool expiry').isZero()) throw new Error('Joint post2020 EBL pool cannot expire');
  const resolved = components.map((part, index) => ({ ...part, deduction: deductions[index]!, absorbed: absorptions[index]!,
    expired: d('0'), remainingCarryforward: available[index]!.minus(absorptions[index]!) }));
  if (!amount(row.remainingCarryforward, 'pool closing').eq(sum(...resolved.map(part => part.remainingCarryforward)))) {
    throw new Error('Joint EBL component closing amounts must conserve the actual pool');
  }
  return { ...row, jointPool: { components: resolved } };
}
