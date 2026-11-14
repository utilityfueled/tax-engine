import { actualPartialPersonalCodInput } from './cod-partial-personal.js';

/** Fictional complete non-estate case records, not eligibility inferred from a flag. */
export function qualifiedPersonalBankruptcyInput(chapter: '12' | '13' = '13',
  options: Parameters<typeof actualPartialPersonalCodInput>[0] = {}) {
  const input = actualPartialPersonalCodInput({ debt: '50000', interest: '0', eventCode: 'A', ...options });
  if (!input.codExclusion) throw new Error('Missing fictional complete debt exclusion source');
  input.codExclusion.bankruptcy = true;
  Object.assign(input.form982NolSources, { title11Case: true, title11Chapter: chapter, title11Source: {
    sourceReference: `Fictional original chapter${chapter} complete docket and discharge: never chapter7 or11`,
    sourceFactsConfirmed: true, debtorUnderCourtJurisdictionConfirmed: true,
    dischargeByCourtOrApprovedPlanConfirmed: true, caseNeverChapter7Or11Confirmed: true,
  } });
  return input;
}
