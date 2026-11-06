import { twoOwnerMarketplaceHealthInput } from './marketplace-health-owners.js';

/** Original-only synthetic ledger. The underlying retained fixture supplies the
 * actual policies, twelve payment/person records, owners, known-zero funding,
 * complete eligibility and prior-return payment sources. No tax result entered.
 * The fictional households have no additional income or coupled adjustments. */
export function bindingOwnerFullRepaymentInput(bindingOwner: 'primary' | 'spouse' = 'primary') {
  const input = twoOwnerMarketplaceHealthInput(2025, 'full');
  if (!input.scheduleC || !input.scheduleF) throw new Error('Actual original business records required');
  input.scheduleC.grossReceipts = bindingOwner === 'primary' ? '1000' : '160000';
  input.scheduleF.salesOfProductsRaised = bindingOwner === 'primary' ? '160000' : '1000';
  return input;
}
