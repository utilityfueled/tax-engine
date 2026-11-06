/** Pure basis admission from actual annual originals; spec/federal/k1-charitable-first-admission.yaml. */
import type Decimal from 'decimal.js';
import type { K1CharitableReturnInput, K1CharitableStatementResult } from './k1-charitable-return-sources.js';
import type { CharitableCarryoverSources } from '@/models/charitable-carryover-sources.js';
import { validateCharitableCarryoverSources } from './charitable-carryover-source-validation.js';
import { d, sum } from '@/utils/decimal.js';

type Vintage = NonNullable<CharitableCarryoverSources['vintages']>[number];
export interface K1EarlierCharitableAdmission {
  sourceId: string; admissionTaxYear: number; lastCarryYear: number;
  originalExcess: Decimal; originNolReduction: Decimal; openingCarryforward: Decimal;
  history: Array<{ taxYear: number; treatedAsPaid: Decimal; nolReduction: Decimal }>;
}
export interface K1CharitableFirstAdmission {
  sourceId: string; originalGiftDate: string; basisOriginTaxYear: number;
  admissionTaxYear: number; lastCarryYear: number; originalBasis: Decimal;
  previouslyAllowedBasis: Decimal; currentAdmission: Decimal; remainingBasisSuspension: Decimal;
  earlierRegularAdmissions: K1EarlierCharitableAdmission[];
  /** Absent means no independent alternative original packet was supplied. */
  earlierAlternativeAdmissions?: K1EarlierCharitableAdmission[];
}
const text = (value: string | undefined, label: string): string => {
  if (!value?.trim()) throw new Error(`K1 first-admission section170 requires actual ${label}`);
  return value.trim();
};
const name = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const identifier = (value: string | undefined, label: string): string => {
  const result = text(value, label).replaceAll('-', '');
  if (!/^\d{9}$/.test(result)) throw new Error(`K1 first-admission section170 ${label} must identify the actual entity`);
  return result;
};
function earlierAdmission(source: Vintage): K1EarlierCharitableAdmission {
  // The full original/history conservation is checked by the common validator
  // before any link or newly admitted amount is considered here.
  const year = source.contributionYear!;
  if (source.history!.some(row => row.taxYear! > year + 5 && (d(row.treatedAsPaid).gt(0) || d(row.nolReduction).gt(0)))) {
    throw new Error('K1 first-admission section170 linked history uses an amount after its original expiry');
  }
  return { sourceId: source.sourceId!, admissionTaxYear: year, lastCarryYear: year + 5,
    originalExcess: d(source.originalExcess), originNolReduction: d(source.originNolReduction), openingCarryforward: d(source.openingCarryforward),
    history: [...source.history!].sort((a, b) => a.taxYear! - b.taxYear!).map(row => ({ taxYear: row.taxYear!,
      treatedAsPaid: d(row.treatedAsPaid), nolReduction: d(row.nolReduction) })) };
}

