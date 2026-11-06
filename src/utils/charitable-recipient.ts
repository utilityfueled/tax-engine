/** Actual source category; spec/federal/charitable-recipient-classification.yaml. */
export type CharitableRecipientCategory = 'fifty-percent' | 'private-nonoperating' | 'other-thirty-percent';
export interface CharitableRecipientResolution {
  percentageCategory: 'fifty-percent' | 'other-thirty-percent';
  privateNonoperating: boolean;
  provenance: 'actual-category' | 'legacy-public';
}

/** Preserve legacy evidence; never infer a foundation's tax category from its name or old true answer. */
export function resolveCharitableRecipient(source: {
  recipientCategory?: string | null;
  isPrivateFoundation?: boolean | null;
}): CharitableRecipientResolution {
  if (source.recipientCategory === 'fifty-percent') return { percentageCategory: 'fifty-percent', privateNonoperating: false, provenance: 'actual-category' };
  if (source.recipientCategory === 'private-nonoperating') return { percentageCategory: 'other-thirty-percent', privateNonoperating: true, provenance: 'actual-category' };
  if (source.recipientCategory === 'other-thirty-percent') return { percentageCategory: 'other-thirty-percent', privateNonoperating: false, provenance: 'actual-category' };
  // Null is an explicitly cleared answer; only absence can retain the old public answer.
  if (source.recipientCategory === undefined && source.isPrivateFoundation === false) return { percentageCategory: 'fifty-percent', privateNonoperating: false, provenance: 'legacy-public' };
  throw new Error('Charitable recipient category classification is unknown or ambiguous; confirm the actual recipient tax category');
}
