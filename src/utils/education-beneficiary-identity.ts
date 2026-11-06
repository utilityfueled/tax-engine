import type { Form1099Q, QualifiedEducationExpenseSummary } from '@/models/inputs.js';

/** Multiple opaque ledger IDs cannot establish different actual students. */
export function assertDistinctEducationBeneficiaries(forms: readonly Form1099Q[], facts: NonNullable<QualifiedEducationExpenseSummary['sourceFacts']>): void {
  const used = new Set([...forms.map(form => form.beneficiaryId), ...(facts.expenses ?? []).map(expense => expense.beneficiaryId)]);
  if (used.size <= 1) return;
  const identities = new Set<string>();
  for (const id of used) {
    const matches = facts.beneficiaries?.filter(beneficiary => beneficiary.id === id) ?? [];
    const value = matches[0]?.studentTaxId;
    if (matches.length !== 1 || !value || !/^\d{3}-?\d{2}-?\d{4}$/.test(value)) throw new Error('Partial in-kind education treatment requires actual distinct beneficiary identities');
    const identity = value.replaceAll('-', '');
    if (identities.has(identity)) throw new Error('Partial in-kind education beneficiary identities cannot use aliases of the same student');
    identities.add(identity);
  }
}
