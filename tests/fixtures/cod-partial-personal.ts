import Decimal from 'decimal.js';
import { actualCodAttributesInput, codPropertyRecord } from './cod-ordinary-attributes.js';
import { actualEblNolInput } from './qbi-ebl-nol.js';

/** Complete fictional original records. The exact incomplete CI inputs are
 * retained separately; these additional facts are never production defaults. */
export function actualPartialPersonalCodInput(options: {
  debt?: string; interest?: string; liabilities?: string; assets?: string;
  wages?: string; creditor?: string; description?: string; eventCode?: string;
} = {}) {
  const debt = options.debt ?? '18000', interest = options.interest ?? '1200';
  const liabilities = options.liabilities ?? '90000', assets = options.assets ?? '80000';
  const input = actualCodAttributesInput(debt);
  const original = input.form982NolSources!.debts![0]!;
  const creditor = options.creditor ?? 'Community Bank', description = options.description ?? 'Credit card balance';
  const eventCode = options.eventCode ?? 'G';
  input.w2s[0]!.wages = options.wages ?? '85000';
  // Preserve the exact W-2 withholding from all three historical originals.
  input.w2s[0]!.federalWithheld = '12750';
  input.form1099C = [{ creditor, amountDischarged: debt, interestIncluded: interest,
    debtDescription: description, personallyLiable: true, identifiableEventCode: eventCode, fmvOfProperty: '0' }];
  input.codExclusion!.insolvency = { totalLiabilities: liabilities, totalAssets: assets };
  const after = new Decimal(liabilities).minus(debt).toFixed();
  const debts = [{ ...original, creditor, debtDescription: description, identifiableEventCode: eventCode,
    amountDischarged: debt, interestIncluded: interest,
    personalDebt: {
      sourceReference: 'Fictional complete creditor settlement and original consumer borrowing records',
      sourceFactsConfirmed: true, allDischargedAmountsIncluded: true,
      proceedsUse: 'personal_living_expenses' as 'personal_living_expenses' | 'business' | 'investment' | 'mixed_or_other',
      useSourceReference: 'Fictional original draws and personal grocery, clothing and living-expense purchase records',
      borrowingNotDeductibleUnpaidExpenseConfirmed: true,
      interestTreatment: 'nondeductible_personal' as 'nondeductible_personal' | 'potentially_deductible',
      interestSourceReference: 'Fictional account interest history: ordinary unsecured personal borrowing, no qualified interest exception',
      actualDischargedAmount: debt, actualDischargedInterest: interest,
      noPaymentOrNewBorrowingAtDischargeConfirmed: true,
    },
  }];
  input.form982NolSources!.insolvency!.assets = [{ sourceId: 'actual-personal-cash', description: 'All actual cash immediately before cancellation',
    amount: assets, sourceReference: 'Fictional dated cash account inventory; all other assets explicitly absent' }];
  input.form982NolSources!.insolvency!.liabilities = [
    { sourceId: 'cancelled-original-loan', description: 'Complete actual discharged personal balance', amount: debt,
      sourceReference: 'Fictional original settlement balance before cancellation', dischargedDebtSourceId: 'form1099C:0' },
    { sourceId: 'remaining-personal-loans', description: 'All other actual liabilities, unchanged at the cancellation event',
      amount: after, sourceReference: 'Fictional complete dated remaining loan statements' },
  ];
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.property.immediatelyAfter.money = assets;
    ledger.property.immediatelyAfter.liabilities = [{ sourceId: 'remaining-personal-loans', amount: after,
      sourceReference: 'Fictional immediately-after original loan records, with no payment or new borrowing' }];
  }
  return Object.assign(input, { form982NolSources: { ...input.form982NolSources!, debts } });
}

export function partialPersonalBasisInput() {
  const input = actualPartialPersonalCodInput();
  input.form982NolSources.insolvency!.assets = [{ sourceId: 'personal-property-fmv', description: 'Actual retained personal property FMV',
    amount: '80000', sourceReference: 'Fictional actual before-event valuation; no cash or other property' }];
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.property.immediatelyAfter.money = '0';
    ledger.property.immediatelyAfter.properties = [codPropertyRecord('retained-personal-property', '75000')];
    ledger.property.followingYear.properties = structuredClone(ledger.property.immediatelyAfter.properties);
  }
  return input;
}

export function partialPersonalLegacyNolInput() {
  const input = actualPartialPersonalCodInput({ debt: '30000', interest: '0', liabilities: '200000', assets: '180000',
    creditor: 'Chase Bank', description: 'Unsecured personal borrowing', eventCode: 'F' });
  const qualified = actualEblNolInput();
  const source = qualified.netOperatingLoss!.vintages![0]!;
  Object.assign(source, { sourceId: 'actual2024-ebl', lossTaxYear: 2024, originalLoss: '15000', openingCarryforward: '15000',
    adjustedThroughTaxYear: 2024, sourceReference: 'Fictional completed2024 Form461 and original NOL worksheet',
    historySourceReference: 'Fictional original2024 closing carry, with no intervening year', history: [], section1411OriginalLoss: '0' });
  qualified.netOperatingLoss!.alternativeTax!.vintages = [{ ...structuredClone(source),
    sourceReference: 'Fictional independently computed2024 AMT loss worksheet',
    historySourceReference: 'Fictional independently filed2024 AMT closing carry' }];
  const history = qualified.qbiLossSources!.excessBusinessLossHistories![0]!;
  Object.assign(history, { nolSourceId: source.sourceId, originalNol: structuredClone(source), originalQualifiedLoss: '15000',
    qualifiedOpeningCarryforward: '15000', history: [], materiallyParticipatedInCurrentYear: false,
    sourceReference: 'Fictional completed2024 original qualified EBL character',
    limitationSourceReference: 'Fictional2024 Form461: this same15000 original loss is entirely qualified' });
  input.netOperatingLoss = qualified.netOperatingLoss;
  input.qbiLossSources = qualified.qbiLossSources;
  input.priorYear = { nolCarryforward: '15000', excessBusinessLossNOL: '15000', qbiLossCarryforward: '0' };
  return input;
}

export function partialPersonalLargeNolInput() {
  const input = actualPartialPersonalCodInput({ debt: '30000', interest: '0', liabilities: '200000', assets: '180000' });
  const source = actualEblNolInput().netOperatingLoss!.vintages![0]!;
  Object.assign(source, { sourceId: 'actual2024-individual-nol', lossTaxYear: 2024, originKind: 'individual_nol', originalLoss: '100000',
    openingCarryforward: '100000', adjustedThroughTaxYear: 2024, history: [], section1411OriginalLoss: '0',
    sourceReference: 'Fictional actual2024 individual NOL worksheet, not an EBL carry',
    historySourceReference: 'Fictional actual2024 closing NOL record' });
  input.netOperatingLoss!.vintages = [source];
  input.netOperatingLoss!.alternativeTax!.vintages = [{ ...structuredClone(source),
    sourceReference: 'Fictional separate original2024 AMT NOL worksheet', historySourceReference: 'Fictional independently filed2024 AMT carry' }];
  return input;
}
