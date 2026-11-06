import { IraBasisSourcesSchema, type IraBasisSourcesInput } from '@/models/ira-basis-sources';
import { Form1099RSchema } from '@/models/inputs';
import { calculateIraBasisSources } from '@/engine/forms/ira-basis-sources';
import { parseGuidedCurrency } from './guided-currency';
import { isStartedRetirement, retirementSourceInput } from './guided-retirement-source-inputs';
import type { AdjustmentData, FilingStatus, PersonalInfoData, RetirementEntryData } from './guided-interview-flow';

type Answer = boolean | null;
type Owner = 'primary' | 'spouse' | '';
export interface IraBasisAccountData {
  accountId?: string; sourceTaxYear?: string; accountType?: 'traditional' | 'sep' | 'simple' | '';
  custodian?: string; custodianTin?: string; accountReference?: string; sourceReference?: string; yearEndValue?: string;
}
export interface IraBasisHistoryData {
  method?: 'confirmed_zero' | 'prior_form_8606' | ''; sourceReference?: string; sourceTaxYear?: string;
  line14?: string; line15cWorksheetAdjustment?: string; mostRecentFormConfirmed?: Answer;
  allPriorRecordsReviewed?: Answer; basisChangesSinceThatReturn?: Answer;
}
type OrdinaryFacts = IraBasisSourcesInput['owners'][number]['ordinaryFacts'];
export interface IraBasisOwnerData {
  accountHolder?: Owner; identity?: Partial<IraBasisSourcesInput['owners'][number]['identity']>;
  basisHistory?: IraBasisHistoryData; ordinaryFacts?: { [K in keyof OrdinaryFacts]?: Answer }; accounts?: IraBasisAccountData[];
}
export interface IraBasisDistributionData {
  sourceId?: string; sourceTaxYear?: string; sourceReference?: string; accountId?: string; accountHolder?: Owner;
  payer?: string; payerTin?: string; accountReference?: string; grossDistribution?: string; taxableAmount?: string;
  taxableAmountNotDetermined?: Answer; iraSepSimple?: Answer; distributionCode?: string;
}
export interface GuidedIraBasisData {
  sourceTaxYear?: string; sourceReference?: string; sourceFactsConfirmed?: Answer;
  allIraOwnersAndAccountsIncluded?: Answer; allDistributionsIncluded?: Answer;
  owners?: IraBasisOwnerData[]; distributions?: IraBasisDistributionData[];
}
export interface GuidedIraBasisContext { data?: GuidedIraBasisData; personal?: PersonalInfoData; adjustments?: AdjustmentData }

export const iraOrdinaryQuestions: ReadonlyArray<readonly [keyof OrdinaryFacts, string]> = [
  ['currentYearContributionsPresent', 'Any current-year traditional or Roth IRA contributions?'],
  ['conversionsPresent', 'Any Roth conversions?'], ['rolloversPresent', 'Any rollovers, including outstanding rollovers?'],
  ['qcdPresent', 'Any qualified charitable distributions?'], ['hsaFundingPresent', 'Any IRA-to-HSA funding distributions?'],
  ['contributionReturnsPresent', 'Any returned contributions or excess contributions?'],
  ['specialDistributionsOrRepaymentsPresent', 'Any special distributions, repayments or penalty exceptions?'],
  ['inheritedAccountsPresent', 'Any inherited IRA accounts?'], ['divorceOrOtherBasisTransfersPresent', 'Any divorce-related or other basis transfers?'],
  ['otherBasisEventsPresent', 'Any other basis events requiring another worksheet?'],
];
function year(value: string | undefined): number {
  if (!/^\d{4}$/.test(value ?? '')) throw new Error('Enter the actual source tax year.');
  return Number(value);
}
function amount(value: string | undefined): string {
  if (!value?.trim()) throw new Error('Enter the actual IRA source amount; blank is unknown.');
  const result = parseGuidedCurrency(value);
  if (result.isNegative()) throw new Error('IRA source amounts must be nonnegative.');
  return value.trim().replaceAll(',', '');
}

/** Explicit action copies entered sources only; linking/history remain unknown. */
export function captureIraBasisDistributions(entries: RetirementEntryData[]): IraBasisDistributionData[] {
  return entries.filter(isStartedRetirement).flatMap((entry, index) => entry.isIraSepSimple === true ? [{
    sourceId: `form1099R:${index}`, sourceTaxYear: entry.sourceTaxYear, accountHolder: entry.accountHolder,
    payer: entry.payer, payerTin: entry.payerTin, accountReference: entry.accountReference,
    grossDistribution: entry.grossDistribution, taxableAmount: entry.taxableAmount,
    taxableAmountNotDetermined: entry.taxableAmountNotDetermined, iraSepSimple: entry.isIraSepSimple, distributionCode: entry.distributionCode,
  }] : []);
}

