import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { TaxYearInput } from "@/models/inputs.js";

/** Bind review-only charity amounts to original facts; tax identifiers are not part of this projection. */
export function charitableSourceDigest(input: TaxYearInput): string {
  const facts = {
    taxYear: input.taxpayer.taxYear,
    donations: input.donations,
    priorAmount: input.priorYear?.charitableCarryforward,
    priorYears: input.priorYear?.charitableCarryforwardByYear,
    priorSources: input.charitableCarryoverSources === undefined ? undefined : (() => {
      const { primaryTaxpayerIdLast4: _primaryId, spouseTaxpayerIdLast4: _spouseId, ...sources } = input.charitableCarryoverSources;
      return sources;
    })(),
    partnership: input.scheduleK1?.map(row => ({ cash: row.charitableCash, capital30: row.charitableCapitalGain30, capital20: row.charitableCapitalGain20 })),
    ...(input.k1CharitableSources ? { originalK1: input.scheduleK1, k1CharitableSources: {
      ...input.k1CharitableSources,
      statements: input.k1CharitableSources.statements?.map(statement => ({ ...statement,
        basis: statement.basis === undefined ? undefined : (() => {
          const { recipientTaxpayerIdLast4: _identifier, ...facts } = statement.basis;
          return facts;
        })(),
      })),
    } } : {}),
    crypto: input.cryptoIncome?.donations?.map(({ charityEIN: _identifier, ...facts }) => facts),
  };
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(facts))));
}
