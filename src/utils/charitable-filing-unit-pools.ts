import Decimal from 'decimal.js';
import type { CharitableCarryoverBalance } from '@/engine/forms/charitable-carryover-source-validation.js';
import type { CharitableFilingUnitResult } from '@/engine/forms/charitable-filing-unit-history.js';
import type { validateCharitableFilingUnitTimeline } from './charitable-filing-unit-timeline.js';

/** A saved per-source use is not an owner-attribution method for a shared pool. */
export function assertDeterminedCharitableJointPools(records: CharitableCarryoverBalance[], timeline: ReturnType<typeof validateCharitableFilingUnitTimeline>): void {
  const groups = new Map<string, CharitableFilingUnitResult[]>();
  for (const row of records) {
    const key = `${row.taxYear}:${row.category}:${row.medium}`;
    groups.set(key, [...(groups.get(key) ?? []), ...(row.filingUnitSources ?? [])]);
  }
  for (const originals of groups.values()) {
    if (originals.length < 2) continue;
    const allSteps = originals.flatMap(row => row.steps);
    const operands = allSteps.flatMap(row => [row.opening.numerator, row.opening.denominator, row.closing.numerator, row.closing.denominator, row.treatedAsPaid, row.nolReduction]);
    const digits = Math.max(1, ...operands.map(value => value.replace('.', '').length));
    const D = Decimal.clone({ precision: Math.max(80, digits * (allSteps.length * 2 + 4) + 32) });
    for (const unit of timeline.returns.values()) {
      if (unit.members.length !== 2 || unit.taxYear === timeline.current.taxYear) continue;
      const steps = allSteps.filter(row => row.action === 'filed_use' && row.returnSourceId === unit.sourceId);
      if (steps.filter(row => new D(row.opening.numerator).gt(0)).length < 2
        || new Set(steps.filter(row => new D(row.opening.numerator).gt(0)).flatMap(row => row.personIds)).size < 2) continue;
      const used = steps.reduce((sum, row) => sum.plus(row.treatedAsPaid).plus(row.nolReduction), new D(0));
      let remaining = steps.some(row => new D(row.closing.numerator).gt(0));
      if (used.isZero() || !remaining) continue;
      for (let year = unit.taxYear + 1; year <= timeline.current.taxYear && remaining; year++) {
        const later = unit.members.map(person => timeline.byPersonYear.get(`${person}:${year}`));
        if (later.some(row => row === undefined) || later[0]!.sourceId !== later[1]!.sourceId) {
          throw new Error('Charitable partial joint use across original sources requires its separate owner-attribution method');
        }
        if (year < timeline.current.taxYear) {
          const use = allSteps.filter(row => row.action === 'filed_use' && row.returnSourceId === later[0]!.sourceId);
          remaining = use.some(row => new D(row.closing.numerator).gt(0));
        }
      }
    }
  }
}