export function buildGuidedIraBasisSources(data: GuidedIraBasisData | undefined, entries: RetirementEntryData[] | undefined,
  taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData, adjustments?: AdjustmentData): IraBasisSourcesInput | undefined {
  if (!data) return undefined;
  if (!personal || !filingStatus || taxYear == null) throw new Error('Actual household facts and return year are required for IRA basis.');
  const packet = IraBasisSourcesSchema.parse({
    taxYear: year(data.sourceTaxYear), sourceReference: data.sourceReference, sourceFactsConfirmed: data.sourceFactsConfirmed,
    allIraOwnersAndAccountsIncluded: data.allIraOwnersAndAccountsIncluded, allDistributionsIncluded: data.allDistributionsIncluded,
    owners: (data.owners ?? []).map(owner => {
      const history = owner.basisHistory;
      if (history?.method === 'confirmed_zero' && [history.sourceTaxYear, history.line14, history.line15cWorksheetAdjustment].some(value => value?.trim())) throw new Error('Reconcile saved prior Form8606 fields before using a confirmed zero-basis history.');
      return { accountHolder: owner.accountHolder, identity: owner.identity, ordinaryFacts: owner.ordinaryFacts,
        basisHistory: { method: history?.method, sourceReference: history?.sourceReference,
          allPriorRecordsReviewed: history?.allPriorRecordsReviewed, basisChangesSinceThatReturn: history?.basisChangesSinceThatReturn,
          ...(history?.method === 'prior_form_8606' ? { taxYear: year(history.sourceTaxYear), line14: amount(history.line14),
            line15cWorksheetAdjustment: amount(history.line15cWorksheetAdjustment), mostRecentFormConfirmed: history.mostRecentFormConfirmed } : {}),
        },
        accounts: (owner.accounts ?? []).map(account => ({ accountId: account.accountId, taxYear: year(account.sourceTaxYear),
          accountType: account.accountType, custodian: account.custodian, custodianTin: account.custodianTin,
          accountReference: account.accountReference, sourceReference: account.sourceReference, yearEndValue: amount(account.yearEndValue) })),
      };
    }),
    distributions: (data.distributions ?? []).map(row => ({ sourceId: row.sourceId, taxYear: year(row.sourceTaxYear),
      sourceReference: row.sourceReference, accountId: row.accountId, accountHolder: row.accountHolder, payer: row.payer, payerTin: row.payerTin,
      accountReference: row.accountReference, grossDistribution: amount(row.grossDistribution),
      taxableAmount: row.taxableAmount?.trim() ? amount(row.taxableAmount) : null,
      taxableAmountNotDetermined: row.taxableAmountNotDetermined, iraSepSimple: row.iraSepSimple, distributionCode: row.distributionCode })),
  });
  // These actual answers cannot be contradicted by contribution/HSA sources.
  const ira = adjustments?.iraContributions;
  for (const value of [ira?.primaryContributions, ira?.spouseContributions, ira?.primaryRothContributions, ira?.spouseRothContributions,
    adjustments?.iraDeduction, ...(adjustments?.hsaAccounts ?? []).map(account => account.qualifiedFundingDistribution)]) {
    if (value?.trim() && !parseGuidedCurrency(value).isZero()) throw new Error('Current IRA contributions, deductions or HSA funding need their separate actual method.');
  }
  const first = personal.firstName.trim(); const middle = personal.middleName?.trim().replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase();
  const status = { single: 'single', mfj: 'married_filing_jointly', mfs: 'married_filing_separately', hoh: 'head_of_household', qss: 'qualifying_surviving_spouse' } as const;
  calculateIraBasisSources({ iraBasisSources: packet, form1099R: (entries ?? []).filter(isStartedRetirement).map(entry => {
    amount(entry.grossDistribution); // Schema defaults cannot supply a missing original amount.
    return Form1099RSchema.parse(retirementSourceInput(entry));
  }), taxpayer: { taxYear, filingStatus: status[filingStatus],
    primary: { firstName: middle ? `${first} ${middle}` : first, lastName: personal.lastName, ssn: personal.ssn, dateOfBirth: personal.dateOfBirth ?? '' },
    spouse: personal.spouse ? { firstName: personal.spouse.firstName, lastName: personal.spouse.lastName, ssn: personal.spouse.ssn, dateOfBirth: personal.spouse.dateOfBirth ?? '' } : undefined,
  } });
  return packet;
}
