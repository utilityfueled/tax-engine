import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';

/** Private source binding only; never render the original records or this digest. */
export function nolFilingUnitSourceDigest(input: TaxYearInput): string {
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(input))));
}
