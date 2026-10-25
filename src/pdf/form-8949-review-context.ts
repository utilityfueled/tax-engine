/** Keep validated capital calculations local while render copies omit identifiers. */
import { createHash } from 'node:crypto';
import type { TaxYearInput } from '@/models/inputs.js';
import { calculateForm8949, type Form8949Result } from '@/engine/forms/form-8949.js';
import { assertOrdinaryDigitalAssetReview } from '@/engine/forms/digital-asset-capital-input.js';
import { redactReviewIdentifiers } from './redact-review-identifiers.js';

const brand = Symbol('prepared Form8949 review');
export interface PreparedForm8949Review { readonly [brand]: true }
const prepared = new WeakMap<PreparedForm8949Review, { originalDigest: string; redactedDigest: string;
  calculation: Form8949Result; originalSources: ReturnType<typeof capitalSources> }>();

function capitalSources(input: TaxYearInput) {
  return { taxpayer: input.taxpayer, form1099B: input.form1099B,
    form1099Div: input.form1099Div, section1202Sources: input.section1202Sources,
    form1099DA: input.form1099DA, cryptoIncome: input.cryptoIncome,
    scheduleDSpecialGainSources: input.scheduleDSpecialGainSources, amtCapitalGains: input.amtCapitalGains,
    priorYear: input.priorYear, form172CapitalSources: input.form172?.capitalSources };
}
function sourceDigest(input: TaxYearInput, redacted = false): string {
  const source = capitalSources(input);
  return createHash('sha256').update(JSON.stringify(redacted ? redactReviewIdentifiers(source) : source)).digest('hex');
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Call with complete original facts before redaction. Tokens are never persisted
 * or accepted from an HTTP client; only this module can create valid contexts. */
export function prepareForm8949Review(input: TaxYearInput): PreparedForm8949Review {
  assertOrdinaryDigitalAssetReview(input);
  const calculation = freeze(calculateForm8949(input));
  const token: PreparedForm8949Review = Object.freeze({ [brand]: true as const });
  prepared.set(token, { originalDigest: sourceDigest(input), redactedDigest: sourceDigest(input, true), calculation,
    originalSources: freeze(structuredClone(capitalSources(input))) });
  return token;
}

export function form8949ReviewCalculation(input: TaxYearInput, token?: PreparedForm8949Review): Form8949Result {
  if (token === undefined) {
    assertOrdinaryDigitalAssetReview(input);
    return calculateForm8949(input);
  }
  const context = prepared.get(token);
  if (!context) throw new Error('Form8949 requires an original prepared review context');
  const suppliedDigest = sourceDigest(input);
  if (suppliedDigest !== context.originalDigest && suppliedDigest !== context.redactedDigest) {
    throw new Error('Form8949 review source facts are stale or conflicting');
  }
  return context.calculation;
}

/** Restore only actual original capital sources for a fresh source calculation.
 * The opaque token binds every consumed source before redaction. No identifier
 * is synthesized, no retained calculation is accepted as a source override,
 * and the returned clone cannot mutate the private validated source snapshot.
 * Callers must keep these original identifiers out of their render output.
 */
export function form8949ReviewOriginalSourceInput(input: TaxYearInput, token: PreparedForm8949Review): TaxYearInput {
  form8949ReviewCalculation(input, token);
  const context = prepared.get(token);
  if (!context) throw new Error('Form8949 requires an original prepared review context');
  const { form172CapitalSources, ...original } = structuredClone(context.originalSources);
  return { ...input, ...original, form172: input.form172 ? { ...input.form172, capitalSources: form172CapitalSources } : undefined };
}
