import Decimal from 'decimal.js';
import type { ScheduleCStandardMileage } from '@/models/inputs.js';

/** Use the same original-mileage reconciliation in the engine and guided loss check. */
export function reconcileScheduleCStandardMileage(facts: ScheduleCStandardMileage) {
  let beforeJuly = new Decimal(0);
  let fromJuly = new Decimal(0);
  for (const entry of facts.entries) {
    if (entry.date < facts.placedInService) {
      throw new Error("Schedule C standard mileage cannot precede the vehicle's first business-use date");
    }
    if (entry.date < '2026-07-01') beforeJuly = beforeJuly.plus(entry.miles);
    else fromJuly = fromJuly.plus(entry.miles);
  }
  const businessMiles = beforeJuly.plus(fromJuly);
  if (!businessMiles.plus(facts.commutingMiles).plus(facts.otherPersonalMiles).eq(facts.totalMiles)) {
    throw new Error('Schedule C standard mileage must reconcile to the complete vehicle mileage total');
  }
  const parkingAndTolls = new Decimal(facts.parkingAndTolls);
  const deduction = beforeJuly.times('0.725').plus(fromJuly.times('0.76')).plus(parkingAndTolls);
  return { deduction, beforeJuly, fromJuly, parkingAndTolls };
}
