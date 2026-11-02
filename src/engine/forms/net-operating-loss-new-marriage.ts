/** Personal loss owner capacity on a later new joint return.
 * Spec: net-operating-loss-new-marriage.yaml. Joint percentage ceilings and
 * separately recomputed full owner income are distinct statutory constraints. */
import Decimal from 'decimal.js';
import type { NetOperatingLossContext, NetOperatingLossResult } from './net-operating-loss.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, roundDollar, sum, zeroFloor } from '@/utils/decimal.js';

export function calculateNewMarriageNol(input: { source: NetOperatingLossResult; context: NetOperatingLossContext; taxYear: number }): NetOperatingLossResult {
  const { source, context, taxYear } = input;
  const value = (amount: Decimal | undefined, label: string) => {
    if (!Decimal.isDecimal(amount) || !amount.isFinite()) throw new Error(`New-marriage NOL requires canonical finite ${label}`);
    return roundDollar(amount);
  };
  if (!Array.isArray(context.ownerIncomeContexts)) throw new Error('New-marriage NOL current calculation requires canonical personal-owner income contexts');
  const owners = new Map(context.ownerIncomeContexts.map(owner => [owner.ownerPersonId, owner]));
  if (owners.size !== context.ownerIncomeContexts.length || source.vintages.some(row => !row.ownerPersonId || !owners.has(row.ownerPersonId))) {
    throw new Error('New-marriage NOL canonical owner contexts must bind each actual original loss owner');
  }
  const income = value(context.taxableIncomeWithoutNolQbiAndSection250, 'joint current income');
  const modifiedBase = context.modifiedTaxableIncomeWithoutNolQbiAndSection250 === undefined ? undefined
    : value(context.modifiedTaxableIncomeWithoutNolQbiAndSection250, 'joint modified income');
  const available = (row: NetOperatingLossResult['vintages'][number]) => row.openingCarryforward.minus(row.expiredBeforeYear);
  const postLimit = roundDollar(zeroFloor(income.minus(source.pre2018Carryforward)).times('0.8'));
  const modifiedLimit = modifiedBase === undefined ? undefined : roundDollar(zeroFloor(modifiedBase.minus(source.pre2018Carryforward)).times('0.8'));
  const reserve = modifiedBase === undefined ? undefined : roundDollar(zeroFloor(modifiedBase.minus(source.pre2018Carryforward)).times('0.2'));
  const currentOwners = new Map([...owners].map(([id, owner]) => [id, zeroFloor(value(owner.taxableIncomeWithoutNolQbiAndSection250, 'owner MFS current income'))]));
  const modifiedOwners = modifiedBase === undefined ? undefined : new Map([...owners].map(([id, owner]) => [id,
    zeroFloor(value(owner.modifiedTaxableIncomeWithoutNolQbiAndSection250, 'owner MFS modified income'))]));
  let postRemaining = postLimit, modifiedPostRemaining = modifiedLimit;
  let earlierClaim = d('0'), earlierModifiedClaim = d('0');
  const earlierOwnerModified = new Map([...owners].map(([id]) => [id, d('0')]));
  const audit = new AuditTrail(); audit.merge(source.lines);
  audit.record('Section172 New Marriage', 'joint-current-base', 'Actual joint172 limit basis', income,
    'One actual joint172(a)(2)80percent ceiling; the full personal owner MFS income maximum is applied separately',
    { 'Pre2018 carried amount': source.pre2018Carryforward, 'Post2017 joint limit': postLimit });
  const contexts = new Map((context.carryoverContexts ?? []).map(row => [row.sourceId, row]));
  if (context.carryoverContexts && (contexts.size !== context.carryoverContexts.length || contexts.size !== source.vintages.filter(row => available(row).gt(0)).length)) {
    throw new Error('New-marriage NOL requires one independent modified context per available original');
  }
  const vintages = source.vintages.map(original => {
    const row = { ...original }, owner = row.ownerPersonId!, capacity = currentOwners.get(owner)!;
    row.earlierClaimedNolDeductions = earlierClaim;
    row.deduction = Decimal.min(available(row), capacity, row.lossTaxYear < 2018 ? available(row) : postRemaining);
    currentOwners.set(owner, capacity.minus(row.deduction));
    if (row.lossTaxYear >= 2018) postRemaining = postRemaining.minus(row.deduction);
    earlierClaim = earlierClaim.plus(row.deduction);
    if (modifiedOwners) {
      row.earlierModifiedNolDeductions = earlierModifiedClaim;
      row.earlierOwnerModifiedNolDeductions = earlierOwnerModified.get(owner)!;
      const modifiedClaim = Decimal.min(available(row), modifiedOwners.get(owner)!, row.lossTaxYear < 2018 ? available(row) : modifiedPostRemaining!);
      modifiedOwners.set(owner, modifiedOwners.get(owner)!.minus(modifiedClaim));
      if (row.lossTaxYear >= 2018) modifiedPostRemaining = modifiedPostRemaining!.minus(modifiedClaim);
      earlierModifiedClaim = earlierModifiedClaim.plus(modifiedClaim);
      earlierOwnerModified.set(owner, earlierOwnerModified.get(owner)!.plus(modifiedClaim));
    }
    audit.record('Section172 New Marriage', `${row.sourceId}:deduction`, 'Personal original NOL deduction', row.deduction,
      'min(actual available vintage, remaining full owner MFS income, remaining applicable actual joint statutory ceiling)',
      { 'Owner current income before earlier originals': owners.get(owner)!.taxableIncomeWithoutNolQbiAndSection250,
        'Earlier actual joint deductions': row.earlierClaimedNolDeductions });
    if (context.carryoverContexts) {
      if (reserve === undefined) throw new Error('New-marriage NOL absorption requires independently recomputed joint and owner modified bases');
      const item = contexts.get(row.sourceId);
      let absorbed = d('0');
      if (available(row).gt(0)) {
        if (!item || !value(item.priorNolDeductions, 'earlier joint modified deductions').eq(row.earlierModifiedNolDeductions!)) {
          throw new Error('New-marriage NOL modified joint context must retain the actual permitted earlier originals');
        }
        const ownerItem = owners.get(owner)!.carryoverContexts?.find(part => part.sourceId === row.sourceId);
        if (!ownerItem || !value(ownerItem.priorNolDeductions, 'earlier owner modified deductions').eq(row.earlierOwnerModifiedNolDeductions!)) {
          throw new Error('New-marriage NOL requires separately recomputed owner modified context for each original');
        }
        const jointCapacity = zeroFloor(value(item.modifiedTaxableIncomeBeforeTwentyPercentReduction, 'joint vintage modified income').minus(reserve));
        const ownerCapacity = zeroFloor(value(ownerItem.modifiedTaxableIncomeBeforeTwentyPercentReduction, 'owner vintage modified income'));
        absorbed = Decimal.min(available(row), jointCapacity, ownerCapacity);
        audit.record('Section172 New Marriage', `${row.sourceId}:absorbed`, 'Personal original modified absorption', absorbed,
          'min(actual available vintage, full owner separately modified income, actual joint modified income after172(b)(2)(C) reserve)',
          { 'Owner modified income': ownerCapacity, 'Joint modified capacity': jointCapacity, 'Joint statutory reserve': reserve });
      }
      const unused = available(row).minus(absorbed), expires = row.lossTaxYear < 2018 && taxYear === row.lossTaxYear + 20;
      row.absorbed = absorbed; row.expired = row.expiredBeforeYear.plus(expires ? unused : d('0'));
      row.remainingCarryforward = expires ? d('0') : unused;
      if (!sum(row.absorbed, row.expired, row.remainingCarryforward).eq(row.openingCarryforward)) throw new Error('New-marriage original amounts must conserve the actual opening carry');
    }
    return row;
  });
  const deduction = sum(...vintages.map(row => row.deduction!));
  return { ...source, vintages, deduction,
    pre2018Deduction: sum(...vintages.filter(row => row.lossTaxYear < 2018).map(row => row.deduction!)),
    post2017Deduction: sum(...vintages.filter(row => row.lossTaxYear >= 2018).map(row => row.deduction!)),
    ...(context.carryoverContexts ? { calculationComplete: true, absorbed: sum(...vintages.map(row => row.absorbed!)),
      expired: sum(...vintages.map(row => row.expired!)), carryforward: sum(...vintages.map(row => row.remainingCarryforward!)) } : {}), lines: audit.getLines() };
}