/** Derive current admission only after validating the complete original source ledger. */
export function calculateK1CharitableFirstAdmission(input: K1CharitableReturnInput,
  statements: readonly K1CharitableStatementResult[]): Map<number, K1CharitableFirstAdmission[]> {
  const originals = input.k1CharitableSources?.statements ?? [];
  if (!originals.some(statement => statement.basis?.priorBasisSuspensions?.some(row => row.section170AdmissionSources !== undefined))) return new Map();
  const regularPacket = input.charitableCarryoverSources;
  if (!regularPacket) throw new Error('K1 first-admission section170 requires its actual complete prior charitable source packet, including none');
  validateCharitableCarryoverSources({ taxpayer: input.taxpayer, charitableCarryoverSources: regularPacket,
    priorYear: input.priorYear, standardDeductionFacts: input.standardDeductionFacts });
  const alternativePacket = input.netOperatingLoss?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources;
  if (alternativePacket) validateCharitableCarryoverSources({ taxpayer: input.taxpayer,
    charitableCarryoverSources: alternativePacket, standardDeductionFacts: input.standardDeductionFacts });
  if ([regularPacket, alternativePacket].some(packet => packet?.vintages?.length && packet.returnMembership === 'changed_filing_unit')) {
    throw new Error('K1 first-admission section170 linked changed-unit carries require their actual original-owner slice binding');
  }
  const regularLinked = new Set<string>(), alternativeLinked = new Set<string>();
  const result = new Map<number, K1CharitableFirstAdmission[]>();
  for (const statement of statements) {
    const original = originals.find(row => row.k1SourceId === `scheduleK1:${statement.k1Index}`), basis = original?.basis;
    if (!original || !basis) throw new Error('K1 first-admission section170 original basis packet is missing');
    const owner = statement.accountHolder === 'spouse' ? input.taxpayer.spouse : input.taxpayer.primary;
    if (!owner) throw new Error('K1 first-admission section170 original owner is missing');
    const expectedName = name(`${owner.firstName} ${owner.lastName}`), expectedLast4 = owner.ssn.replaceAll('-', '').slice(-4);
    const expectedEin = identifier(basis.entityEIN, 'current entity EIN');
    const rows: K1CharitableFirstAdmission[] = [];
    for (const prior of basis.priorBasisSuspensions ?? []) {
      const sources = prior.section170AdmissionSources;
      if (sources === undefined) continue;
      if (sources.sourceFactsConfirmed !== true || !Array.isArray(sources.records)) {
        throw new Error('K1 first-admission section170 requires confirmed actual annual source records');
      }
      text(sources.sourceReference, 'annual original packet reference');
      const calculated = statement.basis.charitableSources?.records.find(row => !row.current && row.sourceId === prior.sourceId);
      const receipt = original.receipts?.find(row => row.basisSourceId === prior.sourceId);
      if (!calculated || !receipt?.contributionDate || !['capital_gain_30', 'capital_gain_20'].includes(calculated.category)) {
        throw new Error('K1 first-admission section170 requires the original pure-basis property and receipt');
      }
      const afterRisk = statement.atRiskAllocation?.charitable.find(row => row.sourceId === prior.sourceId)?.allowed ?? calculated.availableAfterBasis;
      if (!afterRisk.eq(calculated.availableAfterBasis) || statement.priorAtRisk.charitable.length > 0) {
        throw new Error('K1 first-admission section170 cannot re-age a historical at-risk gift or an amount still disallowed at risk');
      }
      const annual = [...sources.records].sort((a, b) => (a.taxYear ?? 0) - (b.taxYear ?? 0));
      const start = calculated.originTaxYear, currentYear = input.taxpayer.taxYear;
      if (annual.length !== currentYear - start) throw new Error('K1 first-admission section170 requires every original annual year exactly once');
      const linkedRegular: K1EarlierCharitableAdmission[] = [], linkedAlternative: K1EarlierCharitableAdmission[] = [];
      annual.forEach((record, index) => {
        const year = start + index;
        if (record.taxYear !== year) throw new Error('K1 first-admission section170 requires each actual consecutive annual year exactly once');
        text(record.basisWorksheetReference, 'annual basis worksheet reference');
        text(record.charitableWorksheetReference, 'annual charitable worksheet reference');
        if (name(text(record.recipientName, 'annual recipient')) !== expectedName || record.recipientTaxpayerIdLast4 !== expectedLast4
          || !/^\d{4}$/.test(record.recipientTaxpayerIdLast4 ?? '') || identifier(record.entityEIN, 'annual entity EIN') !== expectedEin
          || record.entityType !== basis.entityType) {
          throw new Error('K1 first-admission section170 annual owner and entity must match their actual current originals');
        }
        const basisUse = prior.basisUseHistory?.find(row => row.taxYear === year);
        if (!basisUse?.basisAllowed) throw new Error('K1 first-admission section170 annual basis use must remain bound to its original amount');
        const available = d(basisUse.basisAllowed).plus(year === start ? d(prior.appreciationPreviouslyTakenIntoAccount) : 0);
        for (const [system, packet, ids, seen, destination] of [
          ['regular', regularPacket, record.regularCarryoverSourceIds, regularLinked, linkedRegular],
          ['alternative', alternativePacket, record.alternativeCarryoverSourceIds, alternativeLinked, linkedAlternative],
        ] as const) {
          if (!packet) {
            if (ids !== undefined) throw new Error('K1 first-admission section170 alternative links require an independent actual alternative source history');
            continue;
          }
          if (!Array.isArray(ids)) throw new Error(`K1 first-admission section170 requires actual ${system} carry links, including none`);
          const linked = ids.map(id => {
            text(id, `${system} carry identity`);
            if (seen.has(id)) throw new Error('K1 first-admission section170 carry identity cannot be repeated across annual originals');
            const vintage = packet.vintages!.find(row => row.sourceId === id);
            if (!vintage || vintage.contributionYear !== year || vintage.category !== calculated.category || vintage.medium !== 'noncash') {
              throw new Error('K1 first-admission section170 linked carry must retain its original admission year category and medium');
            }
            seen.add(id);
            return earlierAdmission(vintage);
          });
          if (sum(...linked.map(row => row.originalExcess)).gt(available)) {
            throw new Error('K1 first-admission section170 original excess exceeds the amount actually admitted in its original year');
          }
          destination.push(...linked);
        }
      });
      rows.push({ sourceId: calculated.sourceId, originalGiftDate: receipt.contributionDate, basisOriginTaxYear: start,
        admissionTaxYear: currentYear, lastCarryYear: currentYear + 5, originalBasis: calculated.originalBasis,
        previouslyAllowedBasis: calculated.basisPreviouslyAllowed, currentAdmission: calculated.availableAfterBasis,
        remainingBasisSuspension: calculated.basisSuspended, earlierRegularAdmissions: linkedRegular,
        ...(alternativePacket ? { earlierAlternativeAdmissions: linkedAlternative } : {}) });
    }
    if (rows.length) result.set(statement.k1Index, rows);
  }
  for (const [packet, linked] of [[regularPacket, regularLinked], [alternativePacket, alternativeLinked]] as const) {
    if (packet?.vintages?.some(row => !linked.has(row.sourceId!))) {
      throw new Error('K1 first-admission section170 unlinked carry requires an actual distinct-receipt record; a different reference alone does not establish a different gift');
    }
  }
  return result;
}
