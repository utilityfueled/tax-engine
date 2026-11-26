const bareSuffix = /^\d{1,4}$/u;
const endingLabel = /(?:^|\s)(?:(?:ending|ends)\s+in|last\s+(?:four|4)(?:\s+digits)?)[\s:#-]*(?:\.{3,}\s*)?\d+$/iu;
const trailingSymbolMask = /(?:[*•●∙⋅·]+|\.{3,})(?:[\s.:/_\p{Pd}]*\d+(?:[\s.:/_\p{Pd}]+\d+)*)?$/u;

/** Detect masked dividend account references through normalization. Callers match the original reference. */
export function isIncompleteDividendAccountReference(reference: string): boolean {
  const text = reference.normalize('NFKC').trim();
  if (!text || bareSuffix.test(text) || endingLabel.test(text) || trailingSymbolMask.test(text)) return true;

  const tokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  let index = tokens.length - 1;
  while (index >= 0 && /^\d+$/u.test(tokens[index])) index--;
  const lastMask = /^(x+)\d*$/iu.exec(tokens[index] ?? '');
  if (!lastMask) return false;

  // A trailing sequence of X groups can mask an account even when one group is short.
  let count = lastMask[1].length;
  while (count < 4 && index > 0 && /^x+$/iu.test(tokens[index - 1])) {
    index--;
    count += tokens[index].length;
  }
  return count >= 4;
}
